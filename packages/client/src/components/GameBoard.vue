<script setup lang="ts">
import { isValidDrop, RESOURCES, supplyNeeds, type ContractTerms, type Resource, type Stock, type BuildingType, type Coord, type GameEvent, type ManeuverStage, type Phase } from '@atlantis/shared';
import { computed, ref, watch } from 'vue';
import { RESOURCE_LABELS } from '../board/palette';
import { toastFromReport } from '../board/toasts';
import { POPUP_MS, type Popup } from '../board/popups';
import { useAction } from '../composables/useAction';
import { useMobile } from '../composables/useMobile';
import { useRoomStore } from '../stores/room';
import { useSessionStore } from '../stores/session';
import { useToastStore, type ToastAction } from '../stores/toasts';
import { useUiStore } from '../stores/ui';
import ToastHost from './ToastHost.vue';
import ContractsWindow from './ContractsWindow.vue';
import HexBoard from './HexBoard.vue';
import PhaseBar from './PhaseBar.vue';
import TradeWindow, { type TradeTab } from './TradeWindow.vue';

const store = useRoomStore();
const session = useSessionStore();
const ui = useUiStore();
const toasts = useToastStore();
const isMobile = useMobile();
const boardRef = ref<InstanceType<typeof HexBoard> | null>(null);
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
  const gained: Partial<Record<Resource, number>> = {};
  for (const event of events) if (event.type === 'harvested') gained[event.resource] = (gained[event.resource] ?? 0) + event.amount;
  if (Object.keys(gained).length > 0) toasts.push({ key: 'harvest', title: 'Добыча', amounts: gained });
}

// ---------- уведомления ----------
const hexName = (cell: Coord) => {
  const hex = game.value?.hexes.find((h) => h.q === cell.q && h.r === cell.r);
  return hex?.visible ? hex.name : null;
};
watch(
  () => store.reports.length,
  () => {
    for (const data of store.reports.splice(0)) {
      const toast = toastFromReport(data, { me: me.value, names: names.value, hexName });
      if (toast) toasts.push(toast);
    }
  },
);
watch(
  () => game.value?.turn,
  (now, before) => {
    if (now !== undefined && before !== undefined && now > before) toasts.push({ key: 'turn', title: `Ход ${now}`, amounts: {} });
  },
);
/** Клик по уведомлению: открыть и подсветить договор или подвести карту к локации. */
function onToastAction(action: ToastAction) {
  if (action.type === 'hex') boardRef.value?.centerOn(action.hex);
  else ui.openContract(action.contractId, action.tab);
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
  battle: 'Начинается бой. Спорные локации выделены жёлтой пунктирной границей. Бои пройдут, когда подтвердят все игроки.',
  supply: '',
  build: 'Выберите подсвеченную локацию и постройку или найм юнитов в меню внизу. Фаза завершится сама, если строить нечего.',
  trade: 'Торговля: откройте окно кнопкой «Торговля с купцами» и принимайте ставки по порядку (не больше пяти). «Закончить ход» завершает вашу торговлю.',
  harvest:
    'Нажмите на колонию, чтобы добыть ресурс: за фазу добывают с одной цепочки колоний, соединённых дорогами. «Завершить ход» добудет с наибольшей цепочки. Захваченные колонии не добывают.',
};
/** Манёвр идёт тремя этапами; после каждого сервер показывает всем перемещения. Этап заканчивается сам, когда ходить некому. */
const MANEUVER_HINTS: Record<ManeuverStage, string> = {
  fast: 'Этап 1, быстрое перемещение: на один шаг идут быстрые юниты (кавалерия) и юниты по дороге (дороги общие). Столкнувшиеся юниты до конца хода не ходят.',
  normal: 'Этап 2, обычное перемещение: любой юнит делает шаг в соседнюю локацию или переходит морем (флот) — одним способом.',
};
const END_LABELS: Record<Phase, string> = {
  maneuver: 'Завершить этап',
  battle: 'Начать бой',
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
  if (mustSettle.value) return 'Сначала выплатите или расторгните договоры, по которым платёж обязателен в этом ходу (кнопка «Договоры»).';
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
  if (isMobile.value) ui.contractsOpen = false;
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

// ---------- договоры между игроками ----------
const others = computed(() =>
  (store.room?.members ?? []).filter((member) => member.id !== me.value && game.value?.playerOrder.includes(member.id)),
);
const names = computed(() => Object.fromEntries((store.room?.members ?? []).map((member) => [member.id, member.name])));
/** Есть платёж по договору, без которого нельзя закончить ход. */
const mustSettle = computed(() => game.value?.contracts.some((c) => c.mandatory) ?? false);
const offerContract = (to: string, terms: ContractTerms) => run(() => store.sendAction({ type: 'contract_offer', to, terms }));
const contractAction = (type: 'contract_accept' | 'contract_decline' | 'contract_pay', contractId: string) =>
  run(() => store.sendAction({ type, contractId }));
const terminateContract = (contractId: string, give: Stock) =>
  run(() => store.sendAction({ type: 'contract_terminate', contractId, give }));
watch(
  () => ui.contractsOpen,
  (open) => {
    if (open && isMobile.value) tradeOpen.value = false; // на телефоне окна — шторки друг над другом; на компьютере открываются рядом
  },
);
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
        ref="boardRef"
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
      <div class="side-windows">
      <TradeWindow
        v-if="trade"
        v-model:tab="tradeTab"
        :open="tradeOpen"
        :trade="trade"
        :stock="game.stock"
        :others="others"
        @close="tradeOpen = false"
        @accept="tradeWith"
        @offer="offerContract"
      />
      <ContractsWindow
        v-model:tab="ui.contractsTab"
        :open="ui.contractsOpen"
        :contracts="game.contracts"
        :me="me"
        :names="names"
        :stock="game.stock"
        :trade-phase="game.phase === 'trade'"
        :highlight="ui.highlight"
        @close="ui.contractsOpen = false"
        @accept="contractAction('contract_accept', $event)"
        @decline="contractAction('contract_decline', $event)"
        @pay="contractAction('contract_pay', $event)"
        @terminate="terminateContract"
      />
      </div>
      <ToastHost @action="onToastAction" />
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
              Торговля ({{ trade.price ?? '—' }})
            </button>
          </template>
          <button :disabled="store.isReady || (game.phase === 'trade' && mustSettle)" @click="endPhase">{{ END_LABELS[game.phase] }}</button>
        </template>
      </template>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
  </section>
</template>
