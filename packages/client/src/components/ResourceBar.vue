<script setup lang="ts">
import { RESOURCES, type Resource, type Stock } from '@atlantis/shared';
import { RESOURCE_COLORS, RESOURCE_LABELS } from '../board/palette';
import { spriteUrl } from '../board/sprites';

/** `supply` — сколько нужно на снабжение ваших юнитов и построек: показывается в скобках после запаса. */
defineProps<{ stock: Stock; supply: Stock }>();

const icon = (resource: Resource) => spriteUrl(`resources/${resource}`);
</script>

<template>
  <ul class="resources" aria-label="Ваши ресурсы">
    <li
      v-for="resource in RESOURCES"
      :key="resource"
      :class="['resource', { short: stock[resource] < supply[resource] }]"
      :style="{ '--resource': RESOURCE_COLORS[resource] }"
    >
      <span :class="['resource-icon', { plain: !icon(resource) }]" aria-hidden="true">
        <img v-if="icon(resource)" :src="icon(resource)" alt="" />
      </span>
      <span class="resource-name">{{ RESOURCE_LABELS[resource] }}</span>
      <strong class="resource-amount">{{ stock[resource] }}</strong>
      <span class="need" title="Нужно на снабжение">({{ supply[resource] }})</span>
    </li>
  </ul>
</template>
