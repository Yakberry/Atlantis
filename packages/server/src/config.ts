import { resolve } from 'node:path';

// .env необязателен: если файла нет, используются значения по умолчанию ниже.
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

export const config = {
  port: Number(env('PORT', '3000')),
  host: env('HOST', '0.0.0.0'),
  databaseUrl: env('DATABASE_URL', 'postgres://atlantis:atlantis@localhost:5432/atlantis'),
  migrationsDir: resolve('migrations'),
} as const;
