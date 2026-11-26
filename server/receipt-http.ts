import { Router } from 'express';
import { z } from 'zod';
import { AppError } from './errors.js';
import { receiptRequestContext } from './receipt-financial-guard.js';
import {
  previewPaymentReceipt,
  mutatePaymentReceipt,
  readPaymentReceipts,
} from './payment-receipts.js';

export const paymentReceiptRouter = Router();
paymentReceiptRouter.use((_req, res, next) => {
  const principal: unknown = res.locals.principal;
  const identity = z
    .object({ kind: z.literal('identity'), roles: z.array(z.string()) })
    .safeParse(principal);
  if (!identity.success || !identity.data.roles.includes('admin'))
    throw new AppError(403, 'Requiere sesión Google administrativa individual.');
  next();
});
const id = z.coerce.number().int().positive();
paymentReceiptRouter.get('/', async (req, res) =>
  res.json(
    await readPaymentReceipts(receiptRequestContext(req).token, {
      personId: id.parse(req.query.person_id),
      ...(req.query.period_id ? { periodId: id.parse(req.query.period_id) } : {}),
      ...(req.query.before ? { before: z.string().parse(req.query.before) } : {}),
    }),
  ),
);
paymentReceiptRouter.get('/:number', async (req, res) =>
  res.json(
    await readPaymentReceipts(receiptRequestContext(req).token, {
      number: z.string().parse(req.params.number),
    }),
  ),
);
paymentReceiptRouter.post('/preview', async (req, res) =>
  res.json(await previewPaymentReceipt(receiptRequestContext(req).token, req.body)),
);
paymentReceiptRouter.post('/operations', async (req, res) =>
  res.json(await mutatePaymentReceipt(receiptRequestContext(req).token, req.body)),
);
