<script setup lang="ts">
import { RESOURCES, type Stock } from '@atlantis/shared';
import { RESOURCE_COLORS, RESOURCE_LABELS } from '../board/palette';

defineProps<{ stock: Stock }>();
</script>

<template>
  <span class="chips">
    <span
      v-for="resource in RESOURCES"
      :key="resource"
      class="chip"
      :title="RESOURCE_LABELS[resource]"
      :style="{ '--resource': RESOURCE_COLORS[resource] }"
    >{{ stock[resource] }}</span>
  </span>
</template>
