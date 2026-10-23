<script setup lang="ts">
import type { RoomSnapshot } from '@atlantis/shared';
import { playerColor } from '../board/palette';

const props = defineProps<{ room: RoomSnapshot }>();

const colorOf = (playerId: string) => playerColor(props.room.game?.slots[playerId] ?? -1);
</script>

<template>
  <ul class="players">
    <li v-for="member in room.members" :key="member.id" :class="{ active: member.id === room.game?.activePlayerId }">
      <span v-if="room.game" class="dot" :style="{ background: colorOf(member.id) }" />
      {{ member.name }}
      <span v-if="member.id === room.hostId" class="muted">хост</span>
    </li>
  </ul>
</template>
