import { distance, sameCell, type Coord } from './hex';
import { VISION_RANGE, type GameState, type GameView, type Unit, type UnitView } from './model';

/**
 * Где игрок «знает» юнита: свои — там, где они стоят сейчас (приказ действует мгновенно),
 * чужие — там, где их показали при последнем раскрытии хода.
 */
const knownPosition = (unit: Unit, viewerId: string): Coord => (unit.ownerId === viewerId ? unit : unit.revealed);

const toUnitView = (unit: Unit, viewerId: string): UnitView =>
  unit.ownerId === viewerId
    ? { id: unit.id, ownerId: unit.ownerId, tired: unit.tired }
    : { id: unit.id, ownerId: unit.ownerId };

/**
 * Проекция состояния для одного игрока («туман войны»).
 * Локацию видит тот, у кого в ней или рядом с ней стоит юнит. Про невидимые локации сервер
 * не отправляет ничего, кроме координат, а чужие перемещения — только после раскрытия хода,
 * поэтому подсмотреть их на клиенте нельзя.
 */
export function viewFor(state: GameState, viewerId: string): GameView {
  const { hexes, units, ...rest } = state;
  const eyes = units.filter((unit) => unit.ownerId === viewerId);

  return {
    ...rest,
    hexes: hexes.map((hex) => {
      const { q, r } = hex;
      if (!eyes.some((eye) => distance(eye, hex) <= VISION_RANGE)) return { q, r, visible: false };

      const here = units.filter((unit) => sameCell(knownPosition(unit, viewerId), hex));
      const owners = new Set(here.map((unit) => unit.ownerId));
      return {
        q,
        r,
        visible: true,
        resource: hex.resource,
        ownerId: owners.size === 1 ? ([...owners][0] ?? null) : null,
        contested: owners.size > 1,
        units: here.map((unit) => toUnitView(unit, viewerId)),
      };
    }),
  };
}
