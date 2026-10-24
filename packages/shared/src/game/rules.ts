import { generateBoard } from './board';
import { distance, sameCell, type Coord } from './hex';
import {
  emptyStock,
  HARVEST_MAX,
  HARVEST_MIN,
  RESOURCES,
  STARTING_UNITS,
  UNIT_KINDS,
  WIN_TURN,
  type Applied,
  type GameAction,
  type GameEvent,
  type GameState,
  type Hex,
  type Result,
  type Unit,
  type UnitKind,
} from './model';
import { pick, shuffle, type Rng } from './random';

const ok = (state: GameState, events: GameEvent[] = []): Result<Applied> => ({ ok: true, value: { state, events } });
const fail = (error: string): Result<Applied> => ({ ok: false, error });

export function createGame(playerIds: string[], mapSize: number, rng: Rng = Math.random): GameState {
  if (playerIds.length === 0) throw new Error('Нужен хотя бы один игрок');

  const board: Hex[] = generateBoard(mapSize, rng).map((cell) => ({
    ...cell,
    resource: pick(RESOURCES, rng),
    discovered: false,
  }));

  // У каждого игрока своя случайная стартовая локация (разные для всех): там колония и стартовые юниты.
  const homes = shuffle(board, rng);
  let serial = 0;
  const units = playerIds.flatMap((ownerId, i) => {
    const home = homes[i];
    if (!home) throw new Error('Игроков больше, чем локаций');
    const { q, r } = home;
    const spawn = (kind: UnitKind): Unit => ({
      id: `${kind}-${++serial}`,
      ownerId,
      kind,
      q,
      r,
      tired: false,
      revealed: { q, r },
    });
    return [spawn('colony'), ...Array.from({ length: STARTING_UNITS }, () => spawn('unit'))];
  });

  return {
    playerOrder: playerIds,
    slots: Object.fromEntries(playerIds.map((id, i) => [id, i])),
    turn: 1,
    ready: [],
    stock: Object.fromEntries(playerIds.map((id) => [id, emptyStock()])),
    winnerId: null,
    hexes: markDiscovered(board, units),
    units,
  };
}

/** `rng` нужен действиям со случайным исходом (добыча); по умолчанию — `Math.random`. */
export function applyAction(
  state: GameState,
  playerId: string,
  action: GameAction,
  rng: Rng = Math.random,
): Result<Applied> {
  if (state.winnerId) return fail('Игра уже окончена');
  if (!state.playerOrder.includes(playerId)) return fail('Вы не участвуете в игре');
  if (state.ready.includes(playerId)) return fail('Вы уже завершили ход');

  switch (action.type) {
    case 'move':
      return moveUnit(state, playerId, action.unitId, action.to);
    case 'harvest':
      return harvest(state, playerId, action.colonyId, rng);
    case 'end_turn':
      return ok(revealIfAllReady({ ...state, ready: [...state.ready, playerId] }));
  }
}

/** Игрок вышел посреди партии: его юниты, постройки и запасы исчезают, последний оставшийся побеждает. */
export function removePlayer(state: GameState, playerId: string): GameState {
  if (state.winnerId || !state.playerOrder.includes(playerId)) return state;

  const playerOrder = state.playerOrder.filter((id) => id !== playerId);
  const next: GameState = {
    ...state,
    playerOrder,
    ready: state.ready.filter((id) => id !== playerId),
    stock: Object.fromEntries(Object.entries(state.stock).filter(([id]) => id !== playerId)),
    units: state.units.filter((unit) => unit.ownerId !== playerId),
  };

  if (playerOrder.length <= 1) return { ...next, winnerId: playerOrder[0] ?? null };
  // Ушедший мог быть последним, кого ждали.
  return revealIfAllReady(next);
}

/** Юнит переходит в соседнюю локацию сразу (для его владельца), противники узнают об этом при раскрытии хода. */
function moveUnit(state: GameState, playerId: string, unitId: string, to: Coord): Result<Applied> {
  const unit = state.units.find((u) => u.id === unitId && u.ownerId === playerId);
  if (!unit) return fail('Это не ваш юнит');
  if (!UNIT_KINDS[unit.kind].mobile) return fail('Постройки не умеют двигаться');
  if (unit.tired) return fail('Юнит уже ходил в этом ходу');
  if (!state.hexes.some((hex) => sameCell(hex, to))) return fail('Такой локации нет');
  if (distance(unit, to) !== 1) return fail('Можно перейти только в соседнюю локацию');

  return ok({
    ...state,
    units: state.units.map((u) => (u.id === unit.id ? { ...u, q: to.q, r: to.r, tired: true } : u)),
  });
}

/** Колония раз в ход приносит от HARVEST_MIN до HARVEST_MAX единиц ресурса своей локации. */
function harvest(state: GameState, playerId: string, colonyId: string, rng: Rng): Result<Applied> {
  const colony = state.units.find((u) => u.id === colonyId && u.ownerId === playerId);
  if (!colony) return fail('Это не ваша постройка');
  if (!UNIT_KINDS[colony.kind].harvests) return fail('Эта сущность ничего не добывает');
  if (colony.tired) return fail('Колония уже добывала в этом ходу');

  const hex = state.hexes.find((h) => sameCell(h, colony));
  if (!hex) return fail('Колония стоит вне карты');

  const amount = HARVEST_MIN + Math.floor(rng() * (HARVEST_MAX - HARVEST_MIN + 1));
  const mine = state.stock[playerId] ?? emptyStock();

  return ok(
    {
      ...state,
      stock: { ...state.stock, [playerId]: { ...mine, [hex.resource]: mine[hex.resource] + amount } },
      units: state.units.map((u) => (u.id === colony.id ? { ...u, tired: true } : u)),
    },
    [{ type: 'harvested', unitId: colony.id, resource: hex.resource, amount }],
  );
}

/**
 * Когда все игроки завершили ход: перемещения становятся известны всем, юниты и колонии отдыхают,
 * локации, где кто-то побывал, считаются изведанными, начинается новый ход.
 */
function revealIfAllReady(state: GameState): GameState {
  if (!state.playerOrder.every((id) => state.ready.includes(id))) return state;

  const units = state.units.map((u) => ({ ...u, tired: false, revealed: { q: u.q, r: u.r } }));
  return checkVictory({
    ...state,
    units,
    hexes: markDiscovered(state.hexes, units),
    ready: [],
    turn: state.turn + 1,
  });
}

const markDiscovered = (hexes: Hex[], units: Unit[]): Hex[] =>
  hexes.map((hex) =>
    hex.discovered || units.some((unit) => sameCell(unit, hex)) ? { ...hex, discovered: true } : hex,
  );

function checkVictory(state: GameState): GameState {
  return state.turn >= WIN_TURN ? { ...state, winnerId: state.playerOrder[0] ?? null } : state;
}
