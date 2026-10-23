import type { Coord } from './hex';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
/** Радиус карты: 1 — центральная локация и шесть соседних. */
export const BOARD_RADIUS = 1;
/** Дальность обзора юнита: 1 — его локация и соседние. */
export const VISION_RANGE = 1;
/** Заглушка условия победы: когда счётчик ходов доходит до этого значения, игра заканчивается. */
export const WIN_TURN = 3;

export const RESOURCES = ['food', 'wood', 'iron', 'gold'] as const;
export type Resource = (typeof RESOURCES)[number];

export type Hex = Coord & { resource: Resource };
export type Unit = Coord & { id: string; ownerId: string };
export type UnitView = Pick<Unit, 'id' | 'ownerId'>;

/** Полное состояние партии. Живёт только на сервере (и в БД): клиенту уходит `GameView`. */
export type GameState = {
  playerOrder: string[];
  /** Номер цвета игрока (индекс в палитре клиента). Не меняется, даже если кто-то вышел. */
  slots: Record<string, number>;
  turn: number;
  activePlayerId: string;
  winnerId: string | null;
  hexes: Hex[];
  units: Unit[];
};

/** Что игрок знает о локации. Скрытая локация — только координаты. */
export type HexView =
  | (Coord & { visible: false })
  | (Coord & {
      visible: true;
      resource: Resource;
      /** Единственный игрок, чьи юниты в локации; `null`, если она пуста или спорная. */
      ownerId: string | null;
      contested: boolean;
      units: UnitView[];
    });

/** Состояние партии глазами одного игрока: без чужих тайн. */
export type GameView = Omit<GameState, 'hexes' | 'units'> & { hexes: HexView[] };

export type GameAction = { type: 'end_turn' };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
