import pg from 'pg';
import 'dotenv/config';

// Return DATE columns as 'YYYY-MM-DD' strings instead of local-midnight Date
// objects, so day arithmetic is timezone-safe.
pg.types.setTypeParser(1082, (v) => v);
// NUMERIC -> JS number (amounts here are small and fit comfortably).
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

// No built-in fallback: credentials belong in server/.env, not in source code.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy server/.env.example to server/.env and fill it in.');
}

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
