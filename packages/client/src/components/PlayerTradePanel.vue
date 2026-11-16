<script setup lang="ts">
import { emptyStock, MAX_CONTRACT_TURNS, RESOURCES, type ContractTerms, type Stock } from '@atlantis/shared';
import { computed, ref } from 'vue';
import ResourcePicker from './ResourcePicker.vue';

/** Вкладка «Торговля с игроком»: составить договор и отправить его выбранному игроку. */
defineProps<{ others: { id: string; name: string }[]; stock: Stock }>();
const emit = defineEmits<{ offer: [to: string, terms: ContractTerms] }>();

type Part = { open: boolean; give: Stock; get: Stock; turns: number };
const blank = (): Part => ({ open: false, give: emptyStock(), get: emptyStock(), turns: 3 });
const SECTIONS = [
  { key: 'instant', title: 'Мгновенный обмен', hint: 'Обмен происходит сразу после принятия. Ваши ресурсы резервируются до ответа игрока.', turns: false },
  { key: 'perTurn', title: 'Каждый ход', hint: 'Со следующего хода каждая сторона сама платит свою часть кнопкой «Выплатить».', turns: true },
  { key: 'debt', title: 'Долг', hint: 'Вы отдаёте сразу, а вам возвращают не позже последнего хода срока.', turns: true },
] as const;
type Key = (typeof SECTIONS)[number]['key'];

const form = ref<Record<Key, Part>>({ instant: blank(), perTurn: blank(), debt: blank() });
const target = ref('');
const penalty = ref(0);

const count = (stock: Stock) => RESOURCES.reduce((sum, resource) => sum + stock[resource], 0);
const filled = (part: Part) => part.open && count(part.give) + count(part.get) > 0;
const lasting = computed(() => form.value.perTurn.open || form.value.debt.open);
const canSend = computed(() => target.value !== '' && SECTIONS.some((section) => filled(form.value[section.key])));
const turnsOf = (part: Part) => Math.min(MAX_CONTRACT_TURNS, Math.max(1, Math.floor(part.turns) || 1));

function send() {
  const { instant, perTurn, debt } = form.value;
  const terms: ContractTerms = { penalty: lasting.value ? Math.max(0, Math.floor(penalty.value) || 0) : 0 };
  if (filled(instant)) terms.instant = { give: instant.give, get: instant.get };
  if (filled(perTurn)) terms.perTurn = { give: perTurn.give, get: perTurn.get, turns: turnsOf(perTurn) };
  if (filled(debt)) terms.debt = { give: debt.give, get: debt.get, turns: turnsOf(debt) };
  emit('offer', target.value, terms);
  form.value = { instant: blank(), perTurn: blank(), debt: blank() };
  penalty.value = 0;
}
</script>

<template>
  <section class="trade" aria-label="Торговля с игроком">
    <h2>Договор с игроком</h2>
    <p v-if="others.length === 0" class="muted">В партии нет других игроков.</p>
    <template v-else>
      <label class="field">
        Игрок
        <select v-model="target">
          <option value="" disabled>— выберите игрока —</option>
          <option v-for="other in others" :key="other.id" :value="other.id">{{ other.name }}</option>
        </select>
      </label>

      <div v-for="section in SECTIONS" :key="section.key" class="contract-part">
        <button
          type="button"
          class="secondary part-head"
          :aria-expanded="form[section.key].open"
          @click="form[section.key].open = !form[section.key].open"
        >
          {{ form[section.key].open ? '▾' : '▸' }} {{ section.title }}
        </button>
        <div v-if="form[section.key].open" class="part-body">
          <p class="muted">{{ section.hint }}</p>
          <span class="muted">Вы отдаёте</span>
          <ResourcePicker v-model="form[section.key].give" :limit="section.key === 'perTurn' ? undefined : stock" />
          <span class="muted">Вы получаете</span>
          <ResourcePicker v-model="form[section.key].get" />
          <label v-if="section.turns" class="field">
            Ходов (1–{{ MAX_CONTRACT_TURNS }})
            <input v-model.number="form[section.key].turns" type="number" min="1" :max="MAX_CONTRACT_TURNS" />
          </label>
        </div>
      </div>

      <label v-if="lasting" class="field">
        Штраф за расторжение (ресурсов)
        <input v-model.number="penalty" type="number" min="0" />
      </label>

      <button type="button" :disabled="!canSend" @click="send">Отправить договор</button>
    </template>
  </section>
</template>
