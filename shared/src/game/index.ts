/**
 * Правила игры — чистые функции без IO.
 * Сервер вызывает их как источник истины, клиент может использовать для подсказок и предпросчёта.
 * Чтобы сделать настоящую игру, меняем только этот модуль.
 */
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
/** Заглушка условия победы: когда счётчик ходов доходит до этого значения, игра заканчивается. */
export const WIN_TURN = 3;

export type GameState = {
  playerOrder: string[];
  turn: number;
  activePlayerId: string;
  winnerId: string | null;
};

export type GameAction = { type: 'end_turn' };

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function createGame(playerIds: string[]): GameState {
  const [first] = playerIds;
  if (!first) throw new Error('Нужен хотя бы один игрок');
  return { playerOrder: playerIds, turn: 1, activePlayerId: first, winnerId: null };
}

export function applyAction(state: GameState, playerId: string, action: GameAction): Result<GameState> {
  if (state.winnerId) return { ok: false, error: 'Игра уже окончена' };
  if (playerId !== state.activePlayerId) return { ok: false, error: 'Сейчас не ваш ход' };

  switch (action.type) {
    case 'end_turn':
      return { ok: true, value: checkVictory(nextTurn(state)) };
  }
}

/** Игрок вышел посреди партии: ход не должен зависнуть, а последний оставшийся побеждает. */
export function removePlayer(state: GameState, playerId: string): GameState {
  const index = state.playerOrder.indexOf(playerId);
  if (state.winnerId || index === -1) return state;

  const playerOrder = state.playerOrder.filter((id) => id !== playerId);
  const activePlayerId =
    state.activePlayerId === playerId
      ? (playerOrder[index % playerOrder.length] ?? state.activePlayerId)
      : state.activePlayerId;
  const winnerId = playerOrder.length === 1 ? (playerOrder[0] ?? null) : null;

  return { ...state, playerOrder, activePlayerId, winnerId };
}

function nextTurn(state: GameState): GameState {
  const index = state.playerOrder.indexOf(state.activePlayerId);
  const next = state.playerOrder[(index + 1) % state.playerOrder.length];
  if (!next) throw new Error('Пустой порядок ходов');
  return { ...state, turn: state.turn + 1, activePlayerId: next };
}

function checkVictory(state: GameState): GameState {
  if (state.turn < WIN_TURN) return state;
  return { ...state, winnerId: state.playerOrder[0] ?? null };
}
