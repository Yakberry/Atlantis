<script setup lang="ts">
import { PHASES, type Phase } from '@atlantis/shared';

defineProps<{ phase: Phase; turn: number }>();

const LABELS: Record<Phase, string> = { maneuver: 'Манёвр', supply: 'Снабжение', build: 'Строительство', harvest: 'Добыча' };
</script>

<template>
  <ol class="phases" aria-label="Фазы хода">
    <li class="turn">Ход {{ turn }}</li>
    <li v-for="(item, index) in PHASES" :key="item" :class="{ current: item === phase }" :aria-current="item === phase ? 'step' : undefined">
      {{ index + 1 }}. {{ LABELS[item] }}
    </li>
    <li title="Проходит автоматически после добычи">{{ PHASES.length + 1 }}. Бой</li>
  </ol>
</template>
