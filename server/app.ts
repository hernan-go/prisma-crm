import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { ZodError } from 'zod';
import { resolve, posix } from 'node:path';
import { api } from './routes.js';
import { AppError } from './errors.js';
import { authentication, type AuthOptions } from './auth.js';
import { createPortalHttp, type PortalHttpOptions } from './portal-http.js';
import { portalEnvironment, portalRecoveryEnvironment } from './portal-http-runtime.js';
import { bindingRouter, bindingEnvironment, type BindingHttpOptions } from './binding-http.js';
import { aiIntegration, type AiIntegrationOptions } from './integrations/ai-router.js';
import {
  proposalIntegration,
  type ProposalIntegrationOptions,
} from './integrations/knowledge-proposals-router.js';
export function createApp(
  authOptions: AuthOptions = {},
  aiOptions: AiIntegrationOptions = {},
  proposalOptions: ProposalIntegrationOptions = {},
  bindingOptions: BindingHttpOptions | false | undefined = undefined,
  portalOptions: PortalHttpOptions | false | undefined = undefined,
) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', Number(process.env.TRUST_PROXY || 0));
  const binding = bindingOptions === false ? undefined : (bindingOptions ?? bindingEnvironment());
  app.use(
    helmet({
      referrerPolicy: { policy: 'same-origin' },
      contentSecurityPolicy: {
        directives: binding?.loginEnabled
          ? { formAction: ["'self'", 'https://accounts.google.com'] }
          : {},
      },
    }),
  );
  // Terminal portal boundary, before administrative parsing, CORS and auth.
  const portal = createPortalHttp(
    portalOptions === false ? undefined : (portalOptions ?? portalEnvironment()),
    portalOptions === undefined ? portalRecoveryEnvironment() : undefined,
  );
  app.use('/api/portal', portal.api);
  app.use('/app', portal.app);
  app.use(bindingRouter(binding));
  // Separate, terminal namespace: service credentials never reach administrative routes.
  // Mount before browser CORS/body parsing/session auth; this router owns safe errors.
  app.use('/api/integrations/ai', aiIntegration(aiOptions));
  app.use('/api/integrations/knowledge-proposals', proposalIntegration(proposalOptions));
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
  const auth = authentication({
    ...authOptions,
    identityEnabled: authOptions.identityEnabled ?? binding?.loginEnabled ?? false,
  });
  app.use('/api/auth', auth.router);
  app.use('/api', auth.guard);
  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ message: 'Ruta no encontrada.' }));
  const clientRoot = resolve('dist/client');
  // Match the decoded/normalized pathname used by static serving, including
  // encoded aliases and Windows' case-insensitive filesystem.
  app.use((req, res, next) => {
    let path: string;
    try {
      path = posix.normalize(decodeURIComponent(req.path)).toLowerCase();
    } catch {
      return res.sendStatus(400);
    }
    if (
      path === '/portal.html' ||
      path.startsWith('/portal.html/') ||
      path === '/tests/browser' ||
      path.startsWith('/tests/browser/')
    )
      return res.set('Cache-Control', 'no-store').sendStatus(404);
    next();
  });
  app.use(express.static(clientRoot));
  app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: clientRoot }));
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
