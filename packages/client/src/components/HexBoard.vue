<script setup lang="ts">
import {
  BUILDING_TYPES,
  covers,
  distance,
  fullCost,
  isCaptured,
  roadBetween,
  sameCell,
  UNIT_KINDS,
  UNIT_LABELS,
  type BuildingType,
  type Coord,
  type GameView,
  type HexView,
  type UnitKind,
} from '@atlantis/shared';
import { computed, ref, watch } from 'vue';
import { boardBounds, COLONY_POINTS, FORT_POINTS, HEX_IMAGE, HEX_POINTS, hexCenter, RIDER_POINTS, unitSlot } from '../board/layout';
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
import BuildMenu, { type BuildCard } from './BuildMenu.vue';
import UnitIcon from "./UnitIcon.vue";

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
  build: [building: BuildingType, at: Coord, to?: Coord];
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
  /** Столкнулся с чужими юнитами: до конца хода не ходит. */
  blocked: boolean;
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
  /** Название локации и вторая строка (ресурс). */
  name: string;
  sub: string;
  title: string;
  /** Картинка локации (если нарисована и включена); иначе рисуем заливку `fill`. */
  sprite: string | undefined;
  targetable: boolean;
  /** Место для строительства / выбранное место / конец будущей дороги. */
  site: boolean;
  siteSelected: boolean;
  roadTarget: boolean;
  units: TileUnit[];
};

const viewport = ref<HTMLElement | null>(null);
const bounds = computed(() => boardBounds(props.game.hexes));
const { viewBox, fit, zoomBy, wasDragged, handlers } = usePanZoom(viewport, bounds);

const selectedId = ref<string | null>(null);
/** Строительство: выбранная локация и режим выбора конца дороги. */
const siteCell = ref<Coord | null>(null);
const roadMode = ref(false);
const clearBuild = () => {
  siteCell.value = null;
  roadMode.value = false;
};

/** Приказы можно отдавать, пока игра идёт и мы не завершили текущую фазу. */
const canAct = computed(() => !props.game.winnerId && !props.game.ready.includes(props.viewerId));
watch([canAct, () => props.game.phase], () => {
  selectedId.value = null;
  clearBuild();
});

const keyOf = ({ q, r }: Coord) => `${q},${r}`;

function visibleHex(cell: Coord) {
  for (const hex of props.game.hexes) if (hex.visible && sameCell(hex, cell)) return hex;
  return undefined;
}

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

// ---------- добыча: за фазу можно добывать только с одной цепочки колоний ----------
const harvestedChain = computed(() => {
  for (const hex of props.game.hexes) {
    if (!hex.visible) continue;
    const done = hex.units.find((u) => u.ownerId === props.viewerId && UNIT_KINDS[u.kind].harvests && u.tired);
    if (done) return props.game.chains.find((chain) => chain.includes(done.id));
  }
  return undefined;
});

// ---------- строительство ----------
const siteKeys = computed(() => new Set(props.game.sites.map(keyOf)));
const siteHex = computed(() => (siteCell.value ? visibleHex(siteCell.value) : undefined));

const roadExists = (a: Coord, b: Coord) =>
  props.game.roads.some((road) => (sameCell(road.a, a) && sameCell(road.b, b)) || (sameCell(road.a, b) && sameCell(road.b, a)));

/** Куда можно провести дорогу из выбранной локации: соседнее место, доступное для строительства, где дороги ещё нет. */
const roadTargets = computed<Coord[]>(() => {
  const at = siteCell.value;
  if (!at) return [];
  return props.game.sites.filter((cell) => distance(at, cell) === 1 && !roadExists(at, cell));
});

const buildCards = computed<BuildCard[]>(() => {
  const hex = siteHex.value;
  if (!hex) return [];
  return BUILDING_TYPES.map((type) => {
    const cost = fullCost(type);
    let reason = '';
    if (!covers(props.game.stock, cost)) reason = 'Не хватает ресурсов';
    else if (type === 'colony' && hex.units.some((u) => UNIT_KINDS[u.kind].colony)) reason = 'В этой локации уже есть колония';
    else if (type === 'fortified_colony' && !hex.units.some((u) => u.kind === 'colony' && u.ownerId === props.viewerId)) {
      reason = 'Нужна ваша обычная колония в этой локации';
    } else if (type === 'road' && roadTargets.value.length === 0) reason = 'Нет соседней локации, доступной для строительства, без дороги';
    return { type, cost, disabled: reason !== '', reason };
  });
});

const showBuildMenu = computed(() => props.game.phase === 'build' && canAct.value && siteHex.value !== undefined);

function onPick(type: BuildingType) {
  const at = siteCell.value;
  if (!at) return;
  if (type === 'road') {
    roadMode.value = !roadMode.value;
    return;
  }
  emit('build', type, at);
  clearBuild();
}

// ---------- отрисовка ----------
const tileSpriteKey = (hex: HexView): SpriteKey => {
  if (!hex.visible) return 'tiles/fog';
  if (hex.terrain === 'sea') return 'tiles/sea';
  return hex.resource ? `tiles/${hex.resource}` : 'tiles/unexplored';
};

function unitTitle(
  unit: Pick<TileUnit, 'kind' | 'tired' | 'harvestable' | 'captured' | 'blocked' | 'droppable' | 'marked'> & { chainLocked: boolean },
): string {
  if (unit.droppable) return unit.marked ? 'Останется без снабжения (нажмите, чтобы отменить)' : 'Нажмите, чтобы оставить без снабжения';
  if (!UNIT_KINDS[unit.kind].building) {
    const name = UNIT_LABELS[unit.kind];
    if (unit.blocked) return `${name} столкнулся с чужими юнитами и до конца хода не ходит`;
    return unit.tired ? `${name} уже ходил на этом этапе` : name;
  }
  const name = UNIT_LABELS[unit.kind];
  if (unit.captured) return `${name} захвачена: добыча невозможна`;
  if (unit.chainLocked) return `${name} из другой цепочки: за фазу добывают с одной`;
  if (unit.tired) return `${name} уже добывала в этом ходу`;
  return unit.harvestable ? 'Нажмите, чтобы добыть ресурс' : name;
}

/** Дорога — небольшой прямоугольник на общей грани двух локаций, вытянутый вдоль линии между их центрами. */
const roadRects = computed(() =>
  props.game.roads.map((road) => {
    const a = hexCenter(road.a);
    const b = hexCenter(road.b);
    return {
      id: road.id,
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
    };
  }),
);

function toTile(hex: HexView): Tile {
  const { q, r } = hex;
  const { x, y } = hexCenter(hex);
  const key = keyOf(hex);
  const base = {
    sprite: settings.simpleTiles ? undefined : spriteUrl(tileSpriteKey(hex)),
    key,
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
      distance(selected.value.hex, hex) === 1 &&
      (props.game.stage !== 'roads' || roadBetween(props.game.roads, selected.value.hex, hex) !== undefined),
    site: siteKeys.value.has(key),
    siteSelected: siteCell.value !== null && sameCell(siteCell.value, hex),
    roadTarget: roadMode.value && roadTargets.value.some((cell) => sameCell(cell, hex)),
  };

  if (!hex.visible) {
    return { ...base, fill: FOG_FILL, stroke: FOG_STROKE, dashed: false, name: '', sub: '', title: 'Неизвестно', units: [] };
  }
  const sub = hex.terrain === 'sea' ? '' : hex.resource ? RESOURCE_LABELS[hex.resource] : UNKNOWN_LABEL;
  const name = hex.name ?? '';
  return {
    ...base,
    fill: hex.terrain === 'sea' ? SEA_FILL : hex.resource ? RESOURCE_COLORS[hex.resource] : UNKNOWN_FILL,
    stroke: hex.contested ? CONTESTED_STROKE : hex.ownerId ? colorOf(hex.ownerId) : FREE_STROKE,
    dashed: hex.contested,
    name,
    sub,
    title: hex.terrain === 'sea' ? 'Море' : hex.resource ? `${name} — ${sub}` : name,
    units: hex.units.map((unit) => {
      const info = UNIT_KINDS[unit.kind];
      const mine = unit.ownerId === props.viewerId;
      // «Готов»: свой и ещё не использовал своё действие в этой фазе.
      const idle = mine && canAct.value && !unit.tired;
      const captured = info.harvests && isCaptured(unit.ownerId, hex.units);
      const harvestPhase = idle && props.game.phase === 'harvest' && info.harvests && !captured;
      const chainLocked = harvestPhase && harvestedChain.value !== undefined && !harvestedChain.value.includes(unit.id);
      const part = {
        kind: unit.kind,
        tired: unit.tired === true,
        captured,
        blocked: unit.blocked === true,
        harvestable: harvestPhase && !chainLocked,
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
        title: unitTitle({ ...part, chainLocked }),
        selected: unit.id === selectedId.value,
        // На этапе «кавалерия» ходят только быстрые юниты; столкнувшиеся не ходят до конца хода.
        selectable:
          idle && props.game.phase === 'maneuver' && info.mobile && unit.blocked !== true && (props.game.stage !== 'riders' || info.fast),
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

  if (props.game.phase === 'build' && canAct.value) {
    const at = siteCell.value;
    if (at && roadMode.value && tile.roadTarget) {
      emit('build', 'road', at, { q: tile.q, r: tile.r });
      clearBuild();
    } else if (tile.site) {
      siteCell.value = { q: tile.q, r: tile.r };
      roadMode.value = false;
    } else {
      clearBuild();
    }
    return;
  }

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
      </defs>
      <g
        v-for="tile in tiles"
        :key="tile.key"
        :transform="`translate(${tile.x} ${tile.y})`"
        :class="{ target: tile.targetable || tile.site || tile.roadTarget }"
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
        <polygon v-if="tile.targetable || tile.roadTarget" :points="HEX_POINTS" class="target-overlay" />
        <polygon v-if="tile.site" :points="HEX_POINTS" :class="['site-overlay', { chosen: tile.siteSelected }]" />
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
              blocked: unit.blocked,
              tired: unit.tired,
            },
          ]"
          @click="onUnitClick(unit, $event)"
        >
          <circle v-if="(unit.selectable || unit.harvestable) && !unit.selected" r="17" class="halo" />
          <template v-if="unit.sprite">
            <foreignObject x="-13" y="-13" width="26" height="26">
              <UnitIcon :src="unit.sprite" :color="playerColor(unit.slot)" />
            </foreignObject>
          </template>
          <polygon v-else-if="unit.kind === 'fortified_colony'" :points="FORT_POINTS" :fill="unit.color" class="shape fort" />
          <polygon v-else-if="unit.kind === 'colony'" :points="COLONY_POINTS" :fill="unit.color" class="shape" />
          <polygon v-else-if="unit.kind === 'rider'" :points="RIDER_POINTS" :fill="unit.color" class="shape" />
          <circle v-else r="11" :fill="unit.color" class="shape" />
          <title>{{ unit.title }}</title>
        </g>
        <text v-if="tile.name" y="21" class="tile-name">{{ tile.name }}</text>
        <text v-if="tile.sub" y="33" class="tile-sub">{{ tile.sub }}</text>
      </g>
      <g
        v-for="road in roadRects"
        :key="road.id"
        class="road"
        :transform="`translate(${road.x} ${road.y}) rotate(${road.angle})`"
      >
        <rect x="-13" y="-5" width="26" height="10" rx="2" />
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
    <BuildMenu
      v-if="showBuildMenu"
      :title="`Строительство: «${siteHex?.name ?? ''}»`"
      :cards="buildCards"
      :road-mode="roadMode"
      @pick="onPick"
      @close="clearBuild"
    />
  </div>
</template>
