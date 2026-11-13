import { sameCell } from './hex';
import {
  emptyStock,
  FLEET_HARVEST_DIE,
  GUILD_HARVEST_DIE,
  HARVEST_MAX,
  isCaptured,
  UNIT_KINDS,
  type Applied,
  type GameEvent,
  type GameState,
  type Resource,
  type Result,
  type Road,
  type Unit,
} from './model';
import type { Rng } from './random';
import { fail, ok } from './result';
import { colonyChains } from './roads';
import { seaLinks } from './seas';

const hexOf = (state: GameState, unit: Unit) => state.hexes.find((hex) => sameCell(hex, unit));
const isCapturedNow = (state: GameState, unit: Unit) =>
  isCaptured(unit.ownerId, state.units.filter((other) => sameCell(other, unit)));

/** Цепочки колоний игрока: колонии, соединённые дорогами (дороги общие, любого игрока). */
export function chainsOf(state: GameState, playerId: string, roads: readonly Road[] = state.roads): string[][] {
  const colonies = state.units.filter((unit) => unit.ownerId === playerId && UNIT_KINDS[unit.kind].colony);
  return colonyChains(colonies, [...roads, ...seaLinks(state, playerId)]); // флот соединяет прибрежные колонии своего моря
}

/** Колония, к цепочке которой относится добывающее здание: оно само или колония его владельца в той же локации. */
const anchorOf = (state: GameState, unit: Unit): Unit | undefined =>
  UNIT_KINDS[unit.kind].colony
    ? unit
    : state.units.find((u) => u.ownerId === unit.ownerId && UNIT_KINDS[u.kind].colony && sameCell(u, unit));

/** За фазу добычи можно добывать только с одной цепочки: той, с которой игрок уже добыл. */
function activeChain(state: GameState, playerId: string): string[] | undefined {
  const harvested = state.units.find((u) => u.ownerId === playerId && UNIT_KINDS[u.kind].harvests && u.tired);
  const anchor = harvested && anchorOf(state, harvested);
  return anchor && chainsOf(state, playerId).find((chain) => chain.includes(anchor.id));
}

/** Добывающее здание (колония или флот) может добывать: не добывало, не захвачено, на суше, с колонией в цепочке. */
export function canHarvest(state: GameState, unit: Unit): boolean {
  const hex = hexOf(state, unit);
  const anchor = anchorOf(state, unit);
  const chain = activeChain(state, unit.ownerId);
  return (
    UNIT_KINDS[unit.kind].harvests &&
    !unit.tired &&
    hex !== undefined &&
    hex.type !== 'sea' &&
    anchor !== undefined &&
    !isCapturedNow(state, unit) &&
    (!chain || chain.includes(anchor.id))
  );
}

/** Сколько граней у кубика добычи: колония d3 (d6 при гильдии на таком же ресурсе), флот d6. */
function harvestDie(state: GameState, unit: Unit, resource: Resource): number {
  if (!UNIT_KINDS[unit.kind].colony) return FLEET_HARVEST_DIE;
  const boosted = state.units.some(
    (u) => u.ownerId === unit.ownerId && u.kind === 'guild' && hexOf(state, u)?.type === resource && !isCapturedNow(state, u),
  );
  return boosted ? GUILD_HARVEST_DIE : HARVEST_MAX;
}

/** Добыча одним зданием; проверки делает вызывающий. Колония даёт ресурс своей локации, флот — пищу. */
function collect(state: GameState, unit: Unit, rng: Rng): { state: GameState; event: GameEvent } {
  const hex = hexOf(state, unit);
  if (!hex || hex.type === 'sea') throw new Error('Добывающее здание стоит не на суше');
  const resource: Resource = UNIT_KINDS[unit.kind].colony ? hex.type : 'food';
  const amount = 1 + Math.floor(rng() * harvestDie(state, unit, resource));
  const mine = state.stock[unit.ownerId] ?? emptyStock();

  return {
    state: {
      ...state,
      stock: { ...state.stock, [unit.ownerId]: { ...mine, [resource]: mine[resource] + amount } },
      units: state.units.map((u) => (u.id === unit.id ? { ...u, tired: true } : u)),
    },
    event: { type: 'harvested', unitId: unit.id, resource, amount },
  };
}

export function harvestColony(state: GameState, playerId: string, unitId: string, rng: Rng): Result<Applied> {
  const unit = state.units.find((u) => u.id === unitId && u.ownerId === playerId);
  if (!unit) return fail('Это не ваша постройка');
  if (!UNIT_KINDS[unit.kind].harvests) return fail('Эта сущность ничего не добывает');
  if (unit.tired) return fail('Здание уже добывало в этом ходу');
  if (isCapturedNow(state, unit)) return fail('Локация захвачена: добыча невозможна');
  const anchor = anchorOf(state, unit);
  const chain = activeChain(state, playerId);
  if (anchor && chain && !chain.includes(anchor.id)) return fail('За одну фазу можно добывать только с одной цепочки колоний');
  if (!canHarvest(state, unit)) return fail('Здесь нечего добывать');

  const { state: next, event } = collect(state, unit, rng);
  return ok(next, [event]);
}

/**
 * «Завершить ход»: игрок добывает со всех зданий своей цепочки, которые ещё могут добывать (колонии и флот).
 * Если он уже начал добычу — это та же цепочка, иначе выбирается наибольшая (по числу зданий, способных добывать).
 */
export function harvestRemaining(state: GameState, playerId: string, rng: Rng): { state: GameState; events: GameEvent[] } {
  const own = state.units.filter((u) => u.ownerId === playerId && UNIT_KINDS[u.kind].harvests);
  const members = (chain: string[]) => own.filter((u) => chain.includes(anchorOf(state, u)?.id ?? ''));
  const workable = (current: GameState, u: Unit) => {
    const fresh = current.units.find((x) => x.id === u.id);
    return fresh !== undefined && canHarvest(current, fresh);
  };

  let chain = activeChain(state, playerId);
  if (!chain) {
    chain = chainsOf(state, playerId)
      .map((candidate) => ({ candidate, size: members(candidate).filter((u) => workable(state, u)).length }))
      .reduce<{ candidate: string[]; size: number } | undefined>((best, o) => (o.size > (best?.size ?? 0) ? o : best), undefined)
      ?.candidate;
  }

  let current = state;
  const events: GameEvent[] = [];
  for (const u of members(chain ?? [])) {
    const fresh = current.units.find((x) => x.id === u.id);
    if (!fresh || !canHarvest(current, fresh)) continue;
    const collected = collect(current, fresh, rng);
    current = collected.state;
    events.push(collected.event);
  }
  return { state: current, events };
}
