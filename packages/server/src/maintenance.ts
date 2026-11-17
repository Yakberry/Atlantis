import type { FastifyBaseLogger } from 'fastify';
import { config } from './config';
import { pool } from './db/pool';

const HOUR = 3_600_000;

/**
 * Раз в час удаляет давно не использовавшиеся комнаты (участники и сообщения уходят каскадом), чтобы база
 * бесплатного тарифа не росла бесконечно. Возвращает функцию остановки.
 */
export function startCleanup(log: FastifyBaseLogger): () => void {
  const run = async () => {
    try {
      const result = await pool.query("delete from rooms where updated_at < now() - ($1::int * interval '1 hour')", [config.roomTtlHours]);
      if (result.rowCount) log.info({ rooms: result.rowCount }, 'удалены неактивные комнаты');
    } catch (error) {
      log.error(error, 'очистка комнат не удалась');
    }
  };
  const timer = setInterval(run, HOUR);
  timer.unref();
  void run();
  return () => clearInterval(timer);
}
