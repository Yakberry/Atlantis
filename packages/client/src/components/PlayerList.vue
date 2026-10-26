<script setup lang="ts">
import type { RoomSnapshot } from '@atlantis/shared';
import { playerColor } from '../board/palette';
import StockChips from './StockChips.vue';

const props = defineProps<{ room: RoomSnapshot }>();

const colorOf = (playerId: string) => playerColor(props.room.game?.slots[playerId] ?? -1);
/** Запасы соперников известны на конец прошлой фазы. */
const rivalStock = (playerId: string) => props.room.game?.rivals[playerId];
const isReady = (playerId: string) => !props.room.game?.winnerId && props.room.game?.ready.includes(playerId);
</script>

<template>
  <ul class="players">
    <li v-for="member in room.members" :key="member.id">
      <span v-if="room.game" class="dot" :style="{ background: colorOf(member.id) }" />
      {{ member.name }}
      <span v-if="member.id === room.hostId" class="muted">хост</span>
      <StockChips v-if="rivalStock(member.id)" :stock="rivalStock(member.id)!" />
      <span v-if="isReady(member.id)" class="muted">готов</span>
    </li>
  </ul>
</template>
