<script setup lang="ts">
import { MANEUVER_STAGES, PHASES, type ManeuverStage, type Phase } from '@atlantis/shared';

defineProps<{ phase: Phase; stage: ManeuverStage; turn: number }>();

const STAGE_LABELS: Record<ManeuverStage, string> = { fast: 'быстрое', normal: 'обычное и морское' };
const LABELS: Record<Phase, string> = {
  maneuver: 'Манёвр',
  battle: 'Бой',
  supply: 'Снабжение',
  build: 'Строительство',
  harvest: 'Добыча',
  trade: 'Торговля',
};
</script>

<template>
  <ol class="phases" aria-label="Фазы хода">
    <li class="turn">Ход {{ turn }}</li>
    <template v-for="(item, index) in PHASES" :key="item">
      <li :class="{ current: item === phase }" :aria-current="item === phase ? 'step' : undefined">
        {{ index + 1 }}. {{ LABELS[item] }}
        <template v-if="item === 'maneuver' && item === phase">
          · этап {{ MANEUVER_STAGES.indexOf(stage) + 1 }} из {{ MANEUVER_STAGES.length }}: {{ STAGE_LABELS[stage] }}
        </template>
      </li>
    </template>
  </ol>
</template>
