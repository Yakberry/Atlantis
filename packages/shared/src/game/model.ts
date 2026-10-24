import type { Coord } from './hex';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 4;
export const MIN_MAP_SIZE = 5;
export const MAX_MAP_SIZE = 25;
export const DEFAULT_MAP_SIZE = 7;
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
 */
export const UNIT_KINDS = {
  unit: { vision: 2, mobile: true, harvests: false },
  colony: { vision: 1, mobile: false, harvests: true },
} as const;
export type UnitKind = keyof typeof UNIT_KINDS;

export const RESOURCES = ['food', 'wood', 'iron', 'gold'] as const;
export type Resource = (typeof RESOURCES)[number];

/** Запас игрока: по числу единиц каждого ресурса. */
export type Stock = Record<Resource, number>;
export const emptyStock = (): Stock => ({ food: 0, wood: 0, iron: 0, gold: 0 });

export type Hex = Coord & {
  resource: Resource;
  /** Хоть один юнит побывал здесь к последнему раскрытию хода: тип локации известен всем, кто её видит. */
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
      /** `null` — локацию видно, но тип ещё не изведан ни одним юнитом. */
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
