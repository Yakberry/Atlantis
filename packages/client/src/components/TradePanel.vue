<script setup lang="ts">
import { emptyStock, RESOURCES, type GameView, type Resource, type Stock } from '@atlantis/shared';
import { computed, ref, watch } from 'vue';
import { RESOURCE_COLORS, RESOURCE_LABELS } from '../board/palette';

type Offer = NonNullable<GameView['trade']> & { price: number };

const props = defineProps<{ trade: Offer; stock: Stock }>();
const emit = defineEmits<{ accept: [give: Stock, get: Resource]; decline: [] }>();

const give = ref<Stock>(emptyStock());
const get = ref<Resource | null>(null);

const given = computed(() => RESOURCES.reduce((sum, resource) => sum + give.value[resource], 0));
const valid = computed(() => given.value === props.trade.price && get.value !== null);

// Новое предложение — чистый выбор.
watch(
  () => props.trade.accepted.length,
  () => {
    give.value = emptyStock();
    get.value = null;
  },
);

const canAdd = (resource: Resource) => given.value < props.trade.price && give.value[resource] < props.stock[resource];
const add = (resource: Resource, delta: 1 | -1) => {
  if (delta > 0 ? canAdd(resource) : give.value[resource] > 0) give.value = { ...give.value, [resource]: give.value[resource] + delta };
};
const accept = () => get.value && emit('accept', give.value, get.value);
</script>

<template>
  <section class="panel trade" aria-label="Торговля с купцами">
    <header>
      <strong>Торговля с купцами</strong>
      <span class="muted">сделка {{ trade.accepted.length + 1 }} из {{ trade.offers }}</span>
    </header>

    <p>
      Купцы просят <strong class="price">{{ trade.price }}</strong> любых ваших ресурсов за 1 выбранный.
      Отказ завершает вашу торговлю в этом ходу.
    </p>
    <p v-if="trade.accepted.length" class="muted">Уже принято по ценам: {{ trade.accepted.join(', ') }}</p>

    <div class="trade-columns">
      <div>
        <span class="muted">Отдаёте: {{ given }} из {{ trade.price }}</span>
        <ul class="trade-list">
          <li v-for="resource in RESOURCES" :key="resource" :style="{ '--resource': RESOURCE_COLORS[resource] }">
            <span class="swatch" aria-hidden="true" />
            <span class="trade-name">{{ RESOURCE_LABELS[resource] }}</span>
            <span class="muted">(есть {{ stock[resource] }})</span>
            <button class="secondary step" type="button" :disabled="give[resource] === 0" :aria-label="`Меньше: ${RESOURCE_LABELS[resource]}`" @click="add(resource, -1)">−</button>
            <strong class="trade-count">{{ give[resource] }}</strong>
            <button class="secondary step" type="button" :disabled="!canAdd(resource)" :aria-label="`Больше: ${RESOURCE_LABELS[resource]}`" @click="add(resource, 1)">+</button>
          </li>
        </ul>
      </div>
      <div>
        <span class="muted">Получаете 1:</span>
        <ul class="trade-list">
          <li v-for="resource in RESOURCES" :key="resource" :style="{ '--resource': RESOURCE_COLORS[resource] }">
            <button type="button" :class="['secondary', 'pick', { active: get === resource }]" @click="get = resource">
              <span class="swatch" aria-hidden="true" />{{ RESOURCE_LABELS[resource] }}
            </button>
          </li>
        </ul>
      </div>
    </div>

    <div class="row">
      <button type="button" :disabled="!valid" @click="accept">Обменять</button>
      <button class="secondary" type="button" @click="emit('decline')">Отказаться и завершить торговлю</button>
    </div>
  </section>
</template>
