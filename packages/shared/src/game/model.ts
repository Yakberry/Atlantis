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

/** Сколько единиц ресурса приносит одна добыча (случайно, включая границы). */
export const HARVEST_MIN = 1;
export const HARVEST_MAX = 3;
/** Кубик боя и цен на торговле. */
export const DIE_SIDES = 6;
/** Сколько предложений у купцов за ход (потолок числа сделок игрока). */
export const TRADE_OFFERS = 5;
/** Заглушка условия победы: когда счётчик ходов доходит до этого значения, игра заканчивается. */
export const WIN_TURN = 10;

export const RESOURCES = ['food', 'wood', 'marble', 'copper'] as const;
export type Resource = (typeof RESOURCES)[number];

/** Запас игрока: по числу единиц каждого ресурса. */
export type Stock = Record<Resource, number>;
export const emptyStock = (): Stock => ({ food: 0, wood: 0, marble: 0, copper: 0 });
/** Что получает каждый игрок на старте. */
export const START_STOCK: Readonly<Stock> = { food: 4, wood: 2, marble: 4, copper: 4 };

/** Поверхность локации: по суше ходят юниты, по морю будут ходить корабли. */
export type Terrain = 'land' | 'sea';
/** Тип локации: ресурс для суши или море. */
export type HexType = Resource | 'sea';
export const terrainOf = (type: HexType): Terrain => (type === 'sea' ? 'sea' : 'land');

type UnitKindInfo = {
  /** Дальность обзора в локациях. */
  vision: number;
  mobile: boolean;
  /** Повышенная скорость: ходит на этапе манёвра «Всадники». */
  fast: boolean;
  harvests: boolean;
  /** Колония (обычная или укреплённая): добывает, входит в «цепочки», не больше одной на локацию. */
  colony: boolean;
  /** Постройка: не бросает кубик в бою, не «захватывает» чужие колонии. */
  building: boolean;
  /** По какой поверхности вид может стоять и двигаться. */
  terrain: Terrain;
  /** Сколько ресурсов вид требует на снабжение каждый ход (любая комбинация). */
  supply: Partial<Stock>;
  /** Минимальный результат d6, которым осаждающий уничтожает постройку (для не-построек не используется). */
  siegeHit: number;
};

/**
 * Виды сущностей на карте. Все они — «юниты» в широком смысле (принадлежат игроку, стоят в локации,
 * видят вокруг себя, участвуют в споре за локацию); различаются свойствами из этой таблицы.
 */
export const UNIT_KINDS = {
  unit: {
    vision: 2, mobile: true, fast: false, harvests: false, colony: false, building: false, terrain: 'land',
    supply: { food: 1, copper: 1 }, siegeHit: 4,
  },
  rider: {
    vision: 2, mobile: true, fast: true, harvests: false, colony: false, building: false, terrain: 'land',
    supply: { food: 1, copper: 1 }, siegeHit: 4,
  },
  colony: {
    vision: 1, mobile: false, fast: false, harvests: true, colony: true, building: true, terrain: 'land',
    supply: { food: 1 }, siegeHit: 4,
  },
  fortified_colony: {
    vision: 1, mobile: false, fast: false, harvests: true, colony: true, building: true, terrain: 'land',
    supply: { food: 1 }, siegeHit: 5,
  },
} as const satisfies Record<string, UnitKindInfo>;
export type UnitKind = keyof typeof UNIT_KINDS;

/** Что у игрока на старте, помимо колонии: обычный юнит и всадник. */
export const STARTING_KINDS: readonly UnitKind[] = ['unit', 'rider'];


/** Что можно построить на фазе строительства и во сколько это обходится. */
export const BUILDING_TYPES = ['colony', 'fortified_colony', 'road'] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];
export const BUILDINGS: Record<BuildingType, { cost: Partial<Stock> }> = {
  colony: { cost: { wood: 1, marble: 1 } },
  fortified_colony: { cost: { wood: 1, marble: 3 } },
  road: { cost: { marble: 1 } },
};

/** Фазы хода, в которых игроки действуют. Между добычей и торговлей автоматически проходит бой. */
export const PHASES = ['maneuver', 'supply', 'build', 'harvest', 'trade'] as const;
export type Phase = (typeof PHASES)[number];

/**
 * Этапы манёвра. После каждого сервер синхронизирует ход: показывает перемещения всем и разбирает столкновения.
 * - `riders`: ходят только юниты с повышенной скоростью;
 * - `roads`: любой юнит может сделать шаг, но только по дороге;
 * - `march`: любой юнит может сделать шаг как обычно.
 * На каждом этапе юнит делает не больше одного шага; этап пропускается, если ходить некому.
 */
export const MANEUVER_STAGES = ['riders', 'roads', 'march'] as const;
export type ManeuverStage = (typeof MANEUVER_STAGES)[number];


export type Hex = Coord & {
  type: HexType;
  /** Название локации (у суши); у моря его нет. */
  name: string | null;
  /** Хоть один юнит побывал здесь к последнему раскрытию манёвра: ресурс суши известен всем, кто её видит. */
  discovered: boolean;
};

export type Unit = Coord & {
  id: string;
  ownerId: string;
  kind: UnitKind;
  /** Вид, который видят противники: при улучшении колонии до конца фазы строительства остаётся прежним. */
  shownKind: UnitKind;
  /** Построено в эту фазу строительства: противники не видят до её конца. */
  fresh: boolean;
  /** Уже действовал на этом этапе манёвра или добыл на фазе добычи. */
  tired: boolean;
  /** Столкнулся с юнитами другого игрока: до конца хода двигаться не может. */
  blocked: boolean;
  /** Где юнита видят противники: обновляется только при раскрытии манёвра. */
  revealed: Coord;
};

/**
 * Торговля с купцами (банк игры). Цены общие для всех игроков и одинаковые по порядку: каждая — сколько любых своих
 * ресурсов купцы просят за 1 выбранный. Игрок принимает предложения по порядку, пока не откажется (но не больше
 * `TRADE_OFFERS` раз); `steps` — сколько предложений он уже принял.
 */
export type Market = { prices: number[]; steps: Record<string, number> };

/** Дорога между двумя соседними локациями. Общая: пользоваться ею может любой игрок. */
export type Road = {
  id: string;
  /** Кто построил. */
  ownerId: string;
  a: Coord;
  b: Coord;
  /** Построена в эту фазу строительства: противники не видят до её конца. */
  fresh: boolean;
};

export type UnitView = {
  id: string;
  ownerId: string;
  kind: UnitKind;
  /** Известно только владельцу юнита. */
  tired?: boolean;
  blocked?: boolean;
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
  /** Этап манёвра (имеет смысл в фазе манёвра). */
  stage: ManeuverStage;
  /** Игроки, завершившие текущую фазу или этап манёвра (или те, кому в ней нечего делать). */
  ready: string[];
  /** Запасы ресурсов по игрокам, актуальные. */
  stock: Record<string, Stock>;
  /** Запасы, известные всем: обновляются после каждой фазы. */
  shownStock: Record<string, Stock>;
  winnerId: string | null;
  hexes: Hex[];
  units: Unit[];
  roads: Road[];
  /** Предложения купцов этого хода (имеют смысл в фазе торговли). */
  market: Market;
  /** Счётчик для идентификаторов новых юнитов, построек и дорог. */
  nextId: number;
};

/** Что игрок знает о локации. Скрытая локация — только координаты. */
export type HexView =
  | (Coord & { visible: false })
  | (Coord & {
      visible: true;
      /** Название видно у всякой видимой суши; у моря его нет. */
      name: string | null;
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
export type GameView = Omit<GameState, 'hexes' | 'units' | 'stock' | 'shownStock' | 'roads' | 'market' | 'nextId'> & {
  hexes: HexView[];
  /** Ваш запас (актуальный). */
  stock: Stock;
  /** Запасы остальных игроков на конец прошлой фазы. */
  rivals: Record<string, Stock>;
  /** Сколько ресурсов нужно на снабжение ваших юнитов и построек прямо сейчас. */
  supply: Stock;
  /** Дороги, у которых виден хотя бы один конец (общие для всех игроков). */
  roads: Road[];
  /** Ваши цепочки колоний (идентификаторы колоний, соединённых дорогами). */
  chains: string[][];
  /** Локации, где вы можете строить на этой фазе строительства (иначе пусто). */
  sites: Coord[];
  /**
   * Торговля с купцами на фазе торговли (иначе `null`): уже принятые вами цены и текущее предложение
   * (`null`, если торговля для вас закончена). Будущие цены скрыты.
   */
  trade: { accepted: number[]; price: number | null; offers: number } | null;
};

export type GameAction =
  | { type: 'move'; unitId: string; to: Coord }
  | { type: 'harvest'; colonyId: string }
  /** Нехватка ресурсов на снабжении: кто остаётся без него (и удаляется). */
  | { type: 'drop_unsupplied'; unitIds: string[] }
  /** Строительство в локации `at`; для дороги `to` — соседняя локация, к которой она ведёт. */
  | { type: 'build'; building: BuildingType; at: Coord; to?: Coord }
  /** Принять текущее предложение купцов: отдать ресурсы `give` (в сумме ровно по цене) и получить 1 ресурс `get`. */
  | { type: 'trade'; give: Stock; get: Resource }
  /** Завершить свою часть текущей фазы (этап манёвра, строительство, добычу); на торговле — отказаться от цены. */
  | { type: 'end_phase' };

/** Что произошло в результате действия: сообщается только тому, кто его совершил. */
export type GameEvent = { type: 'harvested'; unitId: string; resource: Resource; amount: number };

export type ReportData =
  | { type: 'battle'; hex: Coord; rolls: Record<string, number[]>; winnerId: string | null; destroyed: number }
  | { type: 'siege'; hex: Coord; attackerId: string; defenderId: string; rolls: number[]; destroyed: boolean }
  | { type: 'unsupplied'; playerId: string; units: number; buildings: number }
  | { type: 'supply'; playerId: string; spent: Stock; left: Stock };

/** Сообщение для чата, видимое только тем, кому положено знать о событии. */
export type Report = { audience: string[]; data: ReportData };

export type Applied = { state: GameState; events: GameEvent[]; reports: Report[] };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Колонию «захватили»: в её локации стоят юниты (не постройки) другого игрока. */
export const isCaptured = (ownerId: string, here: readonly { ownerId: string; kind: UnitKind }[]): boolean =>
  here.some((unit) => unit.ownerId !== ownerId && !UNIT_KINDS[unit.kind].building);
