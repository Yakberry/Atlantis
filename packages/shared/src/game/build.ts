import { neighbors, sameCell, distance, type Coord } from './hex';
import {
  BUILDINGS,
  emptyStock,
  UNIT_KINDS,
  type Applied,
  type BuildingType,
  type GameAction,
  type GameState,
  type Hex,
  type Result,
  type Stock,
  type Unit,
  type UnitKind,
} from './model';
import { fail, ok } from './result';
import { roadBetween } from './roads';
import { covers, pay } from './supply';

type BuildAction = Extract<GameAction, { type: 'build' }>;

/** Одно общее сообщение: по нему нельзя понять, какое из условий не выполнено (часть из них скрыта туманом). */
const SITE_ERROR =
  'Здесь строить нельзя: локация должна быть разведана, находиться под вашим контролем или рядом только с вашими колониями и не быть спорной';

export const fullCost = (building: BuildingType): Stock => ({ ...emptyStock(), ...BUILDINGS[building].cost });

const hexAt = (state: GameState, cell: Coord): Hex | undefined => state.hexes.find((hex) => sameCell(hex, cell));
const entitiesAt = (state: GameState, cell: Coord): Unit[] => state.units.filter((unit) => sameCell(unit, cell));
const hasColony = (units: readonly Unit[]) => units.some((unit) => UNIT_KINDS[unit.kind].colony);

/**
 * Можно ли игроку строить в этой локации: суша, разведана, не спорная и не захвачена другим игроком;
 * либо в ней уже стоят только юниты и постройки игрока, либо она пуста и соседствует только с его колониями.
 */
export function canBuildAt(state: GameState, playerId: string, cell: Coord): boolean {
  const hex = hexAt(state, cell);
  if (!hex || hex.type === 'sea' || !hex.discovered) return false;

  const owners = new Set(entitiesAt(state, cell).map((unit) => unit.ownerId));
  if (owners.size > 1) return false;
  if (owners.size === 1) return owners.has(playerId);

  const neighborColonyOwners = new Set(
    neighbors(cell).flatMap((next) =>
      entitiesAt(state, next).filter((unit) => UNIT_KINDS[unit.kind].colony).map((unit) => unit.ownerId),
    ),
  );
  return neighborColonyOwners.size === 1 && neighborColonyOwners.has(playerId);
}

export const buildSites = (state: GameState, playerId: string): Coord[] =>
  state.hexes.filter((hex) => canBuildAt(state, playerId, hex)).map(({ q, r }) => ({ q, r }));

/** Куда можно провести дорогу из этой локации: соседняя локация, доступная игроку для строительства, где дороги ещё нет. */
export function roadTargets(state: GameState, playerId: string, from: Coord): Coord[] {
  return neighbors(from).filter((next) => canBuildAt(state, playerId, next) && !roadBetween(state.roads, from, next));
}

/** Есть ли у игрока хоть одна постройка, которую он может сейчас построить (иначе фаза для него пропускается). */
export function canBuildAnything(state: GameState, playerId: string): boolean {
  const stock = state.stock[playerId] ?? emptyStock();
  const affordable = (building: BuildingType) => covers(stock, fullCost(building));
  const sites = buildSites(state, playerId);

  return (
    (affordable('colony') && sites.some((cell) => !hasColony(entitiesAt(state, cell)))) ||
    (affordable('fortified_colony') &&
      sites.some((cell) => entitiesAt(state, cell).some((u) => u.kind === 'colony' && u.ownerId === playerId))) ||
    (affordable('road') && sites.some((cell) => roadTargets(state, playerId, cell).length > 0))
  );
}

/** Новая постройка скрыта от противников до конца фазы строительства (`fresh`). */
const spawn = (state: GameState, kind: UnitKind, ownerId: string, cell: Coord): Unit => ({
  id: `${kind}-${state.nextId}`,
  ownerId,
  kind,
  shownKind: kind,
  fresh: true,
  q: cell.q,
  r: cell.r,
  tired: false,
  blocked: false,
  revealed: { q: cell.q, r: cell.r },
});

/** Строительство на фазе строительства: колония, укрепление своей колонии или дорога. */
export function build(state: GameState, playerId: string, action: BuildAction): Result<Applied> {
  const { building, at } = action;
  const stock = state.stock[playerId] ?? emptyStock();
  if (!covers(stock, fullCost(building))) return fail('Не хватает ресурсов на строительство');
  if (!canBuildAt(state, playerId, at)) return fail(SITE_ERROR);

  const paid = { ...state.stock, [playerId]: pay(stock, fullCost(building)) };
  const here = entitiesAt(state, at);
  const next = { ...state, stock: paid, nextId: state.nextId + 1 };

  switch (building) {
    case 'colony':
      if (hasColony(here)) return fail('В этой локации уже есть колония');
      return ok({ ...next, units: [...state.units, spawn(state, 'colony', playerId, at)] });

    case 'fortified_colony': {
      const colony = here.find((unit) => unit.kind === 'colony' && unit.ownerId === playerId);
      if (!colony) return fail('Укреплённую колонию можно построить только поверх своей колонии');
      // Улучшение для противников остаётся обычной колонией до конца фазы строительства.
      const upgraded: Unit = {
        ...spawn(state, 'fortified_colony', playerId, at),
        shownKind: colony.shownKind,
        fresh: colony.fresh,
        tired: colony.tired,
      };
      return ok({ ...next, units: state.units.map((unit) => (unit.id === colony.id ? upgraded : unit)) });
    }

    case 'road': {
      const { to } = action;
      if (!to || distance(at, to) !== 1) return fail('Выберите соседнюю локацию, к которой пойдёт дорога');
      if (!roadTargets(state, playerId, at).some((cell) => sameCell(cell, to))) {
        return fail('Дорогу можно проложить только между двумя локациями, доступными вам для строительства, где её ещё нет');
      }
      const road = {
        id: `road-${state.nextId}`,
        ownerId: playerId,
        a: { q: at.q, r: at.r },
        b: { q: to.q, r: to.r },
        fresh: true,
      };
      return ok({ ...next, roads: [...state.roads, road] });
    }
  }
}
