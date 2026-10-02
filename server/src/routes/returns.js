import { Router } from 'express';
import { ApiError } from '../errors.js';
import {
  createReturn, listReturns, getReturnDetail, decideReturn,
} from '../services/returnService.js';

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'Invalid return id.');
  return id;
}

export default function returnsRouter(db) {
  const router = Router();

  // Submit a return request — scored immediately, then auto-approved or queued.
  router.post('/', async (req, res, next) => {
    const { orderItemId, reason, reasonDetails } = req.body || {};
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const created = await createReturn(client, {
        orderItemId: Number(orderItemId),
        reason,
        reasonDetails: typeof reasonDetails === 'string' ? reasonDetails.slice(0, 1000) : null,
      });
      await client.query('COMMIT');
      res.status(201).json(created);
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return next(new ApiError(409, 'A return has already been requested for this item.'));
      next(err);
    } finally {
      client.release();
    }
  });

  router.get('/', async (req, res, next) => {
    try {
      res.json(await listReturns(db, req.query));
    } catch (err) { next(err); }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      res.json(await getReturnDetail(db, parseId(req.params.id)));
    } catch (err) { next(err); }
  });

  router.post('/:id/decision', async (req, res, next) => {
    try {
      res.json(await decideReturn(db, parseId(req.params.id), req.body || {}));
    } catch (err) { next(err); }
  });

  return router;
}
