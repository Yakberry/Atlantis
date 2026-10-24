import type { Resource } from '@atlantis/shared';

export const RESOURCE_COLORS: Record<Resource, string> = {
  food: '#3f7d4e',
  wood: '#7a5230',
  iron: '#5b7b99',
  gold: '#a8841c',
};

export const RESOURCE_LABELS: Record<Resource, string> = {
  food: 'Продовольствие',
  wood: 'Лес',
  iron: 'Железо',
  gold: 'Золото',
};

const PLAYER_COLORS = ['#ff3b4e', '#19d3ff', '#b06bff', '#ff9e2c'];
export const playerColor = (slot: number): string => PLAYER_COLORS[slot] ?? '#cccccc';

export const FOG_FILL = '#2b383d';
export const FOG_STROKE = '#36454b';
export const FREE_STROKE = 'rgba(255, 255, 255, 0.18)';
export const CONTESTED_STROKE = '#ffffff';

/** Локация видна, но её тип ещё никто не изведал. Светлее «тумана», чтобы их не путать. */
export const UNKNOWN_FILL = '#566b71';
export const UNKNOWN_LABEL = 'Неизведано';
