import { distance, neighbors, sameCell, type Coord } from './hex';
import { terrainOf, UNIT_KINDS, type Applied, type GameState, type Hex, type Result, type Unit } from './model';
import type { Rng } from './random';
import { fail, ok } from './result';
import { roadBetween } from './roads';

const key = ({ q, r }: Coord) => `${q},${r}`;

export const markDiscovered = (hexes: Hex[], units: Unit[]): Hex[] =>
  hexes.map((hex) =>
    hex.discovered || units.some((unit) => sameCell(unit, hex)) ? { ...hex, discovered: true } : hex,
  );

/** Клетки, в которые юнит может сделать шаг на текущем этапе манёвра. */
export function legalSteps(state: GameState, unit: Unit): Coord[] {
  const kind = UNIT_KINDS[unit.kind];
  if (!kind.mobile || unit.blocked) return [];
  if (state.stage === 'riders' && !kind.fast) return [];

  return neighbors(unit).filter((cell) => {
    const hex = state.hexes.find((h) => sameCell(h, cell));
    if (!hex || terrainOf(hex.type) !== kind.terrain) return false;
    return state.stage !== 'roads' || roadBetween(state.roads, unit, cell) !== undefined;
  });
}

/** Юнит ещё может пойти на этом этапе. */
export const canStillMove = (state: GameState, unit: Unit): boolean => !unit.tired && legalSteps(state, unit).length > 0;

/** Шаг юнита: для владельца действует сразу, противники узнают о нём при синхронизации в конце этапа. */
export function moveUnit(state: GameState, playerId: string, unitId: string, to: Coord): Result<Applied> {
  const unit = state.units.find((u) => u.id === unitId && u.ownerId === playerId);
  if (!unit) return fail('Это не ваш юнит');
  const kind = UNIT_KINDS[unit.kind];
  if (!kind.mobile) return fail('Постройки не умеют двигаться');
  if (unit.blocked) return fail('Юнит столкнулся с чужими юнитами и до конца хода не может двигаться');
  if (unit.tired) return fail('Юнит уже ходил на этом этапе');
  if (state.stage === 'riders' && !kind.fast) return fail('На этом этапе ходят только юниты с повышенной скоростью');
  const target = state.hexes.find((hex) => sameCell(hex, to));
  if (!target) return fail('Такой локации нет');
  if (kind.terrain !== terrainOf(target.type)) return fail('Сюда этот юнит пройти не может');
  if (distance(unit, to) !== 1) return fail('Можно перейти только в соседнюю локацию');
  if (state.stage === 'roads' && !roadBetween(state.roads, unit, to)) return fail('На этом этапе можно идти только по дороге');

  return ok({
    ...state,
    units: state.units.map((u) => (u.id === unit.id ? { ...u, q: to.q, r: to.r, tired: true } : u)),
  });
}

/**
 * Синхронизация в конце этапа манёвра: перемещения становятся известны всем, посещённые локации изведаны, юниты
 * снова могут ходить на следующем этапе.
 * - Юниты разных игроков, двигавшиеся навстречу друг другу (поменялись бы соседними локациями), на деле столкнулись
 *   в одной из двух локаций, откуда начали шаг (какой именно — случайно): она становится конечной для всех таких юнитов.
 * - Юниты разных игроков, оказавшиеся в одной локации, столкнулись: до конца хода они не могут двигаться
 *   (бой в такой локации пройдёт в конце хода). Постройки в столкновении не участвуют.
 */
export function syncManeuver(state: GameState, rng: Rng): GameState {
  const crossings = new Map<string, { cells: [Coord, Coord]; units: Unit[] }>();
  for (const unit of state.units) {
    if (sameCell(unit, unit.revealed)) continue;
    const id = [key(unit.revealed), key(unit)].sort().join('|');
    const crossing = crossings.get(id) ?? { cells: [unit.revealed, { q: unit.q, r: unit.r }], units: [] };
    crossing.units.push(unit);
    crossings.set(id, crossing);
  }

  const meeting = new Map<string, Coord>();
  for (const { cells, units } of crossings.values()) {
    const colliding = units.filter((u) => units.some((v) => v.ownerId !== u.ownerId && sameCell(v.revealed, u)));
    if (colliding.length === 0) continue;
    const place = cells[rng() < 0.5 ? 0 : 1];
    for (const unit of colliding) meeting.set(unit.id, place);
  }
  const placed = state.units.map((unit) => {
    const at = meeting.get(unit.id) ?? unit;
    return { ...unit, q: at.q, r: at.r };
  });

  const owners = new Map<string, Set<string>>();
  for (const unit of placed) {
    if (UNIT_KINDS[unit.kind].building) continue;
    owners.set(key(unit), (owners.get(key(unit)) ?? new Set<string>()).add(unit.ownerId));
  }

  const units = placed.map((unit) => ({
    ...unit,
    revealed: { q: unit.q, r: unit.r },
    tired: false,
    blocked: unit.blocked || (!UNIT_KINDS[unit.kind].building && (owners.get(key(unit))?.size ?? 0) >= 2),
  }));
  return { ...state, units, hexes: markDiscovered(state.hexes, units) };
}
