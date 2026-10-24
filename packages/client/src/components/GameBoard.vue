<script setup lang="ts">
import type { Coord, GameEvent } from '@atlantis/shared';
import { computed, ref } from 'vue';
import { POPUP_MS, type Popup } from '../board/popups';
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

const popups = ref<Popup[]>([]);
let popupSerial = 0;

function showPopups(events: GameEvent[]) {
  for (const event of events) {
    const popup: Popup = { id: ++popupSerial, ...event };
    popups.value.push(popup);
    setTimeout(() => (popups.value = popups.value.filter((p) => p.id !== popup.id)), POPUP_MS);
  }
}

const move = (unitId: string, to: Coord) => run(() => store.sendAction({ type: 'move', unitId, to }));
const harvest = (colonyId: string) =>
  run(async () => showPopups(await store.sendAction({ type: 'harvest', colonyId })));
const endTurn = () => run(() => store.sendAction({ type: 'end_turn' }));
</script>

<template>
  <section v-if="game" class="game">
    <HexBoard
      :game="game"
      :viewer-id="session.player?.id ?? ''"
      :popups="popups"
      @move="move"
      @harvest="harvest"
    />

    <div class="turnbar">
      <template v-if="game.winnerId">
        <strong>Игра окончена</strong>
        <span class="hint">Победитель: {{ nameOf(game.winnerId) ?? 'игрок, покинувший комнату' }}</span>
      </template>

      <template v-else>
        <strong>Ход {{ game.turn }}</strong>
        <span class="hint muted">
          {{
            store.isReady
              ? `Ход завершён. Ждём: ${waitingFor}`
              : 'Юнит: выберите его и соседнюю локацию. Колония: нажмите, чтобы добыть ресурс.'
          }}
        </span>
        <button :disabled="store.isReady" @click="endTurn">Завершить ход</button>
      </template>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>
