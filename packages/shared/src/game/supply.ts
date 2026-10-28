import { emptyStock, RESOURCES, UNIT_KINDS, type Applied, type GameState, type Report, type Result, type Stock, type Unit, type UnitKind } from './model';
import { fail, ok } from './result';

/** Сколько ресурсов нужно на снабжение этих юнитов и построек. */
export function supplyNeeds(entities: readonly { kind: UnitKind }[]): Stock {
  const needs = emptyStock();
  for (const { kind } of entities) {
    const supply: Partial<Stock> = UNIT_KINDS[kind].supply;
    for (const resource of RESOURCES) needs[resource] += supply[resource] ?? 0;
  }
  return needs;
}

export const covers = (stock: Stock, needs: Stock): boolean => RESOURCES.every((r) => stock[r] >= needs[r]);

export function pay(stock: Stock, needs: Stock): Stock {
  const result = emptyStock();
  for (const resource of RESOURCES) result[resource] = stock[resource] - needs[resource];
  return result;
}

/**
 * Набор отказов от снабжения допустим, если оставшимся хватает ресурсов
 * и каждый отказ был необходим (вернув любого из них, снова получим нехватку).
 */
export function isValidDrop(stock: Stock, entities: readonly { id: string; kind: UnitKind }[], dropIds: readonly string[]): boolean {
  const dropped = new Set(dropIds);
  if (dropped.size !== dropIds.length) return false;
  if (![...dropped].every((id) => entities.some((entity) => entity.id === id))) return false;

  const remaining = entities.filter((entity) => !dropped.has(entity.id));
  if (!covers(stock, supplyNeeds(remaining))) return false;
  return entities.filter((entity) => dropped.has(entity.id)).every((entity) => !covers(stock, supplyNeeds([...remaining, entity])));
}

/** Запись в журнале снабжения: её видят все игроки (запасы и так известны после фазы). Без трат записи нет. */
export function supplyReport(state: GameState, playerId: string, spent: Stock, left: Stock): Report[] {
  if (RESOURCES.every((resource) => spent[resource] === 0)) return [];
  return [{ audience: state.playerOrder, data: { type: 'supply', playerId, spent, left } }];
}

/** Игрок с нехваткой выбрал, кто остаётся без снабжения: они удаляются, остальные получают своё. */
export function dropUnsupplied(state: GameState, playerId: string, unitIds: readonly string[]): Result<Applied> {
  const own = state.units.filter((unit) => unit.ownerId === playerId);
  const stock = state.stock[playerId] ?? emptyStock();
  if (!isValidDrop(stock, own, unitIds)) return fail('Выберите ровно столько, чтобы оставшимся хватило ресурсов');

  const dropped = new Set(unitIds);
  const lost = own.filter((unit) => dropped.has(unit.id));
  const remaining = own.filter((unit) => !dropped.has(unit.id));
  const needs = supplyNeeds(remaining);
  const left = pay(stock, needs);
  const isBuilding = (unit: Unit) => UNIT_KINDS[unit.kind].building;

  return ok(
    {
      ...state,
      units: state.units.filter((unit) => unit.ownerId !== playerId || !dropped.has(unit.id)),
      stock: { ...state.stock, [playerId]: left },
      ready: [...state.ready, playerId],
    },
    [],
    [
      ...supplyReport(state, playerId, needs, left),
      {
        audience: [playerId],
        data: {
          type: 'unsupplied',
          playerId,
          units: lost.filter((unit) => !isBuilding(unit)).length,
          buildings: lost.filter(isBuilding).length,
        },
      },
    ],
  );
}
