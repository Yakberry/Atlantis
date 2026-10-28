import { sameCell } from './hex';
import {
  emptyStock,
  HARVEST_MAX,
  HARVEST_MIN,
  isCaptured,
  UNIT_KINDS,
  type Applied,
  type GameEvent,
  type GameState,
  type Result,
  type Road,
  type Unit,
} from './model';
import type { Rng } from './random';
import { fail, ok } from './result';
import { colonyChains } from './roads';

const hexOf = (state: GameState, unit: Unit) => state.hexes.find((hex) => sameCell(hex, unit));
const isCapturedNow = (state: GameState, colony: Unit) =>
  isCaptured(colony.ownerId, state.units.filter((unit) => sameCell(unit, colony)));

/** Цепочки колоний игрока: колонии, соединённые дорогами (дороги общие, любого игрока). */
export function chainsOf(state: GameState, playerId: string, roads: readonly Road[] = state.roads): string[][] {
  const colonies = state.units.filter((unit) => unit.ownerId === playerId && UNIT_KINDS[unit.kind].colony);
  return colonyChains(colonies, roads);
}

/** За фазу добычи можно добывать только с одной цепочки: той, с которой игрок уже добыл. */
function activeChain(state: GameState, playerId: string): string[] | undefined {
  const harvested = state.units.find((u) => u.ownerId === playerId && UNIT_KINDS[u.kind].harvests && u.tired);
  return harvested && chainsOf(state, playerId).find((chain) => chain.includes(harvested.id));
}

/** Колония может добывать: ещё не добывала, не захвачена, стоит на суше и входит в выбранную цепочку. */
export function canHarvest(state: GameState, colony: Unit): boolean {
  const hex = hexOf(state, colony);
  const chain = activeChain(state, colony.ownerId);
  return (
    UNIT_KINDS[colony.kind].harvests &&
    !colony.tired &&
    hex !== undefined &&
    hex.type !== 'sea' &&
    !isCapturedNow(state, colony) &&
    (!chain || chain.includes(colony.id))
  );
}

/** Добыча одной колонией; проверки делает вызывающий. */
function collect(state: GameState, colony: Unit, rng: Rng): { state: GameState; event: GameEvent } {
  const hex = hexOf(state, colony);
  if (!hex || hex.type === 'sea') throw new Error('Колония стоит не на суше');
  const resource = hex.type;
  const amount = HARVEST_MIN + Math.floor(rng() * (HARVEST_MAX - HARVEST_MIN + 1));
  const mine = state.stock[colony.ownerId] ?? emptyStock();

  return {
    state: {
      ...state,
      stock: { ...state.stock, [colony.ownerId]: { ...mine, [resource]: mine[resource] + amount } },
      units: state.units.map((u) => (u.id === colony.id ? { ...u, tired: true } : u)),
    },
    event: { type: 'harvested', unitId: colony.id, resource, amount },
  };
}

/** Колония раз в ход приносит от HARVEST_MIN до HARVEST_MAX единиц ресурса своей локации. */
export function harvestColony(state: GameState, playerId: string, colonyId: string, rng: Rng): Result<Applied> {
  const colony = state.units.find((u) => u.id === colonyId && u.ownerId === playerId);
  if (!colony) return fail('Это не ваша постройка');
  if (!UNIT_KINDS[colony.kind].harvests) return fail('Эта сущность ничего не добывает');
  if (colony.tired) return fail('Колония уже добывала в этом ходу');
  if (isCapturedNow(state, colony)) return fail('Колония захвачена: добыча невозможна');
  const chain = activeChain(state, playerId);
  if (chain && !chain.includes(colony.id)) return fail('За одну фазу можно добывать только с одной цепочки колоний');
  if (!canHarvest(state, colony)) return fail('Здесь нечего добывать');

  const { state: next, event } = collect(state, colony, rng);
  return ok(next, [event]);
}

/**
 * «Завершить ход»: игрок добывает со всех колоний своей цепочки, которые ещё могут добывать.
 * Если он уже начал добычу — это та же цепочка, иначе выбирается наибольшая (по числу колоний, способных добывать).
 */
export function harvestRemaining(state: GameState, playerId: string, rng: Rng): { state: GameState; events: GameEvent[] } {
  const own = state.units.filter((u) => u.ownerId === playerId);
  const ready = (current: GameState, id: string) => {
    const colony = current.units.find((u) => u.id === id);
    return colony !== undefined && canHarvest(current, colony);
  };

  let chain = activeChain(state, playerId);
  if (!chain) {
    const workable = chainsOf(state, playerId).map((candidate) => ({
      candidate,
      size: candidate.filter((id) => own.some((u) => u.id === id) && ready(state, id)).length,
    }));
    chain = workable.reduce<{ candidate: string[]; size: number } | undefined>(
      (best, option) => (option.size > (best?.size ?? 0) ? option : best),
      undefined,
    )?.candidate;
  }

  let current = state;
  const events: GameEvent[] = [];
  for (const id of chain ?? []) {
    const colony = current.units.find((u) => u.id === id);
    if (!colony || !canHarvest(current, colony)) continue;
    const collected = collect(current, colony, rng);
    current = collected.state;
    events.push(collected.event);
  }
  return { state: current, events };
}
