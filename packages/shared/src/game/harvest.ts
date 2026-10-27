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
  type Unit,
} from './model';
import type { Rng } from './random';
import { fail, ok } from './result';

const hexOf = (state: GameState, unit: Unit) => state.hexes.find((hex) => sameCell(hex, unit));
const isCapturedNow = (state: GameState, colony: Unit) =>
  isCaptured(colony.ownerId, state.units.filter((unit) => sameCell(unit, colony)));

/** Колония может добывать: ещё не добывала, не захвачена и стоит на суше. */
export function canHarvest(state: GameState, colony: Unit): boolean {
  const hex = hexOf(state, colony);
  return (
    UNIT_KINDS[colony.kind].harvests &&
    !colony.tired &&
    hex !== undefined &&
    hex.type !== 'sea' &&
    !isCapturedNow(state, colony)
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
  if (!canHarvest(state, colony)) return fail('Здесь нечего добывать');

  const { state: next, event } = collect(state, colony, rng);
  return ok(next, [event]);
}

/** «Завершить ход»: все остальные не захваченные колонии игрока добывают сами. */
export function harvestRemaining(state: GameState, playerId: string, rng: Rng): { state: GameState; events: GameEvent[] } {
  let current = state;
  const events: GameEvent[] = [];
  for (const { id } of state.units.filter((u) => u.ownerId === playerId)) {
    const colony = current.units.find((u) => u.id === id);
    if (!colony || !canHarvest(current, colony)) continue;
    const collected = collect(current, colony, rng);
    current = collected.state;
    events.push(collected.event);
  }
  return { state: current, events };
}
