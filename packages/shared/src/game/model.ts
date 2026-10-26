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
 * - `islands` — материк и отдельные острова (около 30% суши, острова по 2–5 клеток).
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
/** Кубик боя и порог успешной осады колонии. */
export const DIE_SIDES = 6;
export const SIEGE_HIT = 4;
/** Заглушка условия победы: когда счётчик ходов доходит до этого значения, игра заканчивается. */
export const WIN_TURN = 4;

export const RESOURCES = ['food', 'wood', 'iron', 'marble'] as const;
export type Resource = (typeof RESOURCES)[number];

/** Запас игрока: по числу единиц каждого ресурса. */
export type Stock = Record<Resource, number>;
export const emptyStock = (): Stock => ({ food: 0, wood: 0, iron: 0, marble: 0 });
/** Что получает каждый игрок на старте. */
export const START_STOCK: Readonly<Stock> = { food: 4, wood: 2, iron: 4, marble: 4 };

/** Поверхность локации: по суше ходят юниты, по морю будут ходить корабли. */
export type Terrain = 'land' | 'sea';
/** Тип локации: ресурс для суши или море. */
export type HexType = Resource | 'sea';
export const terrainOf = (type: HexType): Terrain => (type === 'sea' ? 'sea' : 'land');

type UnitKindInfo = {
  /** Дальность обзора в локациях. */
  vision: number;
  mobile: boolean;
  harvests: boolean;
  /** Постройка: не бросает кубик в бою, не «захватывает» чужие колонии. */
  building: boolean;
  /** По какой поверхности вид может стоять и двигаться. */
  terrain: Terrain;
  /** Сколько ресурсов вид требует на снабжение каждый ход (любая комбинация). */
  supply: Partial<Stock>;
};

/**
 * Виды сущностей на карте. Все они — «юниты» в широком смысле (принадлежат игроку, стоят в локации,
 * видят вокруг себя, участвуют в споре за локацию); различаются свойствами из этой таблицы.
 */
export const UNIT_KINDS = {
  unit: { vision: 2, mobile: true, harvests: false, building: false, terrain: 'land', supply: { food: 1, iron: 1 } },
  colony: { vision: 1, mobile: false, harvests: true, building: true, terrain: 'land', supply: { food: 1 } },
} as const satisfies Record<string, UnitKindInfo>;
export type UnitKind = keyof typeof UNIT_KINDS;

/** Фазы хода, в которых игроки действуют; четвёртая фаза — бой — проходит автоматически в конце хода. */
export const PHASES = ['maneuver', 'supply', 'harvest'] as const;
export type Phase = (typeof PHASES)[number];

export type Hex = Coord & {
  type: HexType;
  /** Хоть один юнит побывал здесь к последнему раскрытию манёвра: ресурс суши известен всем, кто её видит. */
  discovered: boolean;
};

export type Unit = Coord & {
  id: string;
  ownerId: string;
  kind: UnitKind;
  /** Уже действовал в этой фазе (двигался на манёвре, добывал на фазе добычи). */
  tired: boolean;
  /** Где юнита видят противники: обновляется только при раскрытии манёвра. */
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
 * Ход делится на фазы; каждая фаза заканчивается, когда готовы все игроки.
 */
export type GameState = {
  playerOrder: string[];
  /** Номер цвета игрока (индекс в палитре клиента). Не меняется, даже если кто-то вышел. */
  slots: Record<string, number>;
  turn: number;
  phase: Phase;
  /** Игроки, завершившие текущую фазу (или те, кому в ней нечего делать). */
  ready: string[];
  /** Запасы ресурсов по игрокам, актуальные. */
  stock: Record<string, Stock>;
  /** Запасы, известные всем: обновляются после каждой фазы. */
  shownStock: Record<string, Stock>;
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
export type GameView = Omit<GameState, 'hexes' | 'units' | 'stock' | 'shownStock'> & {
  hexes: HexView[];
  /** Ваш запас (актуальный). */
  stock: Stock;
  /** Запасы остальных игроков на конец прошлой фазы. */
  rivals: Record<string, Stock>;
  /** Сколько ресурсов нужно на снабжение ваших юнитов и построек прямо сейчас. */
  supply: Stock;
};

export type GameAction =
  | { type: 'move'; unitId: string; to: Coord }
  | { type: 'harvest'; colonyId: string }
  /** Нехватка ресурсов на снабжении: кто остаётся без него (и удаляется). */
  | { type: 'drop_unsupplied'; unitIds: string[] }
  /** Завершить свою часть текущей фазы (манёвр или добычу). */
  | { type: 'end_phase' };

/** Что произошло в результате действия: сообщается только тому, кто его совершил. */
export type GameEvent = { type: 'harvested'; unitId: string; resource: Resource; amount: number };

export type ReportData =
  | { type: 'battle'; hex: Coord; rolls: Record<string, number[]>; winnerId: string | null; destroyed: number }
  | { type: 'siege'; hex: Coord; attackerId: string; defenderId: string; rolls: number[]; destroyed: boolean }
  | { type: 'unsupplied'; playerId: string; units: number; buildings: number };

/** Сообщение для чата, видимое только тем, кому положено знать о событии. */
export type Report = { audience: string[]; data: ReportData };

export type Applied = { state: GameState; events: GameEvent[]; reports: Report[] };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Колонию «захватили»: в её локации стоят юниты (не постройки) другого игрока. */
export const isCaptured = (ownerId: string, here: readonly { ownerId: string; kind: UnitKind }[]): boolean =>
  here.some((unit) => unit.ownerId !== ownerId && !UNIT_KINDS[unit.kind].building);
