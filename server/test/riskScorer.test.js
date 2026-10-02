import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreReturn, levelFor, CATEGORIES } from '../src/scoring/riskScorer.js';
import { daysBetween } from '../src/services/returnService.js';

const loyal = { itemsPurchased: 24, priorReturns: 1, returnsLast90Days: 0 };
const serialReturner = { itemsPurchased: 14, priorReturns: 9, returnsLast90Days: 5 };
const brandNew = { itemsPurchased: 0, priorReturns: 0, returnsLast90Days: 0 };

test('classic wardrobing case scores high and names the reasons', () => {
  const r = scoreReturn({ history: serialReturner, daysToReturn: 28, category: 'occasion_wear' });
  assert.equal(r.riskLevel, 'high');
  assert.equal(r.score, 35 + 10 + 18 + 15 + 10);
  assert.match(r.summary, /High risk/);
  assert.match(r.summary, /64% of purchases/);
  assert.match(r.summary, /day 28 of a 30-day window/);
  assert.match(r.recommendation, /Hold the refund/);
});

test('loyal customer returning a tee early is low risk', () => {
  const r = scoreReturn({ history: loyal, daysToReturn: 4, category: 'everyday_apparel' });
  assert.equal(r.riskLevel, 'low');
  assert.equal(r.score, 0); // -10 loyalty, +2 category, clamped at 0
  assert.match(r.summary, /No strong warning signs/);
  assert.match(r.summary, /Loyal customer/);
});

test('good customer returning a formal dress late is flagged for review, not high', () => {
  const normal = { itemsPurchased: 8, priorReturns: 1, returnsLast90Days: 0 };
  const r = scoreReturn({ history: normal, daysToReturn: 27, category: 'occasion_wear' });
  assert.equal(r.riskLevel, 'medium');
});

test('new customer gets a small caution, not a flag, for an ordinary return', () => {
  const r = scoreReturn({ history: brandNew, daysToReturn: 5, category: 'everyday_apparel' });
  assert.equal(r.riskLevel, 'low');
  const rate = r.factors.find((f) => f.key === 'return_rate');
  assert.equal(rate.points, 8);
  assert.match(rate.detail, /New customer/);
});

test('returns outside the window get the maximum timing points', () => {
  const r = scoreReturn({ history: loyal, daysToReturn: 34, category: 'bedding_bath' });
  const timing = r.factors.find((f) => f.key === 'timing');
  assert.equal(timing.points, 25);
  assert.match(timing.detail, /outside the 30-day return window/);
});

test('every factor carries a plain-language explanation', () => {
  for (const category of Object.keys(CATEGORIES)) {
    const r = scoreReturn({ history: serialReturner, daysToReturn: 12, category });
    assert.equal(r.factors.length, 5);
    for (const f of r.factors) {
      assert.ok(f.detail.length > 20, `${f.key} has an explanation`);
      assert.ok(['raises', 'lowers', 'neutral'].includes(f.impact));
    }
  }
});

test('score is always within 0-100', () => {
  const worst = { itemsPurchased: 10, priorReturns: 10, returnsLast90Days: 20 };
  assert.equal(scoreReturn({ history: worst, daysToReturn: 60, category: 'occasion_wear' }).score, 100);
});

test('risk level thresholds', () => {
  assert.equal(levelFor(34).level, 'low');
  assert.equal(levelFor(35).level, 'medium');
  assert.equal(levelFor(59).level, 'medium');
  assert.equal(levelFor(60).level, 'high');
});

test('rejects unknown categories and bad day counts', () => {
  assert.throws(() => scoreReturn({ history: loyal, daysToReturn: 3, category: 'spaceships' }), /Unknown category/);
  assert.throws(() => scoreReturn({ history: loyal, daysToReturn: -1, category: 'shoes' }));
});

test('daysBetween counts calendar days from delivery', () => {
  assert.equal(daysBetween('2026-09-01', '2026-09-29T15:00:00Z'), 28);
  assert.equal(daysBetween('2026-09-29', '2026-09-29T01:00:00Z'), 0);
});
