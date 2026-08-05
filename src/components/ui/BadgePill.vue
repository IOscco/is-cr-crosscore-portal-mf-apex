<script setup lang="ts">
import type { BadgePillVariant } from '@/types/badge-ui';

withDefaults(
  defineProps<{
    variant?: BadgePillVariant;
    title?: string;
  }>(),
  { variant: 'blue', title: undefined },
);
</script>

<template>
  <span class="badge-pill" :class="`badge-pill--${variant}`" :title="title">
    <slot />
  </span>
</template>

<style scoped>
/* Colores y radios alineados a referencia UX (ps-text-badge / BadgeEstados). Tipografía: design system. */
.badge-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--is-font-sans);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  white-space: nowrap;
  line-height: 16px;
  box-sizing: border-box;
}

.badge-pill--blue {
  padding: 4px 16px;
  border-radius: 20px;
  background-color: #1361b9;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.badge-pill--accepted {
  padding: 4px 8px;
  border-radius: 10px;
  background-color: #1361b9;
  color: #fff;
  font-size: 10px;
  font-weight: 500;
}

.badge-pill--pink {
  padding: 4px 16px;
  border-radius: 20px;
  background-color: #ff429b;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.badge-pill--sky {
  padding: 4px 16px;
  border-radius: 20px;
  background-color: #55aced;
  color: #05406e;
  font-size: 11px;
  font-weight: 700;
}

.badge-pill--orange {
  padding: 4px 14px;
  border-radius: 20px;
  background-color: #ffa32c;
  color: #6b3c00;
  font-size: 11px;
  font-weight: 700;
}

.badge-pill--purple {
  padding: 4px 14px;
  border-radius: 20px;
  background-color: #8246a0;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.badge-pill--red {
  padding: 4px 14px;
  border-radius: 20px;
  background-color: #f25154;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

.badge-pill--teal {
  padding: 4px 14px;
  border-radius: 20px;
  background-color: #14b8b8;
  color: #04342c;
  font-size: 11px;
  font-weight: 700;
}

.badge-pill--gray {
  padding: 4px 14px;
  border-radius: 20px;
  background-color: #9c9c9c;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
</style>
