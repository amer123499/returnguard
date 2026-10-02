import { Router } from 'express';
import { getDashboard } from '../services/dashboardService.js';

export default function dashboardRouter(db) {
  const router = Router();
  router.get('/', async (req, res, next) => {
    try {
      res.json(await getDashboard(db, { weeks: req.query.weeks }));
    } catch (err) { next(err); }
  });
  return router;
}
