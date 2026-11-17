import { createSessionSchema } from '@atlantis/shared';
import type { FastifyInstance } from 'fastify';
import { config } from '../config';
import { pool } from '../db/pool';
import { createPlayer } from '../modules/players/player.repository';

const HOUR = 3_600_000;
const sessionHits = new Map<string, number[]>();

/** Не больше `sessionsPerHourPerIp` новых игроков в час с одного адреса: иначе таблицу игроков можно засорить. */
function allowSession(ip: string): boolean {
  const now = Date.now();
  if (sessionHits.size > 5000) {
    for (const [key, times] of sessionHits) if (times.every((time) => now - time >= HOUR)) sessionHits.delete(key);
  }
  const recent = (sessionHits.get(ip) ?? []).filter((time) => now - time < HOUR);
  const allowed = recent.length < config.sessionsPerHourPerIp;
  if (allowed) recent.push(now);
  sessionHits.set(ip, recent);
  return allowed;
}

export function registerHttp(app: FastifyInstance): void {
  /** Процесс жив (для проверок хостинга). */
  app.get('/healthz', async () => ({ ok: true }));
  /** Процесс готов принимать игроков: база отвечает. */
  app.get('/readyz', async (_request, reply) => {
    try {
      await pool.query('select 1');
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  app.post('/api/session', async (request, reply) => {
    if (!allowSession(request.ip)) return reply.code(429).send({ error: 'Слишком много новых игроков с вашего адреса, попробуйте позже' });
    const body = createSessionSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Имя: от 2 до 24 символов' });
    return createPlayer(pool, body.data.name);
  });
}
