import { RESOURCES, RESOURCE_LABELS, sameCell, type Coord, type ReportData, type Stock } from '@atlantis/shared';
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

/** Текст сообщения в чат для события игры. */
export function formatReport(data: ReportData, room: RoomState): string {
  switch (data.type) {
    case 'battle': {
      const sides = Object.entries(data.rolls)
        .map(([playerId, dice]) => `${nameOf(room, playerId)} — ${dice.join(', ')}`)
        .join('; ');
      const outcome = data.winnerId
        ? `Побеждает ${nameOf(room, data.winnerId)}, уничтожено юнитов: ${data.destroyed}.`
        : 'Ничья: потерь нет.';
      return `Бой в ${place(room, data.hex)}. ${sides}. ${outcome}`;
    }
    case 'siege': {
      const attacker = nameOf(room, data.attackerId);
      const head = `Осада колонии игрока ${nameOf(room, data.defenderId)} в ${place(room, data.hex)}: ${attacker} бросает ${data.rolls.join(', ')}`;
      return data.destroyed ? `${head} — колония уничтожена.` : `${head} — колония устояла, ${attacker} теряет юнита.`;
    }
    case 'unsupplied':
      return `Без снабжения остались и удалены: юнитов — ${data.units}, построек — ${data.buildings}.`;
    case 'supply':
      return `Снабжение, ${nameOf(room, data.playerId)}: потрачено — ${list(data.spent)}; осталось — ${list(data.left)}.`;
  }
}
