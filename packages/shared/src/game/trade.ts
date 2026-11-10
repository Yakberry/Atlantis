import { DIE_SIDES, emptyStock, isCaptured, RESOURCES, TRADE_OFFERS, type Applied, type GameState, type Resource, type Result, type Stock } from './model';
import { sameCell } from './hex';
import type { Rng } from './random';
import { fail, ok } from './result';
import { pay } from './supply';

/** Общие для всех игроков цены этого хода: TRADE_OFFERS значений d6, в порядке предложений. */
export const rollPrices = (rng: Rng): number[] =>
  Array.from({ length: TRADE_OFFERS }, () => 1 + Math.floor(rng() * DIE_SIDES));

const total = (stock: Stock): number => RESOURCES.reduce((sum, resource) => sum + stock[resource], 0);

/** Текущее предложение игрока (`undefined`, если он принял все). */
export const currentPrice = (state: GameState, playerId: string): number | undefined => {
  const rolled = state.market.prices[state.market.steps[playerId] ?? 0];
  return rolled === undefined ? undefined : effectivePrice(state, playerId, rolled);
};

/** Рыночная площадь снижает цены с d6 до d3: брошенное значение делится пополам с округлением вверх. */
export const effectivePrice = (state: GameState, playerId: string, rolled: number): number =>
  state.units.some(
    (unit) =>
      unit.ownerId === playerId && unit.kind === 'market' && !isCaptured(playerId, state.units.filter((other) => sameCell(other, unit))),
  ) ? Math.ceil(rolled / 2) : rolled;

/** Торговля для игрока ещё возможна: предложение есть, и ему хватает ресурсов, чтобы его принять. */
export function canTrade(state: GameState, playerId: string): boolean {
  const price = currentPrice(state, playerId);
  return price !== undefined && total(state.stock[playerId] ?? emptyStock()) >= price;
}

/** Сделка с купцами по текущей цене: отдаёте любые свои ресурсы в сумме ровно по цене, получаете 1 выбранный. */
export function trade(state: GameState, playerId: string, give: Stock, get: Resource): Result<Applied> {
  const price = currentPrice(state, playerId);
  if (price === undefined) return fail('Предложения купцов на этот ход закончились');

  const stock = state.stock[playerId] ?? emptyStock();
  if (!RESOURCES.every((resource) => Number.isInteger(give[resource]) && give[resource] >= 0)) {
    return fail('Некорректное количество ресурсов');
  }
  if (total(give) !== price) return fail(`Купцы просят ровно ${price}`);
  if (!RESOURCES.every((resource) => give[resource] <= stock[resource])) return fail('Не хватает ресурсов');

  const paid = pay(stock, give);
  const received = { ...paid, [get]: paid[get] + 1 };
  return ok({
    ...state,
    stock: { ...state.stock, [playerId]: received },
    market: { ...state.market, steps: { ...state.market.steps, [playerId]: (state.market.steps[playerId] ?? 0) + 1 } },
  });
}
