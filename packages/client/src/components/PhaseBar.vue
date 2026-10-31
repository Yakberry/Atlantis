<script setup lang="ts">
import { MANEUVER_STAGES, PHASES, type ManeuverStage, type Phase } from '@atlantis/shared';

defineProps<{ phase: Phase; stage: ManeuverStage; turn: number }>();

const STAGE_LABELS: Record<ManeuverStage, string> = { riders: 'всадники', roads: 'дороги', march: 'марш' };
const LABELS: Record<Phase, string> = { maneuver: 'Манёвр', supply: 'Снабжение', build: 'Строительство', harvest: 'Добыча' };
</script>

<template>
  <ol class="phases" aria-label="Фазы хода">
    <li class="turn">Ход {{ turn }}</li>
    <li v-for="(item, index) in PHASES" :key="item" :class="{ current: item === phase }" :aria-current="item === phase ? 'step' : undefined">
      {{ index + 1 }}. {{ LABELS[item] }}
      <template v-if="item === 'maneuver' && item === phase">
        · этап {{ MANEUVER_STAGES.indexOf(stage) + 1 }} из {{ MANEUVER_STAGES.length }}: {{ STAGE_LABELS[stage] }}
      </template>
    </li>
    <li title="Проходит автоматически после добычи">{{ PHASES.length + 1 }}. Бой</li>
  </ol>
</template>
