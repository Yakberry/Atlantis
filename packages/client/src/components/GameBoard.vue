<script setup lang="ts">
import { isValidDrop, RESOURCES, supplyNeeds, type Coord, type GameEvent } from '@atlantis/shared';
import { computed, ref, watch } from 'vue';
import { RESOURCE_LABELS } from '../board/palette';
import { POPUP_MS, type Popup } from '../board/popups';
import { useAction } from '../composables/useAction';
import { useRoomStore } from '../stores/room';
import { useSessionStore } from '../stores/session';
import HexBoard from './HexBoard.vue';
import PhaseBar from './PhaseBar.vue';

const store = useRoomStore();
const session = useSessionStore();
const { error, run } = useAction();

const game = computed(() => store.room?.game);
const me = computed(() => session.player?.id ?? '');
const nameOf = (id?: string | null) => store.room?.members.find((m) => m.id === id)?.name;
const waitingFor = computed(() =>
  (store.room?.members ?? [])
    .filter((member) => !game.value?.ready.includes(member.id))
    .map((member) => member.name)
    .join(', '),
);

// ---------- всплывающие цифры добычи ----------
const popups = ref<Popup[]>([]);
let popupSerial = 0;

function showPopups(events: GameEvent[]) {
  for (const event of events) {
    const popup: Popup = { id: ++popupSerial, ...event };
    popups.value.push(popup);
    setTimeout(() => (popups.value = popups.value.filter((p) => p.id !== popup.id)), POPUP_MS);
  }
}

// ---------- снабжение: выбор, кто останется без него ----------
// Тем, кому ресурсов хватило, снабжение оплачивается само и они сразу готовы: выбирает только тот, кто «не готов».
const picking = computed(() => game.value?.phase === 'supply' && !store.isReady && !game.value.winnerId);
const unsupplied = ref<string[]>([]);
watch(
  () => [game.value?.phase, game.value?.turn],
  () => (unsupplied.value = []),
);

const toggleSupply = (unitId: string) => {
  unsupplied.value = unsupplied.value.includes(unitId)
    ? unsupplied.value.filter((id) => id !== unitId)
    : [...unsupplied.value, unitId];
};

const ownEntities = computed(() =>
  (game.value?.hexes ?? []).flatMap((hex) => (hex.visible ? hex.units.filter((unit) => unit.ownerId === me.value) : [])),
);
/** Чего всё ещё не хватает оставшимся (после уже выбранных отказов). */
const shortages = computed(() => {
  if (!game.value) return [];
  const needs = supplyNeeds(ownEntities.value.filter((unit) => !unsupplied.value.includes(unit.id)));
  const stock = game.value.stock;
  return RESOURCES.filter((resource) => needs[resource] > stock[resource]).map((resource) => ({
    resource,
    need: needs[resource],
    have: stock[resource],
  }));
});
const dropIsValid = computed(
  () => !!game.value && isValidDrop(game.value.stock, ownEntities.value, unsupplied.value),
);

// ---------- действия ----------
const HINTS = {
  maneuver: 'Выберите юнита и соседнюю локацию суши. Манёвр завершится сам, когда ходить будет некому.',
  supply: '',
  harvest: 'Нажмите на колонию, чтобы добыть ресурс, или завершите ход: остальные колонии добудут сами. Захваченные не добывают.',
} as const;

const hint = computed(() => {
  if (!game.value) return '';
  if (picking.value) {
    return 'Не хватает ресурсов на снабжение. Нажимайте на юнитов и постройки, которые останутся без него (они будут удалены), пока оставшимся не хватит.';
  }
  return store.isReady ? `Ждём: ${waitingFor.value}` : HINTS[game.value.phase];
});

const move = (unitId: string, to: Coord) => run(() => store.sendAction({ type: 'move', unitId, to }));
const harvest = (colonyId: string) =>
  run(async () => showPopups(await store.sendAction({ type: 'harvest', colonyId })));
const endPhase = () => run(async () => showPopups(await store.sendAction({ type: 'end_phase' })));
const confirmDrop = () =>
  run(async () => {
    await store.sendAction({ type: 'drop_unsupplied', unitIds: unsupplied.value });
    unsupplied.value = [];
  });
</script>

<template>
  <section v-if="game" class="game">
    <PhaseBar :phase="game.phase" :turn="game.turn" />

    <HexBoard
      :game="game"
      :viewer-id="me"
      :popups="popups"
      :picking="picking"
      :unsupplied="unsupplied"
      @move="move"
      @harvest="harvest"
      @toggle-supply="toggleSupply"
    />

    <div class="turnbar">
      <template v-if="game.winnerId">
        <strong>Игра окончена</strong>
        <span class="hint">Победитель: {{ nameOf(game.winnerId) ?? 'игрок, покинувший комнату' }}</span>
      </template>

      <template v-else>
        <span class="hint muted">{{ hint }}</span>
        <template v-if="picking">
          <span v-for="item in shortages" :key="item.resource" class="error">
            {{ RESOURCE_LABELS[item.resource] }}: нужно {{ item.need }}, есть {{ item.have }}
          </span>
          <button :disabled="!dropIsValid" @click="confirmDrop">Подтвердить выбор</button>
        </template>
        <button v-else-if="game.phase !== 'supply'" :disabled="store.isReady" @click="endPhase">
          {{ game.phase === 'maneuver' ? 'Завершить манёвр' : 'Завершить ход' }}
        </button>
      </template>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>
