import { viewFor, type RoomSnapshot } from '@atlantis/shared';
import type { RoomState } from './room.service';

/** Что именно этот игрок вправе знать о комнате. Единственное место, где состояние уходит к клиенту. */
export const snapshotFor = (room: RoomState, viewerId: string): RoomSnapshot => ({
  id: room.id,
  hostId: room.hostId,
  status: room.status,
  settings: room.settings,
  members: room.members,
  game: room.game ? viewFor(room.game, viewerId) : null,
});
