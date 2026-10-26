import type { ChatMessage, Player } from '@atlantis/shared';
import type { Db } from '../../db/pool';

type MessageRow = {
  id: string;
  text: string;
  system: boolean;
  sent_at: Date;
  player_id: string | null;
  name: string | null;
};

const toMessage = (row: MessageRow): ChatMessage => ({
  id: row.id,
  text: row.text,
  system: row.system,
  sentAt: row.sent_at.toISOString(),
  author: row.player_id && row.name ? { id: row.player_id, name: row.name } : null,
});

export type NewMessage = {
  roomId: string;
  text: string;
  /** Автор-игрок; у служебных сообщений его нет. */
  author?: Player;
  system?: boolean;
  /** Кому видно сообщение; без списка — всем в комнате. */
  audience?: string[];
};

export async function insertMessage(db: Db, message: NewMessage): Promise<ChatMessage> {
  const system = message.system ?? false;
  const { rows } = await db.query<{ id: string; sent_at: Date }>(
    'insert into messages (room_id, player_id, text, system, audience) values ($1, $2, $3, $4, $5) returning id, sent_at',
    [message.roomId, message.author?.id ?? null, message.text, system, message.audience ?? null],
  );
  const row = rows[0]!;
  return { id: row.id, author: message.author ?? null, text: message.text, system, sentAt: row.sent_at.toISOString() };
}

/** Последние сообщения, которые `viewerId` вправе видеть. */
export async function listRecent(db: Db, roomId: string, viewerId: string, limit: number): Promise<ChatMessage[]> {
  const { rows } = await db.query<MessageRow>(
    `select m.id, m.text, m.system, m.sent_at, m.player_id, p.name
       from messages m left join players p on p.id = m.player_id
      where m.room_id = $1 and (m.audience is null or $2::uuid = any (m.audience))
      order by m.id desc
      limit $3`,
    [roomId, viewerId, limit],
  );
  return rows.reverse().map(toMessage);
}
