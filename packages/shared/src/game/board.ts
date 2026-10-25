import { distance, neighbors, type Coord } from './hex';
import { MAX_PLAYERS, type GameSettings } from './model';
import { pickWeighted, shuffle, type Rng } from './random';

const key = ({ q, r }: Coord) => `${q},${r}`;
const ORIGIN: Coord = { q: 0, r: 0 };

/** Доля суши, которая уходит на отдельные острова в режиме `islands`. */
const ISLAND_SHARE = 0.3;
const ISLAND_MIN = 2;
const ISLAND_MAX = 5;
/** Сколько клеток между островом и остальной сушей: 2–3 шага, чтобы море вокруг них сомкнулось. */
const GAP_MIN = 2;
const GAP_MAX = 3;

/** Охота выбрать клетку, которая касается `touching` уже построенных клеток. */
type Appetite = (touching: number) => number;
/** Любит «рукава»: чем меньше соседей, тем охотнее. Даёт тонкие отростки. */
const SPARSE: Appetite = (touching) => 1 / touching;
/** Любит «кучность»: чем больше соседей, тем охотнее. Даёт плотный массив без отростков. */
const COMPACT: Appetite = (touching) => touching ** 3;

export type Land = {
  /** Основная суша: на ней стартуют игроки. */
  mainland: Coord[];
  /** Отдельные острова (пустой список, если режим не `islands`). */
  islands: Coord[];
};

export function generateLand({ mapSize, mapStyle }: GameSettings, rng: Rng): Land {
  switch (mapStyle) {
    case 'classic':
      return { mainland: growCluster([ORIGIN], mapSize, SPARSE, rng), islands: [] };
    case 'solid':
      return { mainland: growMassif(mapSize, rng), islands: [] };
    case 'islands':
      return generateArchipelago(mapSize, rng);
  }
}

/**
 * Выращивает связный кластер клеток до `size`: каждый раз берёт свободную клетку рядом с кластером,
 * причём «охота» (`appetite`) зависит от числа соседей. `allowed` отсекает недопустимые клетки;
 * если расти некуда, возвращает то, что успел.
 */
function growCluster(
  start: readonly Coord[],
  size: number,
  appetite: Appetite,
  rng: Rng,
  allowed: (cell: Coord) => boolean = () => true,
): Coord[] {
  const cells = [...start];
  const taken = new Set(cells.map(key));

  while (cells.length < size) {
    const frontier = new Map<string, { cell: Coord; touching: number }>();
    for (const cell of cells) {
      for (const next of neighbors(cell)) {
        if (taken.has(key(next)) || !allowed(next)) continue;
        const entry = frontier.get(key(next));
        if (entry) entry.touching += 1;
        else frontier.set(key(next), { cell: next, touching: 1 });
      }
    }
    if (frontier.size === 0) break;

    const { cell } = pickWeighted([...frontier.values()], (candidate) => appetite(candidate.touching), rng);
    cells.push(cell);
    taken.add(key(cell));
  }
  return cells;
}

function generateArchipelago(size: number, rng: Rng): Land {
  // Материку всегда остаётся достаточно места для всех игроков.
  const budget = Math.min(Math.round(size * ISLAND_SHARE), size - MAX_PLAYERS);
  const sizes = islandSizes(budget, rng);
  const planned = sizes.reduce((sum, n) => sum + n, 0);

  let mainland = growMassif(size - planned, rng);
  const islands: Coord[] = [];
  for (const count of sizes) {
    islands.push(...placeIsland([...mainland, ...islands], count, rng));
  }

  // Остров, которому не нашлось места, достраивается материком: суши всегда ровно `size`.
  const shortfall = size - mainland.length - islands.length;
  if (shortfall > 0) {
    const islandKeys = new Set(islands.map(key));
    const apart = (cell: Coord) =>
      !islandKeys.has(key(cell)) && !neighbors(cell).some((next) => islandKeys.has(key(next)));
    mainland = growCluster(mainland, mainland.length + shortfall, COMPACT, rng, apart);
  }
  return { mainland, islands };
}

/** Цельный массив: растёт кучно, а оставшиеся отростки переносятся в «бухты» с двумя и более соседями. */
const growMassif = (size: number, rng: Rng): Coord[] => removeSpurs(growCluster([ORIGIN], size, COMPACT, rng), rng);

/**
 * Убирает «отростки»: клетку с единственным соседом суши переносит на свободное место,
 * где она касается как можно большего числа клеток (не меньше двух). Связность при этом не нарушается.
 */
function removeSpurs(cells: readonly Coord[], rng: Rng): Coord[] {
  const result = [...cells];
  const touching = (cell: Coord, taken: Set<string>) => neighbors(cell).filter((next) => taken.has(key(next))).length;

  for (let pass = 0; pass < result.length * 3; pass++) {
    const taken = new Set(result.map(key));
    const spur = result.findIndex((cell) => touching(cell, taken) <= 1);
    if (spur < 0) break;

    const [removed] = result.splice(spur, 1);
    if (!removed) break;
    taken.delete(key(removed));

    const spots = new Map<string, { cell: Coord; count: number }>();
    for (const cell of result) {
      for (const next of neighbors(cell)) {
        if (taken.has(key(next)) || key(next) === key(removed)) continue;
        spots.set(key(next), { cell: next, count: touching(next, taken) });
      }
    }
    const best = Math.max(0, ...[...spots.values()].map((spot) => spot.count));
    if (best < 2) {
      result.push(removed); // лучше не найти — оставляем как было
      break;
    }
    const { cell } = pickWeighted([...spots.values()].filter((spot) => spot.count === best), () => 1, rng);
    result.push(cell);
  }
  return result;
}

/** Делит бюджет суши на острова по 2–5 клеток, не оставляя «одиночку» в 1 клетку. */
function islandSizes(budget: number, rng: Rng): number[] {
  const sizes: number[] = [];
  for (let left = budget; left >= ISLAND_MIN; ) {
    const max = Math.min(ISLAND_MAX, left);
    let size = ISLAND_MIN + Math.floor(rng() * (max - ISLAND_MIN + 1));
    if (left - size === 1) size = size < max ? size + 1 : size - 1;
    sizes.push(size);
    left -= size;
  }
  return sizes;
}

/**
 * Ставит остров на расстоянии 2–3 клеток от остальной суши: не касаясь её (иначе это был бы полуостров),
 * но достаточно близко, чтобы море вокруг острова и материка осталось единым полем.
 */
function placeIsland(land: readonly Coord[], size: number, rng: Rng): Coord[] {
  const landKeys = new Set(land.map(key));
  const touchesLand = (cell: Coord) => neighbors(cell).some((next) => landKeys.has(key(next)));
  const free = (cell: Coord) => !landKeys.has(key(cell)) && !touchesLand(cell);

  const qs = land.map((c) => c.q);
  const rs = land.map((c) => c.r);
  const anchors: Coord[] = [];
  for (let q = Math.min(...qs) - GAP_MAX; q <= Math.max(...qs) + GAP_MAX; q++) {
    for (let r = Math.min(...rs) - GAP_MAX; r <= Math.max(...rs) + GAP_MAX; r++) {
      const cell = { q, r };
      if (!free(cell)) continue;
      const nearest = Math.min(...land.map((other) => distance(other, cell)));
      if (nearest >= GAP_MIN && nearest <= GAP_MAX) anchors.push(cell);
    }
  }

  for (const anchor of shuffle(anchors, rng)) {
    const island = growCluster([anchor], size, COMPACT, rng, free);
    if (island.length >= ISLAND_MIN) return island;
  }
  return [];
}

/**
 * Море вокруг суши: клетка моря на каждую пустую клетку рядом с сушей (контур),
 * плюс все пустые клетки внутри контура, до которых не добраться снаружи (внутренние заливы).
 */
export function surroundWithSea(land: Coord[]): Coord[] {
  const occupied = new Map<string, Coord>(land.map((cell) => [key(cell), cell]));
  const sea = new Map<string, Coord>();
  for (const cell of land) {
    for (const next of neighbors(cell)) {
      if (!occupied.has(key(next))) sea.set(key(next), next);
    }
  }
  for (const [k, cell] of sea) occupied.set(k, cell);

  // Заливаем «снаружи» по пустым клеткам рамки вокруг карты; не достигнутые пустые клетки — заливы.
  const cells = [...occupied.values()];
  const qs = cells.map((c) => c.q);
  const rs = cells.map((c) => c.r);
  const [qMin, qMax, rMin, rMax] = [Math.min(...qs) - 1, Math.max(...qs) + 1, Math.min(...rs) - 1, Math.max(...rs) + 1];
  const inFrame = ({ q, r }: Coord) => q >= qMin && q <= qMax && r >= rMin && r <= rMax;

  const outside = new Set<string>([key({ q: qMin, r: rMin })]);
  const queue: Coord[] = [{ q: qMin, r: rMin }];
  for (let cell = queue.pop(); cell; cell = queue.pop()) {
    for (const next of neighbors(cell)) {
      if (!inFrame(next) || occupied.has(key(next)) || outside.has(key(next))) continue;
      outside.add(key(next));
      queue.push(next);
    }
  }

  for (let q = qMin; q <= qMax; q++) {
    for (let r = rMin; r <= rMax; r++) {
      if (!occupied.has(key({ q, r })) && !outside.has(key({ q, r }))) sea.set(key({ q, r }), { q, r });
    }
  }
  return [...sea.values()];
}
