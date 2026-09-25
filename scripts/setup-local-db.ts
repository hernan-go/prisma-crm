import mysql from 'mysql2/promise';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
// Only for the disposable, loopback-only MySQL instance described in README.
const c = await mysql.createConnection({ host: '127.0.0.1', port: 3307, user: 'root' });
const password = randomBytes(24).toString('hex');
await c.query(
  'CREATE DATABASE IF NOT EXISTS prisma_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci',
);
await c.query(
  'CREATE DATABASE IF NOT EXISTS prisma_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci',
);
await c.query("CREATE USER IF NOT EXISTS 'prisma_local'@'localhost' IDENTIFIED BY ?", [password]);
await c.query("ALTER USER 'prisma_local'@'localhost' IDENTIFIED BY ?", [password]);
await c.query("GRANT ALL PRIVILEGES ON prisma_dev.* TO 'prisma_local'@'localhost'");
await c.query("GRANT ALL PRIVILEGES ON prisma_test.* TO 'prisma_local'@'localhost'");
const rootPassword = randomBytes(24).toString('hex');
await c.query("ALTER USER 'root'@'localhost' IDENTIFIED BY ?", [rootPassword]);
await writeFile(
  '.env',
  `NODE_ENV=development\nPORT=3001\nAPP_URL=http://localhost:3001\nDB_HOST=127.0.0.1\nDB_PORT=3307\nDB_NAME=prisma_dev\nDB_USER=prisma_local\nDB_PASSWORD=${password}\nDB_SSL=false\n`,
);
await writeFile(
  'private/local-mysql-admin.json',
  JSON.stringify({ host: '127.0.0.1', port: 3307, user: 'root', password: rootPassword }),
);
await c.end();
console.log('Bases locales listas. Credenciales generadas en archivos excluidos de Git.');
