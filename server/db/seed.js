/**
 * Creates the schema and fills it with a year of realistic, deterministic
 * demo data. Every historical return goes through the same createReturn()
 * scoring path the live API uses.
 *
 *   npm run db:setup      (from /server)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, withTransaction } from '../src/db.js';
import { createReturn } from '../src/services/returnService.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date();

/* ---------- deterministic random helpers ---------- */
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260929);
const between = (min, max) => min + Math.floor(rand() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const chance = (p) => rand() < p;
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const isoDate = (d) => d.toISOString().slice(0, 10);

/* ---------- catalog ---------- */
const CATALOG = {
  occasion_wear: [['Silk Midi Slip Dress', 189], ['Sequin Evening Gown', 245], ['Tailored Tuxedo Blazer', 210], ['Satin Wrap Cocktail Dress', 165]],
  outerwear: [['Wool Double-Breasted Coat', 298], ['Quilted Down Parka', 239], ['Leather Moto Jacket', 325]],
  handbags_accessories: [['Structured Leather Tote', 178], ['Beaded Evening Clutch', 96], ['Cashmere Wrap Scarf', 88]],
  small_appliances: [['Stand Mixer Pro 5qt', 349], ['Espresso Machine Duo', 429], ['Air Fryer XL', 139]],
  home_decor: [['Hand-Thrown Ceramic Vase Set', 124], ['Brass Floor Lamp', 219], ['Jute Area Rug 5x8', 189]],
  shoes: [['Leather Chelsea Boots', 159], ['Suede Block-Heel Pumps', 129], ['Canvas Everyday Sneakers', 72]],
  activewear: [['High-Rise Performance Leggings', 68], ['Seamless Sports Bra', 44], ['Quarter-Zip Running Top', 58]],
  everyday_apparel: [['Organic Cotton Crew Tee', 28], ['Straight-Leg Denim', 89], ['Merino V-Neck Sweater', 98], ['Linen Button-Down Shirt', 64]],
  kitchen_dining: [['Stoneware Dinner Set (12pc)', 119], ['Enamel Dutch Oven 5.5qt', 145], ['Linen Napkins (Set of 4)', 34]],
  bedding_bath: [['Percale Sheet Set Queen', 129], ['Waffle Bath Towel Set', 64], ['Down-Alternative Duvet', 149]],
};
const ALL_CATS = Object.keys(CATALOG);
const PRONE_CATS = ['occasion_wear', 'outerwear', 'handbags_accessories', 'small_appliances', 'home_decor'];
const SKU_PREFIX = {
  occasion_wear: 'OCC', outerwear: 'OUT', handbags_accessories: 'ACC', small_appliances: 'APP', home_decor: 'DEC',
  shoes: 'SHO', activewear: 'ACT', everyday_apparel: 'APL', kitchen_dining: 'KIT', bedding_bath: 'BED',
};

const FIRST = ['Ava', 'Noah', 'Mia', 'Liam', 'Zoe', 'Ethan', 'Chloe', 'Mason', 'Ivy', 'Lucas', 'Nora', 'Owen', 'Ruby', 'Caleb', 'Hazel', 'Jonah', 'Leah', 'Miles', 'Quinn', 'Sofia', 'Theo', 'Uma', 'Wes', 'Yara', 'Priya', 'Diego', 'Amara', 'Kenji', 'Fatima', 'Rowan'];
const LAST = ['Bennett', 'Carter', 'Delgado', 'Ellison', 'Fischer', 'Garcia', 'Hughes', 'Iverson', 'Jensen', 'Kowalski', 'Lindqvist', 'Moreno', 'Nakamura', 'Okafor', 'Patel', 'Reyes', 'Sullivan', 'Tanaka', 'Vasquez', 'Whitfield', 'Young', 'Zimmer', 'Abbott', 'Brooks'];

/* ---------- personas ---------- */
const PERSONAS = {
  regular: {
    orders: [4, 12], itemsPerOrder: [1, 3],
    catWeights: null,
    returnProb: () => 0.08,
    days: () => between(1, 13),
    reasons: ['wrong_size', 'wrong_size', 'quality', 'not_as_described', 'damaged'],
  },
  frequent: {
    orders: [8, 16], itemsPerOrder: [2, 4],
    catWeights: null,
    returnProb: () => 0.4,
    days: () => (chance(0.7) ? between(2, 14) : between(15, 24)),
    reasons: ['wrong_size', 'changed_mind', 'not_as_described', 'quality'],
  },
  wardrober: {
    orders: [6, 12], itemsPerOrder: [1, 2],
    catWeights: 0.7, // share of purchases from wardrobing-prone categories
    // Gets bolder over the year (t: 0 = a year ago, 1 = today).
    returnProb: (cat, t) => (PRONE_CATS.includes(cat) ? 0.45 + 0.4 * t : 0.15),
    days: () => (chance(0.85) ? between(24, 30) : between(31, 34)),
    reasons: ['changed_mind', 'not_as_described', 'wrong_size', 'quality'],
  },
  newbie: {
    orders: [1, 2], itemsPerOrder: [1, 3],
    catWeights: null,
    returnProb: () => 0.3,
    days: () => between(3, 28),
    reasons: ['wrong_size', 'changed_mind'],
  },
};

function pickPersona() {
  const r = rand();
  if (r < 0.66) return 'regular';
  if (r < 0.82) return 'frequent';
  if (r < 0.93) return 'wardrober';
  return 'newbie';
}

function pickCategory(persona) {
  const w = PERSONAS[persona].catWeights;
  if (w && chance(w)) return pick(PRONE_CATS);
  return pick(ALL_CATS);
}

/* ---------- inserts ---------- */
let orderSeq = 100231;
const emails = new Set();

async function insertCustomer(db, name, createdAt) {
  let base = name.toLowerCase().replace(/[^a-z]+/g, '.');
  let email = `${base}@example.com`;
  for (let i = 2; emails.has(email); i++) email = `${base}${i}@example.com`;
  emails.add(email);
  const { rows } = await db.query(
    'INSERT INTO customers (full_name, email, created_at) VALUES ($1, $2, $3) RETURNING id',
    [name, email, createdAt],
  );
  return rows[0].id;
}

/** Inserts an order; returns its items with delivery info for return planning. */
async function insertOrder(db, customerId, orderDate, categories, { orderNumber, deliveryDays } = {}) {
  const deliveredAt = addDays(orderDate, deliveryDays ?? between(2, 5));
  const delivered = deliveredAt <= NOW ? isoDate(deliveredAt) : null;
  const lines = categories.map((cat) => {
    const [name, price] = pick(CATALOG[cat]);
    return { cat, name, price, sku: `${SKU_PREFIX[cat]}-${between(1000, 9999)}` };
  });
  const total = lines.reduce((s, l) => s + l.price, 0);
  const { rows: [order] } = await db.query(
    `INSERT INTO orders (order_number, customer_id, order_date, delivered_date, total_amount)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, order_number`,
    [orderNumber || `HC-${orderSeq++}`, customerId, orderDate, delivered, total],
  );
  const items = [];
  for (const l of lines) {
    const { rows: [it] } = await db.query(
      `INSERT INTO order_items (order_id, sku, product_name, category, unit_price, quantity)
       VALUES ($1, $2, $3, $4, $5, 1) RETURNING id`,
      [order.id, l.sku, l.name, l.cat, l.price],
    );
    items.push({ id: it.id, category: l.cat, deliveredAt: delivered ? deliveredAt : null });
  }
  return { ...order, items };
}

async function seedCustomer(db, persona, name, { createdDaysAgo } = {}) {
  const P = PERSONAS[persona];
  const created = daysAgo(createdDaysAgo ?? (persona === 'newbie' ? between(20, 60) : between(380, 1100)));
  const customerId = await insertCustomer(db, name, created);
  const firstOrderDay = Math.min(365, Math.floor((NOW - created) / DAY) - 1);
  const nOrders = between(...P.orders);
  const plannedReturns = [];

  for (let i = 0; i < nOrders; i++) {
    const ago = between(1, Math.max(2, firstOrderDay));
    const orderDate = new Date(daysAgo(ago).getTime() + between(8, 21) * 3600 * 1000);
    const cats = Array.from({ length: between(...P.itemsPerOrder) }, () => pickCategory(persona));
    const order = await insertOrder(db, customerId, orderDate, cats);

    for (const item of order.items) {
      if (!item.deliveredAt) continue;
      const t = 1 - Math.min(ago, 365) / 365;
      if (!chance(P.returnProb(item.category, t))) continue;
      const requestedAt = new Date(addDays(item.deliveredAt, P.days()).getTime() + between(0, 10) * 3600 * 1000);
      if (requestedAt >= NOW) continue; // customer still has it — leaves returnable items for the intake demo
      plannedReturns.push({ orderItemId: item.id, requestedAt, reason: pick(P.reasons) });
    }
  }
  return { customerId, plannedReturns };
}

const REVIEWERS = ['Priya S.', 'Marcus T.', 'Dana K.', 'Luis R.'];
const DENY_NOTES = [
  'Tags removed and signs of wear on arrival.',
  'Deodorant marks and odour — item was worn.',
  'Outside return window; repeat pattern on account.',
  'Item used; not in resaleable condition.',
];
const APPROVE_NOTES = [
  'Inspected on arrival — tags on, no wear.',
  'Condition fine. Approved.',
  null,
];

async function main() {
  const schema = await fs.readFile(path.join(here, 'schema.sql'), 'utf8');
  console.log('Creating schema...');
  await pool.query(schema);

  await withTransaction(async (db) => {
    console.log('Generating customers and orders...');
    const planned = [];
    for (let i = 0; i < 140; i++) {
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      const { plannedReturns } = await seedCustomer(db, pickPersona(), name);
      planned.push(...plannedReturns);
    }

    // Named demo customers with open orders, so the intake screen shows each risk level.
    const tessa = await seedCustomer(db, 'wardrober', 'Tessa Wardell', { createdDaysAgo: 700 });
    const grace = await seedCustomer(db, 'regular', 'Grace Loyola', { createdDaysAgo: 1400 });
    planned.push(...tessa.plannedReturns, ...grace.plannedReturns);
    // Grace: many orders, (almost) never returns.
    for (let i = 0; i < 10; i++) {
      await insertOrder(db, grace.customerId, daysAgo(between(60, 360)), [pick(ALL_CATS), pick(ALL_CATS)]);
    }
    const newbieId = await insertCustomer(db, 'Sam Newhouse', daysAgo(35));

    await insertOrder(db, tessa.customerId, daysAgo(31), ['occasion_wear', 'handbags_accessories'], { orderNumber: 'HC-DEMO-HIGH', deliveryDays: 3 });
    await insertOrder(db, grace.customerId, daysAgo(7), ['everyday_apparel', 'bedding_bath'], { orderNumber: 'HC-DEMO-LOW', deliveryDays: 3 });
    await insertOrder(db, newbieId, daysAgo(30), ['outerwear'], { orderNumber: 'HC-DEMO-MED', deliveryDays: 4 });

    console.log(`Scoring ${planned.length} historical returns...`);
    planned.sort((a, b) => a.requestedAt - b.requestedAt);
    for (const p of planned) {
      await createReturn(db, p);
    }

    // Simulate staff decisions on flagged returns older than 10 days; newer ones stay in the queue.
    const { rows: pending } = await db.query(
      `SELECT r.id, r.requested_at, rs.risk_level FROM returns r JOIN risk_scores rs ON rs.return_id = r.id
        WHERE r.status = 'pending_review' AND r.requested_at < now() - INTERVAL '10 days'`,
    );
    for (const r of pending) {
      const deny = chance(r.risk_level === 'high' ? 0.7 : 0.2);
      await db.query(
        `UPDATE returns SET status = $2, reviewed_by = $3, reviewed_at = $4, review_note = $5 WHERE id = $1`,
        [
          r.id, deny ? 'denied' : 'approved', pick(REVIEWERS),
          addDays(new Date(r.requested_at), between(1, 3)),
          deny ? pick(DENY_NOTES) : pick(APPROVE_NOTES),
        ],
      );
    }
  });

  const { rows: [stats] } = await pool.query(
    `SELECT (SELECT COUNT(*) FROM customers) AS customers, (SELECT COUNT(*) FROM orders) AS orders,
            (SELECT COUNT(*) FROM returns) AS returns,
            (SELECT COUNT(*) FROM returns WHERE status = 'pending_review') AS pending`,
  );
  console.log(`Done: ${stats.customers} customers, ${stats.orders} orders, ${stats.returns} returns (${stats.pending} awaiting review).`);
  console.log('Try these order numbers on the intake screen: HC-DEMO-HIGH, HC-DEMO-MED, HC-DEMO-LOW');
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
