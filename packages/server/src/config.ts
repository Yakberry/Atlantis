import { resolve } from 'node:path';

// .env необязателен: если файла нет, используются значения по умолчанию ниже (а на хостинге всё задаётся переменными окружения).
try {
  process.loadEnvFile(resolve('../../.env'));
} catch {
  /* нет .env: это нормально */
}

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (value === undefined) throw new Error(`Не задана переменная окружения ${key}`);
  return value;
}
function number(key: string, fallback: number): number {
  const value = Number(env(key, String(fallback)));
  if (!Number.isFinite(value) || value < 0) throw new Error(`Некорректное число в переменной ${key}`);
  return value;
}
const flag = (key: string, fallback: boolean) => ['1', 'true', 'yes', 'on'].includes(env(key, String(fallback)).toLowerCase());
const list = (key: string) =>
  env(key, '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const production = env('NODE_ENV', 'development') === 'production';

export const config = {
  production,
  port: number('PORT', 3000),
  host: env('HOST', '0.0.0.0'),
  logLevel: env('LOG_LEVEL', production ? 'info' : 'debug'),

  databaseUrl: env('DATABASE_URL', 'postgres://atlantis:atlantis@localhost:5432/atlantis'),
  /** `false` — без TLS (локальная база); `true`/`require` — TLS с проверкой сертификата; `no-verify` — TLS без проверки (некоторые бесплатные базы). */
  databaseSsl: env('DATABASE_SSL', 'false'),
  /** Размер пула соединений: не больше лимита соединений вашего тарифа базы. */
  poolMax: number('PG_POOL_MAX', 10),
  migrationsDir: resolve(env('MIGRATIONS_DIR', 'migrations')),

  /** Собранный клиент (если папка есть, его раздаёт этот же процесс). */
  clientDir: resolve(env('CLIENT_DIR', '../client/dist')),
  /** Доверять заголовкам обратного прокси (X-Forwarded-*): нужно на хостинге, чтобы видеть настоящий IP клиента. */
  trustProxy: flag('TRUST_PROXY', production),
  /** Разрешённые источники для запросов с другого домена (клиент и сервер на разных хостах), через запятую. Пусто — только тот же домен. */
  corsOrigins: list('CORS_ORIGIN'),

  // Защита от перегрузки и злоупотреблений.
  maxRooms: number('MAX_ROOMS', 60),
  maxConnections: number('MAX_CONNECTIONS', 400),
  socketEventsPerSecond: number('SOCKET_EVENTS_PER_SEC', 15),
  sessionsPerHourPerIp: number('SESSIONS_PER_HOUR_PER_IP', 30),
  /** Комнаты без действий дольше этого срока удаляются (участники и сообщения — каскадом). */
  roomTtlHours: number('ROOM_TTL_HOURS', 72),
} as const;
