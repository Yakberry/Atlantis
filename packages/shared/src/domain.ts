import type { GameSettings, GameView } from './game';

export type Player = { id: string; name: string };
export type Session = { token: string; player: Player };

export type RoomStatus = 'lobby' | 'playing' | 'finished';

export type RoomSettings = GameSettings;

export type RoomSnapshot = {
  id: string;
  hostId: string;
  status: RoomStatus;
  settings: RoomSettings;
  members: Player[];
  /** Состояние партии глазами получателя (с учётом тумана войны). */
  game: GameView | null;
};

export type ChatMessage = {
  id: string;
  author: Player;
  text: string;
  sentAt: string;
  /** Служебное сообщение (выход игрока и т.п.), а не реплика игрока. */
  system: boolean;
};
