# ReturnGuard

Explainable return-fraud scoring for **Harlow & Co.** Every return request is scored for risk the moment it is submitted. Low-risk returns are approved automatically. Medium- and high-risk returns wait in a review queue, and each one comes with a plain-language explanation of why it was flagged.

- **New return** (`/intake`): look up an order, pick the item and reason, submit. The score, the reasons behind it and what to do next appear right away.
- **Review queue** (`/queue`): flagged returns with the riskiest first. Staff approve or deny them, and a note is required to deny. After each decision the next return opens.
- **Return detail** (`/returns/:id`): the score breakdown, the customer's history, their other returns and the decision record.
- **Trends** (`/dashboard`): weekly returns by risk level, the share flagged, flag rate by category, the main reasons returns get flagged, repeat high-risk customers and refunds withheld.

## Tech stack

| Layer    | Tech |
|----------|------|
| Frontend | React 18 + Vite, React Router, Recharts |
| Backend  | Node.js 18+ and Express |
| Database | PostgreSQL 13+ |
| Scoring  | Rule-based and fully explainable (`server/src/scoring/riskScorer.js`) |

## Project structure

```
returnguard/
├── docker-compose.yml          # Local PostgreSQL
├── package.json                # npm workspaces + root scripts
├── server/
│   ├── db/
│   │   ├── schema.sql          # customers, orders, order_items, returns, risk_scores
│   │   └── seed.js             # schema + one year of realistic demo data
│   ├── src/
│   │   ├── index.js            # starts the API
│   │   ├── app.js              # Express app, routes, error handling
│   │   ├── db.js               # pg pool
│   │   ├── scoring/riskScorer.js   # ★ the scoring logic (pure, unit-tested)
│   │   ├── services/
│   │   │   ├── returnService.js    # submit → score → route; queue; decisions
│   │   │   ├── orderService.js     # order lookup for intake
│   │   │   └── dashboardService.js # trend aggregates
│   │   └── routes/             # orders, returns, dashboard, meta
│   └── test/riskScorer.test.js
└── client/
    ├── vite.config.js          # proxies /api → localhost:4000
    └── src/
        ├── pages/              # Intake, Queue, ReturnDetail, Dashboard
        ├── components/         # RiskBadge, RiskExplanation (score meter + factors)
        ├── api.js, meta.jsx, format.js
        └── styles.css
```

## Getting started

**1. Install dependencies** (Node 18 or newer):

```bash
npm install
```

**2. Start PostgreSQL.** With Docker:

```bash
npm run db:up
```

Without Docker (for example on Windows without virtualization), install PostgreSQL natively. A detailed walkthrough is in [docs/windows-postgres-setup.md](docs/windows-postgres-setup.md). In short:

1. Download the Windows x86-64 installer for PostgreSQL 17 from https://www.postgresql.org/download/windows/ (the EDB installer).
2. Run it and keep the defaults (port `5432`). Set a password for the `postgres` superuser. You can skip Stack Builder at the end.
3. Create the app's user and database. You'll be asked for the `postgres` password:
   ```bash
   "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -f server/db/create-db.sql
   ```

The connection string lives in `server/.env` (copy it from `server/.env.example`). It defaults to `postgres://returnguard:returnguard@localhost:5432/returnguard`.

**3. Create the tables and load the demo data.** This drops and recreates the ReturnGuard tables.

```bash
npm run db:setup
```

**4. Run the API and web app together:**

```bash
npm run dev
```

Open http://localhost:5173. The API runs on http://localhost:4000.

**Tests** (scoring rules):

```bash
npm test
```

### Demo walkthrough

The seed creates 143 customers and about 1,200 orders over the past year. Every historical return is scored through the same code path the live app uses. Three orders are set up for the intake screen:

| Order number   | Scenario | Expected result |
|----------------|----------|-----------------|
| `HC-DEMO-HIGH` | A serial returner sends back formalwear on day 28 of 30 | Medium or high, depending on the item. Goes to the queue. |
| `HC-DEMO-MED`  | A brand-new customer returns a coat on day 26 | Medium. Goes to the queue. |
| `HC-DEMO-LOW`  | A long-time customer who rarely returns sends back a tee on day 4 | Low. Approved automatically. |

Demo dates are relative to when you ran `db:setup`, so re-run it to reset them.

## How scoring works

The score runs from 0 to 100 and is the sum of five factors. Each factor records its points and a sentence explaining them, and both are stored with the return in `risk_scores.factors`.

| Factor | Max | What it looks at |
|---|---|---|
| **Return-rate history** | 35 | Items returned ÷ items bought before this request. Typical is 15%. 15–30% → 12, 30–45% → 22, over 45% → 35. New customers with fewer than 3 items get +8 (caution, not a red flag). Loyal customers (10+ items, ≤10% returned) get **−10**. |
| **Recent return activity** | 15 | Returns in the last 90 days: 2–3 → 6, 4–5 → 10, 6+ → 15 |
| **Days to return** | 25 | Days from delivery to request: up to 14 → 0, 15–24 → 6, last 5 days of the 30-day window → 18, past the window → 25 |
| **Item category** | 15 | Base risk per category. Occasion wear 15; outerwear, handbags and small appliances 9; bedding 1. |
| **Late return of a commonly-misused item** | 10 | A wardrobing-prone category returned in the last 10 days of the window |

**Risk levels:** 0–34 low (auto-approved), 35–59 medium (review), 60+ high (hold the refund).

Customer history only counts activity *before* the request, so scores are fair and can be reproduced for past returns. Each score also records `model_version`. When you change thresholds in `riskScorer.js`, bump `MODEL_VERSION` so older and newer scores can be told apart.

Example summary a staff member sees:

> **High risk (88/100).** Main reasons: returns 64% of purchases (typical is 15%); requested on day 28 of a 30-day window; and occasion & formal wear is a high-risk category.
> **What to do:** Hold the refund. Inspect the item carefully before refunding and deny it if it shows signs of use.

## API

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/health` | Checks the API and database |
| GET  | `/api/meta` | Category, reason and status labels, plus scoring config |
| GET  | `/api/orders/search?q=` | Find orders by order #, email or name |
| GET  | `/api/orders/recent` | Recently delivered orders that still have returnable items |
| GET  | `/api/orders/:orderNumber` | Order with its items and each item's return status |
| POST | `/api/returns` | `{ orderItemId, reason, reasonDetails? }` → scores the return, then auto-approves it or queues it |
| GET  | `/api/returns?status=&level=&q=&sort=risk\|newest\|oldest&limit=&offset=` | Queue and list |
| GET  | `/api/returns/:id` | Full detail with factors, customer history and other returns |
| POST | `/api/returns/:id/decision` | `{ decision: "approve"\|"deny", reviewer, note }`. A note is required to deny. |
| GET  | `/api/dashboard?weeks=12` | Trend aggregates |

Return reasons: `wrong_size`, `not_as_described`, `changed_mind`, `damaged`, `wrong_item`, `quality`, `other`.

## Before production

- **Authentication.** Reviewers currently type their name, and it is saved in their browser. Put the app behind Harlow's SSO and take the reviewer from the session.
- **Calibration.** The thresholds are sensible starting points. Once a few months of staff decisions exist, compare deny rates for each factor and tune the points. The dashboard's "main reasons" panel helps here.
- **Policy settings.** The 30-day window and the 15% baseline return rate are constants in `riskScorer.js`. Move them to config if they vary by region or category.
