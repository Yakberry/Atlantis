import { sameCell } from './hex';
import { DIE_SIDES, UNIT_KINDS, type GameState, type Report, type Unit } from './model';
import type { Rng } from './random';
import { canSee } from './visibility';

const d6 = (rng: Rng) => 1 + Math.floor(rng() * DIE_SIDES);
const isBuilding = (unit: Unit) => UNIT_KINDS[unit.kind].building;

/**
 * Фаза 4. В каждой спорной локации (стоят сущности нескольких игроков):
 * - если юниты есть у двух и более игроков — бой: каждый юнит бросает d6, побеждает игрок с наивысшим
 *   одиночным результатом и уничтожает всех юнитов соперников; если наивысший результат выпал нескольким
 *   игрокам — ничья, потерь нет;
 * - если юниты есть у одного игрока, а в локации стоит вражеская постройка — осада: нападающие бросают d6;
 *   результат ≥ `siegeHit` постройки (колония 4, укреплённая 5) у любого — постройка уничтожена, иначе нападающие теряют случайного юнита.
 * Постройки в бою не бросают кубик. Победителя боя постройка проигравшего в тот же ход не осаждается.
 */
export function resolveBattles(state: GameState, rng: Rng): { state: GameState; reports: Report[] } {
  const destroyed = new Set<string>();
  const reports: Report[] = [];

  for (const hex of state.hexes) {
    const here = state.units.filter((unit) => sameCell(unit, hex));
    const owners = new Set(here.map((unit) => unit.ownerId));
    if (owners.size < 2) continue;

    // Кто узнаёт о событии: участники и все, кто видит локацию.
    const audience = state.playerOrder.filter((id) => owners.has(id) || canSee(state, id, hex));
    const where = { q: hex.q, r: hex.r };

    const sides = new Map<string, Unit[]>();
    for (const unit of here.filter((u) => !isBuilding(u))) {
      sides.set(unit.ownerId, [...(sides.get(unit.ownerId) ?? []), unit]);
    }

    if (sides.size >= 2) {
      const rolls: Record<string, number[]> = {};
      for (const [ownerId, units] of sides) rolls[ownerId] = units.map(() => d6(rng));
      const best = Object.entries(rolls).map(([ownerId, dice]) => ({ ownerId, best: Math.max(...dice) }));
      const top = Math.max(...best.map((side) => side.best));
      const leaders = best.filter((side) => side.best === top);
      const winnerId = leaders.length === 1 ? (leaders[0]?.ownerId ?? null) : null;

      let lost = 0;
      if (winnerId) {
        for (const [ownerId, units] of sides) {
          if (ownerId === winnerId) continue;
          for (const unit of units) {
            destroyed.add(unit.id);
            lost += 1;
          }
        }
      }
      reports.push({ audience, data: { type: 'battle', hex: where, rolls, winnerId, destroyed: lost } });
    } else if (sides.size === 1) {
      const [attackerId, attackers] = [...sides.entries()][0] ?? [];
      if (!attackerId || !attackers) continue;
      let alive = [...attackers];

      for (const building of here.filter((u) => isBuilding(u) && u.ownerId !== attackerId)) {
        if (alive.length === 0) break;
        const rolls = alive.map(() => d6(rng));
        const hit = rolls.some((roll) => roll >= UNIT_KINDS[building.kind].siegeHit);
        if (hit) {
          destroyed.add(building.id);
        } else {
          const casualty = alive[Math.floor(rng() * alive.length)];
          if (casualty) {
            destroyed.add(casualty.id);
            alive = alive.filter((unit) => unit.id !== casualty.id);
          }
        }
        reports.push({
          audience,
          data: { type: 'siege', hex: where, attackerId, defenderId: building.ownerId, rolls, destroyed: hit },
        });
      }
    }
  }

  return { state: { ...state, units: state.units.filter((unit) => !destroyed.has(unit.id)) }, reports };
}
