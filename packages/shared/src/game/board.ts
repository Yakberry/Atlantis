import { neighbors, type Coord } from './hex';
import { pickWeighted, type Rng } from './random';

const key = ({ q, r }: Coord) => `${q},${r}`;

/**
 * Связная карта из `size` клеток, выращенная от центра. Свободная клетка выбирается тем охотнее,
 * чем меньше построенных клеток она касается, поэтому карта не превращается в ровный «цветок»:
 * получаются заливы, полуострова и рукава, а у большинства клеток меньше шести соседей.
 */
export function generateBoard(size: number, rng: Rng): Coord[] {
  const origin: Coord = { q: 0, r: 0 };
  const cells: Coord[] = [origin];
  const taken = new Set([key(origin)]);

  while (cells.length < size) {
    // Кандидаты: свободные клетки рядом с картой и число построенных клеток, которых они касаются.
    const frontier = new Map<string, { cell: Coord; touching: number }>();
    for (const cell of cells) {
      for (const next of neighbors(cell)) {
        if (taken.has(key(next))) continue;
        const entry = frontier.get(key(next));
        if (entry) entry.touching += 1;
        else frontier.set(key(next), { cell: next, touching: 1 });
      }
    }

    const { cell } = pickWeighted([...frontier.values()], (candidate) => 1 / candidate.touching, rng);
    cells.push(cell);
    taken.add(key(cell));
  }
  return cells;
}
