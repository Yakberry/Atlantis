<script setup lang="ts">
import { MAX_MAP_SIZE, MIN_MAP_SIZE } from '@atlantis/shared';
import { useAction } from '../composables/useAction';
import { useRoomStore } from '../stores/room';

const store = useRoomStore();
const { error, run } = useAction();

function onChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const size = Math.min(MAX_MAP_SIZE, Math.max(MIN_MAP_SIZE, Math.round(Number(input.value)) || MIN_MAP_SIZE));
  input.value = String(size);
  run(() => store.setMapSize(size));
}
</script>

<template>
  <div v-if="store.room" class="stack">
    <label v-if="store.isHost" class="field">
      Размер карты, гексов ({{ MIN_MAP_SIZE }}–{{ MAX_MAP_SIZE }})
      <input
        type="number"
        :min="MIN_MAP_SIZE"
        :max="MAX_MAP_SIZE"
        :value="store.room.settings.mapSize"
        @change="onChange"
      />
    </label>
    <p v-else class="muted">Размер карты: {{ store.room.settings.mapSize }} гексов</p>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>
