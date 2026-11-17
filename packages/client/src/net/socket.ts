import type { AckResult, ClientToServerEvents, ServerToClientEvents } from '@atlantis/shared';
import { io, type Socket } from 'socket.io-client';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Адрес сервера: пусто — тот же домен (обычный случай). Для раздельного хостинга задайте VITE_SERVER_URL при сборке клиента. */
export const SERVER_URL: string = import.meta.env.VITE_SERVER_URL ?? '';

export const createSocket = (token: string): AppSocket => io(SERVER_URL || undefined, { auth: { token } });

export function unwrap<T>(result: AckResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}
