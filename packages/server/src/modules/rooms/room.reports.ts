import { RESOURCE_LABELS, sameCell, type Coord, type ReportData } from '@atlantis/shared';
import type { RoomState } from './room.service';

const nameOf = (room: RoomState, playerId: string) =>
  room.members.find((member) => member.id === playerId)?.name ?? 'игрок';

function place(room: RoomState, { q, r }: Coord): string {
  const hex = room.game?.hexes.find((h) => sameCell(h, { q, r }));
  const label = hex && hex.type !== 'sea' ? `«${RESOURCE_LABELS[hex.type]}» ` : '';
  return `локации ${label}(${q}, ${r})`;
}

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
  }
}
