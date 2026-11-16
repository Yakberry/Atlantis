import { defineStore } from 'pinia';
import { ref } from 'vue';

/** Состояние интерфейса, которое нужно нескольким компонентам: окно «Договоры» открывается из шапки, а рисуется поверх карты. */
export const useUiStore = defineStore('ui', () => {
  const contractsOpen = ref(false);
  const contractsTab = ref<'offers' | 'active' | 'history'>('offers');
  return { contractsOpen, contractsTab };
});
