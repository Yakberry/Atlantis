import { existsSync } from 'node:fs';
import compress from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import { config } from './config';
import { migrate } from './db/migrate';
import { pool } from './db/pool';
import { startCleanup } from './maintenance';
import { registerHttp } from './transport/http';
import { registerSocket, type AppServer } from './transport/socket';

async function main(): Promise<void> {
  await migrate();

  const app = Fastify({ logger: { level: config.logLevel }, trustProxy: config.trustProxy, bodyLimit: 16 * 1024 });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
  });
  await app.register(compress); // gzip/brotli для страниц и скриптов (до маршрутов, иначе хук их не заденет)
  registerHttp(app);

  // Собранный клиент отдаёт тот же процесс: одна служба вместо двух. В разработке папки нет: клиент раздаёт Vite.
  if (existsSync(config.clientDir)) {
    await app.register(fastifyStatic, {
      root: config.clientDir,
      wildcard: false,
      setHeaders: (res, path) => {
        // Файлы с хешем в имени кэшируются навсегда; index.html — всегда свежий, чтобы подхватывать новые версии.
        res.setHeader('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/socket.io/')) return reply.code(404).send({ error: 'Не найдено' });
      return reply.sendFile('index.html'); // маршруты клиента (/room/ABCDE) открываются прямой ссылкой
    });
  }

  const io: AppServer = new Server(app.server, {
    cors: config.corsOrigins.length > 0 ? { origin: config.corsOrigins } : undefined,
    maxHttpBufferSize: 64 * 1024, // клиенту незачем слать большие сообщения
    pingInterval: 25_000, // чаще, чем таймауты прокси на хостингах, чтобы соединение не считалось простаивающим
    pingTimeout: 20_000,
    perMessageDeflate: { threshold: 1024 }, // снимки состояния сжимаются примерно в 8 раз
  });
  registerSocket(io);
  const stopCleanup = startCleanup(app.log);

  await app.listen({ port: config.port, host: config.host });

  // Корректная остановка по сигналу хостинга: закрыть соединения и пул, не потеряв запросы в полёте.
  const shutdown = async (signal: string) => {
    app.log.info(`${signal}: останавливаемся`);
    setTimeout(() => process.exit(1), 10_000).unref();
    stopCleanup();
    io.disconnectSockets(true);
    await app.close();
    await pool.end();
    process.exit(0);
  };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
