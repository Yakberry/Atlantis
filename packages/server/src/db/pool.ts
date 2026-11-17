import pg from 'pg';
import { config } from '../config';

const ssl = config.databaseSsl === 'false' ? undefined : { rejectUnauthorized: config.databaseSsl !== 'no-verify' };

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.poolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl,
});

// Ошибка простаивающего соединения (например, база перезапустилась) не должна ронять процесс.
pool.on('error', (error) => console.error('Ошибка пула соединений:', error.message));

/** Всё, что умеет выполнять запросы: и пул, и клиент внутри транзакции. */
export type Db = Pick<pg.Pool, 'query'>;

export async function transaction<T>(run: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await run(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
