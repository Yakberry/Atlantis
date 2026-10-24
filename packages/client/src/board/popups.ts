import type { Resource } from '@atlantis/shared';

/** Всплывающая цифра над сущностью («+2»). */
export type Popup = { id: number; unitId: string; resource: Resource; amount: number };

/** Должно быть чуть больше длительности анимации `.floater` в styles.css. */
export const POPUP_MS = 1300;
