import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const STORAGE_KEY = 'atlantis:settings';

function load(): { simpleTiles: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { simpleTiles?: unknown };
    return { simpleTiles: saved.simpleTiles === true };
  } catch {
    return { simpleTiles: false };
  }
}

/** Личные настройки этого устройства: на других игроков не влияют. */
export const useSettingsStore = defineStore('settings', () => {
  /** Рисовать локации плоской заливкой вместо картинок. */
  const simpleTiles = ref(load().simpleTiles);

  watch(simpleTiles, (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ simpleTiles: value })));

  return { simpleTiles };
});
