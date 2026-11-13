import { sameCell, type Coord } from './hex';
import type { Road } from './model';

const key = ({ q, r }: Coord) => `${q},${r}`;

export const roadBetween = (roads: readonly Road[], x: Coord, y: Coord): Road | undefined =>
  roads.find((road) => (sameCell(road.a, x) && sameCell(road.b, y)) || (sameCell(road.a, y) && sameCell(road.b, x)));

/**
 * Цепочки колоний: колонии, соединённые переданными дорогами (напрямую или через промежуточные клетки).
 * Колония без дорог — цепочка из одной колонии.
 */
export function colonyChains(colonies: readonly (Coord & { id: string })[], roads: readonly { a: Coord; b: Coord }[]): string[][] {
  const links = new Map<string, string[]>();
  const link = (from: Coord, to: Coord) => links.set(key(from), [...(links.get(key(from)) ?? []), key(to)]);
  for (const road of roads) {
    link(road.a, road.b);
    link(road.b, road.a);
  }

  const chains: string[][] = [];
  const seen = new Set<string>();
  for (const colony of colonies) {
    if (seen.has(key(colony))) continue;
    const component = new Set([key(colony)]);
    const queue = [key(colony)];
    for (let cell = queue.pop(); cell !== undefined; cell = queue.pop()) {
      for (const next of links.get(cell) ?? []) {
        if (component.has(next)) continue;
        component.add(next);
        queue.push(next);
      }
    }
    for (const cell of component) seen.add(cell);
    chains.push(colonies.filter((c) => component.has(key(c))).map((c) => c.id));
  }
  return chains;
}
