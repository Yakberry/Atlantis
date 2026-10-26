<script setup lang="ts">
import { distance, isCaptured, UNIT_KINDS, type Coord, type GameView, type HexView, type UnitKind } from '@atlantis/shared';
import { computed, ref, watch } from 'vue';
import { boardBounds, COLONY_POINTS, HEX_IMAGE, HEX_POINTS, hexCenter, unitSlot } from '../board/layout';
import {
  CONTESTED_STROKE,
  FOG_FILL,
  FOG_STROKE,
  FREE_STROKE,
  playerColor,
  RESOURCE_COLORS,
  RESOURCE_LABELS,
  SEA_FILL,
  UNKNOWN_FILL,
  UNKNOWN_LABEL,
} from '../board/palette';
import type { Popup } from '../board/popups';
import { spriteUrl, type SpriteKey } from '../board/sprites';
import { usePanZoom } from '../composables/usePanZoom';
import { useSettingsStore } from '../stores/settings';

const props = withDefaults(
  defineProps<{
    game: GameView;
    viewerId: string;
    popups?: Popup[];
    /** Идёт выбор, кто останется без снабжения: свои юниты и постройки выбираются кликом. */
    picking?: boolean;
    unsupplied?: string[];
  }>(),
  { popups: () => [], picking: false, unsupplied: () => [] },
);
const emit = defineEmits<{
  move: [unitId: string, to: Coord];
  harvest: [colonyId: string];
  toggleSupply: [unitId: string];
}>();

type TileUnit = {
  id: string;
  kind: UnitKind;
  color: string;
  /** Номер цвета игрока; по нему выбирается фильтр окраски иконки. */
  slot: number | null;
  /** Иконка вида (если нарисована); иначе рисуем простую фигуру. */
  sprite: string | undefined;
  title: string;
  selected: boolean;
  /** Можно выбрать, чтобы походить. */
  selectable: boolean;
  /** Можно нажать, чтобы добыть ресурс. */
  harvestable: boolean;
  /** Можно нажать, чтобы оставить без снабжения. */
  droppable: boolean;
  /** Выбран остаться без снабжения. */
  marked: boolean;
  /** Колония, в локации которой стоят чужие юниты. */
  captured: boolean;
  tired: boolean;
};
type Tile = {
  key: string;
  q: number;
  r: number;
  x: number;
  y: number;
  fill: string;
  stroke: string;
  dashed: boolean;
  label: string;
  title: string;
  /** Картинка локации (если нарисована и включена); иначе рисуем заливку `fill`. */
  sprite: string | undefined;
  targetable: boolean;
  units: TileUnit[];
};

const viewport = ref<HTMLElement | null>(null);
const bounds = computed(() => boardBounds(props.game.hexes));
const { viewBox, fit, zoomBy, wasDragged, handlers } = usePanZoom(viewport, bounds);

const selectedId = ref<string | null>(null);

/** Приказы можно отдавать, пока игра идёт и мы не завершили текущую фазу. */
const canAct = computed(() => !props.game.winnerId && !props.game.ready.includes(props.viewerId));
watch([canAct, () => props.game.phase], () => (selectedId.value = null));

/** Выбранный юнит: его вид и локация, в которой он стоит. */
const selected = computed(() => {
  const id = selectedId.value;
  if (!id) return undefined;
  for (const hex of props.game.hexes) {
    if (!hex.visible) continue;
    const unit = hex.units.find((u) => u.id === id);
    if (unit) return { hex, kind: unit.kind };
  }
  return undefined;
});

const settings = useSettingsStore();

const colorOf = (playerId: string) => playerColor(props.game.slots[playerId] ?? -1);
const slotIndexes = computed(() => Object.values(props.game.slots));

const tileSpriteKey = (hex: HexView): SpriteKey => {
  if (!hex.visible) return 'tiles/fog';
  if (hex.terrain === 'sea') return 'tiles/sea';
  return hex.resource ? `tiles/${hex.resource}` : 'tiles/unexplored';
};

function unitTitle(unit: Pick<TileUnit, 'kind' | 'tired' | 'harvestable' | 'captured' | 'droppable' | 'marked'>): string {
  if (unit.droppable) return unit.marked ? 'Останется без снабжения (нажмите, чтобы отменить)' : 'Нажмите, чтобы оставить без снабжения';
  if (unit.kind === 'colony') {
    if (unit.captured) return 'Колония захвачена: добыча невозможна';
    return unit.tired ? 'Колония уже добывала в этом ходу' : unit.harvestable ? 'Нажмите, чтобы добыть ресурс' : 'Колония';
  }
  return unit.tired ? 'Юнит уже ходил в этом ходу' : 'Юнит';
}

function toTile(hex: HexView): Tile {
  const { q, r } = hex;
  const { x, y } = hexCenter(hex);
  const base = {
    sprite: settings.simpleTiles ? undefined : spriteUrl(tileSpriteKey(hex)),
    key: `${q},${r}`,
    q,
    r,
    x,
    y,
    // Выбранный юнит может сделать шаг в соседнюю локацию своей поверхности (юниты — по суше).
    targetable:
      canAct.value &&
      selected.value !== undefined &&
      hex.visible &&
      hex.terrain === UNIT_KINDS[selected.value.kind].terrain &&
      distance(selected.value.hex, hex) === 1,
  };

  if (!hex.visible) {
    return { ...base, fill: FOG_FILL, stroke: FOG_STROKE, dashed: false, label: '', title: `Неизвестно (${q}, ${r})`, units: [] };
  }
  const label = hex.terrain === 'sea' ? '' : hex.resource ? RESOURCE_LABELS[hex.resource] : UNKNOWN_LABEL;
  return {
    ...base,
    fill: hex.terrain === 'sea' ? SEA_FILL : hex.resource ? RESOURCE_COLORS[hex.resource] : UNKNOWN_FILL,
    stroke: hex.contested ? CONTESTED_STROKE : hex.ownerId ? colorOf(hex.ownerId) : FREE_STROKE,
    dashed: hex.contested,
    label,
    title: `${label || 'Море'} (${q}, ${r})`,
    units: hex.units.map((unit) => {
      const info = UNIT_KINDS[unit.kind];
      const mine = unit.ownerId === props.viewerId;
      // «Готов»: свой и ещё не использовал своё действие в этой фазе.
      const idle = mine && canAct.value && !unit.tired;
      const captured = info.harvests && isCaptured(unit.ownerId, hex.units);
      const part = {
        kind: unit.kind,
        tired: unit.tired === true,
        captured,
        harvestable: idle && props.game.phase === 'harvest' && info.harvests && !captured,
        droppable: props.picking && mine,
        marked: props.unsupplied.includes(unit.id),
      };
      const slot = props.game.slots[unit.ownerId] ?? null;
      return {
        ...part,
        id: unit.id,
        color: colorOf(unit.ownerId),
        slot,
        sprite: slot === null ? undefined : spriteUrl(`units/${unit.kind}`),
        title: unitTitle(part),
        selected: unit.id === selectedId.value,
        selectable: idle && props.game.phase === 'maneuver' && info.mobile,
      };
    }),
  };
}

const tiles = computed(() => props.game.hexes.map(toTile));

/** Всплывающие цифры: над сущностью, к которой они относятся. */
const floaters = computed(() =>
  props.popups.flatMap((popup) => {
    for (const tile of tiles.value) {
      const index = tile.units.findIndex((unit) => unit.id === popup.unitId);
      if (index < 0) continue;
      const slot = unitSlot(index, tile.units.length);
      return [
        {
          id: popup.id,
          x: tile.x + slot.x,
          y: tile.y + slot.y - 20,
          text: `+${popup.amount}`,
          color: `color-mix(in srgb, ${RESOURCE_COLORS[popup.resource]} 50%, black)`,
          icon: spriteUrl(`resources/${popup.resource}`),
        },
      ];
    }
    return [];
  }),
);

const slotTransform = (index: number, count: number) => {
  const { x, y } = unitSlot(index, count);
  return `translate(${x} ${y})`;
};

function onUnitClick(unit: TileUnit, event: MouseEvent) {
  if (wasDragged()) return;
  if (unit.droppable) {
    event.stopPropagation();
    emit('toggleSupply', unit.id);
    return;
  }
  if (unit.harvestable) {
    event.stopPropagation();
    selectedId.value = null;
    emit('harvest', unit.id);
    return;
  }
  if (!unit.selectable) return; // событие дойдёт до локации: например, перейти туда, где стоит чужой юнит
  event.stopPropagation();
  selectedId.value = selectedId.value === unit.id ? null : unit.id;
}

function onTileClick(tile: Tile) {
  if (wasDragged()) return;
  if (selectedId.value && tile.targetable) emit('move', selectedId.value, { q: tile.q, r: tile.r });
  selectedId.value = null;
}
</script>

<template>
  <div ref="viewport" class="viewport">
    <svg
      class="board"
      :viewBox="viewBox"
      role="img"
      aria-label="Игровое поле"
      @pointerdown="handlers.onPointerDown"
      @pointermove="handlers.onPointerMove"
      @pointerup="handlers.onPointerEnd"
      @pointercancel="handlers.onPointerEnd"
      @wheel.prevent="handlers.onWheel"
    >
      <defs>
        <clipPath id="hex-clip"><polygon :points="HEX_POINTS" /></clipPath>
        <!-- Окраска одноцветных иконок в цвет игрока: берём только форму (альфа-канал) иконки. -->
        <filter v-for="slot in slotIndexes" :id="`tint-${slot}`" :key="slot" color-interpolation-filters="sRGB">
          <feFlood :flood-color="playerColor(slot)" result="color" />
          <feComposite in="color" in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
      <g
        v-for="tile in tiles"
        :key="tile.key"
        :transform="`translate(${tile.x} ${tile.y})`"
        :class="{ target: tile.targetable }"
        @click="onTileClick(tile)"
      >
        <title>{{ tile.title }}</title>
        <image v-if="tile.sprite" :href="tile.sprite" v-bind="HEX_IMAGE" clip-path="url(#hex-clip)" />
        <polygon
          :points="HEX_POINTS"
          :fill="tile.sprite ? 'none' : tile.fill"
          :stroke="tile.stroke"
          :stroke-dasharray="tile.dashed ? '8 6' : undefined"
          stroke-width="4"
          stroke-linejoin="round"
        />
        <polygon v-if="tile.targetable" :points="HEX_POINTS" class="target-overlay" />
        <g
          v-for="(unit, i) in tile.units"
          :key="unit.id"
          :transform="slotTransform(i, tile.units.length)"
          :class="[
            'unit',
            {
              selectable: unit.selectable,
              harvestable: unit.harvestable,
              droppable: unit.droppable,
              selected: unit.selected,
              marked: unit.marked,
              captured: unit.captured,
              tired: unit.tired,
            },
          ]"
          @click="onUnitClick(unit, $event)"
        >
          <circle v-if="(unit.selectable || unit.harvestable) && !unit.selected" r="17" class="halo" />
          <template v-if="unit.sprite">
            <circle r="14" class="shape backdrop" />
            <image :href="unit.sprite" x="-13" y="-13" width="26" height="26" :filter="`url(#tint-${unit.slot})`" />
          </template>
          <polygon v-else-if="unit.kind === 'colony'" :points="COLONY_POINTS" :fill="unit.color" class="shape" />
          <circle v-else r="11" :fill="unit.color" class="shape" />
          <title>{{ unit.title }}</title>
        </g>
        <text y="30" class="tile-label">{{ tile.label }}</text>
      </g>
      <g v-for="floater in floaters" :key="floater.id" :transform="`translate(${floater.x} ${floater.y})`">
        <g class="floater">
          <image v-if="floater.icon" :href="floater.icon" x="-34" y="-18" width="22" height="22" />
          <text :x="floater.icon ? 12 : 0" class="floater-text" :style="{ stroke: floater.color }">{{ floater.text }}</text>
        </g>
      </g>
    </svg>
    <div class="viewport-controls">
      <button class="secondary" type="button" aria-label="Приблизить" @click="zoomBy(1.4)">+</button>
      <button class="secondary" type="button" aria-label="Отдалить" @click="zoomBy(1 / 1.4)">−</button>
      <button class="secondary" type="button" aria-label="Показать всю карту" @click="fit">⌖</button>
    </div>
  </div>
</template>
