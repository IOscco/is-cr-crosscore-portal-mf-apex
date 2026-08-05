<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { IsDataTable, IsColumn, IsInputText, IsIconField, IsInputIcon, IsDialog, IsButton } from 'is-uikit-components-vue';
import BadgePill from '@/components/ui/BadgePill.vue';
import type { GtiTicket } from '@/lib/incidentes-gti-types';
import { formatGtiDate } from '@/lib/incidentes-gti-live-cache';
import { estadoTicketToPillVariant } from '@/lib/estado-badge';
import { incidentesGtiLiveKey } from '@/composables/useIncidentesGtiLive';
import { calcularAlertaIncidente, type NivelAlerta } from '@/lib/incidentes-gti-alerta';

type GtiTicketRow = GtiTicket & { alertaDiasSort: number };
type AlertFilter = 'TODOS' | NivelAlerta;

interface SummaryCard {
  key: string;
  label: string;
  value: string;
  icon: string;
  tone: 'blue' | 'amber' | 'green' | 'orange' | 'red' | 'slate';
}

const alertOptions: { val: AlertFilter; label: string; color: string }[] = [
  { val: 'TODOS', label: 'Todos', color: '#1361B9' },
  { val: 'OK', label: 'OK', color: '#00B555' },
  { val: 'ALERTA', label: '>15 días', color: '#F0AA00' },
  { val: 'CRITICO', label: '>30 días', color: '#F14649' },
  { val: 'SIN_FECHA', label: 'Sin fecha', color: '#9E9E9E' },
  { val: 'NO_APLICA', label: 'No aplica', color: '#94A3B8' },
];

const route = useRoute();
const store = inject(incidentesGtiLiveKey);

const globalFilter = ref('');
const filtroAlerta = ref<AlertFilter>('TODOS');
const filtroSquad = ref<string>('TODOS');
const detailOpen = ref(false);
const selected = ref<GtiTicketRow | null>(null);

function displayValue(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim();
  return normalized || '—';
}

const routeName = computed(() => String(route.name ?? ''));
const isResolvedView = computed(() => routeName.value === 'incidentes-g3');
const isSinSquadView = computed(() => routeName.value === 'incidentes-sin-squad');
const isSoporteView = computed(() => routeName.value === 'incidentes-soporte');

const ticketsRaw = computed<GtiTicket[]>(() => {
  if (!store) {
    return [];
  }
  if (routeName.value === 'incidentes-g1') {
    return store.byGrupo.g1;
  }
  if (routeName.value === 'incidentes-g2') {
    return store.byGrupo.g2;
  }
  if (routeName.value === 'incidentes-g3') {
    return store.byGrupo.g3;
  }
  if (routeName.value === 'incidentes-otros') {
    return store.byGrupo.otros;
  }
  if (routeName.value === 'incidentes-soporte') {
    return store.byGrupo.soporteNegocio;
  }
  if (routeName.value === 'incidentes-sin-squad') {
    return store.byGrupo.sinSquad;
  }
  return [];
});

const ticketsResueltos = computed<GtiTicket[]>(() => ticketsRaw.value);

watch(
  () => route.name,
  () => {
    globalFilter.value = '';
    filtroAlerta.value = 'TODOS';
    filtroSquad.value = 'TODOS';
  },
);

const ticketsFiltrados = computed<GtiTicketRow[]>(() => {
  let lista = ticketsResueltos.value;

  if (filtroAlerta.value !== 'TODOS') {
    lista = lista.filter(
      (ticket) => calcularAlertaIncidente(ticket.fechaUltimoEstado, ticket.estadoActual).nivel === filtroAlerta.value,
    );
  }

  if (!isSinSquadView.value && !isSoporteView.value) {
    if (filtroSquad.value === 'SIN_SQUAD') {
      lista = lista.filter((ticket) => !ticket.squad);
    } else if (filtroSquad.value !== 'TODOS') {
      lista = lista.filter((ticket) => ticket.squad === filtroSquad.value);
    }
  }

  if (globalFilter.value.trim()) {
    const q = globalFilter.value.trim().toLowerCase();
    lista = lista.filter((ticket) => {
      return (
        ticket.gti.toLowerCase().includes(q) ||
        ticket.subcategoria?.toLowerCase().includes(q) ||
        ticket.sistema?.toLowerCase().includes(q) ||
        ticket.estadoActual?.toLowerCase().includes(q) ||
        ticket.usuarioActual?.toLowerCase().includes(q) ||
        ticket.usuarioResolutor?.toLowerCase().includes(q) ||
        ticket.squad?.toLowerCase().includes(q)
      );
    });
  }

  return lista.map((ticket) => ({
    ...ticket,
    alertaDiasSort: calcularAlertaIncidente(ticket.fechaUltimoEstado, ticket.estadoActual).dias ?? Number.MAX_SAFE_INTEGER,
  }));
});

const squadsDisponibles = computed(() => {
  const unicos = [...new Set(ticketsResueltos.value.map((ticket) => ticket.squad ?? 'SIN_SQUAD'))].sort();
  return ['TODOS', ...unicos];
});

function openDetail(ticket: GtiTicketRow): void {
  selected.value = ticket;
  detailOpen.value = true;
}

function closeDetail(): void {
  detailOpen.value = false;
  selected.value = null;
}

const detailRow = computed(() => selected.value);

function alertBadgeStyle(ticket: GtiTicket): Record<string, string> {
  const alerta = calcularAlertaIncidente(ticket.fechaUltimoEstado, ticket.estadoActual);
  return {
    backgroundColor: alerta.color,
    color: '#fff',
    borderRadius: '999px',
    padding: '3px 12px',
    fontSize: '12px',
    fontFamily: 'Helvetica Neue',
    fontWeight: '700',
    display: 'inline-block',
  };
}

const title = computed(() => String(route.meta.title ?? 'Incidentes'));
const hint = computed(() => String(route.meta.hint ?? ''));

const headerTone = computed(() => {
  switch (routeName.value) {
    case 'incidentes-g1':
      return {
        soft: 'rgba(240, 170, 0, 0.12)',
        text: '#8A5B00',
        label: 'Bandeja G1',
        icon: 'pi pi-clock',
        accent: '#F0AA00',
      };
    case 'incidentes-g2':
      return {
        soft: 'rgba(19, 97, 185, 0.12)',
        text: '#1361B9',
        label: 'Bandeja G2',
        icon: 'pi pi-users',
        accent: '#1361B9',
      };
    case 'incidentes-g3':
      return {
        soft: 'rgba(0, 181, 85, 0.12)',
        text: '#007A3A',
        label: 'Bandeja G3',
        icon: 'pi pi-check-circle',
        accent: '#00B555',
      };
    case 'incidentes-soporte':
      return {
        soft: 'rgba(2, 132, 199, 0.12)',
        text: '#0369A1',
        label: 'Soporte al Negocio',
        icon: 'pi pi-briefcase',
        accent: '#0284C7',
      };
    case 'incidentes-sin-squad':
      return {
        soft: 'rgba(249, 115, 22, 0.12)',
        text: '#C2410C',
        label: 'Clasificación pendiente',
        icon: 'pi pi-exclamation-triangle',
        accent: '#F97316',
      };
    default:
      return {
        soft: 'rgba(139, 92, 246, 0.12)',
        text: '#6D28D9',
        label: 'Otros estados',
        icon: 'pi pi-th-large',
        accent: '#8B5CF6',
      };
  }
});

const sinSquadCount = computed(() => ticketsResueltos.value.filter((ticket) => !ticket.squad).length);
const alertadosCount = computed(
  () =>
    ticketsResueltos.value.filter(
      (ticket) => calcularAlertaIncidente(ticket.fechaUltimoEstado, ticket.estadoActual).nivel === 'ALERTA',
    ).length,
);
const criticosCount = computed(
  () =>
    ticketsResueltos.value.filter(
      (ticket) => calcularAlertaIncidente(ticket.fechaUltimoEstado, ticket.estadoActual).nivel === 'CRITICO',
    ).length,
);
const noAplicaCount = computed(
  () =>
    ticketsResueltos.value.filter(
      (ticket) => calcularAlertaIncidente(ticket.fechaUltimoEstado, ticket.estadoActual).nivel === 'NO_APLICA',
    ).length,
);
const rechazadosCount = computed(
  () =>
    ticketsResueltos.value.filter((ticket) =>
      String(ticket.estadoActual ?? '')
        .trim()
        .toLowerCase()
        .includes('rechazado'),
    ).length,
);

const summaryCards = computed<SummaryCard[]>(() => {
  if (isResolvedView.value) {
    return [
      { key: 'bandeja', label: 'En bandeja', value: String(ticketsResueltos.value.length), icon: 'pi pi-inbox', tone: 'blue' },
      {
        key: 'cerrados',
        label: 'Cerrados',
        value: String(ticketsResueltos.value.length - rechazadosCount.value),
        icon: 'pi pi-check-circle',
        tone: 'green',
      },
      { key: 'rechazados', label: 'Rechazados', value: String(rechazadosCount.value), icon: 'pi pi-times-circle', tone: 'red' },
      { key: 'noaplica', label: 'Alerta', value: noAplicaCount.value ? 'No aplica' : '—', icon: 'pi pi-ban', tone: 'slate' },
    ];
  }

  if (isSoporteView.value) {
    return [
      { key: 'bandeja', label: 'En bandeja', value: String(ticketsResueltos.value.length), icon: 'pi pi-inbox', tone: 'blue' },
      {
        key: 'cerrados',
        label: 'Resueltos',
        value: String(
          ticketsResueltos.value.filter((ticket) => calcularAlertaIncidente(ticket.fechaUltimoEstado, ticket.estadoActual).nivel === 'NO_APLICA').length,
        ),
        icon: 'pi pi-check-circle',
        tone: 'green',
      },
      { key: 'alerta15', label: '>15 días', value: String(alertadosCount.value), icon: 'pi pi-history', tone: 'amber' },
      { key: 'alerta30', label: '>30 días', value: String(criticosCount.value), icon: 'pi pi-exclamation-triangle', tone: 'red' },
    ];
  }

  if (isSinSquadView.value) {
    return [
      { key: 'bandeja', label: 'En bandeja', value: String(ticketsResueltos.value.length), icon: 'pi pi-inbox', tone: 'blue' },
      { key: 'pendientes', label: 'Pendientes', value: String(ticketsResueltos.value.length), icon: 'pi pi-tags', tone: 'orange' },
      { key: 'alerta15', label: '>15 días', value: String(alertadosCount.value), icon: 'pi pi-history', tone: 'amber' },
      { key: 'alerta30', label: '>30 días', value: String(criticosCount.value), icon: 'pi pi-exclamation-triangle', tone: 'red' },
    ];
  }

  return [
    { key: 'bandeja', label: 'En bandeja', value: String(ticketsResueltos.value.length), icon: 'pi pi-inbox', tone: 'blue' },
    { key: 'sinSquad', label: 'Sin squad', value: String(sinSquadCount.value), icon: 'pi pi-user-minus', tone: 'orange' },
    { key: 'alerta15', label: '>15 días', value: String(alertadosCount.value), icon: 'pi pi-history', tone: 'amber' },
    { key: 'alerta30', label: '>30 días', value: String(criticosCount.value), icon: 'pi pi-exclamation-triangle', tone: 'red' },
  ];
});

const emptyTitle = computed(() => {
  if (store?.loading) {
    return 'Cargando tickets GTI';
  }
  if (store?.error) {
    return 'No se pudieron cargar tickets';
  }
  return ticketsResueltos.value.length ? 'Sin resultados para los filtros aplicados' : 'Sin tickets para esta bandeja';
});

const emptyCopy = computed(() => {
  if (store?.loading) {
    return 'Estamos consultando la API GTI y resolviendo la clasificación operativa.';
  }
  if (store?.error) {
    return store.error;
  }
  if (ticketsResueltos.value.length) {
    return 'Prueba limpiando búsqueda, alerta o squad para recuperar resultados.';
  }
  if (isSinSquadView.value) {
    return 'No hay tickets pendientes de clasificación de squad en este momento.';
  }
  if (store && !store.squadMatchAvailable) {
    return 'Los tickets se muestran por estado aunque el match de squads no esté disponible.';
  }
  return 'No hay tickets GTI dentro de esta agrupación operativa.';
});
</script>

<template>
  <div class="ig">
    <header class="ig__head">
      <div class="ig__head-main" :style="{ '--ig-accent': headerTone.accent }">
        <div class="ig__head-copy">
          <span class="ig__head-icon" :style="{ backgroundColor: headerTone.soft, color: headerTone.text }">
            <i :class="headerTone.icon" aria-hidden="true" />
          </span>
          <span class="ig__eyebrow" :style="{ backgroundColor: headerTone.soft, color: headerTone.text }">
            {{ headerTone.label }}
          </span>
          <h2 class="ig__title">{{ title }}</h2>
          <p v-if="hint" class="ig__hint">{{ hint }}</p>
        </div>

        <div class="ig__summary">
          <div v-for="card in summaryCards" :key="card.key" class="ig__summary-card" :data-tone="card.tone">
            <span class="ig__summary-icon">
              <i :class="card.icon" aria-hidden="true" />
            </span>
            <span class="ig__summary-label">{{ card.label }}</span>
            <strong class="ig__summary-value">{{ card.value }}</strong>
          </div>
        </div>
      </div>

      <p v-if="isSinSquadView" class="ig__note">
        Estos tickets requieren clasificación operativa porque no tienen match con squads de desarrollo ni marca de
        Soporte al Negocio. Soporte excluido de esta cola:
        {{ store?.conteos.soporteNegocio?.toLocaleString('es-PE') ?? '0' }} ticket(s).
      </p>
      <p v-else-if="isSoporteView" class="ig__note ig__note--info">
        Esta bandeja consolida tickets asociados al equipo de Soporte al Negocio. Se monitorea aparte y no forma parte
        del total operativo de tribus de desarrollo.
      </p>
      <p v-else-if="store && !store.squadMatchAvailable" class="ig__note ig__note--warning">
        El match de squads no está disponible. Para no dejar las bandejas vacías, los tickets se muestran clasificados
        por estado hasta que el módulo de configuración responda nuevamente.
      </p>
    </header>

    <section class="ig__controls">
      <div class="ig__controls-head">
        <div>
          <p class="ig__controls-title">Explora y filtra la bandeja</p>
          <p class="ig__controls-copy">
            La búsqueda, alerta y squad se combinan antes de paginar para mantener el conteo y la navegación correctos.
          </p>
        </div>
        <span class="ig__count">{{ ticketsFiltrados.length }} / {{ ticketsResueltos.length }} tickets</span>
      </div>

      <div class="ig__toolbar">
        <div class="ig__search-wrap">
          <IsIconField icon-position="left" class="w-full">
            <IsInputIcon class="pi pi-search" />
            <IsInputText v-model="globalFilter" placeholder="Buscar GTI, título, squad, estado..." fluid />
          </IsIconField>
        </div>
      </div>

      <div class="ig__filters">
        <div class="ig__filters-group">
          <span class="ig__filters-label">
            <i class="pi pi-bell" aria-hidden="true" />
            Alerta
          </span>
          <button
            v-for="opcion in alertOptions"
            :key="opcion.val"
            type="button"
            @click="filtroAlerta = opcion.val"
            :style="{
              backgroundColor: filtroAlerta === opcion.val ? opcion.color : '#fff',
              color: filtroAlerta === opcion.val ? '#fff' : '#666',
              border: `1px solid ${filtroAlerta === opcion.val ? opcion.color : '#E0E0E0'}`,
              borderRadius: '999px',
              padding: '5px 12px',
              fontSize: '12px',
              fontFamily: 'Helvetica Neue',
              cursor: 'pointer',
              fontWeight: filtroAlerta === opcion.val ? 700 : 500,
              transition: 'all 0.15s',
              boxShadow: filtroAlerta === opcion.val ? '0 8px 18px rgba(15, 23, 42, 0.08)' : 'none',
            }"
          >
            {{ opcion.label }}
          </button>
        </div>

        <div class="ig__filters-group">
          <span class="ig__filters-label">
            <i class="pi pi-users" aria-hidden="true" />
            Squad
          </span>
          <span v-if="isSinSquadView" class="ig__filters-fixed">
            <i class="pi pi-user-minus" aria-hidden="true" />
            Sin squad asignado
          </span>
          <span v-else-if="isSoporteView" class="ig__filters-fixed ig__filters-fixed--info">
            <i class="pi pi-briefcase" aria-hidden="true" />
            Soporte al Negocio
          </span>
          <select v-else v-model="filtroSquad" class="ig__filters-select">
            <option value="TODOS">Todos los squads</option>
            <option v-for="sq in squadsDisponibles.filter((s) => s !== 'TODOS')" :key="sq" :value="sq">
              {{ sq === 'SIN_SQUAD' ? 'Sin squad asignado' : sq }}
            </option>
          </select>
        </div>
      </div>
    </section>

    <section class="ig__table-shell">
      <div class="ig__table-head">
        <div>
          <p class="ig__table-eyebrow">Vista operativa</p>
          <h3 class="ig__table-title">
            {{ isSinSquadView ? 'Tickets pendientes de clasificación' : isSoporteView ? 'Tickets de Soporte al Negocio' : 'Tickets incidentes clasificados' }}
          </h3>
        </div>
      </div>

      <div class="ig__table-scroll">
        <IsDataTable
          :value="ticketsFiltrados"
          data-key="gti"
          striped-rows
          paginator
          :rows="20"
          :rows-per-page-options="[10, 20, 50]"
          sort-mode="multiple"
          removable-sort
          class="ig__table"
          :pt="{ root: { class: 'p-datatable-sm' } }"
        >
          <template #empty>
            <div class="ig__empty">
              <span class="ig__empty-icon">
                <i :class="store?.error ? 'pi pi-wifi' : 'pi pi-inbox'" aria-hidden="true" />
              </span>
              <strong>{{ emptyTitle }}</strong>
              <span>{{ emptyCopy }}</span>
            </div>
          </template>

          <IsColumn field="gti" header="GTI" sortable style="min-width: 5.5rem">
            <template #body="{ data }">
              <button type="button" class="ig__gti-link" @click="openDetail(data as GtiTicketRow)">
                {{ (data as GtiTicketRow).gti }}
              </button>
            </template>
          </IsColumn>
          <IsColumn field="subcategoria" header="Subcategoría" sortable style="min-width: 10rem" />
          <IsColumn field="sistema" header="Sistema" sortable style="min-width: 8rem">
            <template #body="{ data }">
              {{ displayValue((data as GtiTicketRow).sistema) }}
            </template>
          </IsColumn>
          <IsColumn field="estadoActual" header="Estado Actual" sortable style="min-width: 10rem">
            <template #body="{ data }">
              <span v-if="!String((data as GtiTicketRow).estadoActual ?? '').trim()" class="ig__em">—</span>
              <BadgePill
                v-else
                :variant="estadoTicketToPillVariant((data as GtiTicketRow).estadoActual ?? '')"
                :title="(data as GtiTicketRow).estadoActual ?? ''"
              >
                {{ (data as GtiTicketRow).estadoActual }}
              </BadgePill>
            </template>
          </IsColumn>
          <IsColumn field="usuarioActual" header="Usuario Actual" sortable style="min-width: 9rem">
            <template #body="{ data }">
              {{ displayValue((data as GtiTicketRow).usuarioActual) }}
            </template>
          </IsColumn>
          <IsColumn field="squad" header="Squad" sortable style="min-width: 8rem">
            <template #body="{ data }">
              {{ displayValue((data as GtiTicketRow).squad) }}
            </template>
          </IsColumn>
          <IsColumn field="tpo" header="TPO" sortable style="min-width: 9rem">
            <template #body="{ data }">
              {{ displayValue((data as GtiTicketRow).tpo) }}
            </template>
          </IsColumn>
          <IsColumn field="fechaUltimoEstado" header="Fecha Último Estado" sortable style="min-width: 9rem">
            <template #body="{ data }">
              {{ formatGtiDate((data as GtiTicketRow).fechaUltimoEstado) }}
            </template>
          </IsColumn>
          <IsColumn field="alertaDiasSort" header="Alerta" sortable style="min-width: 8rem">
            <template #body="{ data }">
              <span :style="alertBadgeStyle(data as GtiTicketRow)">
                {{ calcularAlertaIncidente((data as GtiTicketRow).fechaUltimoEstado, (data as GtiTicketRow).estadoActual).label }}
              </span>
            </template>
          </IsColumn>
        </IsDataTable>
      </div>
    </section>

    <IsDialog
      v-model:visible="detailOpen"
      modal
      :dismissable-mask="true"
      :closable="false"
      class="ig__dlg"
      :style="{ width: 'min(740px, 96vw)' }"
      :content-style="{ padding: '0' }"
      @hide="selected = null"
    >
      <template #header>
        <div class="ig__dlg-head">
          <span class="ig__dlg-icon">
            <i class="pi pi-ticket" aria-hidden="true" />
          </span>
          <div class="ig__dlg-head-copy">
            <p class="ig__dlg-eyebrow">Detalle del ticket</p>
            <span id="ig-dlg-title" class="ig__dlg-title" role="heading" aria-level="2">GTI {{ detailRow?.gti ?? '' }}</span>
          </div>
          <button type="button" class="ig__dlg-x" aria-label="Cerrar" @click="closeDetail">
            <i class="pi pi-times" aria-hidden="true" />
          </button>
        </div>
      </template>

      <div v-if="detailRow" class="ig__dlg-body">
        <div class="ig__dlg-panel">
          <section class="ig__dlg-block">
            <p class="ig__dlg-section">
              <i class="pi pi-list" aria-hidden="true" />
              Resumen del ticket
            </p>
            <dl class="ig__dlg-grid">
              <dt>Subcategoría</dt>
              <dd>{{ displayValue(detailRow.subcategoria) }}</dd>
              <dt>Sistema</dt>
              <dd>{{ displayValue(detailRow.sistema) }}</dd>
              <dt>Estado Actual</dt>
              <dd>
                <span v-if="!String(detailRow.estadoActual ?? '').trim()">—</span>
                <BadgePill v-else :variant="estadoTicketToPillVariant(detailRow.estadoActual ?? '')" :title="detailRow.estadoActual ?? ''">
                  {{ detailRow.estadoActual }}
                </BadgePill>
              </dd>
              <dt>Usuario Actual</dt>
              <dd>{{ displayValue(detailRow.usuarioActual) }}</dd>
              <dt>Squad</dt>
              <dd>{{ displayValue(detailRow.squad) }}</dd>
              <dt>TPO</dt>
              <dd>{{ displayValue(detailRow.tpo) }}</dd>
              <dt>Fecha Último Estado</dt>
              <dd>{{ formatGtiDate(detailRow.fechaUltimoEstado) }}</dd>
              <dt>Alerta</dt>
              <dd>
                <span :style="alertBadgeStyle(detailRow)">
                  {{ calcularAlertaIncidente(detailRow.fechaUltimoEstado, detailRow.estadoActual).label }}
                </span>
              </dd>
            </dl>
          </section>

          <section class="ig__dlg-block ig__dlg-block--accent">
            <p class="ig__dlg-section ig__dlg-section--accent">
              <i class="pi pi-info-circle" aria-hidden="true" />
              Detalle adicional
            </p>
            <dl class="ig__dlg-grid">
              <dt>Área</dt>
              <dd>{{ displayValue(detailRow.area) }}</dd>
              <dt>Usuario Resolutor</dt>
              <dd>{{ displayValue(detailRow.usuarioResolutor) }}</dd>
              <dt>Fecha Registro</dt>
              <dd>{{ formatGtiDate(detailRow.fechaRegistro) }}</dd>
              <dt>Fecha Último Estado</dt>
              <dd>{{ formatGtiDate(detailRow.fechaUltimoEstado) }}</dd>
              <dt>Título</dt>
              <dd class="ig__dlg-titulo">{{ displayValue(detailRow.titulo) }}</dd>
              <dt>Descripción</dt>
              <dd class="ig__dlg-descripcion">{{ detailRow.descripcion ?? '—' }}</dd>
            </dl>
          </section>
        </div>

        <div class="ig__dlg-foot">
          <IsButton severity="secondary" outlined label="Cerrar" @click="closeDetail" />
        </div>
      </div>
    </IsDialog>
  </div>
</template>

<style scoped>
.ig {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 360px;
}

.ig__head {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.ig__head-main {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem 1.25rem;
  padding: 1.3rem 1.35rem;
  border-radius: 20px;
  border: 1px solid rgba(19, 97, 185, 0.1);
  border-top: 4px solid var(--ig-accent, #1361b9);
  background: linear-gradient(180deg, rgba(232, 241, 252, 0.88) 0%, rgba(255, 255, 255, 0.98) 100%);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.06);
}

.ig__head-copy {
  flex: 1 1 24rem;
  min-width: 18rem;
}

.ig__head-icon {
  display: inline-grid;
  place-items: center;
  width: 42px;
  height: 42px;
  margin-right: 0.55rem;
  border-radius: 14px;
  vertical-align: middle;
}

.ig__eyebrow {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 0.65rem;
}

.ig__note {
  margin: 0;
  font-size: 12px;
  color: #7c2d12;
  line-height: 1.55;
  max-width: 58rem;
  padding: 0.7rem 0.85rem;
  background: #fff7ed;
  border-radius: 14px;
  border: 1px solid #fed7aa;
}

.ig__note--warning {
  color: #8a5b00;
  background: rgba(240, 170, 0, 0.1);
  border-color: rgba(240, 170, 0, 0.35);
}

.ig__note--info {
  color: #0f4c81;
  background: rgba(2, 132, 199, 0.08);
  border-color: rgba(2, 132, 199, 0.22);
}

.ig__title {
  margin: 0 0 0.45rem;
  font-family: Omnes, system-ui, sans-serif;
  font-size: 1.32rem;
  font-weight: 800;
  letter-spacing: 0.01em;
  color: #07132f;
}

.ig__hint {
  margin: 0;
  max-width: 50rem;
  font-size: 13px;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #496275;
  line-height: 1.58;
}

.ig__summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(135px, 1fr));
  gap: 0.8rem;
  min-width: min(100%, 360px);
}

.ig__summary-card {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 0.15rem 0.65rem;
  align-items: center;
  padding: 0.9rem 1rem;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #e6edf5;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
}

.ig__summary-icon {
  grid-row: span 2;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 12px;
}

.ig__summary-card[data-tone='blue'] .ig__summary-icon {
  background: rgba(19, 97, 185, 0.12);
  color: #1361b9;
}

.ig__summary-card[data-tone='amber'] .ig__summary-icon {
  background: rgba(240, 170, 0, 0.14);
  color: #d97706;
}

.ig__summary-card[data-tone='green'] .ig__summary-icon {
  background: rgba(0, 181, 85, 0.12);
  color: #00b555;
}

.ig__summary-card[data-tone='orange'] .ig__summary-icon {
  background: rgba(249, 115, 22, 0.14);
  color: #ea580c;
}

.ig__summary-card[data-tone='red'] .ig__summary-icon {
  background: rgba(241, 70, 73, 0.12);
  color: #f14649;
}

.ig__summary-card[data-tone='slate'] .ig__summary-icon {
  background: rgba(100, 116, 139, 0.12);
  color: #64748b;
}

.ig__summary-label {
  display: block;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #5a6f82;
}

.ig__summary-value {
  font-family: Omnes, system-ui, sans-serif;
  font-size: 1.35rem;
  line-height: 1;
  color: #07132f;
}

.ig__controls,
.ig__table-shell {
  display: flex;
  flex-direction: column;
  border-radius: 18px;
  background: #fff;
  border: 1px solid #e6edf5;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.05);
}

.ig__controls {
  gap: 0.95rem;
  padding: 1.1rem 1.15rem;
}

.ig__controls-head {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: 0.75rem 1rem;
}

.ig__controls-title {
  margin: 0 0 0.2rem;
  font-family: Omnes, system-ui, sans-serif;
  font-size: 1rem;
  font-weight: 800;
  color: #07132f;
}

.ig__controls-copy {
  margin: 0;
  max-width: 46rem;
  font-size: 12px;
  line-height: 1.55;
  color: #496275;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

.ig__search-wrap {
  width: min(100%, 32rem);
}

.ig__count {
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  background: rgba(19, 97, 185, 0.08);
  font-size: 12px;
  font-weight: 800;
  color: #1361b9;
}

.ig__filters {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin: 0;
}

.ig__filters-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 0.75rem 0.85rem;
  border-radius: 14px;
  background: #f8fbff;
  border: 1px solid #e6edf5;
}

.ig__filters-label,
.ig__filters-fixed {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.ig__filters-label {
  margin-right: 0.25rem;
  font-size: 12px;
  font-weight: 800;
  color: #5a6f82;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

.ig__filters-select,
.ig__filters-fixed {
  font-size: 12px;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  padding: 6px 10px;
  color: #333;
  background: #fff;
}

.ig__filters-select {
  cursor: pointer;
}

.ig__filters-fixed {
  font-weight: 800;
  color: #c2410c;
  background: #fff7ed;
  border-color: #fed7aa;
}

.ig__filters-fixed--info {
  color: #0369a1;
  background: #f0f9ff;
  border-color: #bae6fd;
}

.ig__table-shell {
  gap: 0.85rem;
  padding: 1.15rem;
}

.ig__table-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.ig__table-eyebrow {
  margin: 0 0 0.15rem;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #1361b9;
}

.ig__table-title {
  margin: 0;
  font-family: Omnes, system-ui, sans-serif;
  font-size: 1rem;
  font-weight: 800;
  color: #07132f;
}

.ig__table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 14px;
  border: 1px solid #cfdfea;
  background: #fff;
}

.ig__table {
  min-width: 64rem;
  font-size: 13px;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

.ig__empty {
  display: grid;
  justify-items: center;
  gap: 0.45rem;
  padding: 2.4rem 1rem;
  color: #496275;
  text-align: center;
}

.ig__empty-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: rgba(19, 97, 185, 0.1);
  color: #1361b9;
}

.ig__empty strong {
  color: #07132f;
  font-family: Omnes, system-ui, sans-serif;
}

.ig__empty span:last-child {
  max-width: 34rem;
  font-size: 12px;
  line-height: 1.55;
}

.ig__em {
  color: #5a6f82;
  font-size: 13px;
}

.ig__gti-link {
  font: inherit;
  font-weight: 800;
  color: #1361b9;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.ig__gti-link:hover {
  color: #ff4298;
}

.ig__dlg-head {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 36px;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding-right: 0.25rem;
}

.ig__dlg-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: rgba(19, 97, 185, 0.12);
  color: #1361b9;
}

.ig__dlg-head-copy {
  min-width: 0;
}

.ig__dlg-eyebrow {
  margin: 0 0 0.2rem;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #1361b9;
}

.ig__dlg-title {
  font-family: Omnes, system-ui, sans-serif;
  font-size: 1.18rem;
  font-weight: 800;
  color: #07132f;
}

.ig__dlg-x {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: #5a6f82;
  cursor: pointer;
}

.ig__dlg-x:hover {
  background: rgba(19, 97, 185, 0.08);
  color: #1361b9;
}

.ig__dlg-body {
  padding: 1.15rem 1.25rem 1.25rem;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

.ig__dlg-panel {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.ig__dlg-block {
  padding: 1rem 1rem 0.95rem;
  border-radius: 16px;
  background: #fff;
  border: 1px solid #e6edf5;
}

.ig__dlg-block--accent {
  background: linear-gradient(180deg, #fff 0%, #fbfcff 100%);
}

.ig__dlg-section {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.8rem;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #1361b9;
}

.ig__dlg-section--accent {
  color: #ff4298;
}

.ig__dlg-grid {
  display: grid;
  grid-template-columns: minmax(8rem, 11rem) 1fr;
  gap: 0.45rem 1rem;
  margin: 0;
  font-size: 13px;
}

.ig__dlg-grid dt {
  margin: 0;
  font-weight: 800;
  color: #5a6f82;
}

.ig__dlg-grid dd {
  margin: 0;
  color: #07132f;
  line-height: 1.5;
}

.ig__dlg-titulo {
  white-space: pre-wrap;
}

.ig__dlg-descripcion {
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
  font-size: 13px;
  line-height: 1.55;
}

.ig__dlg-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 1.25rem;
}

@media (max-width: 1024px) {
  .ig__summary {
    width: 100%;
  }
}

@media (max-width: 720px) {
  .ig__summary {
    grid-template-columns: 1fr 1fr;
  }

  .ig__head-main,
  .ig__controls,
  .ig__table-shell,
  .ig__dlg-body {
    padding: 1rem;
  }

  .ig__dlg-grid,
  .ig__dlg-head {
    grid-template-columns: 1fr;
  }
}

/* ISAC-like visual refinement */
.ig {
  gap: 1rem;
}

.ig__head,
.ig__controls,
.ig__table-shell {
  border-color: #e2e8f0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
}

.ig__head {
  border-top-color: #e2e8f0;
  border-top-width: 1px;
}

.ig__head-icon,
.ig__summary-icon,
.ig__empty-icon,
.ig__dlg-icon {
  border-radius: 10px;
  background: #eff6ff;
  color: #1361b9;
}

.ig__title,
.ig__table-title,
.ig__controls-title,
.ig__dlg-title {
  color: #1e293b;
}

.ig__hint,
.ig__controls-copy,
.ig__summary-label,
.ig__em {
  color: #64748b;
}

.ig__summary {
  gap: 0.75rem;
}

.ig__summary-card {
  border-color: #e2e8f0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
}

.ig__summary-value {
  color: #1e293b;
}

.ig__filters-select,
.ig__filters-fixed {
  border-color: #e2e8f0;
  background: #f8fafc;
}

.ig__table-scroll {
  border-color: #e2e8f0;
  border-radius: 12px;
}

.ig__gti-link {
  color: #1361b9;
}

.ig__gti-link:hover {
  color: #e91e8c;
}
</style>
