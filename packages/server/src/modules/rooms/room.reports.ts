import {
  RESOURCES,
  RESOURCE_LABELS,
  sameCell,
  UNIT_LABELS,
  type Coord,
  type ReportData,
  type Stock,
  type UnitKind,
} from '@atlantis/shared';
import type { RoomState } from './room.service';

const nameOf = (room: RoomState, playerId: string) =>
  room.members.find((member) => member.id === playerId)?.name ?? 'игрок';

/** Локация по названию (у моря названия нет): отчёты видят только те, кто видит эту локацию. */
function place(room: RoomState, { q, r }: Coord): string {
  const hex = room.game?.hexes.find((h) => sameCell(h, { q, r }));
  if (!hex?.name) return `локации (${q}, ${r})`;
  const resource = hex.type === 'sea' ? '' : ` (${RESOURCE_LABELS[hex.type].toLowerCase()})`;
  return `локации «${hex.name}»${resource}`;
}

const list = (stock: Stock): string =>
  RESOURCES.filter((resource) => stock[resource] > 0)
    .map((resource) => `${RESOURCE_LABELS[resource].toLowerCase()} ${stock[resource]}`)
    .join(', ') || 'ничего';

/** «фаланга ×2, кавалерия ×1» */
function kindsText(kinds: UnitKind[]): string {
  const counts = new Map<UnitKind, number>();
  for (const kind of kinds) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  return [...counts].map(([kind, count]) => `${UNIT_LABELS[kind].toLowerCase()} ×${count}`).join(', ');
}

/** Текст сообщения в чат для события игры. */
export function formatReport(data: ReportData, room: RoomState): string {
  switch (data.type) {
    case 'battle': {
      const losses = Object.entries(data.losses)
        .map(([playerId, lost]) => `${nameOf(room, playerId)} — ${lost.length > 0 ? kindsText(lost) : 'без потерь'}`)
        .join('; ');
      const stopped = Object.entries(data.stopped)
        .map(([playerId, count]) => `${nameOf(room, playerId)} — ${count}`)
        .join(', ');
      const walls = stopped ? ` Стены остановили юнитов: ${stopped}.` : '';
      const tower = data.tower ? ' Башня вступила в бой.' : '';
      return `Бой в ${place(room, data.hex)}. Потери: ${losses}.${walls}${tower}`;
    }
    case 'burn': {
      const target = `${UNIT_LABELS[data.kind].toLowerCase()} игрока ${nameOf(room, data.ownerId)}`;
      const head = `Поджог: ${target} в ${place(room, data.hex)}, броски ${data.rolls.join(', ')} (нужно ${data.difficulty})`;
      return data.burned ? `${head} — сожжена.` : `${head} — устояла.`;
    }
    case 'unsupplied':
      return `Без снабжения остались и удалены: юнитов — ${data.units}, построек — ${data.buildings}.`;
    case 'supply':
      return `Снабжение, ${nameOf(room, data.playerId)}: потрачено — ${list(data.spent)}; осталось — ${list(data.left)}.`;
  }
}
