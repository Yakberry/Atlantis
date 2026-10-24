import type { z } from 'zod';
import type { ChatMessage, RoomSnapshot } from './domain';
import type { GameEvent } from './game';
import type { chatSendSchema, configureRoomSchema, gameActionPayloadSchema, roomRefSchema } from './schemas';

export type AckResult<T> = { ok: true; data: T } | { ok: false; error: string };
export type Ack<T> = (result: AckResult<T>) => void;

type RoomRef = z.input<typeof roomRefSchema>;
type ConfigureRoomPayload = z.input<typeof configureRoomSchema>;
type GameActionPayload = z.input<typeof gameActionPayloadSchema>;
type ChatSendPayload = z.input<typeof chatSendSchema>;

export interface ClientToServerEvents {
  'room:create': (ack: Ack<RoomSnapshot>) => void;
  'room:join': (payload: RoomRef, ack: Ack<{ room: RoomSnapshot; history: ChatMessage[] }>) => void;
  /** Выйти из комнаты насовсем. */
  'room:leave': (payload: RoomRef, ack: Ack<void>) => void;
  /** Закрыли экран комнаты, но остались участником: перестать получать её события. */
  'room:detach': () => void;
  /** Настройки лобби (только хост, только до старта игры). */
  'room:configure': (payload: ConfigureRoomPayload, ack: Ack<void>) => void;
  'game:start': (payload: RoomRef, ack: Ack<void>) => void;
  /** В ответ приходят события действия (например, сколько добыто). */
  'game:action': (payload: GameActionPayload, ack: Ack<GameEvent[]>) => void;
  'chat:send': (payload: ChatSendPayload, ack: Ack<void>) => void;
}

export interface ServerToClientEvents {
  'room:updated': (room: RoomSnapshot) => void;
  'chat:message': (message: ChatMessage) => void;
}
