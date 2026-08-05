<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IsDrawer } from 'is-uikit-components-vue';
import { fetchHitoReprogramaciones, type HitoReprogramacionApi } from '@/lib/actividades-api';

const props = defineProps<{
  visible: boolean;
  proyectoId: string;
  hitoId: string | null;
  hitoNombre: string;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
}>();

const drawerVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
});

const rows = ref<HitoReprogramacionApi[]>([]);
const loading = ref(false);

function formatIsoEs(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso;
  }
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

watch(
  () => [props.visible, props.hitoId] as const,
  async ([vis, hid]) => {
    if (!vis || !hid) {
      rows.value = [];
      return;
    }
    loading.value = true;
    try {
      rows.value = await fetchHitoReprogramaciones(props.proyectoId, hid);
    } catch {
      rows.value = [];
    } finally {
      loading.value = false;
    }
  },
);
</script>

<template>
  <IsDrawer
    v-model:visible="drawerVisible"
    position="right"
    :header="`Historial de reprogramaciones — ${hitoNombre}`"
    class="hr-drawer"
    style="width: min(420px, 100vw)"
  >
    <div v-if="loading" class="hr-drawer__msg">Cargando…</div>
    <p v-else-if="!rows.length" class="hr-drawer__msg">No hay reprogramaciones registradas.</p>
    <ul v-else class="hr-drawer__list">
      <li v-for="r in rows" :key="r.id" class="hr-drawer__item">
        <div class="hr-drawer__dates">
          {{ formatIsoEs(r.fechaFinPlanAnterior) }} → {{ formatIsoEs(r.fechaFinPlanNuevo) }}
        </div>
        <div class="hr-drawer__meta">{{ r.changedBy }}</div>
        <div class="hr-drawer__meta hr-drawer__meta--muted">{{ new Date(r.createdAt).toLocaleString('es-PE') }}</div>
      </li>
    </ul>
  </IsDrawer>
</template>

<style scoped>
.hr-drawer__msg {
  margin: 1rem 0;
  font-size: 14px;
  color: theme('colors.surface.700');
}
.hr-drawer__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.hr-drawer__item {
  padding: 0.65rem 0.75rem;
  border: 1px solid #e5e5e5;
  border-radius: 6px;
  background: #fafafa;
}
.hr-drawer__dates {
  font-size: 14px;
  font-weight: 600;
  color: theme('colors.surface.800');
}
.hr-drawer__meta {
  font-size: 12px;
  color: theme('colors.surface.500');
  margin-top: 0.25rem;
}
.hr-drawer__meta--muted {
  color: theme('colors.surface.700');
}
</style>
