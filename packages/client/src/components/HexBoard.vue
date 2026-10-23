<script setup lang="ts">
import type { GameView, HexView } from '@atlantis/shared';
import { computed } from 'vue';
import { boardViewBox, HEX_POINTS, hexCenter } from '../board/layout';
import {
  CONTESTED_STROKE,
  FOG_FILL,
  FOG_STROKE,
  FREE_STROKE,
  playerColor,
  RESOURCE_COLORS,
  RESOURCE_LABELS,
} from '../board/palette';

const props = defineProps<{ game: GameView }>();

type Tile = {
  key: string;
  x: number;
  y: number;
  fill: string;
  stroke: string;
  dashed: boolean;
  label: string;
  units: { id: string; color: string }[];
};

const colorOf = (playerId: string) => playerColor(props.game.slots[playerId] ?? -1);

function toTile(hex: HexView): Tile {
  const { x, y } = hexCenter(hex);
  const key = `${hex.q},${hex.r}`;

  if (!hex.visible) {
    return { key, x, y, fill: FOG_FILL, stroke: FOG_STROKE, dashed: false, label: '', units: [] };
  }
  return {
    key,
    x,
    y,
    fill: RESOURCE_COLORS[hex.resource],
    stroke: hex.contested ? CONTESTED_STROKE : hex.ownerId ? colorOf(hex.ownerId) : FREE_STROKE,
    dashed: hex.contested,
    label: RESOURCE_LABELS[hex.resource],
    units: hex.units.map((unit) => ({ id: unit.id, color: colorOf(unit.ownerId) })),
  };
}

const tiles = computed(() => props.game.hexes.map(toTile));
const viewBox = computed(() => boardViewBox(props.game.hexes));
</script>

<template>
  <svg class="board" :viewBox="viewBox" role="img" aria-label="Игровое поле">
    <g v-for="tile in tiles" :key="tile.key" :transform="`translate(${tile.x} ${tile.y})`">
      <polygon
        :points="HEX_POINTS"
        :fill="tile.fill"
        :stroke="tile.stroke"
        :stroke-dasharray="tile.dashed ? '8 6' : undefined"
        stroke-width="4"
        stroke-linejoin="round"
      />
      <circle
        v-for="(unit, i) in tile.units"
        :key="unit.id"
        :cx="(i - (tile.units.length - 1) / 2) * 26"
        cy="-8"
        r="11"
        :fill="unit.color"
        class="unit"
      />
      <text y="30" class="tile-label">{{ tile.label }}</text>
    </g>
  </svg>
</template>
