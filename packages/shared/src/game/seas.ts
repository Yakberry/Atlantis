import { neighbors, sameCell, type Coord } from './hex';
import { isCaptured, UNIT_KINDS, type GameState, type Unit } from './model';

const key = ({ q, r }: Coord) => `${q},${r}`;

/** Клетки суши, которые омывает море `sea`. */
export function washedBy(state: GameState, sea: number): Coord[] {
  const water = new Set(state.hexes.filter((hex) => hex.sea === sea).map(key));
  return state.hexes
    .filter((hex) => hex.type !== 'sea' && neighbors(hex).some((next) => water.has(key(next))))
    .map(({ q, r }) => ({ q, r }));
}

/** Флоты игрока, которые сейчас работают: у них известно море и в их локации нет противника. */
export const activeFleets = (state: GameState, playerId: string): (Unit & { sea: number })[] =>
  state.units.filter(
    (unit): unit is Unit & { sea: number } =>
      unit.ownerId === playerId &&
      unit.kind === 'fleet' &&
      unit.sea !== undefined &&
      !isCaptured(playerId, state.units.filter((other) => sameCell(other, unit))),
  );

/** Что видит флот: всё своё море и все омываемые им локации суши. */
export function fleetSight(state: GameState, playerId: string): Set<string> {
  const seen = new Set<string>();
  for (const fleet of activeFleets(state, playerId)) {
    for (const hex of state.hexes) if (hex.sea === fleet.sea) seen.add(key(hex));
    for (const cell of washedBy(state, fleet.sea)) seen.add(key(cell));
  }
  return seen;
}

/** Морские переходы юнита: из локации, омываемой морем вашего флота, в любую другую омываемую локацию того же моря. */
export function seaRoutes(state: GameState, unit: Unit): Coord[] {
  const result = new Map<string, Coord>();
  for (const fleet of activeFleets(state, unit.ownerId)) {
    const washed = washedBy(state, fleet.sea);
    if (!washed.some((cell) => sameCell(cell, unit))) continue;
    for (const cell of washed) if (!sameCell(cell, unit)) result.set(key(cell), cell);
  }
  return [...result.values()];
}

/** Флот соединяет в цепочку все прибрежные колонии игрока на своём море. */
export function seaLinks(state: GameState, playerId: string): { a: Coord; b: Coord }[] {
  const links: { a: Coord; b: Coord }[] = [];
  for (const fleet of activeFleets(state, playerId)) {
    const washed = new Set(washedBy(state, fleet.sea).map(key));
    const colonies = state.units.filter((u) => u.ownerId === playerId && UNIT_KINDS[u.kind].colony && washed.has(key(u)));
    const [first, ...rest] = colonies;
    if (first) for (const other of rest) links.push({ a: { q: first.q, r: first.r }, b: { q: other.q, r: other.r } });
  }
  return links;
}
