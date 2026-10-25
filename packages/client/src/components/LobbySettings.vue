<script setup lang="ts">
import { MAP_STYLES, MAX_MAP_SIZE, MIN_MAP_SIZE, type MapStyle, type RoomSettings } from '@atlantis/shared';
import { useAction } from '../composables/useAction';
import { useRoomStore } from '../stores/room';

const STYLES: Record<MapStyle, { label: string; hint: string }> = {
  classic: { label: 'Исходный', hint: 'Материк, у которого могут вырастать тонкие отростки суши.' },
  solid: { label: 'Цельный массив', hint: 'Компактная суша без тонких отростков.' },
  islands: {
    label: 'Острова',
    hint: 'Около 30% суши — отдельные острова по 2–5 локаций. Игроки стартуют на материке.',
  },
};

const store = useRoomStore();
const { error, run } = useAction();

const change = (patch: Partial<RoomSettings>) => {
  if (store.room) run(() => store.configure({ ...store.room!.settings, ...patch }));
};

function onSizeChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const size = Math.min(MAX_MAP_SIZE, Math.max(MIN_MAP_SIZE, Math.round(Number(input.value)) || MIN_MAP_SIZE));
  input.value = String(size);
  change({ mapSize: size });
}

const onStyleChange = (event: Event) => change({ mapStyle: (event.target as HTMLSelectElement).value as MapStyle });
</script>

<template>
  <div v-if="store.room" class="stack">
    <template v-if="store.isHost">
      <label class="field">
        Размер суши, гексов ({{ MIN_MAP_SIZE }}–{{ MAX_MAP_SIZE }})
        <input
          type="number"
          :min="MIN_MAP_SIZE"
          :max="MAX_MAP_SIZE"
          :value="store.room.settings.mapSize"
          @change="onSizeChange"
        />
      </label>
      <label class="field">
        Тип карты
        <select :value="store.room.settings.mapStyle" @change="onStyleChange">
          <option v-for="style in MAP_STYLES" :key="style" :value="style">{{ STYLES[style].label }}</option>
        </select>
      </label>
      <p class="muted">{{ STYLES[store.room.settings.mapStyle].hint }}</p>
    </template>
    <p v-else class="muted">
      Карта: {{ STYLES[store.room.settings.mapStyle].label.toLowerCase() }}, {{ store.room.settings.mapSize }} гексов суши
    </p>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>
