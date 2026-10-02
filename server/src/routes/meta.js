import { Router } from 'express';
import {
  CATEGORIES, RISK_LEVELS, MODEL_VERSION, RETURN_WINDOW_DAYS, BASELINE_RETURN_RATE,
} from '../scoring/riskScorer.js';
import { RETURN_REASONS, STATUS_LABELS } from '../services/returnService.js';

/** Labels and scoring configuration the UI needs, so they live in one place. */
export default function metaRouter() {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({
      modelVersion: MODEL_VERSION,
      returnWindowDays: RETURN_WINDOW_DAYS,
      baselineReturnRate: BASELINE_RETURN_RATE,
      riskLevels: RISK_LEVELS,
      categories: Object.fromEntries(
        Object.entries(CATEGORIES).map(([k, v]) => [k, { label: v.label, points: v.points, wardrobingProne: v.wardrobingProne }]),
      ),
      reasons: RETURN_REASONS,
      statuses: STATUS_LABELS,
    });
  });
  return router;
}
