import type { Coord } from '@atlantis/shared';

export const HEX_SIZE = 56;
const GAP = 3;
const PADDING = 12;
const SQRT3 = Math.sqrt(3);

export type Bounds = { x: number; y: number; width: number; height: number };

/** Центр гекса в пикселях (острой вершиной вверх). */
export const hexCenter = ({ q, r }: Coord) => ({
  x: HEX_SIZE * SQRT3 * (q + r / 2),
  y: HEX_SIZE * 1.5 * r,
});

/** Вершины гекса вокруг точки (0, 0); зазор между соседями оставляет место для границы. */
export const HEX_POINTS = Array.from({ length: 6 }, (_, i) => {
  const angle = (Math.PI / 180) * (60 * i - 30);
  const radius = HEX_SIZE - GAP;
  return `${(radius * Math.cos(angle)).toFixed(1)},${(radius * Math.sin(angle)).toFixed(1)}`;
}).join(' ');

/** Прямоугольник, в который помещается вся карта. */
export function boardBounds(cells: Coord[]): Bounds {
  const centers = cells.map(hexCenter);
  const xs = centers.map((c) => c.x);
  const ys = centers.map((c) => c.y);
  const halfWidth = (HEX_SIZE * SQRT3) / 2 + PADDING;
  const halfHeight = HEX_SIZE + PADDING;
  const x = Math.min(...xs) - halfWidth;
  const y = Math.min(...ys) - halfHeight;
  return { x, y, width: Math.max(...xs) + halfWidth - x, height: Math.max(...ys) + halfHeight - y };
}

/** Силуэт колонии (домик) вокруг точки (0, 0); юниты — круги радиуса 11. */
export const COLONY_POINTS = '-11,-1 0,-12 11,-1 11,10 -11,10';

/** Силуэт кавалерии (ромб). */
export const RIDER_POINTS = '0,-13 12,0 0,13 -12,0';

/** Силуэт укреплённой колонии (щит). */
export const FORT_POINTS = '-11,-10 11,-10 11,3 0,12 -11,3';

/** Место сущности среди остальных в одной локации: не больше трёх в ряд. */
export function unitSlot(index: number, count: number): { x: number; y: number } {
  const perRow = 3;
  const rows = Math.ceil(count / perRow);
  const row = Math.floor(index / perRow);
  const inRow = Math.min(perRow, count - row * perRow);
  return { x: ((index % perRow) - (inRow - 1) / 2) * 26, y: -8 + (row - (rows - 1) / 2) * 24 };
}

/** Куда класть картинку локации: она вписана в тот же гекс, что и заливка. */
export const HEX_IMAGE = {
  x: -(SQRT3 * (HEX_SIZE - GAP)) / 2,
  y: -(HEX_SIZE - GAP),
  width: SQRT3 * (HEX_SIZE - GAP),
  height: 2 * (HEX_SIZE - GAP),
};
