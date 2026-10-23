import type { ChatMessage, Player } from '@atlantis/shared';
import { pool } from '../../db/pool';
import { AppError } from '../../errors';
import { isMember } from '../rooms/room.repository';
import * as repo from './chat.repository';

const HISTORY_LIMIT = 50;

export async function sendMessage(player: Player, roomId: string, text: string): Promise<ChatMessage> {
  if (!(await isMember(pool, roomId, player.id))) throw new AppError('Вы не состоите в этой комнате');
  return repo.insertMessage(pool, roomId, player, text);
}

/** Служебное сообщение от имени игрока (членство не проверяем: он мог только что выйти). */
export const announce = (roomId: string, player: Player, text: string): Promise<ChatMessage> =>
  repo.insertMessage(pool, roomId, player, text, true);

export const getHistory = (roomId: string): Promise<ChatMessage[]> =>
  repo.listRecent(pool, roomId, HISTORY_LIMIT);
