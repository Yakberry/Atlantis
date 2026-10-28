import type { Resource } from '@atlantis/shared';

export const RESOURCE_COLORS: Record<Resource, string> = {
  food: '#C59137',
  wood: '#4F9153',
  marble: '#d9dee6',
  copper: '#894927',
};

export { RESOURCE_LABELS } from '@atlantis/shared';

const PLAYER_COLORS = ['#ff3b4e', '#19d3ff', '#b06bff', '#ff9e2c'];
export const playerColor = (slot: number): string => PLAYER_COLORS[slot] ?? '#cccccc';

export const FOG_FILL = '#2b383d';
export const FOG_STROKE = '#36454b';
export const FREE_STROKE = 'rgba(255, 255, 255, 0.18)';
/** Не белый: мрамор светлый, и белая граница на нём бы терялась. */
export const CONTESTED_STROKE = '#ffd84d';

export const SEA_FILL = '#1f6fa3';

/** Локация видна, но её тип ещё никто не изведал. Светлее «тумана», чтобы их не путать. */
export const UNKNOWN_FILL = '#566b71';
export const UNKNOWN_LABEL = ' ';
