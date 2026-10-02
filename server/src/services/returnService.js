import { ApiError } from '../errors.js';
import { scoreReturn, RETURN_WINDOW_DAYS } from '../scoring/riskScorer.js';

export const RETURN_REASONS = {
  wrong_size: 'Wrong size or fit',
  not_as_described: 'Not as described / pictured',
  changed_mind: 'Changed my mind',
  damaged: 'Arrived damaged or defective',
  wrong_item: 'Wrong item sent',
  quality: 'Quality not as expected',
  other: 'Other',
};

export const STATUS_LABELS = {
  pending_review: 'Needs review',
  auto_approved: 'Auto-approved',
  approved: 'Approved',
  denied: 'Denied',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REVIEWER_LENGTH = 100;
const MAX_NOTE_LENGTH = 1000;

// Own keys only, so names like "constructor" or "toString" never pass as valid.
const isReason = (v) => typeof v === 'string' && Object.hasOwn(RETURN_REASONS, v);
const isStatus = (v) => typeof v === 'string' && Object.hasOwn(STATUS_LABELS, v);

/** Whole days between a delivery date ('YYYY-MM-DD') and a request timestamp, by calendar date (UTC). */
export function daysBetween(deliveredDate, requestedAt) {
  const [y, m, d] = deliveredDate.split('-').map(Number);
  const delivered = Date.UTC(y, m - 1, d);
  const req = new Date(requestedAt);
  const requested = Date.UTC(req.getUTCFullYear(), req.getUTCMonth(), req.getUTCDate());
  return Math.max(0, Math.round((requested - delivered) / DAY_MS));
}

/**
 * The customer's history as it stood just before `asOf`. Only earlier activity
 * counts, so re-scoring (or seeding) historical returns is fair.
 */
export async function getCustomerHistory(db, customerId, asOf) {
  const { rows } = await db.query(
    `SELECT
       (SELECT COUNT(*)::int FROM orders
          WHERE customer_id = $1 AND order_date < $2)                       AS orders_placed,
       (SELECT COUNT(*)::int FROM order_items oi JOIN orders o ON o.id = oi.order_id
          WHERE o.customer_id = $1 AND o.order_date < $2)                   AS items_purchased,
       (SELECT COUNT(*)::int FROM returns
          WHERE customer_id = $1 AND requested_at < $2)                     AS prior_returns,
       (SELECT COUNT(*)::int FROM returns
          WHERE customer_id = $1 AND requested_at < $2
            AND requested_at >= $2::timestamptz - INTERVAL '90 days')       AS returns_last_90_days`,
    [customerId, asOf],
  );
  const r = rows[0];
  return {
    ordersPlaced: r.orders_placed,
    itemsPurchased: r.items_purchased,
    priorReturns: r.prior_returns,
    returnsLast90Days: r.returns_last_90_days,
  };
}

/**
 * Create a return request, score it, and route it: low-risk returns are
 * auto-approved; everything else goes to the staff review queue.
 * Must be called inside a transaction.
 */
export async function createReturn(db, { orderItemId, reason, reasonDetails, requestedAt = new Date() }) {
  if (!Number.isInteger(orderItemId)) throw new ApiError(400, 'Choose the item being returned.');
  if (!isReason(reason)) throw new ApiError(400, 'Choose a return reason.');

  const { rows: items } = await db.query(
    `SELECT oi.id, oi.category, oi.unit_price, oi.quantity, oi.product_name,
            o.customer_id, o.delivered_date, o.order_number
       FROM order_items oi JOIN orders o ON o.id = oi.order_id
      WHERE oi.id = $1
      FOR UPDATE OF oi`,
    [orderItemId],
  );
  const item = items[0];
  if (!item) throw new ApiError(404, 'That order item was not found.');
  if (!item.delivered_date) {
    throw new ApiError(422, 'This order has not been delivered yet, so it cannot be returned.');
  }
  const { rowCount: already } = await db.query('SELECT 1 FROM returns WHERE order_item_id = $1', [orderItemId]);
  if (already) throw new ApiError(409, 'A return has already been requested for this item.');

  const daysToReturn = daysBetween(item.delivered_date, requestedAt);
  const history = await getCustomerHistory(db, item.customer_id, requestedAt);
  const assessment = scoreReturn({ history, daysToReturn, category: item.category, windowDays: RETURN_WINDOW_DAYS });

  const autoApprove = assessment.riskLevel === 'low';
  const refundAmount = Number((item.unit_price * item.quantity).toFixed(2));

  const { rows: [ret] } = await db.query(
    `INSERT INTO returns (order_item_id, customer_id, reason, reason_details, requested_at,
                          days_to_return, refund_amount, status, reviewed_by, reviewed_at, review_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, status`,
    [
      orderItemId, item.customer_id, reason, reasonDetails || null, requestedAt,
      daysToReturn, refundAmount,
      autoApprove ? 'auto_approved' : 'pending_review',
      autoApprove ? 'ReturnGuard (automatic)' : null,
      autoApprove ? requestedAt : null,
      autoApprove ? 'Low risk — approved automatically.' : null,
    ],
  );

  await db.query(
    `INSERT INTO risk_scores (return_id, score, risk_level, factors, summary, recommendation, model_version, scored_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      ret.id, assessment.score, assessment.riskLevel, JSON.stringify(assessment.factors),
      assessment.summary, assessment.recommendation, assessment.modelVersion, requestedAt,
    ],
  );

  return { id: ret.id, status: ret.status, daysToReturn, history, assessment };
}

const LIST_SORTS = {
  risk: 'rs.score DESC, r.requested_at ASC',
  oldest: 'r.requested_at ASC',
  newest: 'r.requested_at DESC',
};

export async function listReturns(db, { status, level, q, sort = 'risk', limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  const add = (v) => { params.push(v); return `$${params.length}`; };

  if (status && status !== 'all') {
    const list = String(status).split(',').filter(isStatus);
    if (list.length) where.push(`r.status = ANY(${add(list)})`);
  }
  if (level && level !== 'all') {
    const list = String(level).split(',').filter((l) => ['low', 'medium', 'high'].includes(l));
    if (list.length) where.push(`rs.risk_level = ANY(${add(list)})`);
  }
  const term = typeof q === 'string' ? q.trim().slice(0, 200) : '';
  if (term) {
    const p = add(`%${term}%`);
    where.push(`(o.order_number ILIKE ${p} OR c.full_name ILIKE ${p} OR c.email ILIKE ${p} OR oi.product_name ILIKE ${p})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderSql = LIST_SORTS[sort] || LIST_SORTS.risk;

  const base = `
    FROM returns r
    JOIN risk_scores rs ON rs.return_id = r.id
    JOIN order_items oi ON oi.id = r.order_item_id
    JOIN orders o       ON o.id = oi.order_id
    JOIN customers c    ON c.id = r.customer_id
    ${whereSql}`;

  const [{ rows }, { rows: [{ total }] }] = await Promise.all([
    db.query(
      `SELECT r.id, r.status, r.reason, r.requested_at, r.days_to_return, r.refund_amount,
              rs.score, rs.risk_level, rs.summary,
              oi.product_name, oi.category, o.order_number,
              c.id AS customer_id, c.full_name AS customer_name, c.email AS customer_email
       ${base}
       ORDER BY ${orderSql}
       LIMIT ${add(Math.min(Number(limit) || 50, 200))} OFFSET ${add(Math.max(Number(offset) || 0, 0))}`,
      params,
    ),
    db.query(`SELECT COUNT(*)::int AS total ${base}`, params.slice(0, params.length - 2)),
  ]);
  return { total, items: rows };
}

export async function getReturnDetail(db, id) {
  const { rows } = await db.query(
    `SELECT r.*, rs.score, rs.risk_level, rs.factors, rs.summary, rs.recommendation,
            rs.model_version, rs.scored_at,
            oi.product_name, oi.sku, oi.category, oi.unit_price, oi.quantity,
            o.order_number, o.order_date, o.delivered_date,
            c.full_name AS customer_name, c.email AS customer_email, c.created_at AS customer_since
       FROM returns r
       JOIN risk_scores rs ON rs.return_id = r.id
       JOIN order_items oi ON oi.id = r.order_item_id
       JOIN orders o       ON o.id = oi.order_id
       JOIN customers c    ON c.id = r.customer_id
      WHERE r.id = $1`,
    [id],
  );
  const ret = rows[0];
  if (!ret) throw new ApiError(404, 'Return not found.');

  const [history, { rows: otherReturns }] = await Promise.all([
    getCustomerHistory(db, ret.customer_id, ret.requested_at),
    db.query(
      `SELECT r.id, r.requested_at, r.status, r.days_to_return, r.refund_amount,
              oi.product_name, oi.category, rs.score, rs.risk_level
         FROM returns r
         JOIN order_items oi ON oi.id = r.order_item_id
         JOIN risk_scores rs ON rs.return_id = r.id
        WHERE r.customer_id = $1 AND r.id <> $2
        ORDER BY r.requested_at DESC
        LIMIT 10`,
      [ret.customer_id, id],
    ),
  ]);
  return { ...ret, history, otherReturns };
}

export async function decideReturn(db, id, { decision, reviewer, note }) {
  if (!['approve', 'deny'].includes(decision)) throw new ApiError(400, 'Decision must be approve or deny.');
  const reviewerName = typeof reviewer === 'string' ? reviewer.trim() : '';
  const noteText = typeof note === 'string' ? note.trim() : '';
  if (!reviewerName) throw new ApiError(400, 'Enter your name so the decision can be recorded.');
  if (reviewerName.length > MAX_REVIEWER_LENGTH) {
    throw new ApiError(400, `Your name must be ${MAX_REVIEWER_LENGTH} characters or fewer.`);
  }
  if (decision === 'deny' && !noteText) {
    throw new ApiError(400, 'Please add a short note explaining why the return is denied.');
  }
  if (noteText.length > MAX_NOTE_LENGTH) {
    throw new ApiError(400, `The note must be ${MAX_NOTE_LENGTH} characters or fewer.`);
  }
  const { rows } = await db.query(
    `UPDATE returns
        SET status = $2, reviewed_by = $3, reviewed_at = now(), review_note = $4
      WHERE id = $1 AND status = 'pending_review'
      RETURNING id, status, reviewed_by, reviewed_at, review_note`,
    [id, decision === 'approve' ? 'approved' : 'denied', reviewerName, noteText || null],
  );
  if (!rows[0]) {
    const { rowCount } = await db.query('SELECT 1 FROM returns WHERE id = $1', [id]);
    if (!rowCount) throw new ApiError(404, 'Return not found.');
    throw new ApiError(409, 'This return has already been decided.');
  }
  return rows[0];
}
