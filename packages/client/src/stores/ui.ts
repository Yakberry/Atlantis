import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ContractsTab = 'offers' | 'active' | 'history';

/** Состояние интерфейса, которое нужно нескольким компонентам: окно «Договоры» открывается из шапки и тостов, а рисуется поверх карты. */
export const useUiStore = defineStore('ui', () => {
  const contractsOpen = ref(false);
  const contractsTab = ref<ContractsTab>('offers');
  /** Договор, подсвеченный после клика по уведомлению. */
  const highlight = ref<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function openContract(id: string, tab: ContractsTab) {
    contractsTab.value = tab;
    contractsOpen.value = true;
    highlight.value = id;
    clearTimeout(timer);
    timer = setTimeout(() => (highlight.value = null), 5000);
  }
  return { contractsOpen, contractsTab, highlight, openContract };
});
