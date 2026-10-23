<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import ChatPanel from '../components/ChatPanel.vue';
import GameBoard from '../components/GameBoard.vue';
import PlayerList from '../components/PlayerList.vue';
import { useAction } from '../composables/useAction';
import { useRoomStore } from '../stores/room';

const props = defineProps<{ id: string }>();
const store = useRoomStore();
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
  <main class="page">
    <p v-if="joinError" class="error">{{ joinError }} <RouterLink to="/">В лобби</RouterLink></p>

    <div v-else-if="store.room" class="room">
      <section class="panel stack">
        <h1>Комната {{ store.room.id }}</h1>
        <PlayerList :room="store.room" />

        <template v-if="store.room.status === 'lobby'">
          <p class="muted">Ссылка для друзей: {{ link }}</p>
          <button v-if="store.isHost" :disabled="!store.canStart" @click="run(store.startGame)">
            Начать игру
          </button>
          <p v-else class="muted">Ждём, пока хост начнёт игру.</p>
        </template>
        <GameBoard v-else />

        <p v-if="actionError" class="error">{{ actionError }}</p>
        <button class="secondary" @click="run(leaveRoom)">Выйти из комнаты</button>
      </section>

      <ChatPanel />
    </div>
  </main>
</template>
