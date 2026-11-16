import {
  chatSendSchema,
  configureRoomSchema,
  gameActionPayloadSchema,
  roomRefSchema,
  tokenSchema,
  type Ack,
  type ChatMessage,
  type ClientToServerEvents,
  type Player,
  type Report,
  type ServerToClientEvents,
} from '@atlantis/shared';
import type { Server } from 'socket.io';
import type { z } from 'zod';
import { pool } from '../db/pool';
import { AppError } from '../errors';
import * as chat from '../modules/chat/chat.service';
import { findPlayerByToken } from '../modules/players/player.repository';
import * as rooms from '../modules/rooms/room.service';
import type { RoomState } from '../modules/rooms/room.service';
import { formatReport } from '../modules/rooms/room.reports';
import { snapshotFor } from '../modules/rooms/room.view';

type SocketData = { player: Player };
export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

function parse<S extends z.ZodTypeAny>(schema: S, payload: unknown): z.infer<S> {
  const result = schema.safeParse(payload);
  if (!result.success) throw new AppError('Некорректный запрос');
  return result.data;
}

/** Единая точка превращения исключений в ответ клиенту. */
async function respond<T>(ack: Ack<T>, run: () => Promise<T>): Promise<void> {
  if (typeof ack !== 'function') return;
  try {
    ack({ ok: true, data: await run() });
  } catch (error) {
    if (!(error instanceof AppError)) console.error(error);
    ack({ ok: false, error: error instanceof AppError ? error.message : 'Внутренняя ошибка сервера' });
  }
}

/** Каждому подписчику комнаты уходит его собственный снимок: у игроков разный туман войны. */
async function broadcast(io: AppServer, room: RoomState): Promise<void> {
  for (const socket of await io.in(room.id).fetchSockets()) {
    socket.emit('room:updated', snapshotFor(room, socket.data.player.id));
  }
}

/** Сообщение в чат: всем в комнате или только тем, кому положено его видеть. */
async function emitMessage(io: AppServer, roomId: string, message: ChatMessage, audience?: string[]): Promise<void> {
  if (!audience) {
    io.to(roomId).emit('chat:message', message);
    return;
  }
  for (const socket of await io.in(roomId).fetchSockets()) {
    if (audience.includes(socket.data.player.id)) socket.emit('chat:message', message);
  }
}

/** Отчёты о событиях игры уходят тем, кто о них вправе знать: текстом в чат (если он есть) и структурой для уведомлений. */
async function publishReports(io: AppServer, room: RoomState, reports: Report[]): Promise<void> {
  for (const { audience, data } of reports) {
    const text = formatReport(data, room);
    if (text !== null) await emitMessage(io, room.id, await chat.announce(room.id, text, audience), audience);
    for (const socket of await io.in(room.id).fetchSockets()) {
      if (audience.includes(socket.data.player.id)) socket.emit('game:report', data); // структурированно, для тостов
    }
  }
}

export function registerSocket(io: AppServer): void {
  io.use(async (socket, next) => {
    const token = tokenSchema.safeParse(socket.handshake.auth.token);
    const player = token.success ? await findPlayerByToken(pool, token.data) : null;
    if (!player) return next(new Error('unauthorized'));
    socket.data.player = player;
    next();
  });

  io.on('connection', (socket) => {
    const { player } = socket.data;

    const leaveRooms = async () => {
      for (const room of socket.rooms) if (room !== socket.id) await socket.leave(room);
    };
    const enter = async (roomId: string) => {
      await leaveRooms();
      await socket.join(roomId);
    };

    socket.on('room:create', (ack) =>
      respond(ack, async () => {
        const room = await rooms.createRoom(player);
        await enter(room.id);
        return snapshotFor(room, player.id);
      }),
    );

    socket.on('room:join', (payload, ack) =>
      respond(ack, async () => {
        const { roomId } = parse(roomRefSchema, payload);
        const room = await rooms.joinRoom(player, roomId);
        await enter(room.id);
        await broadcast(io, room);
        return { room: snapshotFor(room, player.id), history: await chat.getHistory(room.id, player.id) };
      }),
    );

    socket.on('room:leave', (payload, ack) =>
      respond(ack, async () => {
        const { roomId } = parse(roomRefSchema, payload);
        const left = await rooms.leaveRoom(player, roomId);
        await leaveRooms();
        if (!left) return; // комната пуста и удалена: сообщать некому
        await broadcast(io, left.room);
        await emitMessage(io, roomId, await chat.announce(roomId, `Игрок ${player.name} отключился`));
        await publishReports(io, left.room, left.reports);
      }),
    );

    socket.on('room:configure', (payload, ack) =>
      respond(ack, async () => {
        const { roomId, ...settings } = parse(configureRoomSchema, payload);
        await broadcast(io, await rooms.configureRoom(player, roomId, settings));
      }),
    );

    socket.on('room:detach', () => void leaveRooms());

    socket.on('game:start', (payload, ack) =>
      respond(ack, async () => {
        const { roomId } = parse(roomRefSchema, payload);
        await broadcast(io, await rooms.startGame(player, roomId));
      }),
    );

    socket.on('game:action', (payload, ack) =>
      respond(ack, async () => {
        const { roomId, action } = parse(gameActionPayloadSchema, payload);
        const { room, events, reports } = await rooms.performAction(player, roomId, action);
        await broadcast(io, room);
        await publishReports(io, room, reports);
        return events;
      }),
    );

    socket.on('chat:send', (payload, ack) =>
      respond(ack, async () => {
        const { roomId, text } = parse(chatSendSchema, payload);
        await emitMessage(io, roomId, await chat.sendMessage(player, roomId, text));
      }),
    );
  });
}
