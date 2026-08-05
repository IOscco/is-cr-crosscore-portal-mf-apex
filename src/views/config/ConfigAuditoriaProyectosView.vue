<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { IsDataTable, IsColumn } from 'is-uikit-components-vue';
import { fetchAuditoriaProyectosEliminados, type ProyectoEliminacionAuditoriaApi } from '@/lib/proyectos-api';

const rows = ref<ProyectoEliminacionAuditoriaApi[]>([]);
const loading = ref(false);
const err = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  err.value = null;
  try {
    rows.value = await fetchAuditoriaProyectosEliminados();
  } catch {
    err.value = 'No se pudo cargar el registro de eliminaciones.';
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

function fmtIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(d);
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="aud">
    <h2 class="aud__title">Auditoría — proyectos eliminados</h2>
    <p class="aud__desc">
      Registro inmutable por eliminación confirmada. Visible solo para administradores.
    </p>
    <p v-if="err" class="aud__err" role="alert">{{ err }}</p>
    <IsDataTable
      :value="rows"
      :loading="loading"
      data-key="id"
      striped-rows
      class="aud__table"
      :pt="{ root: { class: 'p-datatable-sm' } }"
    >
      <template #empty>
        <span v-if="!loading && !err">No hay eliminaciones registradas.</span>
      </template>
      <IsColumn field="proyectoId" header="ID proyecto" style="min-width: 14rem" />
      <IsColumn field="nombre" header="Nombre" style="min-width: 12rem" />
      <IsColumn field="estado" header="Estado al eliminar" style="min-width: 10rem" />
      <IsColumn field="eliminadoPor" header="Eliminado por" style="min-width: 10rem" />
      <IsColumn header="Fecha / hora" style="min-width: 11rem">
        <template #body="{ data }">
          {{ fmtIso((data as ProyectoEliminacionAuditoriaApi).eliminadoEn) }}
        </template>
      </IsColumn>
    </IsDataTable>
  </div>
</template>

<style scoped>
.aud__title {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.aud__desc {
  margin: 0 0 1rem;
  font-size: 13px;
  color: theme('colors.surface.700');
  line-height: 1.5;
  max-width: 40rem;
}
.aud__err {
  margin: 0 0 1rem;
  padding: 0.65rem 1rem;
  border-radius: 6px;
  background: #fff5f5;
  border: 1px solid rgba(241, 70, 73, 0.35);
  color: #9b1c26;
  font-size: 13px;
}
.aud__table {
  font-size: 13px;
}
</style>
