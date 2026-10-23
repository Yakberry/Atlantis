/** Осевые координаты гексагональной сетки (https://www.redblobgames.com/grids/hexagons/). */
export type Coord = { q: number; r: number };

export const distance = (a: Coord, b: Coord): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

/** Шестиугольная карта: центр и `radius` колец вокруг него (радиус 1 — 7 клеток). */
export function createBoard(radius: number): Coord[] {
  const cells: Coord[] = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      cells.push({ q, r });
    }
  }
  return cells;
}

export const sameCell = (a: Coord, b: Coord): boolean => a.q === b.q && a.r === b.r;
