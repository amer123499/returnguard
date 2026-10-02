-- ReturnGuard database schema (PostgreSQL 13+)
-- Re-runnable: drops and recreates all ReturnGuard tables.

DROP TABLE IF EXISTS risk_scores;
DROP TABLE IF EXISTS returns;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS customers;

CREATE TABLE customers (
  id          SERIAL PRIMARY KEY,
  full_name   TEXT        NOT NULL,
  email       TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id              SERIAL PRIMARY KEY,
  order_number    TEXT          NOT NULL UNIQUE,
  customer_id     INTEGER       NOT NULL REFERENCES customers(id),
  order_date      TIMESTAMPTZ   NOT NULL,
  delivered_date  DATE,                       -- NULL until delivered
  total_amount    NUMERIC(10,2) NOT NULL DEFAULT 0
);
CREATE INDEX idx_orders_customer ON orders(customer_id, order_date);

CREATE TABLE order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER       NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku           TEXT          NOT NULL,
  product_name  TEXT          NOT NULL,
  category      TEXT          NOT NULL CHECK (category IN (
                  'occasion_wear', 'outerwear', 'handbags_accessories', 'small_appliances',
                  'home_decor', 'shoes', 'activewear', 'everyday_apparel',
                  'kitchen_dining', 'bedding_bath')),
  unit_price    NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  quantity      INTEGER       NOT NULL DEFAULT 1 CHECK (quantity > 0)
);
CREATE INDEX idx_order_items_order ON order_items(order_id);

CREATE TABLE returns (
  id              SERIAL PRIMARY KEY,
  order_item_id   INTEGER       NOT NULL UNIQUE REFERENCES order_items(id),
  customer_id     INTEGER       NOT NULL REFERENCES customers(id),
  reason          TEXT          NOT NULL,
  reason_details  TEXT,
  requested_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  days_to_return  INTEGER       NOT NULL CHECK (days_to_return >= 0),
  refund_amount   NUMERIC(10,2) NOT NULL,
  status          TEXT          NOT NULL CHECK (status IN
                    ('pending_review', 'auto_approved', 'approved', 'denied')),
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT
);
CREATE INDEX idx_returns_customer ON returns(customer_id, requested_at);
CREATE INDEX idx_returns_status   ON returns(status, requested_at);
CREATE INDEX idx_returns_requested ON returns(requested_at);

-- One risk assessment per return. `factors` holds the full, explainable
-- breakdown produced by src/scoring/riskScorer.js.
CREATE TABLE risk_scores (
  id              SERIAL PRIMARY KEY,
  return_id       INTEGER     NOT NULL UNIQUE REFERENCES returns(id) ON DELETE CASCADE,
  score           INTEGER     NOT NULL CHECK (score BETWEEN 0 AND 100),
  risk_level      TEXT        NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  factors         JSONB       NOT NULL,
  summary         TEXT        NOT NULL,
  recommendation  TEXT        NOT NULL,
  model_version   TEXT        NOT NULL,
  scored_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_risk_scores_level ON risk_scores(risk_level);
