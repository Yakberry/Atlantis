import { distance, sameCell, type Coord } from './hex';
import { buildSites } from './build';
import { chainsOf } from './harvest';
import { supplyNeeds } from './supply';
import { emptyStock, terrainOf, UNIT_KINDS, type GameState, type GameView, type Hex, type Unit, type UnitView } from './model';

/**
 * Где игрок «знает» юнита: свои — там, где они стоят сейчас (приказ действует мгновенно),
 * чужие — там, где их показали при последнем раскрытии манёвра.
 */
const knownPosition = (unit: Unit, viewerId: string): Coord => (unit.ownerId === viewerId ? unit : unit.revealed);

/** Владелец знает о юните всё; остальные видят его вид (`shownKind`) и ничего о его усталости. */
const toUnitView = (unit: Unit, viewerId: string): UnitView =>
  unit.ownerId === viewerId
    ? { id: unit.id, ownerId: unit.ownerId, kind: unit.kind, tired: unit.tired }
    : { id: unit.id, ownerId: unit.ownerId, kind: unit.shownKind };

/** Игрок видит локацию: рядом с ней (в пределах обзора вида) стоит его юнит или постройка. */
export const canSee = (state: GameState, viewerId: string, cell: Coord): boolean =>
  state.units.some(
    (unit) => unit.ownerId === viewerId && distance(unit, cell) <= UNIT_KINDS[unit.kind].vision,
  );

/**
 * Проекция состояния для одного игрока («туман войны»).
 *
 * - Локацию видит тот, у кого достаточно близко стоит юнит или постройка (дальность зависит от вида).
 *   Про невидимые локации сервер не отправляет ничего, кроме координат.
 * - Море видно как море сразу. Ресурс видимой суши известен, если в ней кто-то побывал к последнему
 *   раскрытию манёвра либо если в ней сейчас стоит свой юнит. Чужие посещения до раскрытия на вид не влияют,
 *   иначе по внезапно открывшемуся ресурсу можно было бы вычислить чужой ход.
 * - Название видно у всякой видимой суши. Дороги видны, если виден хотя бы один их конец.
 * - Новые постройки и дороги других игроков скрыты до конца фазы строительства; улучшенная колония до тех пор выглядит прежней.
 * - Запас ресурсов: свой — актуальный, чужие — на конец прошлой фазы.
 * - Чужие юниты видны там, где их показали при последнем раскрытии манёвра; чужая усталость скрыта.
 */
export function viewFor(state: GameState, viewerId: string): GameView {
  const { hexes, units, stock, shownStock, roads, nextId: _nextId, ...rest } = state;
  const eyes = units.filter((unit) => unit.ownerId === viewerId);
  const shownRoads = roads.filter((road) => !road.fresh || road.ownerId === viewerId);

  const knowsResource = (hex: Hex) => hex.discovered || eyes.some((eye) => sameCell(eye, hex));

  return {
    ...rest,
    stock: stock[viewerId] ?? emptyStock(),
    rivals: Object.fromEntries(Object.entries(shownStock).filter(([id]) => id !== viewerId)),
    supply: supplyNeeds(eyes),
    roads: shownRoads.filter((road) => canSee(state, viewerId, road.a) || canSee(state, viewerId, road.b)),
    chains: chainsOf(state, viewerId, shownRoads),
    sites: state.phase === 'build' && !state.ready.includes(viewerId) ? buildSites(state, viewerId) : [],
    hexes: hexes.map((hex) => {
      const { q, r } = hex;
      if (!canSee(state, viewerId, hex)) return { q, r, visible: false };

      const here = units.filter(
        (unit) => (unit.ownerId === viewerId || !unit.fresh) && sameCell(knownPosition(unit, viewerId), hex),
      );
      const owners = new Set(here.map((unit) => unit.ownerId));
      return {
        q,
        r,
        visible: true,
        name: hex.name,
        terrain: terrainOf(hex.type),
        resource: hex.type !== 'sea' && knowsResource(hex) ? hex.type : null,
        ownerId: owners.size === 1 ? ([...owners][0] ?? null) : null,
        contested: owners.size > 1,
        units: here.map((unit) => toUnitView(unit, viewerId)),
      };
    }),
  };
}
