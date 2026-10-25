import type { GameState, MapStyle, Player, RoomStatus } from '@atlantis/shared';
import type { Db } from '../../db/pool';

export type RoomRow = { id: string; hostId: string; status: RoomStatus; mapSize: number; mapStyle: MapStyle; game: GameState | null };

export async function insertRoom(db: Db, id: string, hostId: string): Promise<void> {
  await db.query('insert into rooms (id, host_id) values ($1, $2)', [id, hostId]);
}

/** `lock` блокирует строку до конца транзакции: ходы в одной комнате выполняются строго по очереди. */
export async function findRoom(db: Db, id: string, { lock = false } = {}): Promise<RoomRow | null> {
  const { rows } = await db.query<RoomRow>(
    `select id, host_id as "hostId", status, map_size as "mapSize", map_style as "mapStyle", game from rooms where id = $1 ${lock ? 'for update' : ''}`,
    [id],
  );
  return rows[0] ?? null;
}

/** Обновляет только переданные поля. */
export async function updateRoom(
  db: Db,
  id: string,
  patch: { status?: RoomStatus; hostId?: string; mapSize?: number; mapStyle?: MapStyle; game?: GameState },
): Promise<void> {
  await db.query(
    `update rooms
        set status  = coalesce($2, status),
            host_id = coalesce($3, host_id),
            map_size = coalesce($4, map_size),
            map_style = coalesce($5, map_style),
            game    = coalesce($6, game)
      where id = $1`,
    [
      id,
      patch.status ?? null,
      patch.hostId ?? null,
      patch.mapSize ?? null,
      patch.mapStyle ?? null,
      patch.game ? JSON.stringify(patch.game) : null,
    ],
  );
}

/** Сообщения и участники удаляются каскадом. */
export async function deleteRoom(db: Db, id: string): Promise<void> {
  await db.query('delete from rooms where id = $1', [id]);
}

export async function addMember(db: Db, roomId: string, playerId: string): Promise<void> {
  await db.query(
    'insert into room_members (room_id, player_id) values ($1, $2) on conflict do nothing',
    [roomId, playerId],
  );
}

export async function removeMember(db: Db, roomId: string, playerId: string): Promise<void> {
  await db.query('delete from room_members where room_id = $1 and player_id = $2', [roomId, playerId]);
}

export async function listMembers(db: Db, roomId: string): Promise<Player[]> {
  const { rows } = await db.query<Player>(
    `select p.id, p.name
       from room_members m join players p on p.id = m.player_id
      where m.room_id = $1
      order by m.joined_at`,
    [roomId],
  );
  return rows;
}

export async function isMember(db: Db, roomId: string, playerId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    'select 1 from room_members where room_id = $1 and player_id = $2',
    [roomId, playerId],
  );
  return (rowCount ?? 0) > 0;
}
