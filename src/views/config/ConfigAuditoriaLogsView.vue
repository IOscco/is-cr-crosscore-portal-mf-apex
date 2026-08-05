<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IsButton, IsInputText, IsDataTable, IsColumn } from 'is-uikit-components-vue';
import { fetchAuditLogs, auditLogsToCsv, type AuditLogEntryApi } from '@/lib/audit-api';
import { fetchAuditoriaProyectosEliminados, type ProyectoEliminacionAuditoriaApi } from '@/lib/proyectos-api';
import { usePortalAccess } from '@/modules/shared/composables/usePortalAccess';

type AuditSection = 'logs' | 'proyectos-eliminados';

const auditSection = ref<AuditSection>('logs');
const rows = ref<AuditLogEntryApi[]>([]);
const proyectosEliminadosRows = ref<ProyectoEliminacionAuditoriaApi[]>([]);
const loading = ref(false);
const loadingProyectosEliminados = ref(false);
const err = ref<string | null>(null);
const proyectosEliminadosErr = ref<string | null>(null);
const filtroModulo = ref('');
const filtroAccion = ref('');
const filtroUsuario = ref('');
const filtroDesde = ref('');
const filtroHasta = ref('');
const { canSeeConfigAuditIniciativas, canSeeConfigAuditProyectos, canSeeConfigProyectosEliminados } = usePortalAccess();

const forcedModulo = computed(() => {
  if (canSeeConfigAuditIniciativas.value && !canSeeConfigAuditProyectos.value) {
    return 'iniciativas';
  }
  if (canSeeConfigAuditProyectos.value && !canSeeConfigAuditIniciativas.value) {
    return 'proyectos';
  }
  return '';
});

async function load(): Promise<void> {
  loading.value = true;
  err.value = null;
  try {
    rows.value = await fetchAuditLogs({
      module: forcedModulo.value || filtroModulo.value.trim() || undefined,
      action: filtroAccion.value.trim() || undefined,
      userEmail: filtroUsuario.value.trim() || undefined,
      from: filtroDesde.value.trim() || undefined,
      to: filtroHasta.value.trim() || undefined,
      limit: 800,
    });
  } catch {
    err.value = 'No se pudieron cargar los logs.';
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

async function loadProyectosEliminados(): Promise<void> {
  loadingProyectosEliminados.value = true;
  proyectosEliminadosErr.value = null;
  try {
    proyectosEliminadosRows.value = await fetchAuditoriaProyectosEliminados();
  } catch {
    proyectosEliminadosErr.value = 'No se pudo cargar el registro de eliminaciones.';
    proyectosEliminadosRows.value = [];
  } finally {
    loadingProyectosEliminados.value = false;
  }
}

function exportCsv(): void {
  const csv = auditLogsToCsv(rows.value);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function detailStr(r: AuditLogEntryApi): string {
  if (r.detail == null) {
    return '—';
  }
  if (typeof r.detail === 'object') {
    return JSON.stringify(r.detail);
  }
  return String(r.detail);
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

watch(
  forcedModulo,
  (module) => {
    filtroModulo.value = module;
    void load();
  },
  { immediate: true },
);

watch(
  canSeeConfigProyectosEliminados,
  (canSee) => {
    if (!canSee && auditSection.value === 'proyectos-eliminados') {
      auditSection.value = 'logs';
    }
    if (canSee) {
      void loadProyectosEliminados();
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="log">
    <h2 class="log__title">Logs de auditoría</h2>
    <p class="log__desc">Acciones registradas en backend (crear, eliminar, restaurar, purgar, editar).</p>

    <div class="log__sections" aria-label="Secciones de auditoría">
      <button
        v-if="canSeeConfigProyectosEliminados"
        type="button"
        class="log__section"
        :class="{ 'log__section--on': auditSection === 'logs' }"
        @click="auditSection = 'logs'"
      >
        Eventos del sistema
      </button>
      <button
        type="button"
        class="log__section"
        :class="{ 'log__section--on': auditSection === 'proyectos-eliminados' }"
        @click="auditSection = 'proyectos-eliminados'"
      >
        Proyectos eliminados
      </button>
    </div>

    <div v-if="auditSection === 'logs'" class="log__filters">
      <div class="log__field">
        <label class="log__label">Módulo</label>
        <IsInputText v-model="filtroModulo" placeholder="proyectos, squads…" fluid />
      </div>
      <div class="log__field">
        <label class="log__label">Acción</label>
        <IsInputText v-model="filtroAccion" placeholder="crear, eliminar…" fluid />
      </div>
      <div class="log__field">
        <label class="log__label">Usuario (email)</label>
        <IsInputText v-model="filtroUsuario" fluid />
      </div>
      <div class="log__field">
        <label class="log__label">Desde (ISO)</label>
        <IsInputText v-model="filtroDesde" placeholder="2026-01-01" fluid />
      </div>
      <div class="log__field">
        <label class="log__label">Hasta (ISO)</label>
        <IsInputText v-model="filtroHasta" placeholder="2026-12-31" fluid />
      </div>
      <IsButton severity="primary" label="Aplicar filtros" @click="load" />
      <IsButton severity="secondary" outlined label="Exportar CSV" :disabled="!rows.length" @click="exportCsv" />
    </div>
    <p v-if="auditSection === 'logs' && err" class="log__err" role="alert">{{ err }}</p>
    <IsDataTable
      v-if="auditSection === 'logs'"
      :value="rows"
      :loading="loading"
      data-key="id"
      striped-rows
      class="log__table"
      :pt="{ root: { class: 'p-datatable-sm' } }"
    >
      <IsColumn field="occurredAt" header="Fecha / hora" sortable style="min-width: 11rem" />
      <IsColumn field="userEmail" header="Usuario" sortable style="min-width: 10rem" />
      <IsColumn field="module" header="Módulo" sortable style="min-width: 7rem" />
      <IsColumn field="entityLabel" header="Entidad" sortable style="min-width: 12rem" />
      <IsColumn field="action" header="Acción" sortable style="min-width: 7rem" />
      <IsColumn header="Detalle" style="min-width: 14rem">
        <template #body="{ data }">
          <span class="log__detail">{{ detailStr(data as AuditLogEntryApi) }}</span>
        </template>
      </IsColumn>
    </IsDataTable>

    <section v-if="auditSection === 'proyectos-eliminados'" class="log__deleted">
      <p class="log__desc">Registro inmutable por eliminación confirmada. Visible solo para administradores.</p>
      <p v-if="proyectosEliminadosErr" class="log__err" role="alert">{{ proyectosEliminadosErr }}</p>
      <IsDataTable
        :value="proyectosEliminadosRows"
        :loading="loadingProyectosEliminados"
        data-key="id"
        striped-rows
        class="log__table"
        :pt="{ root: { class: 'p-datatable-sm' } }"
      >
        <template #empty>
          <span v-if="!loadingProyectosEliminados && !proyectosEliminadosErr">No hay eliminaciones registradas.</span>
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
    </section>
  </div>
</template>

<style scoped>
.log__title {
  margin: 0 0 0.5rem;
  font-size: 1.1rem;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.log__desc {
  margin: 0 0 1rem;
  font-size: 13px;
  color: theme('colors.surface.700');
  max-width: 44rem;
  line-height: 1.5;
}
.log__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
  margin-bottom: 1rem;
}
.log__sections {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.log__section {
  border: 1px solid theme('colors.surface.200');
  background: #fff;
  border-radius: 6px;
  padding: 0.45rem 1rem;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: theme('colors.surface.500');
}
.log__section--on {
  border-color: #1361b9;
  color: theme('colors.surface.800');
  box-shadow: 0 0 0 1px rgba(0, 107, 240, 0.2);
}
.log__field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 10rem;
}
.log__label {
  font-size: 12px;
  font-weight: 600;
  color: theme('colors.surface.700');
}
.log__err {
  color: #c41e24;
  font-size: 13px;
  margin: 0 0 1rem;
}
.log__table {
  font-size: 12px;
}
.log__detail {
  display: inline-block;
  max-width: 22rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.log__deleted {
  margin-top: 0.25rem;
}

@media (max-width: 768px) {
  .log__filters {
    align-items: stretch;
    flex-direction: column;
  }

  .log__field {
    width: 100%;
    min-width: 0;
  }

  .log__sections {
    display: grid;
    grid-template-columns: 1fr;
  }

  .log__section {
    width: 100%;
  }
}
</style>
