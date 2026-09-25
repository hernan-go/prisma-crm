import 'dotenv/config';
import mysql, {
  type PoolConnection,
  type RowDataPacket,
  type ResultSetHeader,
} from 'mysql2/promise';
export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'prisma',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'prisma',
  connectionLimit: 8,
  charset: 'utf8mb4',
  dateStrings: true,
  timezone: 'Z',
  ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: true } } : {}),
});
export type Connection = Pick<PoolConnection, 'execute'>;
export async function query<T = Record<string, any>>(
  sql: string,
  values: any[] = [],
  db: Connection = pool,
): Promise<T[]> {
  const [rows] = await db.execute<RowDataPacket[]>(sql, values);
  return rows as T[];
}
export async function execute(sql: string, values: any[] = [], db: Connection = pool) {
  const [r] = await db.execute<ResultSetHeader>(sql, values);
  return r;
}
export async function transaction<T>(fn: (db: PoolConnection) => Promise<T>) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const result = await fn(db);
    await db.commit();
    return result;
  } catch (e) {
    await db.rollback();
    throw e;
  } finally {
    db.release();
  }
}
// Serialize person writes across processes so duplicate checks cannot race imports.
export async function peopleTransaction<T>(fn: (db: PoolConnection) => Promise<T>) {
  const db = await pool.getConnection();
  let locked = false;
  try {
    const [rows] = await db.query("SELECT GET_LOCK(CONCAT(DATABASE(), ':people'),15) acquired");
    locked = Boolean((rows as any)[0].acquired);
    if (!locked) throw new Error('Person write lock timeout');
    await db.beginTransaction();
    const result = await fn(db);
    await db.commit();
    return result;
  } catch (e) {
    await db.rollback();
    throw e;
  } finally {
    if (locked) await db.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':people'))");
    db.release();
  }
}
