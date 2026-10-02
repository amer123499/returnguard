import { ApiError } from '../errors.js';
import { RETURN_WINDOW_DAYS } from '../scoring/riskScorer.js';
import { daysBetween } from './returnService.js';

/** Find orders by order number, customer email or customer name. */
export async function searchOrders(db, q) {
  const term = typeof q === 'string' ? q.trim().slice(0, 200) : '';
  if (term.length < 2) return [];
  const { rows } = await db.query(
    `SELECT o.id, o.order_number, o.order_date, o.delivered_date, o.total_amount,
            c.full_name AS customer_name, c.email AS customer_email,
            (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id) AS item_count
       FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE o.order_number ILIKE $1 OR c.email ILIKE $1 OR c.full_name ILIKE $1
      ORDER BY o.order_date DESC
      LIMIT 15`,
    [`%${term}%`],
  );
  return rows;
}

/** Recently delivered orders that still have at least one item that can be returned (handy for intake demos). */
export async function recentReturnableOrders(db, limit = 8) {
  const { rows } = await db.query(
    `SELECT o.id, o.order_number, o.order_date, o.delivered_date, o.total_amount,
            c.full_name AS customer_name, c.email AS customer_email,
            (SELECT COUNT(*)::int FROM order_items WHERE order_id = o.id) AS item_count
       FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE o.delivered_date IS NOT NULL
        AND o.delivered_date >= CURRENT_DATE - ($1::int + 5)
        AND EXISTS (SELECT 1 FROM order_items oi
                     WHERE oi.order_id = o.id
                       AND NOT EXISTS (SELECT 1 FROM returns r WHERE r.order_item_id = oi.id))
      ORDER BY random()
      LIMIT $2`,
    [RETURN_WINDOW_DAYS, limit],
  );
  return rows;
}

export async function getOrder(db, orderNumber) {
  const { rows } = await db.query(
    `SELECT o.id, o.order_number, o.order_date, o.delivered_date, o.total_amount,
            c.id AS customer_id, c.full_name AS customer_name, c.email AS customer_email,
            c.created_at AS customer_since
       FROM orders o JOIN customers c ON c.id = o.customer_id
      WHERE upper(o.order_number) = upper($1)`,
    [orderNumber.trim()],
  );
  const order = rows[0];
  if (!order) throw new ApiError(404, `No order found with number "${orderNumber}".`);

  const { rows: items } = await db.query(
    `SELECT oi.id, oi.sku, oi.product_name, oi.category, oi.unit_price, oi.quantity,
            r.id AS return_id, r.status AS return_status
       FROM order_items oi
       LEFT JOIN returns r ON r.order_item_id = oi.id
      WHERE oi.order_id = $1
      ORDER BY oi.id`,
    [order.id],
  );

  const daysSinceDelivery = order.delivered_date ? daysBetween(order.delivered_date, new Date()) : null;
  return {
    ...order,
    daysSinceDelivery,
    returnWindowDays: RETURN_WINDOW_DAYS,
    items,
  };
}
