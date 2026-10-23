<script setup lang="ts">
import { computed } from 'vue';
import { useAction } from '../composables/useAction';
import { useRoomStore } from '../stores/room';
import HexBoard from './HexBoard.vue';

const store = useRoomStore();
const { error, run } = useAction();

const game = computed(() => store.room?.game);
const nameOf = (id?: string | null) => store.room?.members.find((m) => m.id === id)?.name;
</script>

<template>
  <section v-if="game" class="stack">
    <HexBoard :game="game" />

    <template v-if="game.winnerId">
      <h2>Игра окончена</h2>
      <p>Победитель: {{ nameOf(game.winnerId) ?? 'игрок, покинувший комнату' }}</p>
    </template>

    <template v-else>
      <h2>Ход {{ game.turn }}</h2>
      <p>{{ store.isMyTurn ? 'Ваш ход' : `Ходит ${nameOf(game.activePlayerId)}` }}</p>
      <button :disabled="!store.isMyTurn" @click="run(() => store.sendAction({ type: 'end_turn' }))">
        Завершить ход
      </button>
    </template>

    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>
