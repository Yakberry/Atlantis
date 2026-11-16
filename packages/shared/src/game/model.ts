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
/** Кубик добычи: колонии при гильдии на таком же ресурсе и флота. */
export const GUILD_HARVEST_DIE = 6;
export const FLEET_HARVEST_DIE = 6;
/** Боевые классы юнитов для таблицы целевых чисел. */
export type CombatClass = 'phalanx' | 'archer' | 'cavalry' | 'scout' | 'catapult';

/**
 * Целевые числа атаки: сколько нужно выбросить на d6 (не меньше), чтобы атакующий класс поразил защищающийся.
 * В неуказанных случаях — `ATTACK_DEFAULT`.
 */
export const ATTACK_TARGETS: Record<CombatClass, Partial<Record<CombatClass, number>>> = {
  phalanx: { cavalry: 3, scout: 3, archer: 5 },
  archer: { phalanx: 3, scout: 3, cavalry: 5 },
  cavalry: { archer: 3, scout: 3, phalanx: 5 },
  scout: { phalanx: 5, archer: 5, cavalry: 5, catapult: 5 },
  catapult: { phalanx: 5, archer: 5, cavalry: 5 },
};
export const ATTACK_DEFAULT = 4;
/** «Стены» укреплённой колонии: проверка нападающего на допуск к бою. */
export const WALL_CHECK = 4;
/** «Башня» укреплённой колонии: целевое число её атаки всегда такое. */
export const TOWER_TARGET = 4;

/** Кубик боя и цен на торговле. */
export const DIE_SIDES = 6;
/** Сколько предложений у купцов за ход (потолок числа сделок игрока). */
export const TRADE_OFFERS = 5;
/** Заглушка условия победы: когда счётчик ходов доходит до этого значения, игра заканчивается. */
export const WIN_TURN = 20;

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
  /** Класс в таблице целевых чисел боя; у построек его нет. */
  combat: CombatClass | null;
  /** Сложность поджога постройки (нужно выбросить на d6 не меньше); у юнитов `null`. Особое здание поджигают, когда у владельца в локации нет ни колонии, ни войск (катапульта — автоматически). */
  burn: number | null;
  /** «Стены»: нападающие сначала проходят проверку (`WALL_CHECK`) или не участвуют в бою. Не работают против катапульты. */
  walls: boolean;
  /** «Башня»: при защитниках в локации сама атакует противников с целевым числом `TOWER_TARGET`. */
  tower: boolean;
};

/**
 * Виды сущностей на карте. Все они — «юниты» в широком смысле (принадлежат игроку, стоят в локации,
 * видят вокруг себя, участвуют в споре за локацию); различаются свойствами из этой таблицы.
 */
export const UNIT_KINDS = {
  unit: {
    vision: 2, mobile: true, fast: false, harvests: false, colony: false, building: false, terrain: 'land',
    supply: { food: 1, copper: 1 }, combat: 'phalanx', burn: null, walls: false, tower: false,
  },
  rider: {
    vision: 2, mobile: true, fast: true, harvests: false, colony: false, building: false, terrain: 'land',
    supply: { food: 1, copper: 1 }, combat: 'cavalry', burn: null, walls: false, tower: false,
  },
  // Заготовки: нужны таблице боя и правилам про катапульту; пока их нечем создать. Свойства — как у фаланги, ждут уточнений.
  archer: {
    vision: 2, mobile: true, fast: false, harvests: false, colony: false, building: false, terrain: 'land',
    supply: { food: 1, copper: 1 }, combat: 'archer', burn: null, walls: false, tower: false,
  },
  scout: {
    vision: 2, mobile: true, fast: false, harvests: false, colony: false, building: false, terrain: 'land',
    supply: { food: 1 }, combat: 'scout', burn: null, walls: false, tower: false,
  },
  catapult: {
    vision: 2, mobile: true, fast: false, harvests: false, colony: false, building: false, terrain: 'land',
    supply: { food: 1, copper: 1 }, combat: 'catapult', burn: null, walls: false, tower: false,
  },
  colony: {
    vision: 1, mobile: false, fast: false, harvests: true, colony: true, building: true, terrain: 'land',
    supply: { food: 1 }, combat: null, burn: 5, walls: false, tower: false,
  },
  fortified_colony: {
    vision: 1, mobile: false, fast: false, harvests: true, colony: true, building: true, terrain: 'land',
    supply: { food: 1 }, combat: null, burn: 6, walls: true, tower: true,
  },
  // Особые здания: стоят в одной локации с колонией (не больше одного на локацию).
  fleet: {
    vision: 1, mobile: false, fast: false, harvests: true, colony: false, building: true, terrain: 'land',
    supply: { wood: 1, copper: 1 }, combat: null, burn: 5, walls: false, tower: false,
  },
  guild: {
    vision: 1, mobile: false, fast: false, harvests: false, colony: false, building: true, terrain: 'land',
    supply: { wood: 1, copper: 1 }, combat: null, burn: 5, walls: false, tower: false,
  },
  market: {
    vision: 1, mobile: false, fast: false, harvests: false, colony: false, building: true, terrain: 'land',
    supply: { wood: 1, copper: 1 }, combat: null, burn: 5, walls: false, tower: false,
  },
  barracks: {
    vision: 1, mobile: false, fast: false, harvests: false, colony: false, building: true, terrain: 'land',
    supply: {}, combat: null, burn: 5, walls: false, tower: false,
  },
} as const satisfies Record<string, UnitKindInfo>;
export type UnitKind = keyof typeof UNIT_KINDS;

/** Что у игрока на старте, помимо колонии: обычный юнит и всадник. */
export const STARTING_KINDS: readonly UnitKind[] = ['unit', 'rider'];


/** Что можно построить на фазе строительства и во сколько это обходится. */
export const BUILDING_TYPES = ['colony', 'fortified_colony', 'road', 'fleet', 'guild', 'market', 'barracks', 'unit', 'archer', 'rider', 'catapult', 'scout'] as const;
export type BuildingType = (typeof BUILDING_TYPES)[number];
export const BUILDINGS: Record<BuildingType, { cost: Partial<Stock> }> = {
  colony: { cost: { wood: 1, marble: 1 } },
  fortified_colony: { cost: { wood: 1, marble: 3 } },
  road: { cost: { marble: 1 } },
  fleet: { cost: { wood: 3, copper: 2, marble: 1 } },
  guild: { cost: { marble: 3, copper: 2, wood: 1 } },
  market: { cost: { marble: 3, copper: 2, wood: 1 } },
  barracks: { cost: { copper: 2, wood: 2, marble: 2 } },
  unit: { cost: { food: 1, copper: 2 } },
  archer: { cost: { food: 1, wood: 2 } },
  rider: { cost: { food: 3, copper: 1 } },
  catapult: { cost: { wood: 2, copper: 2 } },
  scout: { cost: { food: 1, copper: 1 } },
};

/** Войска нанимаются на фазе строительства: фаланга, стрелки, кавалерия и катапульта — в локации с вашими казармами, разведчик — в любой вашей колонии. */
export const BARRACKS_UNITS = ['unit', 'archer', 'rider', 'catapult'] as const satisfies readonly UnitKind[];
export const HIRED_UNITS = [...BARRACKS_UNITS, 'scout'] as const satisfies readonly UnitKind[];

/**
 * Особые здания: строятся в локации, где уже стоит ваша колония; не больше одного на локацию.
 * Флот — только на побережье, производит d6 пищи; гильдия поднимает добычу колоний на таком же ресурсе с d3 до d6;
 * рыночная площадь снижает цены купцов с d6 до d3; казармы позволяют строить юнитов в этой локации.
 */
export const SPECIAL_BUILDINGS = ['fleet', 'guild', 'market', 'barracks'] as const satisfies readonly UnitKind[];
export type SpecialBuilding = (typeof SPECIAL_BUILDINGS)[number];
export const isSpecialBuilding = (kind: string): kind is SpecialBuilding => (SPECIAL_BUILDINGS as readonly string[]).includes(kind);

/** Фазы хода. Бой идёт сразу после манёвра и начинается, когда все игроки подтвердили (если спорных локаций нет, фаза пропускается). */
export const PHASES = ['maneuver', 'battle', 'supply', 'build', 'harvest', 'trade'] as const;
export type Phase = (typeof PHASES)[number];

/**
 * Этапы манёвра. После каждого сервер синхронизирует ход: показывает перемещения всем и разбирает столкновения.
 * - `fast`: быстрое перемещение — на один шаг двигаются быстрые юниты и юниты, идущие по дороге;
 * - `normal`: обычное перемещение — на один шаг любой юнит либо морской переход (флот); каждый юнит — только одним способом.
 * На каждом этапе юнит делает не больше одного шага; этап пропускается, если ходить некому.
 * Куда можно пойти, решает сервер (`GameView.moves`): смена видимости и разведка ресурсов приходят только с его ответом.
 */
export const MANEUVER_STAGES = ['fast', 'normal'] as const;
export type ManeuverStage = (typeof MANEUVER_STAGES)[number];


export type Hex = Coord & {
  type: HexType;
  /** Название локации (у суши); у моря его нет. */
  name: string | null;
  /** Номер моря у воды (океан поделён на отдельные моря); у суши `null`. */
  sea: number | null;
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
  /** Флот: к какому морю направлен. */
  sea?: number;
  /** Флот: клетка воды, в сторону которой он построен (рисуется «дорогой» к морю). */
  dock?: Coord;
  /** Где юнита видят противники: обновляется только при раскрытии манёвра. */
  revealed: Coord;
};

/**
 * Торговля с купцами (банк игры). Цены общие для всех игроков и одинаковые по порядку: каждая — сколько любых своих
 * ресурсов купцы просят за 1 выбранный. Игрок принимает предложения по порядку, пока не откажется (но не больше
 * `TRADE_OFFERS` раз); `steps` — сколько предложений он уже принял.
 */
export type Market = { prices: number[]; steps: Record<string, number> };

/** Сколько ходов может длиться договор «каждый ход» или «долг». */
export const MAX_CONTRACT_TURNS = 10;

export type ContractStatus = 'offered' | 'active' | 'completed' | 'declined' | 'expired' | 'terminated';
/** Часть договора: сколько отдаёт и сколько получает предложивший (`fromId`). */
export type ContractPart = { give: Stock; get: Stock };
/**
 * Условия договора между игроками; любая часть может отсутствовать.
 * - `instant`: мгновенный обмен при принятии;
 * - `perTurn`: `turns` ходов подряд (со следующего хода) каждая сторона платит свою часть кнопкой «Выплатить»;
 * - `debt`: предложивший отдаёт `give` сразу, а получатель возвращает `get` не позже последнего хода из `turns`;
 * - `penalty`: сколько ресурсов отдаёт сторона, расторгающая действующий договор (или все, если их меньше).
 */
export type ContractTerms = {
  instant?: ContractPart;
  perTurn?: ContractPart & { turns: number };
  debt?: ContractPart & { turns: number };
  penalty: number;
};
export type Contract = {
  id: string;
  fromId: string;
  toId: string;
  terms: ContractTerms;
  status: ContractStatus;
  offeredTurn: number;
  /** Ход принятия; платежи по договору идут со следующего хода. */
  startTurn: number | null;
  endedTurn: number | null;
  /** Зарезервированное под мгновенный обмен, пока предложение не принято и не отклонено. */
  reserved: Stock;
  /** Платёж «каждый ход» этого хода уже внесён стороной. */
  paid: { from: boolean; to: boolean };
  debtRepaid: boolean;
  terminatedBy: string | null;
};
/** Договор глазами участника, с готовыми расчётами сервера. */
export type ContractView = Contract & {
  /** Сколько ходов прошло с принятия. */
  k: number;
  /** Что вы должны заплатить сейчас. */
  owe: Stock;
  payable: boolean;
  canPay: boolean;
  /** Платёж обязателен до конца хода. */
  mandatory: boolean;
};

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
  /** Флот: клетка воды, к которой он обращён. */
  dock?: Coord;
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
  /** Договоры между игроками. */
  contracts: Contract[];
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
      /** Номер моря (у воды) — по нему рисуются границы морей. */
      sea: number | null;
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
export type GameView = Omit<GameState, 'hexes' | 'units' | 'stock' | 'shownStock' | 'roads' | 'market' | 'contracts' | 'nextId'> & {
  hexes: HexView[];
  /** Ваш запас (актуальный). */
  stock: Stock;
  /** Сколько всего ресурсов у остальных игроков на конец прошлой фазы (только сумма, без разбивки). */
  rivals: Record<string, number>;
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
  /** Куда может пойти каждый ваш юнит прямо сейчас (в манёвре); считает сервер, клиент только подсвечивает. */
  moves: Record<string, Coord[]>;
  /** Ваши договоры (чужие не видны). */
  contracts: ContractView[];
  /** Сколько дел по договорам ждёт вас: входящие предложения и обязательные платежи. */
  contractAlerts: number;
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
  /** Предложить договор игроку `to` (фаза торговли). */
  | { type: 'contract_offer'; to: string; terms: ContractTerms }
  | { type: 'contract_accept'; contractId: string }
  | { type: 'contract_decline'; contractId: string }
  /** Внести обязательные платежи по договору за этот ход. */
  | { type: 'contract_pay'; contractId: string }
  /** Расторгнуть договор, отдав штраф `give`. */
  | { type: 'contract_terminate'; contractId: string; give: Stock }
  /** Завершить свою часть текущей фазы (этап манёвра, строительство, добычу); на торговле — отказаться от цены. */
  | { type: 'end_phase' };

/** Что произошло в результате действия: сообщается только тому, кто его совершил. */
export type GameEvent = { type: 'harvested'; unitId: string; resource: Resource; amount: number };

export type ReportData =
  /** Лог боевых потерь: у каждой стороны — список потерянных юнитов; `stopped` — сколько юнитов не прошли стены. */
  | { type: 'battle'; hex: Coord; losses: Record<string, UnitKind[]>; stopped: Record<string, number>; tower: boolean }
  /** Попытка сжечь незащищённую колонию. */
  | { type: 'burn'; hex: Coord; ownerId: string; kind: UnitKind; rolls: number[]; difficulty: number; burned: boolean; automatic: boolean }
  | { type: 'unsupplied'; playerId: string; units: number; buildings: number }
  | { type: 'supply'; playerId: string; spent: Stock; left: Stock };

/** Сообщение для чата, видимое только тем, кому положено знать о событии. */
export type Report = { audience: string[]; data: ReportData };

export type Applied = { state: GameState; events: GameEvent[]; reports: Report[] };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Колонию «захватили»: в её локации стоят юниты (не постройки) другого игрока. */
export const isCaptured = (ownerId: string, here: readonly { ownerId: string; kind: UnitKind }[]): boolean =>
  here.some((unit) => unit.ownerId !== ownerId && !UNIT_KINDS[unit.kind].building);
