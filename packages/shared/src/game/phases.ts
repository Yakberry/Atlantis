import { hasPendingBattle, resolveBattles } from './battle';
import { canBuildAnything } from './build';
import { canHarvest } from './harvest';
import { canStillMove, syncManeuver } from './maneuver';
import { emptyStock, MANEUVER_STAGES, WIN_TURN, type GameState, type Report, type Stock } from './model';
import type { Rng } from './random';
import { covers, pay, supplyNeeds, supplyReport } from './supply';
import { canTrade, rollPrices } from './trade';

/** Предохранитель: за одно действие не может пройти больше шагов, чем сыграть за партию. */
const MAX_STEPS = 100;

/**
 * Двигает ход вперёд, пока есть кому его двигать: игроки, которым в фазе нечего делать, готовы сами;
 * когда готовы все, фаза заканчивается и начинается следующая. Бой (последняя фаза) проходит сразу после добычи.
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
    case 'build':
      return canBuildAnything(state, playerId);
    case 'harvest':
      return own.some((unit) => canHarvest(state, unit));
    case 'battle':
      return hasPendingBattle(state); // подтверждать нужно, только если бои предстоят
    case 'trade':
      return canTrade(state, playerId);
    case 'supply':
      return true; // кому хватило ресурсов, тот готов с начала фазы; остальные должны выбрать сами
  }
}

function advance(state: GameState, rng: Rng): { state: GameState; reports: Report[] } {
  switch (state.phase) {
    case 'maneuver': {
      // Конец этапа: синхронизация, затем следующий этап или, если этапы кончились, бой.
      const synced = syncManeuver(state, rng);
      const following = MANEUVER_STAGES[MANEUVER_STAGES.indexOf(synced.stage) + 1];
      if (following) return { state: { ...synced, stage: following, ready: [] }, reports: [] };
      return { state: reveal({ ...synced, phase: 'battle', ready: [] }), reports: [] };
    }
    case 'battle': {
      // Все подтвердили: бои проходят, затем снабжение выживших.
      const { state: fought, reports } = resolveBattles(state, rng);
      const entered = enterSupply(fought);
      return { state: reveal(entered.state), reports: [...reports, ...entered.reports] };
    }
    case 'supply':
      return { state: reveal({ ...state, phase: 'build', ready: [] }), reports: [] };
    case 'build': {
      // Конец строительства: новые постройки и дороги становятся видны всем.
      const units = state.units.map((unit) => ({ ...unit, fresh: false, shownKind: unit.kind }));
      const roads = state.roads.map((road) => ({ ...road, fresh: false }));
      return { state: reveal({ ...state, units, roads, phase: 'harvest', ready: [] }), reports: [] };
    }
    case 'harvest': {
      // Затем — торговля с купцами: цены общие, бросаются в начале фазы.
      const units = state.units.map((unit) => ({ ...unit, tired: false, blocked: false }));
      const market = { prices: rollPrices(rng), steps: {} };
      return { state: reveal({ ...state, units, market, phase: 'trade', ready: [] }), reports: [] };
    }
    case 'trade': {
      // Конец хода: начинается новый.
      const next = { ...state, phase: 'maneuver' as const, stage: 'riders' as const, ready: [], turn: state.turn + 1 };
      return { state: reveal(checkTurnLimit(next)), reports: [] };
    }
  }
}

/** Начало снабжения: тем, кому хватает ресурсов, снабжение оплачивается сразу (и попадает в журнал). */
function enterSupply(state: GameState): { state: GameState; reports: Report[] } {
  const stock = { ...state.stock };
  const ready: string[] = [];
  const reports: Report[] = [];
  for (const id of state.playerOrder) {
    const needs = supplyNeeds(state.units.filter((unit) => unit.ownerId === id));
    const mine = stock[id] ?? emptyStock();
    if (!covers(mine, needs)) continue;
    stock[id] = pay(mine, needs);
    ready.push(id);
    reports.push(...supplyReport(state, id, needs, stock[id]));
  }
  return { state: { ...state, phase: 'supply', stock, ready }, reports };
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
