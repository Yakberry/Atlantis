import { createBoard } from './hex';
import {
  BOARD_RADIUS,
  RESOURCES,
  WIN_TURN,
  type GameAction,
  type GameState,
  type Result,
} from './model';
import { pick, shuffle, type Rng } from './random';

export function createGame(playerIds: string[], rng: Rng = Math.random): GameState {
  const [first] = playerIds;
  if (!first) throw new Error('Нужен хотя бы один игрок');

  const hexes = createBoard(BOARD_RADIUS).map((cell) => ({ ...cell, resource: pick(RESOURCES, rng) }));

  // Стартовые локации случайные и разные: никто не начинает на чужой клетке.
  const spawns = shuffle(hexes, rng);
  const units = playerIds.map((ownerId, i) => {
    const spawn = spawns[i];
    if (!spawn) throw new Error('Игроков больше, чем локаций');
    return { id: `unit-${i + 1}`, ownerId, q: spawn.q, r: spawn.r };
  });

  return {
    playerOrder: playerIds,
    slots: Object.fromEntries(playerIds.map((id, i) => [id, i])),
    turn: 1,
    activePlayerId: first,
    winnerId: null,
    hexes,
    units,
  };
}

export function applyAction(state: GameState, playerId: string, action: GameAction): Result<GameState> {
  if (state.winnerId) return { ok: false, error: 'Игра уже окончена' };
  if (playerId !== state.activePlayerId) return { ok: false, error: 'Сейчас не ваш ход' };

  switch (action.type) {
    case 'end_turn':
      return { ok: true, value: checkVictory(nextTurn(state)) };
  }
}

/** Игрок вышел посреди партии: его юниты исчезают, ход не зависает, последний оставшийся побеждает. */
export function removePlayer(state: GameState, playerId: string): GameState {
  const index = state.playerOrder.indexOf(playerId);
  if (state.winnerId || index === -1) return state;

  const playerOrder = state.playerOrder.filter((id) => id !== playerId);
  const activePlayerId =
    state.activePlayerId === playerId
      ? (playerOrder[index % playerOrder.length] ?? state.activePlayerId)
      : state.activePlayerId;
  const winnerId = playerOrder.length === 1 ? (playerOrder[0] ?? null) : null;
  const units = state.units.filter((unit) => unit.ownerId !== playerId);

  return { ...state, playerOrder, activePlayerId, winnerId, units };
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
