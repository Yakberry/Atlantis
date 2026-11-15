<script setup lang="ts">
import GraphicsToggle from './GraphicsToggle.vue';

defineProps<{ roomId: string; link: string }>();
const emit = defineEmits<{ leave: [] }>();
</script>

<template>
  <details class="settings-menu">
    <summary aria-label="Настройки">⚙ Настройки</summary>
    <div class="menu-panel">
      <p>Комната <strong>{{ roomId }}</strong></p>
      <p class="muted menu-link">{{ link }}</p>
      <GraphicsToggle />
      <button class="secondary" type="button" @click="emit('leave')">Выйти из комнаты</button>
    </div>
  </details>
</template>
