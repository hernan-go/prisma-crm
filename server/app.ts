import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import { resolve } from 'node:path';
import { api } from './routes.js';
import { AppError } from './errors.js';
import { authentication, type AuthOptions } from './auth.js';
import { aiIntegration, type AiIntegrationOptions } from './integrations/ai-router.js';
export function createApp(authOptions: AuthOptions = {}, aiOptions: AiIntegrationOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));
  app.use(helmet());
  // Separate, terminal namespace: service credentials never reach administrative routes.
  // Mount before browser CORS/body parsing/session auth; this router owns safe errors.
  app.use('/api/integrations/ai', aiIntegration(aiOptions));
  app.use(cors({ origin: process.env.APP_URL || 'http://localhost:5173', credentials: true }));
  app.use(express.json({ limit: '8mb' }));
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 240,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: 'Demasiadas solicitudes. Esperá un minuto.' },
    }),
  );
  // Origin checks apply to login and all administrative writes.
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin && origin !== (process.env.APP_URL || 'http://localhost:5173'))
        return res.status(403).json({ message: 'Origen de solicitud no permitido.' });
      if (req.get('sec-fetch-site') === 'cross-site')
        return res.status(403).json({ message: 'Solicitud externa no permitida.' });
    }
    next();
  });
  const auth = authentication(authOptions);
  app.use('/api/auth', auth.router);
  app.use('/api', auth.guard);
  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ message: 'Ruta no encontrada.' }));
  app.use(express.static(resolve('dist/client')));
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/client/index.html')));
  app.use(
    (error: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (error instanceof ZodError)
        return res
          .status(422)
          .json({ message: error.issues.map((i) => i.message).join(' '), issues: error.issues });
      if (error instanceof AppError)
        return res.status(error.status).json({ message: error.message, details: error.details });
      if (error.code === 'ER_DUP_ENTRY')
        return res.status(409).json({ message: 'Ya existe un registro con estos datos.' });
      if (error.code === 'ER_NO_REFERENCED_ROW_2')
        return res.status(422).json({ message: 'La persona, actividad o período no existe.' });
      if (error.code === 'LIMIT_FILE_SIZE')
        return res.status(413).json({ message: 'El archivo supera 5 MB.' });
      if (error.type === 'entity.parse.failed')
        return res.status(400).json({ message: 'Solicitud JSON inválida.' });
      console.error('Request failed', { code: error.code || error.name });
      return res
        .status(500)
        .json({ message: 'No se pudo completar la operación. Intentá nuevamente.' });
    },
  );
  return app;
}
