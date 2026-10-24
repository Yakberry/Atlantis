<script setup lang="ts">
import { useSettingsStore } from '../stores/settings';

const settings = useSettingsStore();
</script>

<template>
  <label class="toggle">
    <input v-model="settings.simpleTiles" type="checkbox" />
    Простое отображение
  </label>
</template>
