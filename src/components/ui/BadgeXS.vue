<script setup lang="ts">
import type { BadgeXSVariant } from '@/types/badge-ui';

withDefaults(
  defineProps<{
    variant?: BadgeXSVariant;
    title?: string;
  }>(),
  { variant: 'pending', title: undefined },
);
</script>

<template>
  <span class="badge-xs" :class="`badge-xs--${variant}`" :title="title">
    <slot />
  </span>
</template>

<style scoped>
.badge-xs {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  height: 20px;
  border-radius: 10px;
  font-family: var(--is-font-sans);
  font-size: 8px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  white-space: nowrap;
  line-height: 10px;
  box-sizing: border-box;
}

.badge-xs--pending {
  background-color: rgba(255, 66, 155, 0.3);
  color: #c21e73;
  font-weight: 400;
}

.badge-xs--observed {
  background-color: rgba(255, 66, 155, 0.3);
  color: #c21e73;
  font-weight: 500;
}

.badge-xs--approved {
  background-color: rgba(85, 172, 237, 0.3);
  color: #185fa5;
  font-weight: 500;
}

.badge-xs--rejected {
  background-color: #feeced;
  color: #f25154;
  font-weight: 500;
}

.badge-xs--sent {
  background-color: rgba(85, 172, 237, 0.3);
  color: #185fa5;
  font-weight: 500;
}
</style>
