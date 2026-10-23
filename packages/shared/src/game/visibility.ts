import { distance } from './hex';
import { VISION_RANGE, type GameState, type GameView } from './model';

/**
 * Проекция состояния для одного игрока («туман войны»).
 * Локацию видит тот, у кого в ней или рядом с ней стоит юнит. Про невидимые локации
 * сервер не отправляет ничего, кроме координат, поэтому подсмотреть их на клиенте нельзя.
 */
export function viewFor(state: GameState, viewerId: string): GameView {
  const { hexes, units, ...rest } = state;
  const eyes = units.filter((unit) => unit.ownerId === viewerId);

  return {
    ...rest,
    hexes: hexes.map((hex) => {
      const { q, r } = hex;
      if (!eyes.some((eye) => distance(eye, hex) <= VISION_RANGE)) return { q, r, visible: false };

      const here = units.filter((unit) => unit.q === q && unit.r === r);
      const owners = new Set(here.map((unit) => unit.ownerId));
      return {
        q,
        r,
        visible: true,
        resource: hex.resource,
        ownerId: owners.size === 1 ? ([...owners][0] ?? null) : null,
        contested: owners.size > 1,
        units: here.map(({ id, ownerId }) => ({ id, ownerId })),
      };
    }),
  };
}
