import { Router, type ErrorRequestHandler, type RequestHandler } from 'express';

// Relative to /api/portal. These contracts do not authorize any operation.
export const portalAuthRoutes = [
  { method: 'GET', path: '/auth/session' },
  { method: 'POST', path: '/auth/google/start' },
  { method: 'GET', path: '/auth/google/callback' },
  { method: 'POST', path: '/auth/google/finish' },
  { method: 'POST', path: '/auth/logout' },
] as const satisfies ReadonlyArray<{ method: 'GET' | 'POST'; path: string }>;

export const portalUnavailable: RequestHandler = (_req, res) => {
  res.set('Cache-Control', 'no-store').status(503).json({
    code: 'portal_unavailable',
    message: 'Portal no disponible.',
  });
};

// Always closed in Block 1: no environment activation, DB, cookies or body parser.
// Future functional POST handlers own exact-Origin/CSRF checks. Logout must remain
// available when policy is disabled or a session expires; this stub is NOT logout.
export function portalRouter() {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  for (const route of portalAuthRoutes) {
    router.all(route.path, (req, res, next) => {
      // Explicitly reject implicit GET -> HEAD and automatic OPTIONS success.
      if (req.method !== route.method) {
        res.set('Allow', route.method).status(405).json({
          code: 'portal_method_not_allowed',
          message: 'Método no permitido.',
        });
        return;
      }
      portalUnavailable(req, res, next);
    });
  }
  router.use((_req, res) => {
    res.status(404).json({ code: 'portal_not_found', message: 'Ruta portal no encontrada.' });
  });
  const errorHandler: ErrorRequestHandler = (_error, _req, res, _next) => {
    res.set('Cache-Control', 'no-store').status(500).json({
      code: 'portal_error',
      message: 'No se pudo completar la solicitud portal.',
    });
  };
  router.use(errorHandler);
  return router;
}
