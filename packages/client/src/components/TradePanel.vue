<script setup lang="ts">
import { emptyStock, RESOURCES, type GameView, type Resource, type Stock } from '@atlantis/shared';
import { computed, ref, watch } from 'vue';
import { RESOURCE_COLORS, RESOURCE_LABELS } from '../board/palette';
import { spriteUrl } from '../board/sprites';

/** Вкладка «Торговля с купцами»: ставка, прошлые ставки, что отдать, что получить. */
const props = defineProps<{ trade: NonNullable<GameView['trade']>; stock: Stock }>();
const emit = defineEmits<{ accept: [give: Stock, get: Resource] }>();

const give = ref<Stock>(emptyStock());
const wanted = ref<Resource | ''>('');

const given = computed(() => RESOURCES.reduce((sum, resource) => sum + give.value[resource], 0));
const valid = computed(() => props.trade.price !== null && given.value === props.trade.price && wanted.value !== '');

// Новое предложение — чистый выбор.
watch(
  () => props.trade.accepted.length,
  () => {
    give.value = emptyStock();
    wanted.value = '';
  },
);

const icon = (resource: Resource) => spriteUrl(`resources/${resource}`);
const canAdd = (resource: Resource) =>
  props.trade.price !== null && given.value < props.trade.price && give.value[resource] < props.stock[resource];
const add = (resource: Resource, delta: 1 | -1) => {
  if (delta > 0 ? canAdd(resource) : give.value[resource] > 0) {
    give.value = { ...give.value, [resource]: give.value[resource] + delta };
  }
};
const accept = () => {
  if (wanted.value !== '') emit('accept', give.value, wanted.value);
};
</script>

<template>
  <section class="trade" aria-label="Торговля с купцами">
    <h2>Торговля с купцами</h2>

    <template v-if="trade.price !== null">
      <p>
        Ставка купцов: <strong class="price">{{ trade.price }}</strong> любых ваших ресурсов за 1 выбранный
        <span class="muted">(сделка {{ trade.accepted.length + 1 }} из {{ trade.offers }})</span>
      </p>
    </template>
    <p v-else class="muted">Для вас торговля с купцами в этом ходу закончена.</p>
    <p class="muted">
      {{ trade.accepted.length ? `Прошлые ставки в этом ходу: ${trade.accepted.join(', ')}` : 'Прошлых ставок в этом ходу ещё нет.' }}
    </p>

    <template v-if="trade.price !== null">
      <div>
        <span class="muted">Отдаёте: {{ given }} из {{ trade.price }}</span>
        <ul class="trade-list">
          <li v-for="resource in RESOURCES" :key="resource" :style="{ '--resource': RESOURCE_COLORS[resource] }">
            <span :class="['resource-icon', { plain: !icon(resource) }]" aria-hidden="true">
              <img v-if="icon(resource)" :src="icon(resource)" alt="" />
            </span>
            <span class="trade-name">{{ RESOURCE_LABELS[resource] }}</span>
            <span class="muted">({{ stock[resource] }})</span>
            <button class="secondary step" type="button" :disabled="give[resource] === 0" :aria-label="`Меньше: ${RESOURCE_LABELS[resource]}`" @click="add(resource, -1)">−</button>
            <strong class="trade-count">{{ give[resource] }}</strong>
            <button class="secondary step" type="button" :disabled="!canAdd(resource)" :aria-label="`Больше: ${RESOURCE_LABELS[resource]}`" @click="add(resource, 1)">+</button>
          </li>
        </ul>
      </div>

      <label class="field">
        Желаемый ресурс
        <select v-model="wanted">
          <option value="" disabled>— выберите ресурс —</option>
          <option v-for="resource in RESOURCES" :key="resource" :value="resource">{{ RESOURCE_LABELS[resource] }}</option>
        </select>
      </label>

      <button type="button" :disabled="!valid" @click="accept">Принять</button>
    </template>
  </section>
</template>
