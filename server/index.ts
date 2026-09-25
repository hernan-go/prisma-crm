import 'dotenv/config';
import { createApp } from './app.js';
import { pool } from './db.js';
if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.APP_URL?.startsWith('https://') || !process.env.DB_PASSWORD)
)
  throw new Error('Configurá APP_URL HTTPS y DB_PASSWORD en producción.');
const server = createApp().listen(Number(process.env.PORT || 3001), '0.0.0.0', () =>
  console.log('PRISMA CRM iniciado.'),
);
for (const event of ['SIGTERM', 'SIGINT'])
  process.on(event, () =>
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    }),
  );
