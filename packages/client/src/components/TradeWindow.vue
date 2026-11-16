<script setup lang="ts">
import type { ContractTerms, GameView, Resource, Stock } from '@atlantis/shared';
import PlayerTradePanel from './PlayerTradePanel.vue';
import TradePanel from './TradePanel.vue';

export type TradeTab = 'merchants' | 'players';

/**
 * Окно торговли: выдвигается с левого края поверх трети контейнера карты. Лежит внутри контейнера
 * (position: absolute), поэтому карту не двигает и нижние кнопки не заслоняет.
 */
defineProps<{ open: boolean; tab: TradeTab; trade: NonNullable<GameView['trade']>; stock: Stock; others: { id: string; name: string }[] }>();
const emit = defineEmits<{ 'update:tab': [tab: TradeTab]; close: []; accept: [give: Stock, get: Resource]; offer: [to: string, terms: ContractTerms] }>();

const TABS: { id: TradeTab; label: string }[] = [
  { id: 'merchants', label: 'С купцами' },
  { id: 'players', label: 'С игроком' },
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
        <PlayerTradePanel v-else :others="others" :stock="stock" @offer="(to, terms) => emit('offer', to, terms)" />
      </div>
    </aside>
  </Transition>
</template>
