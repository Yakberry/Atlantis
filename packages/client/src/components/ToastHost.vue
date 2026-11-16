<script setup lang="ts">
import { RESOURCES, type Resource } from '@atlantis/shared';
import { RESOURCE_COLORS, RESOURCE_LABELS } from '../board/palette';
import { spriteUrl } from '../board/sprites';
import { useToastStore, type Toast, type ToastAction } from '../stores/toasts';

const emit = defineEmits<{ action: [action: ToastAction] }>();
const store = useToastStore();

const icon = (resource: Resource) => spriteUrl(`resources/${resource}`);
const chips = (toast: Toast) =>
  RESOURCES.filter((resource) => (toast.amounts[resource] ?? 0) !== 0).map((resource) => ({ resource, amount: toast.amounts[resource] ?? 0 }));
const click = (toast: Toast) => {
  if (toast.action) emit('action', toast.action);
  store.dismiss(toast.id);
};
</script>

<template>
  <TransitionGroup name="toast" tag="ul" class="toast-host" aria-live="polite">
    <li v-for="toast in store.toasts" :key="toast.id">
      <button
        type="button"
        :class="['toast', { clickable: toast.action }]"
        @click="click(toast)"
        @mouseenter="store.pause(toast.id)"
        @mouseleave="store.resume(toast.id)"
      >
        <strong>{{ toast.title }}</strong>
        <span v-if="toast.note" class="muted">{{ toast.note }}</span>
        <span v-if="chips(toast).length" class="toast-amounts">
          <span
            v-for="chip in chips(toast)"
            :key="chip.resource"
            class="toast-chip"
            :style="{ '--resource': RESOURCE_COLORS[chip.resource] }"
            :title="RESOURCE_LABELS[chip.resource]"
          >
            {{ chip.amount > 0 ? '+' : '−' }}{{ Math.abs(chip.amount) }}
            <span :class="['resource-icon', { plain: !icon(chip.resource) }]" aria-hidden="true">
              <img v-if="icon(chip.resource)" :src="icon(chip.resource)" alt="" />
            </span>
          </span>
        </span>
      </button>
    </li>
  </TransitionGroup>
</template>
