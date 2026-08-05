<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { IsMessage } from 'is-uikit-components-vue';

const route = useRoute();
const title = computed(() => String(route.meta.title ?? 'Módulo'));
const hint = computed(() => String(route.meta.hint ?? 'Contenido según backlog Excel (Sprint 0 / 1).'));
</script>

<template>
  <div class="ph">
    <div class="ph__panel">
      <h2 class="ph__title">{{ title }}</h2>
      <IsMessage severity="info" :closable="false">{{ hint }}</IsMessage>
    </div>
  </div>
</template>

<style scoped>
.ph__panel {
  max-width: 40rem;
  background: #ffffff;
  border: 1px solid theme('colors.surface.200');
  border-radius: 8px;
  padding: 1.25rem;
  box-shadow: theme('boxShadow.sm');
}
.ph__title {
  margin: 0 0 0.75rem;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: theme('colors.surface.800');
}
</style>
