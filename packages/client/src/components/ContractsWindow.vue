<script setup lang="ts">
import { emptyStock, RESOURCES, type ContractPart, type ContractView, type Stock } from '@atlantis/shared';
import { computed, nextTick, ref, watch } from 'vue';
import AmountChips from './AmountChips.vue';
import ResourcePicker from './ResourcePicker.vue';

export type ContractsTab = 'offers' | 'active' | 'history';

/**
 * Окно «Договоры»: предложения, действующие договоры и история. Каждый договор — компактная строка с ресурсами и картинками;
 * принять/отказаться и выплатить/расторгнуть появляются при наведении (на сенсорных экранах показаны всегда).
 */
const props = defineProps<{
  open: boolean;
  tab: ContractsTab;
  contracts: ContractView[];
  me: string;
  names: Record<string, string>;
  stock: Stock;
  tradePhase: boolean;
  /** Договор, на который указало уведомление. */
  highlight?: string | null;
}>();
const emit = defineEmits<{
  'update:tab': [tab: ContractsTab];
  close: [];
  accept: [id: string];
  decline: [id: string];
  pay: [id: string];
  terminate: [id: string, give: Stock];
}>();

const incoming = computed(() => props.contracts.filter((c) => c.status === 'offered' && c.toId === props.me));
const sent = computed(() => props.contracts.filter((c) => c.status === 'offered' && c.fromId === props.me));
const offers = computed(() => [...incoming.value, ...sent.value]);
const active = computed(() => props.contracts.filter((c) => c.status === 'active'));
const history = computed(() =>
  props.contracts.filter((c) => c.status !== 'offered' && c.status !== 'active').sort((a, b) => (b.endedTurn ?? 0) - (a.endedTurn ?? 0)),
);
const rows = computed(() => (props.tab === 'offers' ? offers.value : props.tab === 'active' ? active.value : history.value));
const EMPTY = { offers: 'Предложений договоров нет.', active: 'Действующих договоров нет.', history: 'История договоров пока пуста.' };
const TABS = computed(() => [
  { id: 'offers' as const, label: 'Предложения', badge: incoming.value.length },
  { id: 'active' as const, label: 'Активные', badge: active.value.filter((c) => c.mandatory).length },
  { id: 'history' as const, label: 'Завершённые', badge: 0 },
]);

const name = (id: string) => props.names[id] ?? 'игрок';
const partner = (c: ContractView) => name(c.fromId === props.me ? c.toId : c.fromId);
const total = (stock: Stock) => RESOURCES.reduce((sum, resource) => sum + stock[resource], 0);
const span = (c: ContractView) => Math.max(c.terms.perTurn?.turns ?? 0, c.terms.debt?.turns ?? 0);

/** Условия глазами игрока: что он отдаёт (минус) и получает (плюс). */
function parts(c: ContractView) {
  const iAmFrom = c.fromId === props.me;
  const side = (part: ContractPart) => ({ out: iAmFrom ? part.give : part.get, inn: iAmFrom ? part.get : part.give });
  const { instant, perTurn, debt, penalty } = c.terms;
  const result: { label: string; out?: Stock; inn?: Stock }[] = [];
  if (instant) result.push({ label: 'мгновенно', ...side(instant) });
  if (perTurn) result.push({ label: `каждый ход (${perTurn.turns})`, ...side(perTurn) });
  if (debt) result.push({ label: `долг (${debt.turns})`, ...(debt.give === iAmFrom ? { out: debt.amount } : { inn: debt.amount }) });
  return { result, penalty: perTurn || debt ? penalty : 0 };
}

const OUTCOME: Record<string, string> = { completed: 'выполнен', declined: 'отклонён', expired: 'не принят', terminated: 'расторгнут' };
function status(c: ContractView): string {
  if (c.status === 'offered') return c.toId === props.me ? 'предложение' : 'ждёт ответа';
  if (c.status === 'active') return `действует, ход ${c.k}/${span(c)}`;
  if (c.status === 'terminated') return `расторгнут ${c.terminatedBy === props.me ? 'вами' : name(c.terminatedBy ?? '')}`;
  return OUTCOME[c.status] ?? c.status;
}

// ---------- расторжение: выбор штрафа ----------
const terminating = ref<string | null>(null);
const penaltyPick = ref<Stock>(emptyStock());
const requiredPenalty = (c: ContractView) => Math.min(c.terms.penalty, total(props.stock));
const startTerminate = (id: string) => {
  terminating.value = terminating.value === id ? null : id;
  penaltyPick.value = emptyStock();
};
const confirmTerminate = (c: ContractView) => {
  emit('terminate', c.id, penaltyPick.value);
  terminating.value = null;
};

watch(
  () => props.highlight,
  async (id) => {
    if (!id) return;
    await nextTick();
    document.getElementById(`contract-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  },
);
</script>

<template>
  <Transition name="slide">
    <aside v-if="open" class="contracts-window" aria-label="Договоры">
      <header class="trade-tabs" role="tablist">
        <button
          v-for="item in TABS"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="tab === item.id"
          :class="['tab', { active: tab === item.id }]"
          @click="emit('update:tab', item.id)"
        >
          {{ item.label }}<span v-if="item.badge > 0" class="chat-badge">{{ item.badge }}</span>
        </button>
        <button class="secondary close" type="button" aria-label="Закрыть окно договоров" @click="emit('close')">×</button>
      </header>

      <div class="trade-body">
        <p v-if="!tradePhase" class="muted">Принимать, выплачивать и расторгать договоры можно на фазе торговли.</p>
        <p v-if="rows.length === 0" class="muted">{{ EMPTY[tab] }}</p>

        <ul class="contract-list">
          <li
            v-for="c in rows"
            :key="c.id"
            :id="`contract-${c.id}`"
            :class="['contract-row', { highlighted: c.id === highlight, due: c.mandatory, open: terminating === c.id }]"
            tabindex="0"
          >
            <div class="line">
              <strong class="who">{{ partner(c) }}</strong>
              <span v-for="part in parts(c).result" :key="part.label" class="part">
                {{ part.label }}: <AmountChips :out="part.out" :inn="part.inn" />
              </span>
              <span v-if="parts(c).penalty > 0" class="part">штраф ({{ parts(c).penalty }})</span>
              <span class="status">
                {{ status(c) }}
                <template v-if="total(c.reserved) > 0"> · резерв <AmountChips :out="c.reserved" /></template>
                <template v-if="c.mandatory"> · <b class="due-mark">к оплате</b> <AmountChips :out="c.owe" /></template>
              </span>
            </div>

            <div v-if="c.status === 'offered' && c.toId === me" class="actions">
              <button type="button" :disabled="!tradePhase" @click="emit('accept', c.id)">Принять</button>
              <button class="secondary" type="button" :disabled="!tradePhase" @click="emit('decline', c.id)">Отказаться</button>
            </div>
            <div v-else-if="c.status === 'active'" class="actions">
              <button
                v-if="c.payable"
                type="button"
                :disabled="!tradePhase || !c.canPay"
                :title="c.canPay ? '' : 'Не хватает ресурсов: остаётся расторгнуть договор'"
                @click="emit('pay', c.id)"
              >
                Выплатить
              </button>
              <button class="secondary" type="button" :disabled="!tradePhase" @click="startTerminate(c.id)">Расторгнуть</button>
            </div>

            <div v-if="terminating === c.id" class="terminate">
              <p class="muted">
                Штраф: отдайте {{ requiredPenalty(c) }} {{ requiredPenalty(c) < c.terms.penalty ? '(все ваши ресурсы)' : 'ресурсов' }}.
              </p>
              <ResourcePicker v-model="penaltyPick" :limit="stock" :cap="requiredPenalty(c)" />
              <button type="button" :disabled="total(penaltyPick) !== requiredPenalty(c)" @click="confirmTerminate(c)">Расторгнуть и отдать штраф</button>
            </div>
          </li>
        </ul>
      </div>
    </aside>
  </Transition>
</template>
