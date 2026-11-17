<script setup lang="ts">
import { RESOURCES, type Resource, type Stock } from '@atlantis/shared';
import { computed } from 'vue';
import { RESOURCE_COLORS, RESOURCE_LABELS } from '../board/palette';
import { spriteUrl } from '../board/sprites';

/** Ресурсы одной строкой: «−2 [иконка] +1 [иконка]». `out` — отдаёте (минус), `inn` — получаете (плюс). */
const props = defineProps<{ out?: Stock; inn?: Stock }>();

const chips = computed(() => {
  const list: { key: string; resource: Resource; amount: number; sign: '+' | '−' }[] = [];
  for (const resource of RESOURCES) {
    const amount = props.out?.[resource] ?? 0;
    if (amount > 0) list.push({ key: `o-${resource}`, resource, amount, sign: '−' });
  }
  for (const resource of RESOURCES) {
    const amount = props.inn?.[resource] ?? 0;
    if (amount > 0) list.push({ key: `i-${resource}`, resource, amount, sign: '+' });
  }
  return list;
});
const icon = (resource: Resource) => spriteUrl(`resources/${resource}`);
</script>

<template>
  <span class="amounts">
    <span
      v-for="chip in chips"
      :key="chip.key"
      :class="['amount', chip.sign === '+' ? 'plus' : 'minus']"
      :style="{ '--resource': RESOURCE_COLORS[chip.resource] }"
      :title="RESOURCE_LABELS[chip.resource]"
    >
      {{ chip.sign }}{{ chip.amount }}
      <span :class="['resource-icon', { plain: !icon(chip.resource) }]" aria-hidden="true">
        <img v-if="icon(chip.resource)" :src="icon(chip.resource)" alt="" />
      </span>
    </span>
    <span v-if="chips.length === 0" class="muted">—</span>
  </span>
</template>
