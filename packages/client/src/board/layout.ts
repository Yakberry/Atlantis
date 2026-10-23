import type { Coord } from '@atlantis/shared';

export const HEX_SIZE = 56;
const GAP = 3;
const SQRT3 = Math.sqrt(3);

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

export function boardViewBox(cells: Coord[]): string {
  const centers = cells.map(hexCenter);
  const xs = centers.map((c) => c.x);
  const ys = centers.map((c) => c.y);
  const halfWidth = (HEX_SIZE * SQRT3) / 2;
  const left = Math.min(...xs) - halfWidth;
  const top = Math.min(...ys) - HEX_SIZE;
  return `${left} ${top} ${Math.max(...xs) + halfWidth - left} ${Math.max(...ys) + HEX_SIZE - top}`;
}
