<script setup lang="ts">
import type { GameView, Resource, Stock } from '@atlantis/shared';
import TradePanel from './TradePanel.vue';

export type TradeTab = 'merchants' | 'players';

/**
 * Окно торговли: выдвигается с левого края поверх трети контейнера карты. Лежит внутри контейнера
 * (position: absolute), поэтому карту не двигает и нижние кнопки не заслоняет.
 */
defineProps<{ open: boolean; tab: TradeTab; trade: NonNullable<GameView['trade']>; stock: Stock }>();
const emit = defineEmits<{ 'update:tab': [tab: TradeTab]; close: []; accept: [give: Stock, get: Resource] }>();

const TABS: { id: TradeTab; label: string }[] = [
  { id: 'merchants', label: 'С купцами' },
  { id: 'players', label: 'С игроками' },
];
</script>

<template>
  <Transition name="slide">
    <aside v-if="open" class="trade-window" aria-label="Торговля">
      <header class="trade-tabs" role="tablist">
        <button
          v-for="item in TABS"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="tab === item.id"
          :class="['tab', { active: tab === item.id }]"
          @click="emit('update:tab', item.id)"
        >
          {{ item.label }}
        </button>
        <button class="secondary close" type="button" aria-label="Закрыть окно торговли" @click="emit('close')">×</button>
      </header>

      <div class="trade-body">
        <TradePanel v-if="tab === 'merchants'" :trade="trade" :stock="stock" @accept="(give, get) => emit('accept', give, get)" />
        <p v-else class="muted">Торговля между игроками появится здесь.</p>
      </div>
    </aside>
  </Transition>
</template>
