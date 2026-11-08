<script setup lang="ts">
import { isValidDrop, RESOURCES, supplyNeeds, type Resource, type Stock, type BuildingType, type Coord, type GameEvent, type ManeuverStage, type Phase } from '@atlantis/shared';
import { computed, ref, watch } from 'vue';
import { RESOURCE_LABELS } from '../board/palette';
import { POPUP_MS, type Popup } from '../board/popups';
import { useAction } from '../composables/useAction';
import { useRoomStore } from '../stores/room';
import { useSessionStore } from '../stores/session';
import HexBoard from './HexBoard.vue';
import PhaseBar from './PhaseBar.vue';
import TradeWindow, { type TradeTab } from './TradeWindow.vue';

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
const HINTS: Record<Phase, string> = {
  maneuver: '',
  supply: '',
  build: 'Выберите подсвеченную локацию и постройку в меню внизу. Фаза завершится сама, если строить нечего.',
  trade: 'Торговля: откройте окно кнопкой «Торговля с купцами» и принимайте ставки по порядку (не больше пяти). «Закончить ход» завершает вашу торговлю.',
  harvest:
    'Нажмите на колонию, чтобы добыть ресурс: за фазу добывают с одной цепочки колоний, соединённых дорогами. «Завершить ход» добудет с наибольшей цепочки. Захваченные колонии не добывают.',
};
/** Манёвр идёт тремя этапами; после каждого сервер показывает всем перемещения. Этап заканчивается сам, когда ходить некому. */
const MANEUVER_HINTS: Record<ManeuverStage, string> = {
  riders: 'Этап 1: ходят только юниты с повышенной скоростью, по одному шагу. Столкнувшиеся юниты до конца хода не ходят.',
  roads: 'Этап 2: любой юнит может сделать один шаг, но только по дороге (дороги общие).',
  march: 'Этап 3: любой юнит может сделать один шаг.',
};
const END_LABELS: Record<Phase, string> = {
  maneuver: 'Завершить этап',
  supply: '',
  build: 'Завершить строительство',
  harvest: 'Завершить ход',
  trade: 'Закончить ход',
};

const hint = computed(() => {
  if (!game.value) return '';
  if (picking.value) {
    return 'Не хватает ресурсов на снабжение. Нажимайте на юнитов и постройки, которые останутся без него (они будут удалены), пока оставшимся не хватит.';
  }
  if (store.isReady) return `Ждём: ${waitingFor.value}`;
  return game.value.phase === 'maneuver' ? MANEUVER_HINTS[game.value.stage] : HINTS[game.value.phase];
});

const move = (unitId: string, to: Coord) => run(() => store.sendAction({ type: 'move', unitId, to }));
const harvest = (colonyId: string) =>
  run(async () => showPopups(await store.sendAction({ type: 'harvest', colonyId })));
const build = (building: BuildingType, at: Coord, to?: Coord) =>
  run(() => store.sendAction({ type: 'build', building, at, ...(to ? { to } : {}) }));
// ---------- торговля: окно выдвигается слева поверх карты ----------
const trade = computed(() => (game.value?.phase === 'trade' && !game.value.winnerId ? game.value.trade : null));
const tradeOpen = ref(false);
const tradeTab = ref<TradeTab>('merchants');
/** Кнопка открывает окно на своей вкладке; повторное нажатие на ту же вкладку закрывает его. */
const openTrade = (tab: TradeTab) => {
  tradeOpen.value = !(tradeOpen.value && tradeTab.value === tab);
  tradeTab.value = tab;
};
// Окно закрывается, когда торговать больше нельзя: фаза кончилась или игрок закончил ход.
watch(
  () => [game.value?.phase, store.isReady],
  () => {
    if (!trade.value || store.isReady) tradeOpen.value = false;
  },
);
const tradeWith = (give: Stock, get: Resource) => run(() => store.sendAction({ type: 'trade', give, get }));
const endPhase = () => run(async () => showPopups(await store.sendAction({ type: 'end_phase' })));
const confirmDrop = () =>
  run(async () => {
    await store.sendAction({ type: 'drop_unsupplied', unitIds: unsupplied.value });
    unsupplied.value = [];
  });
</script>

<template>
  <section v-if="game" class="game">
    <PhaseBar :phase="game.phase" :stage="game.stage" :turn="game.turn" />

    <div class="map-stage">
      <HexBoard
        :game="game"
        :viewer-id="me"
        :popups="popups"
        :picking="picking"
        :unsupplied="unsupplied"
        @move="move"
        @harvest="harvest"
        @build="build"
        @toggle-supply="toggleSupply"
      />
      <TradeWindow
        v-if="trade"
        v-model:tab="tradeTab"
        :open="tradeOpen"
        :trade="trade"
        :stock="game.stock"
        @close="tradeOpen = false"
        @accept="tradeWith"
      />
    </div>

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
        <template v-else-if="game.phase !== 'supply'">
          <template v-if="game.phase === 'trade' && trade">
            <button class="secondary" type="button" :disabled="store.isReady" @click="openTrade('merchants')">
              Торговля с купцами ({{ trade.price ?? '—' }})
            </button>
            <button class="secondary" type="button" :disabled="store.isReady" @click="openTrade('players')">
              Торговля с игроками
            </button>
          </template>
          <button :disabled="store.isReady" @click="endPhase">{{ END_LABELS[game.phase] }}</button>
        </template>
      </template>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>
