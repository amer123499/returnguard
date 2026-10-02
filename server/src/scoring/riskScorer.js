/**
 * ReturnGuard risk scorer.
 *
 * A transparent, rule-based scoring function. Every point added to (or taken
 * off) a return's score comes from a named factor with a plain-language
 * explanation, so staff can always see *why* a return was flagged.
 *
 * Factor budget (max points):
 *   Return-rate history ......... 35  (can also subtract 10 for loyal, low-return customers)
 *   Recent return activity ...... 15
 *   Days to return .............. 25
 *   Item category ............... 15
 *   Late return of risky item ... 10  (interaction of timing x category)
 *                                ----
 *                                 100
 *
 * This module is pure (no database access) so it can be unit-tested and
 * reused by the API and the seed script alike.
 */

export const MODEL_VERSION = 'rg-rules-1.0';
export const RETURN_WINDOW_DAYS = 30;
/** Share of purchased items the typical Harlow customer returns. */
export const BASELINE_RETURN_RATE = 0.15;

export const RISK_LEVELS = [
  { level: 'low', min: 0, label: 'Low risk' },
  { level: 'medium', min: 35, label: 'Medium risk' },
  { level: 'high', min: 60, label: 'High risk' },
];

/**
 * Item categories. `points` is the category's base risk; `wardrobingProne`
 * marks categories that are commonly used once and sent back.
 */
export const CATEGORIES = {
  occasion_wear: {
    label: 'Occasion & formal wear',
    points: 15,
    wardrobingProne: true,
    note: 'Occasion and formal wear is the most "wardrobed" category at Harlow: bought for one event, worn once, then returned.',
  },
  outerwear: {
    label: 'Coats & outerwear',
    points: 9,
    wardrobingProne: true,
    note: 'Coats and outerwear are often worn for a trip or cold snap and then returned.',
  },
  handbags_accessories: {
    label: 'Handbags & accessories',
    points: 9,
    wardrobingProne: true,
    note: 'Handbags and statement accessories are frequently borrowed for an occasion and returned.',
  },
  small_appliances: {
    label: 'Small appliances',
    points: 9,
    wardrobingProne: true,
    note: 'Small appliances are sometimes used for a holiday or event and then returned as "unwanted".',
  },
  home_decor: {
    label: 'Home décor',
    points: 6,
    wardrobingProne: true,
    note: 'Décor pieces are sometimes used to stage a party, photo shoot or house viewing and then returned.',
  },
  shoes: {
    label: 'Shoes',
    points: 6,
    wardrobingProne: false,
    note: 'Shoes have a moderate return rate, mostly for fit.',
  },
  activewear: {
    label: 'Activewear',
    points: 5,
    wardrobingProne: false,
    note: 'Activewear has a moderate return rate, mostly for fit.',
  },
  everyday_apparel: {
    label: 'Everyday apparel',
    points: 2,
    wardrobingProne: false,
    note: 'Everyday apparel returns are usually about size or fit and rarely involve misuse.',
  },
  kitchen_dining: {
    label: 'Kitchen & dining',
    points: 2,
    wardrobingProne: false,
    note: 'Kitchen and dining returns are usually about breakage or quality and rarely involve misuse.',
  },
  bedding_bath: {
    label: 'Bedding & bath',
    points: 1,
    wardrobingProne: false,
    note: 'Bedding and bath items are rarely involved in return fraud.',
  },
};

const pct = (x) => `${Math.round(x * 100)}%`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function factor(key, label, points, maxPoints, detail, short, evidence) {
  const impact = points > 0 ? 'raises' : points < 0 ? 'lowers' : 'neutral';
  return { key, label, points, maxPoints, impact, detail, short, evidence };
}

/* ---------- individual factors ---------- */

export function returnRateFactor(history) {
  const { itemsPurchased = 0, priorReturns = 0 } = history;
  const label = 'Return-rate history';
  const evidence = { itemsPurchased, priorReturns, baselineRate: BASELINE_RETURN_RATE };

  if (itemsPurchased < 3) {
    return factor(
      'return_rate', label, 8, 35,
      `New customer: only ${plural(itemsPurchased, 'item')} bought before this return, so there is little history to go on. This adds a small amount of caution — it is not a red flag on its own.`,
      'new customer with little purchase history',
      { ...evidence, returnRate: null },
    );
  }

  const rate = priorReturns / itemsPurchased;
  evidence.returnRate = Number(rate.toFixed(3));
  const base = `Has returned ${priorReturns} of ${plural(itemsPurchased, 'item')} bought (${pct(rate)}).`;
  const typical = `The typical Harlow customer returns about ${pct(BASELINE_RETURN_RATE)}`;

  if (itemsPurchased >= 10 && rate <= 0.1) {
    return factor('return_rate', label, -10, 35,
      `${base} This is a long-standing customer who rarely returns anything, which lowers the risk.`,
      'loyal customer who rarely returns', evidence);
  }
  if (rate <= BASELINE_RETURN_RATE) {
    return factor('return_rate', label, 0, 35,
      `${base} ${typical}, so this is normal.`,
      'normal return rate', evidence);
  }
  const multiple = (rate / BASELINE_RETURN_RATE).toFixed(1);
  let points;
  if (rate <= 0.3) points = 12;
  else if (rate <= 0.45) points = 22;
  else points = 35;
  return factor('return_rate', label, points, 35,
    `${base} ${typical}, so this customer returns about ${multiple}× as often as normal.`,
    `returns ${pct(rate)} of purchases (typical is ${pct(BASELINE_RETURN_RATE)})`, evidence);
}

export function recentActivityFactor(history) {
  const { returnsLast90Days = 0 } = history;
  const label = 'Recent return activity';
  const evidence = { returnsLast90Days };
  let points = 0;
  if (returnsLast90Days >= 6) points = 15;
  else if (returnsLast90Days >= 4) points = 10;
  else if (returnsLast90Days >= 2) points = 6;

  if (points === 0) {
    return factor('recent_activity', label, 0, 15,
      `${plural(returnsLast90Days, 'other return')} in the last 90 days — nothing unusual.`,
      'no unusual recent returns', evidence);
  }
  return factor('recent_activity', label, points, 15,
    `${plural(returnsLast90Days, 'other return')} in the last 90 days. A burst of returns in a short period can indicate a habit of buying to use and send back.`,
    `${plural(returnsLast90Days, 'return')} in the last 90 days`, evidence);
}

export function timingFactor(daysToReturn, windowDays = RETURN_WINDOW_DAYS) {
  const label = 'Days to return';
  const evidence = { daysToReturn, windowDays };
  if (daysToReturn > windowDays) {
    return factor('timing', label, 25, 25,
      `Requested ${daysToReturn} days after delivery — outside the ${windowDays}-day return window.`,
      `requested outside the ${windowDays}-day return window (day ${daysToReturn})`, evidence);
  }
  if (daysToReturn >= windowDays - 5) {
    return factor('timing', label, 18, 25,
      `Requested on day ${daysToReturn} of a ${windowDays}-day window. Returns at the very end of the window are a common sign the item was worn or used and then sent back.`,
      `requested on day ${daysToReturn} of a ${windowDays}-day window`, evidence);
  }
  if (daysToReturn >= 15) {
    return factor('timing', label, 6, 25,
      `Requested ${daysToReturn} days after delivery. Size and fit problems are usually noticed in the first two weeks, so a later return deserves a little more attention.`,
      `requested ${daysToReturn} days after delivery`, evidence);
  }
  return factor('timing', label, 0, 25,
    `Requested ${plural(daysToReturn, 'day')} after delivery. Early returns usually mean a size, fit or quality issue.`,
    'returned promptly', evidence);
}

export function categoryFactor(category) {
  const cfg = CATEGORIES[category];
  if (!cfg) throw new Error(`Unknown category: ${category}`);
  return factor('category', 'Item category', cfg.points, 15, cfg.note,
    `${cfg.label.toLowerCase()} is a ${cfg.points >= 9 ? 'high' : cfg.points >= 5 ? 'moderate' : 'low'}-risk category`,
    { category, categoryLabel: cfg.label });
}

export function lateRiskyItemFactor(category, daysToReturn, windowDays = RETURN_WINDOW_DAYS) {
  const cfg = CATEGORIES[category];
  const label = 'Late return of a commonly-misused item';
  const late = daysToReturn >= windowDays - 10;
  const evidence = { category, daysToReturn, wardrobingProne: cfg.wardrobingProne };
  if (cfg.wardrobingProne && late) {
    return factor('late_risky_item', label, 10, 10,
      `A ${cfg.label.toLowerCase()} item returned late in the window matches the classic "use it once, send it back" (wardrobing) pattern.`,
      'late return matches the wardrobing pattern', evidence);
  }
  return factor('late_risky_item', label, 0, 10,
    'The combination of item type and timing does not match the wardrobing pattern.',
    'does not match the wardrobing pattern', evidence);
}

/* ---------- overall score ---------- */

export function levelFor(score) {
  let result = RISK_LEVELS[0];
  for (const lvl of RISK_LEVELS) if (score >= lvl.min) result = lvl;
  return result;
}

const RECOMMENDATIONS = {
  low: 'Safe to approve. No warning signs — this return can be refunded automatically.',
  medium: 'Review before refunding. When the item arrives, check for signs of wear: missing tags, creases, odours, or makeup and deodorant marks.',
  high: 'Hold the refund. Inspect the item carefully before refunding and deny it if it shows signs of use. Refer repeat cases to Loss Prevention.',
};

/**
 * Score a return request.
 *
 * @param {object} input
 * @param {object} input.history  { itemsPurchased, priorReturns, returnsLast90Days }
 *                                 — counted *before* this return request.
 * @param {number} input.daysToReturn  days between delivery and the return request
 * @param {string} input.category      one of the keys of CATEGORIES
 * @param {number} [input.windowDays]
 */
export function scoreReturn({ history, daysToReturn, category, windowDays = RETURN_WINDOW_DAYS }) {
  if (!Number.isFinite(daysToReturn) || daysToReturn < 0) {
    throw new Error('daysToReturn must be a non-negative number');
  }
  const factors = [
    returnRateFactor(history),
    recentActivityFactor(history),
    timingFactor(daysToReturn, windowDays),
    categoryFactor(category),
    lateRiskyItemFactor(category, daysToReturn, windowDays),
  ];

  const raw = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const { level, label } = levelFor(score);

  const drivers = factors
    .filter((f) => f.points > 0)
    .sort((a, b) => b.points - a.points);
  const reassurances = factors.filter((f) => f.points < 0);

  let summary;
  if (level === 'low') {
    const why = reassurances.length
      ? ` ${capitalize(reassurances[0].short)}.`
      : '';
    summary = `${label} (${score}/100). No strong warning signs.${why}`;
  } else {
    const reasons = drivers.slice(0, 3).map((f) => f.short);
    summary = `${label} (${score}/100). Main reasons: ${joinList(reasons)}.`;
  }

  return {
    score,
    riskLevel: level,
    riskLabel: label,
    factors: [...factors].sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
    summary,
    recommendation: RECOMMENDATIONS[level],
    modelVersion: MODEL_VERSION,
  };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join('; ')}; and ${items[items.length - 1]}`;
}
