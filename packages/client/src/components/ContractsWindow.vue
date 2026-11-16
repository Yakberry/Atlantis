<script setup lang="ts">
import { emptyStock, RESOURCES, type ContractPart, type ContractView, type Stock } from '@atlantis/shared';
import { computed, ref } from 'vue';
import { RESOURCE_LABELS } from '../board/palette';
import ResourcePicker from './ResourcePicker.vue';

export type ContractsTab = 'offers' | 'active' | 'history';

/** Окно «Договоры»: предложения, действующие договоры и история. Выдвигается слева поверх карты, как торговля. */
const props = defineProps<{
  open: boolean;
  tab: ContractsTab;
  contracts: ContractView[];
  me: string;
  names: Record<string, string>;
  stock: Stock;
  tradePhase: boolean;
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
const active = computed(() => props.contracts.filter((c) => c.status === 'active'));
const history = computed(() =>
  props.contracts.filter((c) => c.status !== 'offered' && c.status !== 'active').sort((a, b) => (b.endedTurn ?? 0) - (a.endedTurn ?? 0)),
);
const TABS = computed(() => [
  { id: 'offers' as const, label: 'Предложения', badge: incoming.value.length },
  { id: 'active' as const, label: 'Активные', badge: active.value.filter((c) => c.mandatory).length },
  { id: 'history' as const, label: 'Завершённые', badge: 0 },
]);

const name = (id: string) => props.names[id] ?? 'игрок';
const partner = (c: ContractView) => name(c.fromId === props.me ? c.toId : c.fromId);
const list = (stock: Stock) =>
  RESOURCES.filter((resource) => stock[resource] > 0)
    .map((resource) => `${RESOURCE_LABELS[resource].toLowerCase()} ${stock[resource]}`)
    .join(', ') || 'ничего';
const total = (stock: Stock) => RESOURCES.reduce((sum, resource) => sum + stock[resource], 0);
const span = (c: ContractView) => Math.max(c.terms.perTurn?.turns ?? 0, c.terms.debt?.turns ?? 0);

/** Условия глазами игрока: что он отдаёт и что получает. */
function lines(c: ContractView): string[] {
  const iAmFrom = c.fromId === props.me;
  const out = (part: ContractPart) => list(iAmFrom ? part.give : part.get);
  const inn = (part: ContractPart) => list(iAmFrom ? part.get : part.give);
  const { instant, perTurn, debt, penalty } = c.terms;
  const result: string[] = [];
  if (instant) result.push(`Мгновенно: вы отдаёте ${out(instant)}, получаете ${inn(instant)}.`);
  if (perTurn) result.push(`Каждый ход (${perTurn.turns}): вы платите ${out(perTurn)}, получаете ${inn(perTurn)}.`);
  if (debt) {
    result.push(
      iAmFrom
        ? `Долг: вы отдаёте ${list(debt.give)} сразу, вам вернут ${list(debt.get)} не позже ${debt.turns}-го хода.`
        : `Долг: вы получаете ${list(debt.give)} сразу и вернёте ${list(debt.get)} не позже ${debt.turns}-го хода.`,
    );
  }
  if (penalty > 0 && (perTurn || debt)) result.push(`Штраф за расторжение: ${penalty}.`);
  return result;
}

const STATUS: Record<string, string> = { completed: 'Выполнен', declined: 'Отклонён', expired: 'Не принят до конца хода', terminated: 'Расторгнут' };
const outcome = (c: ContractView) =>
  c.status === 'terminated' ? `Расторгнут: ${c.terminatedBy === props.me ? 'вами' : name(c.terminatedBy ?? '')}` : (STATUS[c.status] ?? c.status);

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

      <div class="trade-body trade">
        <p v-if="!tradePhase" class="muted">Принимать, выплачивать и расторгать договоры можно на фазе торговли.</p>

        <template v-if="tab === 'offers'">
          <p v-if="incoming.length === 0" class="muted">Предложений договоров в этом ходу нет.</p>
          <article v-for="c in incoming" :key="c.id" class="contract">
            <strong>Предлагает {{ name(c.fromId) }}</strong>
            <ul class="terms"><li v-for="line in lines(c)" :key="line">{{ line }}</li></ul>
            <div class="row">
              <button type="button" :disabled="!tradePhase" @click="emit('accept', c.id)">Принять</button>
              <button class="secondary" type="button" :disabled="!tradePhase" @click="emit('decline', c.id)">Отказаться</button>
            </div>
          </article>
          <template v-if="sent.length > 0">
            <h3 class="muted">Вы предложили</h3>
            <article v-for="c in sent" :key="c.id" class="contract">
              <strong>{{ name(c.toId) }}: ждём ответа</strong>
              <ul class="terms"><li v-for="line in lines(c)" :key="line">{{ line }}</li></ul>
              <small v-if="total(c.reserved) > 0" class="muted">Зарезервировано: {{ list(c.reserved) }}</small>
            </article>
          </template>
        </template>

        <template v-else-if="tab === 'active'">
          <p v-if="active.length === 0" class="muted">Действующих договоров нет.</p>
          <article v-for="c in active" :key="c.id" class="contract">
            <strong>{{ partner(c) }} <small class="muted">ход {{ c.k }} из {{ span(c) }}</small></strong>
            <ul class="terms"><li v-for="line in lines(c)" :key="line">{{ line }}</li></ul>
            <p v-if="c.mandatory" class="due">Платёж обязателен до конца хода: {{ list(c.owe) }}.</p>
            <p v-else-if="c.payable" class="muted">К оплате сейчас: {{ list(c.owe) }}.</p>
            <div class="row">
              <button v-if="c.payable" type="button" :disabled="!tradePhase || !c.canPay" :title="c.canPay ? '' : 'Не хватает ресурсов: остаётся расторгнуть договор'" @click="emit('pay', c.id)">
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
          </article>
        </template>

        <template v-else>
          <p v-if="history.length === 0" class="muted">История договоров пока пуста.</p>
          <article v-for="c in history" :key="c.id" class="contract">
            <strong>{{ partner(c) }} <small class="muted">· {{ outcome(c) }}</small></strong>
            <ul class="terms"><li v-for="line in lines(c)" :key="line">{{ line }}</li></ul>
          </article>
        </template>
      </div>
    </aside>
  </Transition>
</template>
