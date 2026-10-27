import 'dotenv/config';
import { createApp } from './app.js';
import { pool } from './db.js';
import { registerProxyDiagnosticServer } from './proxy-diagnostics.js';
if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.APP_URL?.startsWith('https://') || !process.env.DB_PASSWORD)
)
  throw new Error('Configurá APP_URL HTTPS y DB_PASSWORD en producción.');
const host = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const app = createApp();
const server = app.listen(Number(process.env.PORT || 3001), host, () =>
  console.log('PRISMA CRM iniciado.'),
);
registerProxyDiagnosticServer(app, server);
for (const event of ['SIGTERM', 'SIGINT'])
  process.on(event, () =>
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    }),
  );
