<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import ChatPanel from '../components/ChatPanel.vue';
import GameBoard from '../components/GameBoard.vue';
import LobbySettings from '../components/LobbySettings.vue';
import PlayerList from '../components/PlayerList.vue';
import ResourceBar from '../components/ResourceBar.vue';
import SettingsMenu from '../components/SettingsMenu.vue';
import { useAction } from '../composables/useAction';
import { useMobile } from '../composables/useMobile';
import { useRoomStore } from '../stores/room';
import { useSettingsStore } from '../stores/settings';
import { useUiStore } from '../stores/ui';

const props = defineProps<{ id: string }>();
const store = useRoomStore();
const settings = useSettingsStore();
const ui = useUiStore();
const router = useRouter();
const { error: joinError, run: tryJoin } = useAction();
const { error: actionError, run } = useAction();
const link = location.href;

// На телефоне чат — выдвижной лист поверх экрана (по умолчанию закрыт; счётчик непрочитанных), на компьютере — колонка справа.
const isMobile = useMobile();
const chatOpen = ref(false);
const unread = ref(0);
watch(
  () => store.messages.at(-1),
  (now, before) => {
    if (now?.author && now?.id && before?.id && !chatOpen.value) unread.value += 1;
  },
);
const toggleChat = () => {
  unread.value = 0;
  if (isMobile.value) {
    chatOpen.value = !chatOpen.value;
  } else {
    settings.chatHidden = !settings.chatHidden;
  }
};
const chatLabel = computed(() =>
  isMobile.value ? (chatOpen.value ? 'Закрыть чат' : 'Чат') : settings.chatHidden ? 'Показать чат' : 'Скрыть чат',
);

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
    <div v-else-if="store.room" :class="['room', { 'no-chat': settings.chatHidden || isMobile }]">
      <section class="panel stage">
        <!-- Шапка в одну строку: комната, кнопка выхода и простое отображение живут в меню настроек -->
        <header class="stage-header">
          <PlayerList :room="store.room" />
          <button v-if="store.room.game" class="secondary" type="button" @click="ui.contractsOpen = !ui.contractsOpen">
            Договоры<span v-if="store.room.game.contractAlerts > 0" class="chat-badge">{{ store.room.game.contractAlerts }}</span>
          </button>
          <button class="secondary" type="button" @click="toggleChat">
            {{ chatLabel }}<span v-if="unread > 0" class="chat-badge">{{ unread }}</span>
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

      <ChatPanel v-if="!isMobile && !settings.chatHidden" />
      <div v-if="isMobile && chatOpen" class="chat-sheet">
        <ChatPanel />
      </div>
    </div>
  </main>
</template>
