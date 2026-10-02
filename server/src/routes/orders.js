import { Router } from 'express';
import { searchOrders, recentReturnableOrders, getOrder } from '../services/orderService.js';

export default function ordersRouter(db) {
  const router = Router();

  router.get('/search', async (req, res, next) => {
    try {
      res.json(await searchOrders(db, req.query.q));
    } catch (err) { next(err); }
  });

  router.get('/recent', async (_req, res, next) => {
    try {
      res.json(await recentReturnableOrders(db));
    } catch (err) { next(err); }
  });

  router.get('/:orderNumber', async (req, res, next) => {
    try {
      res.json(await getOrder(db, req.params.orderNumber));
    } catch (err) { next(err); }
  });

  return router;
}
