import { distance, neighbors, sameCell, type Coord } from './hex';
import { terrainOf, UNIT_KINDS, type Applied, type GameState, type Hex, type Result, type Unit } from './model';
import type { Rng } from './random';
import { fail, ok } from './result';

const key = ({ q, r }: Coord) => `${q},${r}`;

export const markDiscovered = (hexes: Hex[], units: Unit[]): Hex[] =>
  hexes.map((hex) =>
    hex.discovered || units.some((unit) => sameCell(unit, hex)) ? { ...hex, discovered: true } : hex,
  );

/** Клетки, в которые юнит может сделать шаг. */
export function legalSteps(state: GameState, unit: Unit): Coord[] {
  const kind = UNIT_KINDS[unit.kind];
  if (!kind.mobile) return [];
  return neighbors(unit).filter((cell) => {
    const hex = state.hexes.find((h) => sameCell(h, cell));
    return hex !== undefined && terrainOf(hex.type) === kind.terrain;
  });
}

/** Юнит ещё может пойти в этом манёвре. */
export const canStillMove = (state: GameState, unit: Unit): boolean => !unit.tired && legalSteps(state, unit).length > 0;

/** Юнит переходит в соседнюю локацию сразу (для владельца), противники узнают об этом при раскрытии манёвра. */
export function moveUnit(state: GameState, playerId: string, unitId: string, to: Coord): Result<Applied> {
  const unit = state.units.find((u) => u.id === unitId && u.ownerId === playerId);
  if (!unit) return fail('Это не ваш юнит');
  if (!UNIT_KINDS[unit.kind].mobile) return fail('Постройки не умеют двигаться');
  if (unit.tired) return fail('Юнит уже ходил в этом ходу');
  const target = state.hexes.find((hex) => sameCell(hex, to));
  if (!target) return fail('Такой локации нет');
  if (UNIT_KINDS[unit.kind].terrain !== terrainOf(target.type)) return fail('Сюда этот юнит пройти не может');
  if (distance(unit, to) !== 1) return fail('Можно перейти только в соседнюю локацию');

  return ok({
    ...state,
    units: state.units.map((u) => (u.id === unit.id ? { ...u, q: to.q, r: to.r, tired: true } : u)),
  });
}

/**
 * Конец манёвра: перемещения становятся известны всем, юниты отдыхают, посещённые локации изведаны.
 * Юниты разных игроков, которым надо было поменяться местами, на деле столкнулись в одной из локаций,
 * откуда начали ход (какой именно — случайно): бой на фазе 4 произойдёт там.
 */
export function resolveManeuver(state: GameState, rng: Rng): GameState {
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

  const units = state.units.map((unit) => {
    const at = meeting.get(unit.id) ?? unit;
    return { ...unit, q: at.q, r: at.r, revealed: { q: at.q, r: at.r }, tired: false };
  });
  return { ...state, units, hexes: markDiscovered(state.hexes, units) };
}
