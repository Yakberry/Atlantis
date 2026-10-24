<script setup lang="ts">
import { distance, UNIT_KINDS, type Coord, type GameView, type HexView, type UnitKind } from '@atlantis/shared';
import { computed, ref, watch } from 'vue';
import { boardBounds, COLONY_POINTS, HEX_POINTS, hexCenter, unitSlot } from '../board/layout';
import {
  CONTESTED_STROKE,
  FOG_FILL,
  FOG_STROKE,
  FREE_STROKE,
  playerColor,
  RESOURCE_COLORS,
  RESOURCE_LABELS,
  UNKNOWN_FILL,
  UNKNOWN_LABEL,
} from '../board/palette';
import { usePanZoom } from '../composables/usePanZoom';

const props = defineProps<{ game: GameView; viewerId: string }>();
const emit = defineEmits<{ move: [unitId: string, to: Coord] }>();

type TileUnit = {
  id: string;
  kind: UnitKind;
  color: string;
  selected: boolean;
  selectable: boolean;
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
  targetable: boolean;
  units: TileUnit[];
};

const viewport = ref<HTMLElement | null>(null);
const bounds = computed(() => boardBounds(props.game.hexes));
const { viewBox, fit, zoomBy, wasDragged, handlers } = usePanZoom(viewport, bounds);

const selectedId = ref<string | null>(null);

/** Приказы можно отдавать, пока игра идёт и мы не завершили ход. */
const canAct = computed(() => !props.game.winnerId && !props.game.ready.includes(props.viewerId));
watch(canAct, () => (selectedId.value = null));

/** Локация, в которой стоит выбранный юнит. */
const origin = computed(() => {
  const id = selectedId.value;
  if (!id) return undefined;
  return props.game.hexes.find((hex) => hex.visible && hex.units.some((unit) => unit.id === id));
});

const colorOf = (playerId: string) => playerColor(props.game.slots[playerId] ?? -1);

function toTile(hex: HexView): Tile {
  const { q, r } = hex;
  const { x, y } = hexCenter(hex);
  const base = {
    key: `${q},${r}`,
    q,
    r,
    x,
    y,
    targetable: canAct.value && origin.value !== undefined && distance(origin.value, hex) === 1,
  };

  if (!hex.visible) {
    return { ...base, fill: FOG_FILL, stroke: FOG_STROKE, dashed: false, label: '', units: [] };
  }
  return {
    ...base,
    fill: hex.resource ? RESOURCE_COLORS[hex.resource] : UNKNOWN_FILL,
    stroke: hex.contested ? CONTESTED_STROKE : hex.ownerId ? colorOf(hex.ownerId) : FREE_STROKE,
    dashed: hex.contested,
    label: hex.resource ? RESOURCE_LABELS[hex.resource] : UNKNOWN_LABEL,
    units: hex.units.map((unit) => ({
      id: unit.id,
      kind: unit.kind,
      color: colorOf(unit.ownerId),
      selected: unit.id === selectedId.value,
      selectable: unit.ownerId === props.viewerId && UNIT_KINDS[unit.kind].mobile && canAct.value && !unit.tired,
      tired: unit.tired === true,
    })),
  };
}

const tiles = computed(() => props.game.hexes.map(toTile));

const slotTransform = (index: number, count: number) => {
  const { x, y } = unitSlot(index, count);
  return `translate(${x} ${y})`;
};

function onUnitClick(unit: TileUnit, event: MouseEvent) {
  if (wasDragged()) return;
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
      <g
        v-for="tile in tiles"
        :key="tile.key"
        :transform="`translate(${tile.x} ${tile.y})`"
        :class="{ target: tile.targetable }"
        @click="onTileClick(tile)"
      >
        <polygon
          :points="HEX_POINTS"
          :fill="tile.fill"
          :stroke="tile.stroke"
          :stroke-dasharray="tile.dashed ? '8 6' : undefined"
          stroke-width="4"
          stroke-linejoin="round"
        />
        <polygon v-if="tile.targetable" :points="HEX_POINTS" class="target-overlay" />
        <g v-for="(unit, i) in tile.units" :key="unit.id" :transform="slotTransform(i, tile.units.length)">
          <circle v-if="unit.selectable && !unit.selected" r="17" class="halo" />
          <polygon v-if="unit.kind === 'colony'" :points="COLONY_POINTS" :fill="unit.color" class="unit colony">
            <title>Колония</title>
          </polygon>
          <circle
            v-else
            r="11"
            :fill="unit.color"
            :class="['unit', { selectable: unit.selectable, selected: unit.selected, tired: unit.tired }]"
            @click="onUnitClick(unit, $event)"
          >
            <title v-if="unit.tired">Юнит уже ходил в этом ходу</title>
          </circle>
        </g>
        <text y="30" class="tile-label">{{ tile.label }}</text>
      </g>
    </svg>
    <div class="viewport-controls">
      <button class="secondary" type="button" aria-label="Приблизить" @click="zoomBy(1.4)">+</button>
      <button class="secondary" type="button" aria-label="Отдалить" @click="zoomBy(1 / 1.4)">−</button>
      <button class="secondary" type="button" aria-label="Показать всю карту" @click="fit">⌖</button>
    </div>
  </div>
</template>
