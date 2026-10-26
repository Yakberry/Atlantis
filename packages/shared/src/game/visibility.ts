import { distance, sameCell, type Coord } from './hex';
import { supplyNeeds } from './supply';
import { emptyStock, terrainOf, UNIT_KINDS, type GameState, type GameView, type Hex, type Unit, type UnitView } from './model';

/**
 * Где игрок «знает» юнита: свои — там, где они стоят сейчас (приказ действует мгновенно),
 * чужие — там, где их показали при последнем раскрытии манёвра.
 */
const knownPosition = (unit: Unit, viewerId: string): Coord => (unit.ownerId === viewerId ? unit : unit.revealed);

const toUnitView = (unit: Unit, viewerId: string): UnitView =>
  unit.ownerId === viewerId
    ? { id: unit.id, ownerId: unit.ownerId, kind: unit.kind, tired: unit.tired }
    : { id: unit.id, ownerId: unit.ownerId, kind: unit.kind };

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
 * - Запас ресурсов: свой — актуальный, чужие — на конец прошлой фазы.
 * - Чужие юниты видны там, где их показали при последнем раскрытии манёвра; чужая усталость скрыта.
 */
export function viewFor(state: GameState, viewerId: string): GameView {
  const { hexes, units, stock, shownStock, ...rest } = state;
  const eyes = units.filter((unit) => unit.ownerId === viewerId);

  const knowsResource = (hex: Hex) => hex.discovered || eyes.some((eye) => sameCell(eye, hex));

  return {
    ...rest,
    stock: stock[viewerId] ?? emptyStock(),
    rivals: Object.fromEntries(Object.entries(shownStock).filter(([id]) => id !== viewerId)),
    supply: supplyNeeds(eyes),
    hexes: hexes.map((hex) => {
      const { q, r } = hex;
      if (!canSee(state, viewerId, hex)) return { q, r, visible: false };

      const here = units.filter((unit) => sameCell(knownPosition(unit, viewerId), hex));
      const owners = new Set(here.map((unit) => unit.ownerId));
      return {
        q,
        r,
        visible: true,
        terrain: terrainOf(hex.type),
        resource: hex.type !== 'sea' && knowsResource(hex) ? hex.type : null,
        ownerId: owners.size === 1 ? ([...owners][0] ?? null) : null,
        contested: owners.size > 1,
        units: here.map((unit) => toUnitView(unit, viewerId)),
      };
    }),
  };
}
