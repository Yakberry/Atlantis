<script setup lang="ts">
import { RESOURCES, type Resource, type Stock } from '@atlantis/shared';
import { computed } from 'vue';
import { RESOURCE_COLORS, RESOURCE_LABELS } from '../board/palette';
import { spriteUrl } from '../board/sprites';

/** Выбор количества каждого ресурса. `limit` — потолок по каждому ресурсу (например, запас), `cap` — потолок суммы. */
const props = defineProps<{ modelValue: Stock; limit?: Stock; cap?: number }>();
const emit = defineEmits<{ 'update:modelValue': [value: Stock] }>();

const total = computed(() => RESOURCES.reduce((sum, resource) => sum + props.modelValue[resource], 0));
const icon = (resource: Resource) => spriteUrl(`resources/${resource}`);
const canAdd = (resource: Resource) =>
  (props.limit === undefined || props.modelValue[resource] < props.limit[resource]) &&
  (props.cap === undefined || total.value < props.cap);
const change = (resource: Resource, delta: 1 | -1) => {
  if (delta > 0 ? canAdd(resource) : props.modelValue[resource] > 0) {
    emit('update:modelValue', { ...props.modelValue, [resource]: props.modelValue[resource] + delta });
  }
};
</script>

<template>
  <ul class="trade-list">
    <li v-for="resource in RESOURCES" :key="resource" :style="{ '--resource': RESOURCE_COLORS[resource] }">
      <span :class="['resource-icon', { plain: !icon(resource) }]" aria-hidden="true">
        <img v-if="icon(resource)" :src="icon(resource)" alt="" />
      </span>
      <span class="trade-name">{{ RESOURCE_LABELS[resource] }}</span>
      <span v-if="limit" class="muted">({{ limit[resource] }})</span>
      <button class="secondary step" type="button" :disabled="modelValue[resource] === 0" :aria-label="`Меньше: ${RESOURCE_LABELS[resource]}`" @click="change(resource, -1)">−</button>
      <strong class="trade-count">{{ modelValue[resource] }}</strong>
      <button class="secondary step" type="button" :disabled="!canAdd(resource)" :aria-label="`Больше: ${RESOURCE_LABELS[resource]}`" @click="change(resource, 1)">+</button>
    </li>
  </ul>
</template>
