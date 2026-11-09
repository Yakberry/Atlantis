import { sameCell } from './hex';
import {
  ATTACK_DEFAULT,
  ATTACK_TARGETS,
  DIE_SIDES,
  TOWER_TARGET,
  UNIT_KINDS,
  WALL_CHECK,
  type GameState,
  type Report,
  type Unit,
  type UnitKind,
} from './model';
import { shuffle, type Rng } from './random';
import { canSee } from './visibility';

const d6 = (rng: Rng) => 1 + Math.floor(rng() * DIE_SIDES);
const isBuilding = (unit: Unit) => UNIT_KINDS[unit.kind].building;

/** Целевое число атаки: сколько нужно выбросить на d6 (не меньше), чтобы `attacker` поразил `defender`. */
export function attackTarget(attacker: UnitKind, defender: UnitKind): number {
  const from = UNIT_KINDS[attacker].combat;
  const to = UNIT_KINDS[defender].combat;
  return (from && to ? ATTACK_TARGETS[from][to] : undefined) ?? ATTACK_DEFAULT;
}

type Attacker = { ownerId: string; kind: UnitKind; tower: boolean };

/** Есть ли спорные локации, где пройдёт бой или поджог (нужен хотя бы один юнит, не постройка). Иначе фаза боя пропускается. */
export function hasPendingBattle(state: GameState): boolean {
  return state.hexes.some((hex) => {
    const here = state.units.filter((unit) => sameCell(unit, hex));
    return new Set(here.map((unit) => unit.ownerId)).size >= 2 && here.some((unit) => !isBuilding(unit));
  });
}

/**
 * Фаза боя (после манёвра, когда все игроки подтвердили). В каждой спорной локации (сущности ≥2 игроков):
 *
 * 1. «Стены». Если у владельца укреплённой колонии в локации есть защитники и у нападающих (юнитов других игроков)
 *    нет катапульты, каждый нападающий бросает d6: меньше WALL_CHECK — он в бою не участвует (ни атакует, ни цель).
 * 2. Обмен атаками. Каждый участвующий юнит (и «башня» укреплённой колонии, если есть защитники) в случайном порядке
 *    выбирает случайного ещё не поражённого юнита другого игрока, бросает d6 и поражает его, если результат не меньше
 *    целевого числа по таблице (`attackTarget`; у башни всегда TOWER_TARGET). Поражённый юнит больше не становится целью,
 *    но свою атаку проводит. Потом поражённые удаляются.
 * 3. Поджог. Если в локации осталась колония без защитников, каждый выживший чужой юнит бросает d6; результат не
 *    меньше сложности колонии (обычная 5, укреплённая 6) у любого — колония сожжена.
 *
 * Отчёты видят участники и те, кто видит локацию.
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
    const soldiers = here.filter((unit) => !isBuilding(unit));
    const buildings = here.filter(isBuilding);

    // 1. Стены и башня работают при защитниках в локации.
    const fortress = buildings.find(
      (b) => (UNIT_KINDS[b.kind].walls || UNIT_KINDS[b.kind].tower) && soldiers.some((s) => s.ownerId === b.ownerId),
    );
    const stoppedIds = new Set<string>();
    const stopped: Record<string, number> = {};
    if (fortress && UNIT_KINDS[fortress.kind].walls) {
      const assault = soldiers.filter((s) => s.ownerId !== fortress.ownerId);
      const catapult = assault.some((s) => UNIT_KINDS[s.kind].combat === 'catapult');
      if (!catapult) {
        for (const unit of assault) {
          if (d6(rng) >= WALL_CHECK) continue;
          stoppedIds.add(unit.id);
          stopped[unit.ownerId] = (stopped[unit.ownerId] ?? 0) + 1;
        }
      }
    }

    // 2. Обмен атаками.
    const fighters = soldiers.filter((unit) => !stoppedIds.has(unit.id));
    const fighting = new Set(fighters.map((unit) => unit.ownerId)).size >= 2;
    const towerFires = fighting && fortress !== undefined && UNIT_KINDS[fortress.kind].tower;
    const dead = new Set<string>();

    if (fighting) {
      const attackers = shuffle<Attacker>(
        [
          ...fighters.map((unit) => ({ ownerId: unit.ownerId, kind: unit.kind, tower: false })),
          ...(towerFires && fortress ? [{ ownerId: fortress.ownerId, kind: fortress.kind, tower: true }] : []),
        ],
        rng,
      );
      for (const attacker of attackers) {
        const targets = fighters.filter((unit) => unit.ownerId !== attacker.ownerId && !dead.has(unit.id));
        if (targets.length === 0) continue; // все противники уже поражены: атаковать некого
        const target = targets[Math.floor(rng() * targets.length)];
        if (!target) continue;
        const needed = attacker.tower ? TOWER_TARGET : attackTarget(attacker.kind, target.kind);
        // if (d6(rng) >= needed) dead.add(target.id);
        const rngd6 = d6(rng);
        if (rngd6 >= needed) dead.add(target.id);
        console.log(attacker.kind, rngd6, needed, target.kind, attacker.ownerId, target.ownerId);
      }
    }

    if (fighting || stoppedIds.size > 0) {
      const losses: Record<string, UnitKind[]> = {};
      for (const ownerId of new Set(soldiers.map((unit) => unit.ownerId))) {
        losses[ownerId] = soldiers.filter((u) => u.ownerId === ownerId && dead.has(u.id)).map((u) => u.kind);
      }
      reports.push({ audience, data: { type: 'battle', hex: where, losses, stopped, tower: towerFires } });
    }
    for (const id of dead) destroyed.add(id);

    // 3. Поджог незащищённых колоний.
    const survivors = soldiers.filter((unit) => !dead.has(unit.id));
    for (const colony of buildings) {
      const difficulty = UNIT_KINDS[colony.kind].burn;
      const attackers = survivors.filter((unit) => unit.ownerId !== colony.ownerId);
      const defended = survivors.some((unit) => unit.ownerId === colony.ownerId);
      if (difficulty === null || defended || attackers.length === 0) continue;

      const rolls = attackers.map(() => d6(rng));
      const burned = rolls.some((roll) => roll >= difficulty);
      if (burned) destroyed.add(colony.id);
      reports.push({
        audience,
        data: { type: 'burn', hex: where, ownerId: colony.ownerId, kind: colony.kind, rolls, difficulty, burned },
      });
    }
  }

  return { state: { ...state, units: state.units.filter((unit) => !destroyed.has(unit.id)) }, reports };
}
