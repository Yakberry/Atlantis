import type { Applied, GameEvent, GameState, Report, Result } from './model';

export const ok = (state: GameState, events: GameEvent[] = [], reports: Report[] = []): Result<Applied> => ({
  ok: true,
  value: { state, events, reports },
});

export const fail = (error: string): Result<Applied> => ({ ok: false, error });
