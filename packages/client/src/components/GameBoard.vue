<script setup lang="ts">
import type { Coord } from '@atlantis/shared';
import { computed } from 'vue';
import { useAction } from '../composables/useAction';
import { useRoomStore } from '../stores/room';
import { useSessionStore } from '../stores/session';
import HexBoard from './HexBoard.vue';

const store = useRoomStore();
const session = useSessionStore();
const { error, run } = useAction();

const game = computed(() => store.room?.game);
const nameOf = (id?: string | null) => store.room?.members.find((m) => m.id === id)?.name;
const waitingFor = computed(() =>
  (store.room?.members ?? [])
    .filter((member) => !game.value?.ready.includes(member.id))
    .map((member) => member.name)
    .join(', '),
);

const move = (unitId: string, to: Coord) => run(() => store.sendAction({ type: 'move', unitId, to }));
const endTurn = () => run(() => store.sendAction({ type: 'end_turn' }));
</script>

<template>
  <section v-if="game" class="stack">
    <HexBoard :game="game" :viewer-id="session.player?.id ?? ''" @move="move" />

    <template v-if="game.winnerId">
      <h2>Игра окончена</h2>
      <p>Победитель: {{ nameOf(game.winnerId) ?? 'игрок, покинувший комнату' }}</p>
    </template>

    <template v-else>
      <h2>Ход {{ game.turn }}</h2>
      <p v-if="store.isReady" class="muted">Ход завершён. Ждём: {{ waitingFor }}</p>
      <p v-else class="muted">Выберите юнита, затем соседнюю локацию. Когда закончите, завершите ход.</p>
      <button :disabled="store.isReady" @click="endTurn">Завершить ход</button>
    </template>

    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>
