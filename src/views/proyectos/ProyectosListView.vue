<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import Tooltip from 'primevue/tooltip';
import {
  IsDataTable,
  IsColumn,
  IsPaginator,
  IsButton,
  IsInputText,
  IsSelect,
  IsSelectButton,
  IsIconField,
  IsInputIcon,
  IsTag,
  IsPopover,
  useConfirm,
} from 'is-uikit-components-vue';
import type { SelectOption } from '@/types/forms';
import { usePortalAccess } from '@/modules/shared/composables/usePortalAccess';
import type { ProyectoListItemApi } from '@/lib/proyectos-api';
import { fetchProyectosList, deleteProyectoApi } from '@/lib/proyectos-api';
import NuevoProyectoDialog from './NuevoProyectoDialog.vue';
import { calcularAvancePlanificadoProyecto } from './proyecto-fechas-ui';

const VISTA_SESSION_KEY = 'itp-proyectos-vista';
const vTooltip = Tooltip;

const confirm = useConfirm();
const { canManageProyectos } = usePortalAccess();
const canGestorUi = computed(() => canManageProyectos.value);

const nuevoOpen = ref(false);

const vista = ref<'lista' | 'tarjetas'>('lista');
const vistaOptions = [
  { label: 'Lista', value: 'lista', icon: 'pi pi-list' },
  { label: 'Tarjetas', value: 'tarjetas', icon: 'pi pi-th-large' },
] as const;

const estadoLegend = ref<{ toggle: (event: Event) => void } | null>(null);
function toggleEstadoLegend(event: Event): void {
  estadoLegend.value?.toggle(event);
}

type PillTone = 'gris' | 'azul' | 'rojo' | 'verde' | 'ambar';
type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary';
function toneToSeverity(tone: PillTone): TagSeverity {
  switch (tone) {
    case 'verde':
      return 'success';
    case 'azul':
      return 'info';
    case 'ambar':
      return 'warn';
    case 'rojo':
      return 'danger';
    default:
      return 'secondary';
  }
}

const rows = ref<ProyectoListItemApi[]>([]);
const loading = ref(false);
const loadError = ref<string | null>(null);
const totalRecords = ref(0);
const lazyFirst = ref(0);
const lazyRows = ref(15);
const lazySortField = ref<string | undefined>(undefined);
const lazySortOrder = ref<number | undefined>(undefined);

const globalFilter = ref('');
const qDebounced = ref('');
let qTimer: ReturnType<typeof setTimeout> | null = null;

const filterSquad = ref('');
const filterEstado = ref('');
const filterMes = ref('');
const filterEvolution = ref<'' | 'si' | 'no'>('');
const filterSquadDebounced = ref('');
const filterEstadoDebounced = ref('');
const filterMesDebounced = ref('');
const filterEvolutionDebounced = ref<'' | 'si' | 'no'>('');
let fTimer: ReturnType<typeof setTimeout> | null = null;

const estadoFilterOptions = ref<SelectOption[]>([
  { value: '', label: 'Todos los estatus' },
  { value: 'pendiente', label: 'Pendiente planificar' },
  { value: 'activo', label: 'Activo' },
  { value: 'completado', label: 'Completado' },
  { value: 'cancelado', label: 'Cancelado' },
]);

const evolutionFilterOptions = ref<SelectOption[]>([
  { value: '', label: 'Todos' },
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
]);

watch(globalFilter, () => {
  if (qTimer) {
    clearTimeout(qTimer);
  }
  qTimer = setTimeout(() => {
    qDebounced.value = globalFilter.value.trim();
    lazyFirst.value = 0;
    void loadRemote();
  }, 280);
});

watch([filterSquad, filterEstado, filterMes, filterEvolution], () => {
  if (fTimer) {
    clearTimeout(fTimer);
  }
  fTimer = setTimeout(() => {
    filterSquadDebounced.value = filterSquad.value.trim();
    filterEstadoDebounced.value = filterEstado.value.trim();
    filterMesDebounced.value = filterMes.value.trim();
    filterEvolutionDebounced.value = filterEvolution.value;
    lazyFirst.value = 0;
    void loadRemote();
  }, 320);
});

function setVista(v: 'lista' | 'tarjetas'): void {
  if (vista.value === v) {
    return;
  }
  vista.value = v;
  try {
    sessionStorage.setItem(VISTA_SESSION_KEY, v);
  } catch {
    /* ignore */
  }
  lazyFirst.value = 0;
  void loadRemote();
}

const rangeStart = computed(() => {
  if (!totalRecords.value) {
    return 0;
  }
  return lazyFirst.value + 1;
});

const rangeEnd = computed(() => {
  if (!totalRecords.value) {
    return 0;
  }
  return Math.min(lazyFirst.value + rows.value.length, totalRecords.value);
});

const counterLabel = computed(() => {
  if (!totalRecords.value) {
    return '0 de 0 proyecto(s)';
  }
  return `${rangeStart.value}–${rangeEnd.value} de ${totalRecords.value} proyecto(s)`;
});

async function loadRemote(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  const page = Math.floor(lazyFirst.value / lazyRows.value) + 1;
  const pageSize = lazyRows.value as 15 | 30 | 50;
  const cardMode = vista.value === 'tarjetas';
  const sortField = cardMode ? null : lazySortField.value || null;
  const sortOrder = cardMode
    ? null
    : lazySortOrder.value === 1 || lazySortOrder.value === -1
      ? lazySortOrder.value
      : null;
  try {
    const res = await fetchProyectosList({
      page,
      pageSize,
      q: qDebounced.value,
      sortField,
      sortOrder,
      filterSquad: filterSquadDebounced.value || null,
      filterEstado: filterEstadoDebounced.value || null,
      filterMes: filterMesDebounced.value || null,
      filterEvolution: filterEvolutionDebounced.value || null,
      cardOrder: cardMode,
    });
    rows.value = res.data;
    totalRecords.value = res.meta.total;
  } catch (e) {
    const st = (e as Error & { status?: number }).status;
    if (st === 503) {
      loadError.value =
        'El listado de proyectos no está disponible (servicio sin base de datos). Contacte a TI o use un entorno con API configurada.';
    } else {
      loadError.value =
        e instanceof Error && e.message.trim()
          ? e.message.trim()
          : 'No se pudo cargar el listado de proyectos. Compruebe la sesión y el servidor.';
    }
    rows.value = [];
    totalRecords.value = 0;
  } finally {
    loading.value = false;
  }
}

function onSort(): void {
  void loadRemote();
}

function onPaginator(e: { page: number; first: number; rows: number }): void {
  lazyFirst.value = e.first;
  lazyRows.value = e.rows as 15 | 30 | 50;
  void loadRemote();
}

function semaforoLabel(s: ProyectoListItemApi['semaforo']): string {
  if (s === 'gris') {
    return 'Pendiente planificar';
  }
  if (s === 'verde') {
    return 'En tiempo';
  }
  if (s === 'ambar') {
    return 'Atención';
  }
  return 'Riesgo / vencido';
}

function saludLabel(row: ProyectoListItemApi): string {
  if (row.avanceRealPct == null) {
    return 'PENDIENTE % REAL';
  }
  if (row.saludProyecto === 'gris') {
    return 'PENDIENTE % REAL';
  }
  if (row.saludProyecto === 'verde') {
    return 'Verde';
  }
  if (row.saludProyecto === 'ambar') {
    return `Amarillo${row.saludProyectoDesfasePct == null ? '' : ` (${row.saludProyectoDesfasePct}% desfase)`}`;
  }
  return `Rojo${row.saludProyectoDesfasePct == null ? '' : ` (${row.saludProyectoDesfasePct}% desfase)`}`;
}

function saludTone(row: ProyectoListItemApi): ProyectoListItemApi['saludProyecto'] {
  return row.avanceRealPct == null ? 'gris' : row.saludProyecto;
}

function estadoProyectoTone(estado: string): 'gris' | 'azul' | 'rojo' | 'verde' {
  const t = String(estado ?? '').trim().toLowerCase();
  if (t.includes('bloque')) {
    return 'rojo';
  }
  if (t.includes('cerrad') || t.includes('complet')) {
    return 'verde';
  }
  if (t.includes('progreso')) {
    return 'azul';
  }
  return 'gris';
}

function formatSquad(value: string | null | undefined): string {
  const clean = String(value ?? '').replace(/^Squad:\s*/i, '').trim();
  return clean || 'No aplica';
}

function parsePapToIso(value: string | null | undefined): string {
  const s = String(value ?? '').trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

function avancePlanificadoListado(row: ProyectoListItemApi): number {
  const calc = calcularAvancePlanificadoProyecto(
    row.fechaInicioPlan ?? null,
    row.fechaFinPlan ?? parsePapToIso(row.papFinPlan),
  );
  return calc ?? row.porcentajeAvance;
}

function requestDelete(row: ProyectoListItemApi): void {
  if (!canGestorUi.value) {
    return;
  }
  confirm.require({
    message: `¿Eliminar el proyecto «${row.nombreAlcance}»? Esta acción no se puede deshacer.`,
    header: 'Confirmar eliminación',
    icon: 'pi pi-trash',
    acceptLabel: 'Sí, eliminar',
    rejectLabel: 'Cancelar',
    defaultFocus: 'reject',
    rejectClass: 'p-button-secondary',
    acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await deleteProyectoApi(row.id);
        await loadRemote();
      } catch {
        loadError.value = 'No se pudo eliminar el proyecto.';
      }
    },
  });
}

function onCreatedProject(): void {
  nuevoOpen.value = false;
  lazyFirst.value = 0;
  void loadRemote();
}

onMounted(() => {
  try {
    const s = sessionStorage.getItem(VISTA_SESSION_KEY);
    if (s === 'tarjetas' || s === 'lista') {
      vista.value = s;
    }
  } catch {
    /* ignore */
  }
  void loadRemote();
});
</script>

<template>
  <div class="pr">
    <header class="pr__head">
      <div class="pr__head-row">
        <h2 class="pr__title">Proyectos</h2>
        <div v-if="canGestorUi" class="pr__head-actions">
          <RouterLink v-slot="{ href, navigate }" custom :to="{ name: 'proyectos-papelera' }">
            <IsButton
              severity="secondary"
              outlined
              icon="pi pi-trash"
              label="Papelera"
              :href="href"
              @click="navigate()"
            />
          </RouterLink>
          <IsButton severity="primary" icon="pi pi-plus" label="Nuevo Proyecto" @click="nuevoOpen = true" />
        </div>
      </div>
      <p class="pr__hint">
        Proyectos gestionados por el equipo de Apex, que se encuentran fuera del desarrollo de las tribus de
        desarrollo.
      </p>
    </header>

    <p v-if="loadError" class="pr__err" role="alert">{{ loadError }}</p>

    <div class="pr__controls">
      <div class="pr__filters">
        <IsInputText
          v-model="filterSquad"
          class="pr__filter-squad"
          placeholder="Squad / proveedor (contiene)"
          fluid
        />
        <div class="pr__filter-estado">
          <label for="pr-filter-estado" class="pr__mes-label">Estado</label>
          <IsSelect
            input-id="pr-filter-estado"
            :model-value="filterEstado"
            placeholder="Todos"
            :options="estadoFilterOptions"
            option-label="label"
            option-value="value"
            fluid
            @update:model-value="(v) => (filterEstado = String(v ?? ''))"
          />
        </div>
        <div v-if="false" class="pr__filter-mes">
          <!-- Filtro temporalmente oculto. Se conserva para reactivarlo sin cambios de API/store. -->
          <AppMonthPicker
            class="pr__mes-input"
            :model-value="filterMes"
            label="Período (mes Fecha Fin Plan.)"
            @update:model-value="(v: string | null) => (filterMes = v ?? '')"
          />
        </div>
        <div class="pr__filter-evolution">
          <label for="pr-filter-evolution" class="pr__mes-label">Evolution</label>
          <IsSelect
            input-id="pr-filter-evolution"
            :model-value="filterEvolution"
            placeholder="Todos"
            :options="evolutionFilterOptions"
            option-label="label"
            option-value="value"
            fluid
            @update:model-value="(v) => (filterEvolution = v === 'si' || v === 'no' ? v : '')"
          />
        </div>
      </div>
      <div class="pr__controls-right">
        <IsSelectButton
          :model-value="vista"
          :options="vistaOptions"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          data-key="value"
          aria-label="Vista de listado"
          class="pr__view"
          @update:model-value="(v) => setVista(v === 'tarjetas' ? 'tarjetas' : 'lista')"
        >
          <template #option="{ option }">
            <i :class="option.icon" aria-hidden="true" />
            <span class="pr__view-toggle-label">{{ option.label }}</span>
          </template>
        </IsSelectButton>
        <div class="pr__search-wrap">
          <IsIconField>
            <IsInputIcon class="pi pi-search" />
            <IsInputText
              v-model="globalFilter"
              placeholder="Buscar squad, nombre, IT PM…"
              fluid
            />
          </IsIconField>
        </div>
      </div>
    </div>

    <div class="pr__meta-row">
      <span class="pr__count">{{ counterLabel }}</span>
    </div>

    <IsDataTable
      v-show="vista === 'lista'"
      v-model:sort-field="lazySortField"
      v-model:sort-order="lazySortOrder"
      lazy
      removable-sort
      sort-mode="single"
      data-key="id"
      striped-rows
      :value="rows"
      :loading="loading"
      :paginator="false"
      class="pr__table"
      :pt="{ root: { class: 'p-datatable-sm' } }"
      @sort="onSort"
    >
      <template #empty>
        <div v-if="!loading && !loadError" class="pr__empty">
          <p class="pr__empty-title">No hay proyectos registrados.</p>
          <p v-if="canGestorUi" class="pr__empty-text">
            Haz clic en «+ Nuevo Proyecto» para comenzar.
          </p>
        </div>
      </template>

      <IsColumn field="squadProveedor" header="Squad" sortable style="min-width: 10rem">
        <template #body="{ data }">{{ formatSquad((data as ProyectoListItemApi).squadProveedor) }}</template>
      </IsColumn>
      <IsColumn field="nombreAlcance" header="Nombre del Proyecto" sortable style="min-width: 14rem">
        <template #body="{ data }">
          <RouterLink
            class="pr__project-link"
            :to="{ name: 'proyecto-detail', params: { id: (data as ProyectoListItemApi).id } }"
          >
            {{ (data as ProyectoListItemApi).nombreAlcance }}
          </RouterLink>
        </template>
      </IsColumn>
      <IsColumn field="estadoTexto" sortable style="min-width: 11rem">
        <template #header>
          <span class="pr__th">
            Estado
            <IsButton
              class="pr__info"
              text
              rounded
              size="small"
              icon="pi pi-info-circle"
              aria-label="Ver leyenda de estados"
              @click="toggleEstadoLegend($event)"
            />
            <IsPopover ref="estadoLegend">
              <div class="pr__legend">
                <strong>Leyenda de estados</strong>
                <span><b>PENDIENTE PLANIFICAR:</b> El proyecto fue registrado pero aún no ha comenzado. La fecha de inicio planificada es posterior a la fecha actual.</span>
                <span><b>ACTIVO:</b> El proyecto está activo. La fecha de inicio planificada ya pasó y la fecha fin planificada aún no ha llegado.</span>
                <span><b>COMPLETADO:</b> El proyecto ha concluido. Fue marcado manualmente como cerrado por el gestor o administrador.</span>
                <span><b>CANCELADO:</b> El proyecto fue dado de baja antes de su finalización.</span>
              </div>
            </IsPopover>
          </span>
        </template>
        <template #body="{ data }">
          <IsTag
            class="pr__tag"
            rounded
            :severity="toneToSeverity(estadoProyectoTone((data as ProyectoListItemApi).estadoTexto))"
            :value="(data as ProyectoListItemApi).estadoTexto"
            :title="(data as ProyectoListItemApi).estadoTexto"
          />
        </template>
      </IsColumn>
      <IsColumn field="itProjectManager" sortable style="min-width: 10rem">
        <template #header>
          <span class="pr__th">
            IT PM
            <IsButton
              v-tooltip.top="'IT Project Manager: responsable de la gestión y seguimiento del proyecto desde el área de TI.'"
              class="pr__info"
              text
              rounded
              size="small"
              icon="pi pi-info-circle"
              aria-label="Informacion sobre IT PM"
            />
          </span>
        </template>
      </IsColumn>
      <IsColumn field="papFinPlan" header="Fecha Fin Plan." sortable style="min-width: 8rem" />
      <IsColumn field="porcentajeAvance" sortable style="min-width: 9rem">
        <template #header>
          <span class="pr__th">
            % Avance planificado
            <IsButton
              v-tooltip.top="'Porcentaje calculado automáticamente en función a la fecha de inicio y fin planificadas del proyecto respecto a la fecha actual. Refleja cuánto debería haberse avanzado según el cronograma.'"
              class="pr__info"
              text
              rounded
              size="small"
              icon="pi pi-info-circle"
              aria-label="Informacion sobre avance planificado"
            />
          </span>
        </template>
        <template #body="{ data }"> {{ avancePlanificadoListado(data as ProyectoListItemApi) }}% </template>
      </IsColumn>
      <IsColumn field="avanceRealPct" header="% Avance real" sortable style="min-width: 8rem">
        <template #body="{ data }">
          {{ (data as ProyectoListItemApi).avanceRealPct == null ? 'Pend.' : `${(data as ProyectoListItemApi).avanceRealPct}%` }}
        </template>
      </IsColumn>
      <IsColumn field="saludProyecto" sortable style="min-width: 11rem">
        <template #header>
          <span class="pr__th">
            Salud del proyecto
            <IsButton
              v-tooltip.top="'Indicador que compara el % de avance planificado vs. el % de avance real ingresado. Su estado varía según la brecha entre ambos valores.'"
              class="pr__info"
              text
              rounded
              size="small"
              icon="pi pi-info-circle"
              aria-label="Informacion sobre salud del proyecto"
            />
          </span>
        </template>
        <template #body="{ data }">
          <IsTag
            class="pr__tag"
            rounded
            :severity="toneToSeverity(saludTone(data as ProyectoListItemApi))"
            :value="saludLabel(data as ProyectoListItemApi)"
            :title="saludLabel(data as ProyectoListItemApi)"
          />
        </template>
      </IsColumn>
      <IsColumn field="acciones" header="Acciones" sortable style="min-width: 8rem">
        <template #body="{ data }">
          <span class="pr__actions">
            <RouterLink class="pr__link" :to="{ name: 'proyecto-detail', params: { id: (data as ProyectoListItemApi).id } }">
              Ver
            </RouterLink>
            <IsButton
              v-if="canGestorUi"
              severity="danger"
              text
              rounded
              size="small"
              icon="pi pi-trash"
              aria-label="Eliminar proyecto"
              title="Eliminar"
              @click="requestDelete(data as ProyectoListItemApi)"
            />
          </span>
        </template>
      </IsColumn>
    </IsDataTable>

    <div v-show="vista === 'tarjetas'" class="pr__cards" :aria-busy="loading">
      <template v-if="loading">
        <div v-for="i in 8" :key="i" class="pr__card pr__card--skeleton">
          <span class="apex-skeleton" style="width: 75%; height: 1rem;" />
          <span class="apex-skeleton" style="width: 100%; height: 6px; border-radius: 6px;" />
          <span class="apex-skeleton" style="width: 35%; height: 0.75rem;" />
          <span class="apex-skeleton" style="width: 55%; height: 0.75rem;" />
        </div>
      </template>
      <RouterLink
        v-for="row in rows"
        :key="row.id"
        class="pr__card"
        :to="{ name: 'proyecto-detail', params: { id: row.id } }"
      >
        <div class="pr__card-head">
          <h3 class="pr__card-title">{{ row.nombreAlcance }}</h3>
          <span
            class="pr__dot"
            :class="`pr__dot--${row.semaforo}`"
            :title="semaforoLabel(row.semaforo)"
            aria-hidden="true"
          />
        </div>
        <div class="pr__card-bar-wrap" :title="`Avance ${avancePlanificadoListado(row)}%`">
          <div class="pr__card-bar" :style="{ width: `${Math.min(100, Math.max(0, avancePlanificadoListado(row)))}%` }" />
        </div>
        <p class="pr__card-pct">{{ avancePlanificadoListado(row) }}% avance</p>
        <dl class="pr__card-dl">
          <div>
            <dt>Fecha Fin Plan.</dt>
            <dd>{{ row.papFinPlan }}</dd>
          </div>
          <div>
            <dt>IT PM</dt>
            <dd>{{ row.itProjectManager }}</dd>
          </div>
        </dl>
        <span v-if="row.esEvolution" class="pr__evo">Evolution</span>
      </RouterLink>
      <p v-if="!loading && !rows.length && !loadError" class="pr__cards-empty">No hay proyectos para mostrar.</p>
    </div>

    <IsPaginator
      :first="lazyFirst"
      :rows="lazyRows"
      :total-records="totalRecords"
      :rows-per-page-options="[15, 30, 50]"
      template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown CurrentPageReport"
      current-page-report-template="Página {currentPage} de {totalPages} · {totalRecords} proyecto(s)"
      class="pr__paginator"
      @page="onPaginator"
    />

    <NuevoProyectoDialog v-if="canGestorUi" v-model:visible="nuevoOpen" @created="onCreatedProject" />
  </div>
</template>

<style scoped>
.pr__head {
  margin-bottom: 1rem;
}
.pr__head-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.4rem;
}
.pr__head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
}
.pr__title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: theme('colors.surface.800');
}
.pr__hint {
  margin: 0;
  font-size: 13px;
  color: theme('colors.surface.500');
  line-height: 1.55;
  max-width: 52rem;
}
.pr__err {
  margin: 0 0 1rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  background: #fff5f5;
  border: 1px solid rgba(241, 70, 73, 0.35);
  color: #9b1c26;
  font-size: 13px;
}

.pr__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem 1.5rem;
  margin-bottom: 0.75rem;
}
.pr__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1rem;
  flex: 1 1 280px;
  align-items: flex-end;
}
.pr__filter-squad {
  flex: 1 1 160px;
  min-width: 140px;
  max-width: 220px;
}
.pr__filter-estado {
  flex: 0 1 220px;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.pr__filter-mes {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.pr__filter-evolution {
  flex: 0 1 160px;
  min-width: 140px;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.pr__mes-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: theme('colors.surface.500');
}
.pr__mes-input {
  min-width: 11rem;
}
.pr__mes-input :deep(.app-month-picker__label) {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: theme('colors.surface.500');
  margin-bottom: 0.2rem;
}
.pr__mes-input :deep(.app-month-picker__control) {
  height: 2.5rem;
}
.pr__controls-right {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
  flex: 0 1 auto;
  margin-left: auto;
}
.pr__view :deep(.p-togglebutton-label),
.pr__view-toggle-label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}
.pr__view-toggle-label {
  font-weight: 600;
}
.pr__search-wrap {
  width: min(100%, 280px);
  min-width: 200px;
}
.pr__meta-row {
  margin-bottom: 0.65rem;
}
.pr__count {
  display: inline-flex;
  align-items: center;
  min-height: 1.6rem;
  padding: 0.2rem 0.65rem;
  border: 1px solid var(--apex-border-soft);
  border-radius: 999px;
  background: var(--apex-surface-panel);
  font-size: 13px;
  font-weight: 600;
  color: var(--apex-text-muted);
}

.pr__table {
  font-size: 13px;
  margin-bottom: 0.5rem;
}
.pr__table :deep(th),
.pr__table :deep(td) {
  text-align: center;
  vertical-align: middle;
}
.pr__table :deep(th .p-column-header-content) {
  justify-content: center;
}
.pr__th {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  white-space: nowrap;
}
.pr__info.p-button {
  width: 1.35rem;
  height: 1.35rem;
  padding: 0;
  color: theme('colors.interseguro-info.500');
}
.pr__info.p-button :deep(.p-button-icon) {
  font-size: 0.8rem;
}
.pr__info.p-button:hover {
  color: var(--apex-color-g100);
}
.pr__legend {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  width: min(22rem, 82vw);
  color: theme('colors.surface.700');
  font-size: 12px;
  font-weight: 500;
  line-height: 1.45;
  letter-spacing: 0;
  text-transform: none;
  white-space: normal;
  text-align: left;
}
.pr__legend strong {
  color: theme('colors.surface.800');
  font-size: 12px;
}

.pr__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
  margin-bottom: 0.75rem;
  min-height: 4rem;
}
.pr__cards-empty {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 14px;
  color: theme('colors.surface.500');
}
.pr__card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 1.1rem;
  border-radius: var(--apex-radius-panel);
  border: 1px solid var(--apex-border-soft);
  background: var(--apex-surface-panel);
  text-decoration: none;
  color: inherit;
  box-shadow: var(--apex-shadow-soft);
  transition:
    box-shadow 0.18s ease,
    border-color 0.18s ease,
    transform 0.12s ease;
}
.pr__card:hover {
  border-color: rgba(19, 97, 185, 0.32);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  transform: translateY(-2px);
}
.pr__card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.pr__card-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.35;
  color: theme('colors.surface.800');
}
.pr__dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.06);
}
.pr__dot--verde {
  background: var(--apex-color-gh);
}
.pr__dot--ambar {
  background: var(--apex-color-oy);
}
.pr__dot--rojo {
  background: var(--apex-color-re);
}
.pr__dot--gris {
  background: var(--apex-color-neutral);
}
.pr__card-bar-wrap {
  height: 6px;
  border-radius: 6px;
  background: var(--apex-border-soft);
  overflow: hidden;
}
.pr__card-bar {
  height: 100%;
  border-radius: 6px;
  background: linear-gradient(90deg, var(--apex-color-g100), var(--apex-color-lb100));
  transition: width 0.2s ease;
}
.pr__card-pct {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: theme('colors.surface.500');
}
.pr__card-dl {
  margin: 0;
  display: grid;
  gap: 0.35rem;
  font-size: 12px;
}
.pr__card-dl dt {
  margin: 0;
  font-weight: 700;
  color: theme('colors.surface.500');
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.pr__card-dl dd {
  margin: 0;
  color: theme('colors.surface.800');
  font-weight: 600;
}
.pr__evo {
  align-self: flex-start;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(19, 97, 185, 0.1);
  color: var(--apex-color-g100);
}

.pr__paginator {
  margin-top: 0.25rem;
  border-radius: 8px;
}

.pr__tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
  max-width: 100%;
}
.pr__actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
}
.pr__project-link {
  color: theme('colors.interseguro-info.500');
  cursor: pointer;
  font-weight: 700;
  text-decoration: none;
}
.pr__project-link:hover,
.pr__project-link:focus-visible {
  color: var(--apex-color-g100);
  text-decoration: underline;
  outline: none;
}
.pr__link {
  font-size: 13px;
  font-weight: 700;
  color: theme('colors.interseguro-info.500');
  text-decoration: none;
}
.pr__link:hover {
  text-decoration: underline;
}
.pr__empty {
  padding: 2rem 1.5rem;
  text-align: center;
}
.pr__empty-title {
  margin: 0 0 0.35rem;
  font-size: 1rem;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.pr__empty-text {
  margin: 0;
  font-size: 13px;
  color: theme('colors.surface.500');
  line-height: 1.5;
  max-width: 28rem;
  margin-inline: auto;
}

@media (max-width: 900px) {
  .pr__head-row,
  .pr__controls {
    align-items: stretch;
    flex-direction: column;
  }

  .pr__head-actions,
  .pr__controls-right,
  .pr__filters {
    width: 100%;
  }

  .pr__search-wrap {
    width: min(100%, 28rem);
  }
}

@media (max-width: 640px) {
  .pr__head-actions,
  .pr__controls-right,
  .pr__filters {
    flex-direction: column;
    align-items: stretch;
  }

  .pr__search-wrap,
  .pr__filter-squad,
  .pr__filter-estado,
  .pr__filter-mes,
  .pr__filter-evolution {
    width: 100%;
    max-width: none;
  }

  .pr__view {
    width: 100%;
  }

  .pr__card-head {
    flex-direction: column;
  }

  .pr__dot {
    align-self: flex-start;
  }
}

/* ── Animaciones de entrada ──────────────────────────────────── */
.pr__head { animation: apex-fade-in 0.22s ease-out both; }
.pr__controls { animation: apex-fade-in 0.22s ease-out 0.04s both; }
.pr__cards { animation: apex-fade-in 0.22s ease-out 0.08s both; }

.pr__card {
  animation: apex-fade-in 0.25s ease-out both;
}

/* Barra de avance con animación al montar */
.pr__card-bar {
  transform-origin: left center;
  animation: apex-bar-grow 0.9s cubic-bezier(0.4, 0, 0.2, 1) 0.1s both;
}

/* Skeleton card placeholder */
.pr__card--skeleton {
  pointer-events: none;
  gap: 0.75rem;
}
</style>
