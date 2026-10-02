/** A factor counts as a "main reason" for a flag only if it added at least this many points. */
const MAIN_REASON_MIN_POINTS = 8;

/** Aggregates for the return-fraud trends dashboard. */
export async function getDashboard(db, { weeks = 12 } = {}) {
  const w = Math.min(Math.max(Number(weeks) || 12, 4), 52);
  const periodStart = `date_trunc('week', now()) - ($1::int - 1) * INTERVAL '1 week'`;

  const [weekly, summary, byCategory, topFactors, repeat, pending] = await Promise.all([
    db.query(
      `WITH weeks AS (
         SELECT generate_series(${periodStart}, date_trunc('week', now()), INTERVAL '1 week') AS week_start
       )
       SELECT to_char(w.week_start, 'YYYY-MM-DD') AS week_start,
              COUNT(r.id)::int                                             AS total,
              COUNT(r.id) FILTER (WHERE rs.risk_level = 'low')::int        AS low,
              COUNT(r.id) FILTER (WHERE rs.risk_level = 'medium')::int     AS medium,
              COUNT(r.id) FILTER (WHERE rs.risk_level = 'high')::int       AS high,
              COUNT(r.id) FILTER (WHERE r.status = 'denied')::int          AS denied,
              COALESCE(ROUND(AVG(rs.score)), 0)::int                       AS avg_score
         FROM weeks w
         LEFT JOIN returns r      ON date_trunc('week', r.requested_at) = w.week_start
         LEFT JOIN risk_scores rs ON rs.return_id = r.id
        GROUP BY w.week_start
        ORDER BY w.week_start`,
      [w],
    ),
    db.query(
      `SELECT COUNT(*)::int                                                  AS total,
              COUNT(*) FILTER (WHERE rs.risk_level <> 'low')::int            AS flagged,
              COUNT(*) FILTER (WHERE rs.risk_level = 'high')::int            AS high,
              COUNT(*) FILTER (WHERE r.status = 'denied')::int               AS denied,
              COALESCE(SUM(r.refund_amount) FILTER (WHERE r.status = 'denied'), 0) AS denied_value,
              COALESCE(SUM(r.refund_amount), 0)                              AS requested_value,
              COALESCE(ROUND(AVG(rs.score)), 0)::int                         AS avg_score
         FROM returns r JOIN risk_scores rs ON rs.return_id = r.id
        WHERE r.requested_at >= ${periodStart}`,
      [w],
    ),
    db.query(
      `SELECT oi.category,
              COUNT(*)::int                                                  AS total,
              COUNT(*) FILTER (WHERE rs.risk_level <> 'low')::int            AS flagged,
              COUNT(*) FILTER (WHERE r.status = 'denied')::int               AS denied,
              ROUND(AVG(rs.score))::int                                      AS avg_score
         FROM returns r
         JOIN risk_scores rs ON rs.return_id = r.id
         JOIN order_items oi ON oi.id = r.order_item_id
        WHERE r.requested_at >= ${periodStart}
        GROUP BY oi.category
        ORDER BY flagged DESC, total DESC`,
      [w],
    ),
    db.query(
      `SELECT f->>'key' AS key, f->>'label' AS label, COUNT(*)::int AS times
         FROM returns r
         JOIN risk_scores rs ON rs.return_id = r.id
         CROSS JOIN LATERAL jsonb_array_elements(rs.factors) AS f
        WHERE r.requested_at >= ${periodStart}
          AND rs.risk_level <> 'low'
          AND (f->>'points')::int >= ${MAIN_REASON_MIN_POINTS}
        GROUP BY 1, 2
        ORDER BY times DESC`,
      [w],
    ),
    db.query(
      `SELECT c.id, c.full_name, c.email,
              COUNT(*)::int                                           AS returns,
              COUNT(*) FILTER (WHERE rs.risk_level = 'high')::int     AS high_risk,
              ROUND(AVG(rs.score))::int                               AS avg_score
         FROM returns r
         JOIN risk_scores rs ON rs.return_id = r.id
         JOIN customers c    ON c.id = r.customer_id
        WHERE r.requested_at >= ${periodStart}
        GROUP BY c.id
       HAVING COUNT(*) FILTER (WHERE rs.risk_level = 'high') >= 2
        ORDER BY high_risk DESC, avg_score DESC
        LIMIT 5`,
      [w],
    ),
    db.query(`SELECT COUNT(*)::int AS n FROM returns WHERE status = 'pending_review'`),
  ]);

  return {
    weeks: w,
    summary: { ...summary.rows[0], pendingReview: pending.rows[0].n },
    weekly: weekly.rows,
    byCategory: byCategory.rows,
    topFactors: topFactors.rows,
    repeatCustomers: repeat.rows,
  };
}
