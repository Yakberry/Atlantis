<script setup lang="ts">
import type { RoomSnapshot } from '@atlantis/shared';
import { playerColor } from '../board/palette';

const props = defineProps<{ room: RoomSnapshot }>();

const colorOf = (playerId: string) => playerColor(props.room.game?.slots[playerId] ?? -1);
const rivalTotal = (playerId: string) => props.room.game?.rivals[playerId];
const isReady = (playerId: string) => !props.room.game?.winnerId && props.room.game?.ready.includes(playerId);
</script>

<template>
  <ul class="players">
    <li v-for="member in room.members" :key="member.id">
      <span v-if="room.game" class="dot" :style="{ background: colorOf(member.id) }" />
      {{ member.name }}
      <span v-if="member.id === room.hostId" class="muted">хост</span>
      <span v-if="rivalTotal(member.id) !== undefined" class="total" title="Всего ресурсов (на конец прошлой фазы)">({{ rivalTotal(member.id) }})</span>
      <span v-if="isReady(member.id)" class="muted">готов</span>
    </li>
  </ul>
</template>
