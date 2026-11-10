<script setup lang="ts">
import { RESOURCES, type BuildingType, type Stock, type Resource } from '@atlantis/shared';
import { computed } from 'vue';
import { RESOURCE_COLORS, RESOURCE_LABELS } from '../board/palette';
import { spriteUrl } from '../board/sprites';

export type BuildCard = { type: BuildingType; cost: Stock; disabled: boolean; reason: string };

const props = defineProps<{ title: string; cards: BuildCard[]; roadMode: boolean }>();
const emit = defineEmits<{ pick: [type: BuildingType]; close: [] }>();

const HIRES: readonly BuildingType[] = ['unit', 'archer', 'rider', 'catapult', 'scout'];

const INFO: Record<BuildingType, { name: string; hint: string; glyph?: string }> = {
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
  fleet: { name: 'Флот', hint: 'Строится на побережье в локации с вашей колонией. Производит d6 пищи. Снабжение: 1 лес и 1 медь.' },
  guild: {
    name: 'Гильдия',
    hint: 'Улучшает добычу всех ваших колоний, добывающих тот же ресурс, что эта локация: с d3 до d6. Снабжение: 1 лес и 1 медь.',
  },
  market: { name: 'Рыночная площадь', hint: 'Снижает цены купцов с d6 до d3. Снабжение: 1 лес и 1 медь.' },
  barracks: { name: 'Казармы', hint: 'Позволяют нанимать здесь фалангу, стрелков, кавалерию и катапульту. Снабжения не требуют.' },
  unit: { name: 'Фаланга', hint: 'Нанимается в казармах. Снабжение: 1 еда и 1 медь.' },
  archer: { name: 'Стрелки', hint: 'Нанимаются в казармах. Снабжение: 1 еда и 1 медь.' },
  rider: { name: 'Кавалерия', hint: 'Нанимается в казармах. Ходит на этапе «кавалерия». Снабжение: 1 еда и 1 медь.' },
  catapult: { name: 'Катапульта', hint: 'Нанимается в казармах. Отключает стены, особые здания поджигает без броска. Снабжение: 1 еда и 1 медь.' },
  scout: { name: 'Разведчики', hint: 'Производит любая ваша колония. Поджигать колонии и здания не умеют. Снабжение: 1 еда и 1 медь.' },
};

const groups = computed(() => [
  { title: 'Постройки', cards: props.cards.filter((card) => !HIRES.includes(card.type)) },
  { title: 'Найм юнитов', cards: props.cards.filter((card) => HIRES.includes(card.type)) },
]);

const art = (type: BuildingType) => spriteUrl(`buildings/${type}`);
const resourceIcon = (resource: Resource) => spriteUrl(`resources/${resource}`);
const costOf = (cost: Stock) => RESOURCES.filter((resource) => cost[resource] > 0).map((resource) => ({ resource, amount: cost[resource] }));
</script>

<template>
  <div class="build-menu" role="group" aria-label="Строительство">
    <header>
      <strong>{{ title }}</strong>
      <button class="secondary close" type="button" aria-label="Закрыть меню" @click="emit('close')">×</button>
    </header>
    <p v-if="roadMode" class="muted">Выберите соседнюю подсвеченную локацию, к которой пойдёт дорога.</p>
    <section v-for="group in groups" :key="group.title">
      <h3 class="muted">{{ group.title }}</h3>
      <ul class="cards">
        <li v-for="card in group.cards" :key="card.type">
          <button
            type="button"
            :class="['card', { active: roadMode && card.type === 'road' }]"
            :disabled="card.disabled"
            :title="card.reason || INFO[card.type].hint"
            @click="emit('pick', card.type)"
          >
            <span class="card-art" aria-hidden="true">
              <img v-if="art(card.type)" :src="art(card.type)" alt="" />
              <template v-else>{{ INFO[card.type].glyph }}</template>
            </span>
            <strong>{{ INFO[card.type].name }}</strong>
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
    </section>
  </div>
</template>
