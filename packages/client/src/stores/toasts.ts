import type { Coord, Resource } from '@atlantis/shared';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ToastAction =
  | { type: 'contract'; contractId: string; tab: 'offers' | 'active' | 'history' }
  | { type: 'hex'; hex: Coord };
export type Toast = {
  id: number;
  /** Тосты с одним ключом объединяются. */
  key: string;
  title: string;
  /** Изменение ресурсов: «+3», «−1». */
  amounts: Partial<Record<Resource, number>>;
  note?: string;
  action?: ToastAction;
};
export type ToastInput = Omit<Toast, 'id'>;

const LIFETIME_MS = 6000;
const MAX_VISIBLE = 4;

/** Короткие уведомления о значимых событиях в углу карты. */
export const useToastStore = defineStore('toasts', () => {
  const toasts = ref<Toast[]>([]);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let serial = 0;

  const stop = (id: number) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
  };
  const arm = (id: number) => {
    stop(id);
    timers.set(id, setTimeout(() => dismiss(id), LIFETIME_MS));
  };
  function dismiss(id: number) {
    stop(id);
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  /** Умная подача: тост с тем же ключом сливается с живым (ресурсы складываются, таймер продлевается); показывается не больше MAX_VISIBLE. */
  function push(input: ToastInput) {
    const existing = toasts.value.find((toast) => toast.key === input.key);
    if (existing) {
      const amounts = { ...existing.amounts };
      for (const [resource, amount] of Object.entries(input.amounts) as [Resource, number][]) {
        amounts[resource] = (amounts[resource] ?? 0) + amount;
      }
      Object.assign(existing, { title: input.title, amounts, note: input.note ?? existing.note, action: input.action ?? existing.action });
      arm(existing.id);
      return;
    }
    const toast: Toast = { ...input, id: ++serial };
    toasts.value = [...toasts.value, toast].slice(-MAX_VISIBLE);
    for (const id of [...timers.keys()]) if (!toasts.value.some((t) => t.id === id)) stop(id);
    arm(toast.id);
  }

  return { toasts, push, dismiss, pause: stop, resume: arm };
});
