/** Осевые координаты гексагональной сетки (https://www.redblobgames.com/grids/hexagons/). */
export type Coord = { q: number; r: number };

const DIRECTIONS: readonly Coord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const neighbors = ({ q, r }: Coord): Coord[] => DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));

export const distance = (a: Coord, b: Coord): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

export const sameCell = (a: Coord, b: Coord): boolean => a.q === b.q && a.r === b.r;
