import type { ChatMessage, Player } from '@atlantis/shared';
import { pool } from '../../db/pool';
import { AppError } from '../../errors';
import { isMember } from '../rooms/room.repository';
import * as repo from './chat.repository';

const HISTORY_LIMIT = 50;

export async function sendMessage(player: Player, roomId: string, text: string): Promise<ChatMessage> {
  if (!(await isMember(pool, roomId, player.id))) throw new AppError('Вы не состоите в этой комнате');
  return repo.insertMessage(pool, { roomId, text, author: player });
}

/** Служебное сообщение игры; `audience` — кому его показывать (без списка — всем). */
export const announce = (roomId: string, text: string, audience?: string[]): Promise<ChatMessage> =>
  repo.insertMessage(pool, { roomId, text, system: true, audience });

export const getHistory = (roomId: string, viewerId: string): Promise<ChatMessage[]> =>
  repo.listRecent(pool, roomId, viewerId, HISTORY_LIMIT);
