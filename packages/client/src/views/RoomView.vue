<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import ChatPanel from '../components/ChatPanel.vue';
import GameBoard from '../components/GameBoard.vue';
import LobbySettings from '../components/LobbySettings.vue';
import PlayerList from '../components/PlayerList.vue';
import ResourceBar from '../components/ResourceBar.vue';
import SettingsMenu from '../components/SettingsMenu.vue';
import { useAction } from '../composables/useAction';
import { useRoomStore } from '../stores/room';
import { useSettingsStore } from '../stores/settings';

const props = defineProps<{ id: string }>();
const store = useRoomStore();
const settings = useSettingsStore();
const router = useRouter();
const { error: joinError, run: tryJoin } = useAction();
const { error: actionError, run } = useAction();
const link = location.href;

async function leaveRoom() {
  await store.leave();
  await router.push({ name: 'lobby' });
}

watch(() => props.id, (id) => tryJoin(() => store.join(id)), { immediate: true });
onBeforeUnmount(() => store.detach());
</script>

<template>
  <main class="page wide">
    <p v-if="joinError" class="error">{{ joinError }} <RouterLink to="/">В лобби</RouterLink></p>

    <div v-else-if="store.room" :class="['room', { 'no-chat': settings.chatHidden }]">
      <section class="panel stage">
        <!-- Шапка в одну строку: комната, кнопка выхода и простое отображение живут в меню настроек -->
        <header class="stage-header">
          <PlayerList :room="store.room" />
          <button class="secondary" type="button" @click="settings.chatHidden = !settings.chatHidden">
            {{ settings.chatHidden ? 'Показать чат' : 'Скрыть чат' }}
          </button>
          <SettingsMenu :room-id="store.room.id" :link="link" @leave="run(leaveRoom)" />
        </header>

        <ResourceBar v-if="store.room.game" :stock="store.room.game.stock" :supply="store.room.game.supply" />

        <div v-if="store.room.status === 'lobby'" class="stack">
          <p class="muted">Ссылка для друзей: {{ link }}</p>
          <LobbySettings />
          <button v-if="store.isHost" :disabled="!store.canStart" @click="run(store.startGame)">
            Начать игру
          </button>
          <p v-else class="muted">Ждём, пока хост начнёт игру.</p>
        </div>
        <GameBoard v-else />

        <p v-if="actionError" class="error">{{ actionError }}</p>
      </section>

      <ChatPanel v-if="!settings.chatHidden" />
    </div>
  </main>
</template>
