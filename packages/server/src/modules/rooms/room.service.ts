import { randomInt } from 'node:crypto';
import {
  applyAction,
  createGame,
  removePlayer,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type GameAction,
  type Player,
  type GameState,
  type RoomSettings,
  type RoomStatus,
} from '@atlantis/shared';
import { transaction, type Db } from '../../db/pool';
import { AppError } from '../../errors';
import * as repo from './room.repository';

/** Полное состояние комнаты. Клиентам оно не отправляется напрямую, только через `snapshotFor`. */
export type RoomState = {
  id: string;
  hostId: string;
  status: RoomStatus;
  settings: RoomSettings;
  members: Player[];
  game: GameState | null;
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generateCode = () =>
  Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

export const createRoom = (player: Player): Promise<RoomState> =>
  transaction(async (db) => {
    const id = generateCode();
    await repo.insertRoom(db, id, player.id);
    await repo.addMember(db, id, player.id);
    return loadRoom(db, id);
  });

/** Повторный вход участника (реконнект) не меняет состав комнаты. */
export const joinRoom = (player: Player, roomId: string): Promise<RoomState> =>
  transaction(async (db) => {
    const room = await requireRoom(db, roomId, { lock: true });
    if (!(await repo.isMember(db, roomId, player.id))) {
      if (room.status !== 'lobby') throw new AppError('Игра уже началась');
      if ((await repo.listMembers(db, roomId)).length >= MAX_PLAYERS) throw new AppError('Комната заполнена');
      await repo.addMember(db, roomId, player.id);
    }
    return loadRoom(db, roomId);
  });

/**
 * Выход насовсем. Возвращает `null`, если комната опустела и была удалена.
 * Хост уходит — роль достаётся тому, кто вошёл раньше остальных.
 */
export const leaveRoom = (player: Player, roomId: string): Promise<RoomState | null> =>
  transaction(async (db) => {
    const room = await requireRoom(db, roomId, { lock: true });
    if (!(await repo.isMember(db, roomId, player.id))) throw new AppError('Вы не состоите в этой комнате');

    await repo.removeMember(db, roomId, player.id);
    const [heir] = await repo.listMembers(db, roomId);
    if (!heir) {
      await repo.deleteRoom(db, roomId);
      return null;
    }

    const game = room.status === 'playing' && room.game ? removePlayer(room.game, player.id) : undefined;
    await repo.updateRoom(db, roomId, {
      hostId: room.hostId === player.id ? heir.id : undefined,
      game,
      status: game?.winnerId ? 'finished' : undefined,
    });
    return loadRoom(db, roomId);
  });

export const configureRoom = (player: Player, roomId: string, settings: RoomSettings): Promise<RoomState> =>
  transaction(async (db) => {
    const room = await requireRoom(db, roomId, { lock: true });
    if (room.hostId !== player.id) throw new AppError('Настройки меняет только хост');
    if (room.status !== 'lobby') throw new AppError('Нельзя менять настройки после старта игры');

    await repo.updateRoom(db, roomId, { mapSize: settings.mapSize });
    return loadRoom(db, roomId);
  });

export const startGame = (player: Player, roomId: string): Promise<RoomState> =>
  transaction(async (db) => {
    const room = await requireRoom(db, roomId, { lock: true });
    if (room.hostId !== player.id) throw new AppError('Начать игру может только хост');
    if (room.status !== 'lobby') throw new AppError('Игра уже началась');

    const members = await repo.listMembers(db, roomId);
    if (members.length < MIN_PLAYERS) throw new AppError(`Нужно минимум игроков: ${MIN_PLAYERS}`);

    await repo.updateRoom(db, roomId, { status: 'playing', game: createGame(members.map((m) => m.id), room.mapSize) });
    return loadRoom(db, roomId);
  });

export const performAction = (player: Player, roomId: string, action: GameAction): Promise<RoomState> =>
  transaction(async (db) => {
    const room = await requireRoom(db, roomId, { lock: true });
    if (room.status !== 'playing' || !room.game) throw new AppError('Игра не идёт');

    const result = applyAction(room.game, player.id, action);
    if (!result.ok) throw new AppError(result.error);

    await repo.updateRoom(db, roomId, {
      game: result.value,
      status: result.value.winnerId ? 'finished' : undefined,
    });
    return loadRoom(db, roomId);
  });

async function requireRoom(db: Db, id: string, opts?: { lock?: boolean }) {
  const room = await repo.findRoom(db, id, opts);
  if (!room) throw new AppError('Комната не найдена');
  return room;
}

async function loadRoom(db: Db, id: string): Promise<RoomState> {
  const { mapSize, ...room } = await requireRoom(db, id);
  return { ...room, settings: { mapSize }, members: await repo.listMembers(db, id) };
}
