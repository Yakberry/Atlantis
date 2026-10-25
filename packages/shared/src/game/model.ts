import type { Coord } from './hex';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;
export const MIN_MAP_SIZE = 5;
export const MAX_MAP_SIZE = 35;
export const DEFAULT_MAP_SIZE = 7;

/**
 * Способ генерации суши:
 * - `classic` — материк, у которого могут вырастать тонкие отростки;
 * - `solid` — цельный массив: клетки суши стремятся соседствовать с другими клетками суши;
 * - `islands` — материк и отдельные острова (около `ISLAND_SHARE` суши, острова по 2–5 клеток).
 */
export const MAP_STYLES = ['classic', 'solid', 'islands'] as const;
export type MapStyle = (typeof MAP_STYLES)[number];
export const DEFAULT_MAP_STYLE: MapStyle = 'solid';

/** Настройки карты, которые выбирает хост. `mapSize` — число клеток суши (море добавляется сверху). */
export type GameSettings = { mapSize: number; mapStyle: MapStyle };
/** Подвижных юнитов у каждого игрока на старте (помимо колонии). */
export const STARTING_UNITS = 2;
/** Сколько единиц ресурса приносит одна добыча (случайно, включая границы). */
export const HARVEST_MIN = 1;
export const HARVEST_MAX = 3;
/** Заглушка условия победы: когда счётчик ходов доходит до этого значения, игра заканчивается. */
export const WIN_TURN = 3;

/**
 * Виды сущностей на карте. Все они — «юниты» в широком смысле (принадлежат игроку, стоят в локации,
 * видят вокруг себя, участвуют в споре за локацию), но постройки не двигаются и видят на 1 локацию ближе.
 * `terrain` — по какой поверхности вид может стоять и двигаться (корабли добавятся со значением 'sea').
 */
export const UNIT_KINDS = {
  unit: { vision: 15, mobile: true, harvests: false, terrain: 'land' },
  colony: { vision: 1, mobile: false, harvests: true, terrain: 'land' },
} as const;
export type UnitKind = keyof typeof UNIT_KINDS;

export const RESOURCES = ['food', 'wood', 'iron', 'marble'] as const;
export type Resource = (typeof RESOURCES)[number];

/** Поверхность локации: по суше ходят юниты, по морю будут ходить корабли. */
export type Terrain = 'land' | 'sea';
/** Тип локации: ресурс для суши или море. */
export type HexType = Resource | 'sea';
export const terrainOf = (type: HexType): Terrain => (type === 'sea' ? 'sea' : 'land');

/** Запас игрока: по числу единиц каждого ресурса. */
export type Stock = Record<Resource, number>;
export const emptyStock = (): Stock => ({ food: 0, wood: 0, iron: 0, marble: 0 });

export type Hex = Coord & {
  type: HexType;
  /** Хоть один юнит побывал здесь к последнему раскрытию хода: ресурс суши известен всем, кто её видит. */
  discovered: boolean;
};

export type Unit = Coord & {
  id: string;
  ownerId: string;
  kind: UnitKind;
  /** Уже действовал в этом ходу (ходил или добывал); сбрасывается, когда ход раскрывается. */
  tired: boolean;
  /** Где юнита видят противники: обновляется только при раскрытии хода. */
  revealed: Coord;
};

export type UnitView = {
  id: string;
  ownerId: string;
  kind: UnitKind;
  /** Известно только владельцу юнита. */
  tired?: boolean;
};

/**
 * Полное состояние партии. Живёт только на сервере (и в БД): клиенту уходит `GameView`.
 * Ход общий: все игроки действуют одновременно, а когда все завершили ход, он раскрывается.
 */
export type GameState = {
  playerOrder: string[];
  /** Номер цвета игрока (индекс в палитре клиента). Не меняется, даже если кто-то вышел. */
  slots: Record<string, number>;
  turn: number;
  /** Игроки, уже завершившие текущий ход. */
  ready: string[];
  /** Запасы ресурсов по игрокам. Для остальных игроков они скрыты. */
  stock: Record<string, Stock>;
  winnerId: string | null;
  hexes: Hex[];
  units: Unit[];
};

/** Что игрок знает о локации. Скрытая локация — только координаты. */
export type HexView =
  | (Coord & { visible: false })
  | (Coord & {
      visible: true;
      /** Море видно как море сразу; суша — как суша, но её ресурс неизвестен, пока там никто не побывал. */
      terrain: Terrain;
      /** `null` — для моря и для суши, чей ресурс ещё не изведан ни одним юнитом. */
      resource: Resource | null;
      /** Единственный игрок, чьи юниты в локации; `null`, если она пуста или спорная. */
      ownerId: string | null;
      contested: boolean;
      units: UnitView[];
    });

/** Состояние партии глазами одного игрока: без чужих тайн. */
export type GameView = Omit<GameState, 'hexes' | 'units' | 'stock'> & {
  hexes: HexView[];
  /** Запас самого игрока. */
  stock: Stock;
};

export type GameAction =
  | { type: 'move'; unitId: string; to: Coord }
  | { type: 'harvest'; colonyId: string }
  | { type: 'end_turn' };

/** Что произошло в результате действия: сообщается только тому, кто его совершил. */
export type GameEvent = { type: 'harvested'; unitId: string; resource: Resource; amount: number };

export type Applied = { state: GameState; events: GameEvent[] };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
