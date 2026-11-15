import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const STORAGE_KEY = 'atlantis:settings';

type Saved = { simpleTiles: boolean; chatHidden: boolean };

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Saved>;
    return { simpleTiles: saved.simpleTiles === true, chatHidden: saved.chatHidden === true };
  } catch {
    return { simpleTiles: false, chatHidden: false };
  }
}

/** Личные настройки этого устройства: на других игроков не влияют. */
export const useSettingsStore = defineStore('settings', () => {
  const initial = load();
  /** Рисовать локации плоской заливкой вместо картинок. */
  const simpleTiles = ref(initial.simpleTiles);
  /** Чат скрыт: карта занимает освободившееся место. */
  const chatHidden = ref(initial.chatHidden);

  watch([simpleTiles, chatHidden], () =>
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ simpleTiles: simpleTiles.value, chatHidden: chatHidden.value })),
  );

  return { simpleTiles, chatHidden };
});
