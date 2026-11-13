import { generateLand, partitionSeas, surroundWithSea } from './board';
import { build } from './build';
import { sameCell } from './hex';
import { harvestColony, harvestRemaining } from './harvest';
import { markDiscovered, moveUnit } from './maneuver';
import { LOCATION_NAMES } from './names';
import {
  RESOURCES,
  START_STOCK,
  STARTING_KINDS,
  type Applied,
  type GameAction,
  type GameSettings,
  type GameState,
  type Hex,
  type Report,
  type Result,
  type Unit,
  type UnitKind,
} from './model';
import { settle } from './phases';
import { pick, shuffle, type Rng } from './random';
import { fail, ok } from './result';
import { dropUnsupplied } from './supply';
import { trade } from './trade';

export function createGame(playerIds: string[], settings: GameSettings, rng: Rng = Math.random): GameState {
  if (playerIds.length === 0) throw new Error('Нужен хотя бы один игрок');

  // `mapSize` — число клеток суши; вся суша окружена морем (контур и внутренние заливы).
  const { mainland, islands } = generateLand(settings, rng);
  const land = [...mainland, ...islands];

  // Уникальные названия суши в случайном порядке (море безымянное).
  const names = shuffle([...new Set(LOCATION_NAMES)], rng);
  if (names.length < land.length) throw new Error('В списке названий локаций меньше, чем клеток суши');
  const water = surroundWithSea(land);
  const seas = partitionSeas(land, water, rng); // океан делится на отдельные моря
  const board: Hex[] = [
    ...land.map((cell, i) => ({ ...cell, type: pick(RESOURCES, rng), name: names[i] ?? null, sea: null, discovered: false })),
    ...water.map((cell) => ({ ...cell, type: 'sea' as const, name: null, sea: seas.get(`${cell.q},${cell.r}`) ?? 0, discovered: false })),
  ];

  // У каждого игрока своя случайная стартовая локация (разные для всех): там колония и стартовые юниты.
  // Только на материке: пока нет кораблей, остров стал бы для игрока ловушкой.
  const homes = shuffle(board.filter((hex) => mainland.some((cell) => sameCell(cell, hex))), rng);
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
      shownKind: kind,
      fresh: false,
      tired: false,
      blocked: false,
      revealed: { q, r },
    });
    return [spawn('colony'), ...STARTING_KINDS.map(spawn)];
  });

  const stock = Object.fromEntries(playerIds.map((id) => [id, { ...START_STOCK }]));
  const state: GameState = {
    playerOrder: playerIds,
    slots: Object.fromEntries(playerIds.map((id, i) => [id, i])),
    turn: 1,
    phase: 'maneuver',
    stage: 'riders',
    ready: [],
    stock,
    shownStock: Object.fromEntries(playerIds.map((id) => [id, { ...START_STOCK }])),
    winnerId: null,
    hexes: markDiscovered(board, units),
    units,
    roads: [],
    market: { prices: [], steps: {} },
    nextId: serial + 1,
  };
  return settle(state, rng).state;
}

/** `rng` нужен действиям со случайным исходом (добыча, бой, «разъезд»); по умолчанию — `Math.random`. */
export function applyAction(
  state: GameState,
  playerId: string,
  action: GameAction,
  rng: Rng = Math.random,
): Result<Applied> {
  if (state.winnerId) return fail('Игра уже окончена');
  if (!state.playerOrder.includes(playerId)) return fail('Вы не участвуете в игре');
  if (state.ready.includes(playerId)) return fail('Вы уже завершили эту фазу');

  const done = perform(state, playerId, action, rng);
  if (!done.ok) return done;

  const settled = settle(done.value.state, rng);
  return ok(settled.state, done.value.events, [...done.value.reports, ...settled.reports]);
}

function perform(state: GameState, playerId: string, action: GameAction, rng: Rng): Result<Applied> {
  switch (action.type) {
    case 'move':
      if (state.phase !== 'maneuver') return fail('Двигаться можно только на фазе манёвра');
      return moveUnit(state, playerId, action.unitId, action.to);

    case 'harvest':
      if (state.phase !== 'harvest') return fail('Добывать ресурсы можно только на фазе добычи');
      return harvestColony(state, playerId, action.colonyId, rng);

    case 'drop_unsupplied':
      if (state.phase !== 'supply') return fail('Сейчас не фаза снабжения');
      return dropUnsupplied(state, playerId, action.unitIds);

    case 'build':
      if (state.phase !== 'build') return fail('Строить можно только на фазе строительства');
      return build(state, playerId, action);

    case 'trade':
      if (state.phase !== 'trade') return fail('Торговать можно только на фазе торговли');
      return trade(state, playerId, action.give, action.get);

    case 'end_phase':
      switch (state.phase) {
        case 'maneuver':
        case 'battle': // подтверждение начала боёв
        case 'build':
        case 'trade': // на торговле это отказ от текущей цены
          return ok({ ...state, ready: [...state.ready, playerId] });
        case 'harvest': {
          const { state: harvested, events } = harvestRemaining(state, playerId, rng);
          return ok({ ...harvested, ready: [...harvested.ready, playerId] }, events);
        }
        case 'supply':
          return fail('Не хватает ресурсов: выберите, кто останется без снабжения');
      }
  }
}

/** Игрок вышел посреди партии: его юниты, постройки и запасы исчезают, последний оставшийся побеждает. */
export function removePlayer(
  state: GameState,
  playerId: string,
  rng: Rng = Math.random,
): { state: GameState; reports: Report[] } {
  if (state.winnerId || !state.playerOrder.includes(playerId)) return { state, reports: [] };

  const without = <T>(record: Record<string, T>) =>
    Object.fromEntries(Object.entries(record).filter(([id]) => id !== playerId));
  const playerOrder = state.playerOrder.filter((id) => id !== playerId);
  const next: GameState = {
    ...state,
    playerOrder,
    ready: state.ready.filter((id) => id !== playerId),
    stock: without(state.stock),
    shownStock: without(state.shownStock),
    units: state.units.filter((unit) => unit.ownerId !== playerId),
  };

  if (playerOrder.length <= 1) return { state: { ...next, winnerId: playerOrder[0] ?? null }, reports: [] };
  // Ушедший мог быть последним, кого ждали.
  return settle(next, rng);
}
