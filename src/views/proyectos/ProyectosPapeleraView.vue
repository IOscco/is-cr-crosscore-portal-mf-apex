<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { IsDataTable, IsColumn, IsButton } from 'is-uikit-components-vue';
import {
  fetchProyectosPapelera,
  restoreProyectoPapelera,
  purgeProyectoPapelera,
  type ProyectoPapeleraItemApi,
} from '@/lib/proyectos-api';
import { usePortalAccess } from '@/modules/shared/composables/usePortalAccess';

const { canManageProyectos } = usePortalAccess();
const rows = ref<ProyectoPapeleraItemApi[]>([]);
const loading = ref(false);
const err = ref<string | null>(null);
const purgeId = ref<string | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  err.value = null;
  try {
    rows.value = await fetchProyectosPapelera();
  } catch {
    err.value = 'No se pudo cargar la papelera.';
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

async function restaurar(id: string): Promise<void> {
  if (!canManageProyectos.value) {
    return;
  }
  try {
    await restoreProyectoPapelera(id);
    await load();
  } catch {
    err.value = 'No se pudo restaurar el proyecto.';
  }
}

async function confirmarPurgar(): Promise<void> {
  if (!purgeId.value || !canManageProyectos.value) {
    return;
  }
  try {
    await purgeProyectoPapelera(purgeId.value);
    purgeId.value = null;
    await load();
  } catch {
    err.value = 'No se pudo eliminar permanentemente.';
  }
}

function fmtIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'medium' }).format(d);
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="pap">
    <nav class="pap__nav">
      <RouterLink :to="{ name: 'proyectos' }" class="pap__back">← Volver al listado</RouterLink>
    </nav>
    <h2 class="pap__title">Papelera — Proyectos</h2>
    <p class="pap__desc">HU-ITP-049 — Restaurar devuelve el proyecto al listado activo; eliminar definitivo requiere confirmación.</p>
    <p v-if="err" class="pap__err" role="alert">{{ err }}</p>
    <IsDataTable
      :value="rows"
      :loading="loading"
      data-key="id"
      striped-rows
      class="pap__table"
      :pt="{ root: { class: 'p-datatable-sm' } }"
    >
      <template #empty>
        <span v-if="!loading && !err">La papelera está vacía.</span>
      </template>
      <IsColumn field="nombre" header="Nombre" style="min-width: 12rem" />
      <IsColumn header="Eliminado el" style="min-width: 11rem">
        <template #body="{ data }">
          {{ fmtIso((data as ProyectoPapeleraItemApi).eliminadoEn) }}
        </template>
      </IsColumn>
      <IsColumn field="eliminadoPor" header="Eliminado por" style="min-width: 10rem" />
      <IsColumn v-if="canManageProyectos" header="" style="width: 14rem">
        <template #body="{ data }">
          <div class="pap__actions">
            <IsButton size="small" severity="primary" outlined label="Restaurar" @click="restaurar((data as ProyectoPapeleraItemApi).id)" />
            <IsButton size="small" severity="danger" outlined label="Eliminar definitivo" @click="purgeId = (data as ProyectoPapeleraItemApi).id" />
          </div>
        </template>
      </IsColumn>
    </IsDataTable>

    <div v-if="purgeId" class="pap__modal" role="dialog" aria-modal="true">
      <div class="pap__modal-card">
        <h3 class="pap__modal-title">¿Eliminar definitivamente?</h3>
        <p class="pap__modal-text">Esta acción no se puede deshacer. Se borrarán hitos, actividades y adjuntos asociados.</p>
        <div class="pap__modal-actions">
          <IsButton severity="secondary" outlined label="Cancelar" @click="purgeId = null" />
          <IsButton severity="danger" label="Sí, eliminar" @click="confirmarPurgar" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pap__nav {
  margin-bottom: 0.75rem;
}
.pap__back {
  font-size: 13px;
  font-weight: 600;
  color: var(--apex-color-g100);
  text-decoration: none;
}
.pap__back:hover {
  text-decoration: underline;
}
.pap__title {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.pap__desc {
  margin: 0 0 1rem;
  font-size: 13px;
  color: theme('colors.surface.700');
  max-width: 40rem;
  line-height: 1.5;
}
.pap__err {
  color: #c41e24;
  font-size: 13px;
  margin: 0 0 1rem;
}
.pap__table {
  font-size: 13px;
}
.pap__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.pap__modal {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
}
.pap__modal-card {
  background: #fff;
  border-radius: 8px;
  padding: 1.25rem;
  max-width: 22rem;
  box-shadow: theme('boxShadow.lg');
}
.pap__modal-title {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 700;
}
.pap__modal-text {
  margin: 0 0 1rem;
  font-size: 13px;
  color: theme('colors.surface.700');
  line-height: 1.5;
}
.pap__modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
