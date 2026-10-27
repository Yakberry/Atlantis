import { resolveBattles } from './battle';
import { canHarvest } from './harvest';
import { canStillMove, resolveManeuver } from './maneuver';
import { emptyStock, WIN_TURN, type GameState, type Report, type Stock } from './model';
import type { Rng } from './random';
import { covers, pay, supplyNeeds } from './supply';

/** Предохранитель: за одно действие не может пройти больше шагов, чем сыграть за партию. */
const MAX_STEPS = 100;

/**
 * Двигает ход вперёд, пока есть кому его двигать: игроки, которым в фазе нечего делать, готовы сами;
 * когда готовы все, фаза заканчивается и начинается следующая. Бой (фаза 4) проходит сразу после добычи.
 */
export function settle(state: GameState, rng: Rng): { state: GameState; reports: Report[] } {
  const reports: Report[] = [];
  let current = state;

  for (let step = 0; step < MAX_STEPS; step++) {
    current = checkElimination(autoReady(current));
    const everyoneReady = current.playerOrder.every((id) => current.ready.includes(id));
    if (current.winnerId || !everyoneReady) break;

    const next = advance(current, rng);
    current = next.state;
    reports.push(...next.reports);
  }
  return { state: current, reports };
}

function autoReady(state: GameState): GameState {
  const idle = state.playerOrder.filter((id) => !state.ready.includes(id) && !hasWork(state, id));
  return idle.length > 0 ? { ...state, ready: [...state.ready, ...idle] } : state;
}

/** Есть ли у игрока ещё что делать в текущей фазе. */
function hasWork(state: GameState, playerId: string): boolean {
  const own = state.units.filter((unit) => unit.ownerId === playerId);
  switch (state.phase) {
    case 'maneuver':
      return own.some((unit) => canStillMove(state, unit));
    case 'harvest':
      return own.some((unit) => canHarvest(state, unit));
    case 'supply':
      return true; // кому хватило ресурсов, тот готов с начала фазы; остальные должны выбрать сами
  }
}

function advance(state: GameState, rng: Rng): { state: GameState; reports: Report[] } {
  switch (state.phase) {
    case 'maneuver':
      return { state: reveal(enterSupply(resolveManeuver(state, rng))), reports: [] };
    case 'supply':
      return { state: reveal({ ...state, phase: 'harvest', ready: [] }), reports: [] };
    case 'harvest': {
      const { state: fought, reports } = resolveBattles(state, rng);
      // Новый ход: все снова могут действовать.
      const units = fought.units.map((unit) => ({ ...unit, tired: false }));
      const next = { ...fought, units, phase: 'maneuver' as const, ready: [], turn: fought.turn + 1 };
      return { state: reveal(checkTurnLimit(next)), reports };
    }
  }
}

/** Начало снабжения: тем, кому хватает ресурсов, снабжение оплачивается сразу. */
function enterSupply(state: GameState): GameState {
  const stock = { ...state.stock };
  const ready: string[] = [];
  for (const id of state.playerOrder) {
    const needs = supplyNeeds(state.units.filter((unit) => unit.ownerId === id));
    const mine = stock[id] ?? emptyStock();
    if (covers(mine, needs)) {
      stock[id] = pay(mine, needs);
      ready.push(id);
    }
  }
  return { ...state, phase: 'supply', stock, ready };
}

/** Запасы, которые видят все, обновляются после каждой фазы. */
function reveal(state: GameState): GameState {
  const shownStock: Record<string, Stock> = {};
  for (const [id, stock] of Object.entries(state.stock)) shownStock[id] = { ...stock };
  return { ...state, shownStock };
}

/** Остался один игрок, у которого есть юниты или постройки, — он победил. */
function checkElimination(state: GameState): GameState {
  if (state.winnerId || state.playerOrder.length < 2) return state;
  const alive = state.playerOrder.filter((id) => state.units.some((unit) => unit.ownerId === id));
  return alive.length <= 1 ? { ...state, winnerId: alive[0] ?? state.playerOrder[0] ?? null } : state;
}

/** Заглушка условия победы. */
function checkTurnLimit(state: GameState): GameState {
  return state.turn >= WIN_TURN ? { ...state, winnerId: state.playerOrder[0] ?? null } : state;
}
