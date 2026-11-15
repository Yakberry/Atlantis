<script setup lang="ts">
import { RESOURCES, type BuildingType, type UnitKind, type Stock, type Resource } from '@atlantis/shared';
import { computed, ref } from 'vue';
import { RESOURCE_COLORS, RESOURCE_LABELS } from '../board/palette';
import { spriteUrl } from '../board/sprites';

export type BuildCard = { type: UnitKind; cost: Stock; disabled: boolean; reason: string };

const props = defineProps<{ open: boolean; title: string; cards: BuildCard[]; mode: 'road' | 'fleet' | null; }>();
const emit = defineEmits<{ pick: [type: UnitKind]; close: [] }>();

const HIRES: readonly UnitKind[] = ['unit', 'archer', 'rider', 'catapult', 'scout'];

const INFO: Record<UnitKind, { name: string; hint: string; glyph?: string }> = {
  colony: {
    name: 'Колония',
    hint: 'Добывает 1–3 ресурса своей локации. Снабжение: 1 еда. Не больше одной на локацию. Если в ней не осталось защитников, её жгут: чужому юниту нужно выбросить 5.',
    glyph: '⌂',
  },
  fortified_colony: {
    name: 'Укреплённая колония',
    hint: 'Строится поверх своей колонии и заменяет её. Поджечь её можно только броском 6. Стены: нападающие сначала проходят проверку 4 (не работают против катапульты). Башня: при защитниках сама атакует противников.',
    glyph: '▣',
  },
  road: {
    name: 'Дорога',
    hint: 'Проходит между двумя локациями. Юнит, прошедший по ней, в этот ход может сделать ещё один шаг. Соединяет колонии в цепочку.',
    glyph: '═',
  },
  // Новые здания и юниты: только спрайт, без запасных значков.
  fleet: { name: 'Флот', hint: 'Строится на побережье в сторону выбранного моря. Производит d6 пищи, соединяет в цепочку все ваши прибрежные колонии этого моря, показывает все омываемые им локации и позволяет юнитам переходить между ними. Снабжение: 1 лес и 1 медь.' },
  guild: {
    name: 'Гильдия',
    hint: 'Улучшает добычу всех ваших колоний, добывающих тот же ресурс, что эта локация: с d3 до d6. Снабжение: 1 лес и 1 медь.',
  },
  market: { name: 'Рыночная площадь', hint: 'Снижает цены купцов с d6 до d3. Снабжение: 1 лес и 1 медь.' },
  barracks: { name: 'Казармы', hint: 'Позволяют нанимать здесь фалангу, стрелков, кавалерию и катапульту. Снабжения не требуют.' },
  unit: { name: 'Фаланга', hint: 'Нанимается в казармах. Снабжение: 1 еда и 1 медь.' },
  archer: { name: 'Лучник', hint: 'Нанимаются в казармах. Снабжение: 1 еда и 1 медь.' },
  rider: { name: 'Кавалерия', hint: 'Нанимается в казармах. Ходит на этапе «кавалерия». Снабжение: 1 еда и 1 медь.' },
  catapult: { name: 'Катапульта', hint: 'Нанимается в казармах. Отключает стены, особые здания поджигает без броска. Снабжение: 1 еда и 1 медь.' },
  scout: { name: 'Разведчик', hint: 'Производит любая ваша колония. Поджигать колонии и здания не умеют. Снабжение: 1 еда и 1 медь.' },
};

const tab = ref<'buildings' | 'units'>('buildings');
const TABS = [
  { id: 'buildings', label: 'Здания' },
  { id: 'units', label: 'Юниты' },
] as const;
const shown = computed(() => props.cards.filter((card) => (tab.value === 'units') === HIRES.includes(card.type)));

const art = (type: UnitKind) => spriteUrl(`units/${type}`);
const resourceIcon = (resource: Resource) => spriteUrl(`resources/${resource}`);
const costOf = (cost: Stock) => RESOURCES.filter((resource) => cost[resource] > 0).map((resource) => ({ resource, amount: cost[resource] }));
</script>

<template>
  <Transition name="slide">
    <aside v-if="open" class="build-window" aria-label="Строительство">
      <header class="trade-tabs" role="tablist">
        <button
          v-for="item in TABS"
          :key="item.id"
          type="button"
          role="tab"
          :aria-selected="tab === item.id"
          :class="['tab', { active: tab === item.id }]"
          @click="tab = item.id"
        >
          {{ item.label }}
        </button>
        <button class="secondary close" type="button" aria-label="Закрыть окно строительства" @click="emit('close')">×</button>
      </header>
      <div class="trade-body">
        <ul class="cards">
          <li v-for="card in shown" :key="card.type">
            <button
              type="button"
              class="card"
              :disabled="card.disabled"
              :title="card.reason || INFO[card.type].hint"
              @click="emit('pick', card.type)"
            >
              <span class="card-art" aria-hidden="true">
                <img v-if="art(card.type)" :src="art(card.type)" alt="" />
                <template v-else>{{ INFO[card.type].glyph }}</template>
              </span>
              <strong>{{ INFO[card.type].name }}</strong>
              <small v-if="card.disabled" class="reason">{{ card.reason }}</small>
              <span class="card-cost">
                 <span
                     v-for="item in costOf(card.cost)"
                     :key="item.resource"
                     class="chip"
                     :title="RESOURCE_LABELS[item.resource]"
                 >
                    <img class="card-cost-art" v-if="resourceIcon(item.resource)" :src="resourceIcon(item.resource)" alt="" />
                    {{ item.amount }}
                 </span>
              </span>
            </button>
          </li>
        </ul>
      </div>
    </aside>
  </Transition>
</template>
