<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import { RouterLink } from 'vue-router';
import { incidentesGtiLiveKey } from '@/composables/useIncidentesGtiLive';
import { calcularAlertaIncidente } from '@/lib/incidentes-gti-alerta';
import type { GtiTicket } from '@/lib/incidentes-gti-types';

type FiltroResumen =
  | 'todos'
  | 'g1'
  | 'g2'
  | 'g3'
  | 'otros'
  | 'sinSquad'
  | 'soporteNegocio';
type FiltroAlerta = 'alerta' | 'critico';

const store = inject(incidentesGtiLiveKey);

const filtroResumen = ref<FiltroResumen>('todos');
const filtroAlerta = ref<FiltroAlerta | null>(null);

function setFiltroResumen(filtro: FiltroResumen): void {
  filtroResumen.value = filtroResumen.value === filtro ? 'todos' : filtro;
}

function setFiltroAlerta(filtro: FiltroAlerta): void {
  filtroAlerta.value = filtroAlerta.value === filtro ? null : filtro;
}

const abiertosTribus = computed<GtiTicket[]>(() => {
  if (!store) return [];
  return [...store.byGrupo.g1, ...store.byGrupo.g2, ...store.byGrupo.otros];
});

const ticketsFiltrados = computed<GtiTicket[]>(() => {
  if (!store) return [];
  let tickets: GtiTicket[];

  switch (filtroResumen.value) {
    case 'g1': tickets = store.byGrupo.g1; break;
    case 'g2': tickets = store.byGrupo.g2; break;
    case 'g3': tickets = store.byGrupo.g3; break;
    case 'otros': tickets = store.byGrupo.otros; break;
    case 'sinSquad': tickets = store.byGrupo.sinSquad; break;
    case 'soporteNegocio': tickets = store.byGrupo.soporteNegocio; break;
    default: tickets = abiertosTribus.value;
  }

  if (!filtroAlerta.value) return tickets;

  const nivel = filtroAlerta.value === 'alerta' ? 'ALERTA' : 'CRITICO';
  return tickets.filter(
    (ticket) => calcularAlertaIncidente(ticket.fechaUltimoEstado, ticket.estadoActual).nivel === nivel,
  );
});

const totalAbiertos = computed(() => (store ? store.conteos.g1Ratificacion + store.conteos.g2Desarrollo + store.conteos.otros : 0));

const alertaCount = computed(() =>
  abiertosTribus.value.filter(
    (t) => calcularAlertaIncidente(t.fechaUltimoEstado, t.estadoActual).nivel === 'ALERTA',
  ).length,
);

const criticoCount = computed(() =>
  abiertosTribus.value.filter(
    (t) => calcularAlertaIncidente(t.fechaUltimoEstado, t.estadoActual).nivel === 'CRITICO',
  ).length,
);

const filtroResumenLabel = computed<string>(() => {
  const labels: Record<FiltroResumen, string> = {
    todos: 'Todos los abiertos de tribus',
    g1: 'En ratificación (G1)',
    g2: 'En desarrollo (G2)',
    g3: 'Resueltos (G3)',
    otros: 'Otros abiertos',
    sinSquad: 'Sin squad asignado',
    soporteNegocio: 'Soporte al Negocio',
  };
  return labels[filtroResumen.value];
});

const filtroAlertaLabel = computed<string | null>(() => {
  if (filtroAlerta.value === 'alerta') return 'Alerta >15 días';
  if (filtroAlerta.value === 'critico') return 'Críticos >30 días';
  return null;
});

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  } catch {
    return iso;
  }
}

function exportCsv(): void {
  const headers = ['GTI', 'Título', 'Squad', 'Responsable', 'Estado', 'Antigüedad (días)', 'Última actualización'];
  const rows = ticketsFiltrados.value.map((t) => {
    const alerta = calcularAlertaIncidente(t.fechaUltimoEstado, t.estadoActual);
    return [
      t.gti,
      `"${(t.titulo ?? '').replace(/"/g, '""')}"`,
      t.squad ?? t.patronSquad ?? '',
      t.usuarioActual ?? '',
      t.estadoActual ?? '',
      alerta.dias ?? '',
      formatDate(t.fechaUltimoEstado),
    ].join(',');
  });
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const alertaSuffix = filtroAlerta.value ? `_${filtroAlerta.value}` : '';
  a.download = `incidentes_${filtroResumen.value}${alertaSuffix}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <div class="idb">
    <!-- ── Layout principal ─────────────────────────────────────── -->
    <div class="idb__layout">
      <!-- ── Columna principal ────────────────────────────────── -->
      <div class="idb__main">

        <!-- Resumen General -->
        <section class="idb__section">
          <h3 class="idb__section-title">Resumen General</h3>
          <div class="idb__cards idb__cards--4">
            <button
              type="button"
              class="idb-card idb-card--blue"
              :class="{ 'idb-card--active': filtroResumen === 'todos' }"
              :aria-pressed="filtroResumen === 'todos'"
              @click="setFiltroResumen('todos')"
            >
              <span class="idb-card__icon"><i class="pi pi-sitemap" aria-hidden="true" /></span>
              <span class="idb-card__label">Total abiertos</span>
              <strong class="idb-card__value">{{ totalAbiertos.toLocaleString('es-PE') }}</strong>
              <span class="idb-card__sub">G1 + G2 + Otros</span>
            </button>

            <button
              type="button"
              class="idb-card idb-card--indigo"
              :class="{ 'idb-card--active': filtroResumen === 'g2' }"
              :aria-pressed="filtroResumen === 'g2'"
              @click="setFiltroResumen('g2')"
            >
              <span class="idb-card__icon"><i class="pi pi-users" aria-hidden="true" /></span>
              <span class="idb-card__label">En desarrollo</span>
              <strong class="idb-card__value">{{ (store?.conteos.g2Desarrollo ?? 0).toLocaleString('es-PE') }}</strong>
              <span class="idb-card__sub">G2</span>
            </button>

            <button
              type="button"
              class="idb-card idb-card--amber"
              :class="{ 'idb-card--active': filtroResumen === 'g1' }"
              :aria-pressed="filtroResumen === 'g1'"
              @click="setFiltroResumen('g1')"
            >
              <span class="idb-card__icon"><i class="pi pi-clock" aria-hidden="true" /></span>
              <span class="idb-card__label">En ratificación</span>
              <strong class="idb-card__value">{{ (store?.conteos.g1Ratificacion ?? 0).toLocaleString('es-PE') }}</strong>
              <span class="idb-card__sub">G1</span>
            </button>

            <button
              type="button"
              class="idb-card idb-card--green"
              :class="{ 'idb-card--active': filtroResumen === 'g3' }"
              :aria-pressed="filtroResumen === 'g3'"
              @click="setFiltroResumen('g3')"
            >
              <span class="idb-card__icon"><i class="pi pi-check-circle" aria-hidden="true" /></span>
              <span class="idb-card__label">Resueltos</span>
              <strong class="idb-card__value">{{ (store?.conteos.g3Cerrados ?? 0).toLocaleString('es-PE') }}</strong>
              <span class="idb-card__sub">G3 en rango</span>
            </button>
          </div>
        </section>

        <!-- Alertas Críticas -->
        <section class="idb__section">
          <h3 class="idb__section-title">Alertas Críticas</h3>
          <div class="idb__cards idb__cards--3">
            <button
              type="button"
              class="idb-card idb-card--orange"
              :class="{ 'idb-card--active': filtroAlerta === 'alerta' }"
              :aria-pressed="filtroAlerta === 'alerta'"
              @click="setFiltroAlerta('alerta')"
            >
              <span class="idb-card__icon"><i class="pi pi-history" aria-hidden="true" /></span>
              <span class="idb-card__label">&gt;15 días sin avance</span>
              <strong class="idb-card__value">{{ alertaCount.toLocaleString('es-PE') }}</strong>
              <span class="idb-card__sub">Requiere seguimiento</span>
            </button>

            <button
              type="button"
              class="idb-card idb-card--red"
              :class="{ 'idb-card--active': filtroAlerta === 'critico' }"
              :aria-pressed="filtroAlerta === 'critico'"
              @click="setFiltroAlerta('critico')"
            >
              <span class="idb-card__icon"><i class="pi pi-exclamation-triangle" aria-hidden="true" /></span>
              <span class="idb-card__label">&gt;30 días sin avance</span>
              <strong class="idb-card__value">{{ criticoCount.toLocaleString('es-PE') }}</strong>
              <span class="idb-card__sub">Atención urgente</span>
            </button>

            <button
              type="button"
              class="idb-card idb-card--slate"
              :class="{ 'idb-card--active': filtroResumen === 'sinSquad' }"
              :aria-pressed="filtroResumen === 'sinSquad'"
              @click="setFiltroResumen('sinSquad')"
            >
              <span class="idb-card__icon"><i class="pi pi-question-circle" aria-hidden="true" /></span>
              <span class="idb-card__label">Sin squad asignado</span>
              <strong class="idb-card__value">{{ (store?.conteos.sinSquad ?? 0).toLocaleString('es-PE') }}</strong>
              <span class="idb-card__sub">Clasificar</span>
            </button>
          </div>
        </section>

        <!-- Excepciones -->
        <section class="idb__section">
          <h3 class="idb__section-title">Excepciones</h3>
          <div class="idb__cards idb__cards--3">
            <button
              type="button"
              class="idb-card idb-card--sky"
              :class="{ 'idb-card--active': filtroResumen === 'soporteNegocio' }"
              :aria-pressed="filtroResumen === 'soporteNegocio'"
              @click="setFiltroResumen('soporteNegocio')"
            >
              <span class="idb-card__icon"><i class="pi pi-briefcase" aria-hidden="true" /></span>
              <span class="idb-card__label">Soporte al Negocio</span>
              <strong class="idb-card__value">{{ (store?.conteos.soporteNegocio ?? 0).toLocaleString('es-PE') }}</strong>
              <span class="idb-card__sub">Bandeja separada</span>
            </button>

            <button
              type="button"
              class="idb-card idb-card--amber"
              :class="{ 'idb-card--active': filtroResumen === 'sinSquad' }"
              :aria-pressed="filtroResumen === 'sinSquad'"
              @click="setFiltroResumen('sinSquad')"
            >
              <span class="idb-card__icon"><i class="pi pi-filter-slash" aria-hidden="true" /></span>
              <span class="idb-card__label">Pendientes de clasificación</span>
              <strong class="idb-card__value">{{ (store?.conteos.sinSquad ?? 0).toLocaleString('es-PE') }}</strong>
              <span class="idb-card__sub">Sin match de squad</span>
            </button>

            <button
              type="button"
              class="idb-card idb-card--violet"
              :class="{ 'idb-card--active': filtroResumen === 'otros' }"
              :aria-pressed="filtroResumen === 'otros'"
              @click="setFiltroResumen('otros')"
            >
              <span class="idb-card__icon"><i class="pi pi-th-large" aria-hidden="true" /></span>
              <span class="idb-card__label">Otros abiertos</span>
              <strong class="idb-card__value">{{ (store?.conteos.otros ?? 0).toLocaleString('es-PE') }}</strong>
              <span class="idb-card__sub">Fuera de G1/G2/G3</span>
            </button>
          </div>
        </section>

        <!-- Tickets Prioritarios -->
        <section class="idb__section idb__section--table">
          <div class="idb__table-head">
            <div>
              <h3 class="idb__section-title">Tickets Prioritarios</h3>
              <p class="idb__table-filter-label">
                <span class="idb__filter-chip">{{ filtroResumenLabel }}</span>
                <span v-if="filtroAlertaLabel" class="idb__filter-chip idb__filter-chip--alert">
                  {{ filtroAlertaLabel }}
                </span>
                <span class="idb__filter-count">{{ ticketsFiltrados.length }} ticket(s)</span>
              </p>
            </div>
            <button type="button" class="idb__export-btn" @click="exportCsv">
              <i class="pi pi-download" aria-hidden="true" />
              Exportar CSV
            </button>
          </div>

          <div class="idb__table-wrap">
            <table class="idb__table">
              <thead>
                <tr>
                  <th>GTI</th>
                  <th>Título</th>
                  <th>Squad / Tribu</th>
                  <th>Responsable</th>
                  <th>Antigüedad</th>
                  <th>Estado</th>
                  <th>Últ. actualización</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="ticketsFiltrados.length === 0">
                  <td colspan="8" class="idb__table-empty">
                    <span class="apex-empty-state">
                      <i class="pi pi-inbox apex-empty-state__icon" aria-hidden="true" />
                      <span class="apex-empty-state__msg">Sin tickets en este filtro</span>
                    </span>
                  </td>
                </tr>
                <tr v-for="ticket in ticketsFiltrados" :key="ticket.gti" class="idb__tr">
                  <td class="idb__td-gti">
                    <span class="idb__gti-badge">{{ ticket.gti }}</span>
                  </td>
                  <td class="idb__td-titulo">
                    <span class="idb__titulo">{{ ticket.titulo || '—' }}</span>
                  </td>
                  <td class="idb__td-squad">
                    <span v-if="ticket.squad" class="idb__squad-chip">{{ ticket.squad }}</span>
                    <span v-else-if="ticket.patronSquad" class="idb__squad-chip idb__squad-chip--muted">{{ ticket.patronSquad }}</span>
                    <span v-else class="idb__muted">—</span>
                  </td>
                  <td class="idb__td-resp">{{ ticket.usuarioActual || '—' }}</td>
                  <td class="idb__td-alert">
                    <span
                      class="idb__alerta-badge"
                      :style="{ '--alerta-color': calcularAlertaIncidente(ticket.fechaUltimoEstado, ticket.estadoActual).color }"
                    >
                      <template v-if="calcularAlertaIncidente(ticket.fechaUltimoEstado, ticket.estadoActual).dias !== null">
                        {{ calcularAlertaIncidente(ticket.fechaUltimoEstado, ticket.estadoActual).dias }}d
                      </template>
                      <template v-else>
                        {{ calcularAlertaIncidente(ticket.fechaUltimoEstado, ticket.estadoActual).label }}
                      </template>
                    </span>
                  </td>
                  <td class="idb__td-estado">
                    <span class="idb__estado">{{ ticket.estadoActual || '—' }}</span>
                  </td>
                  <td class="idb__td-fecha">{{ formatDate(ticket.fechaUltimoEstado) }}</td>
                  <td class="idb__td-actions">
                    <RouterLink
                      v-if="ticket.soporteNegocio"
                      :to="{ name: 'incidentes-soporte' }"
                      class="idb__action-btn"
                      title="Ver bandeja soporte"
                    >
                      <i class="pi pi-arrow-right" aria-hidden="true" />
                    </RouterLink>
                    <RouterLink
                      v-else-if="!ticket.squad"
                      :to="{ name: 'incidentes-sin-squad' }"
                      class="idb__action-btn"
                      title="Ver pendientes"
                    >
                      <i class="pi pi-arrow-right" aria-hidden="true" />
                    </RouterLink>
                    <RouterLink
                      v-else
                      :to="{ name: 'incidentes-g2' }"
                      class="idb__action-btn"
                      title="Ver en bandeja"
                    >
                      <i class="pi pi-arrow-right" aria-hidden="true" />
                    </RouterLink>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- ── Sidebar derecho ──────────────────────────────────────── -->
      <aside class="idb__sidebar">
        <!-- Universo de Análisis -->
        <div class="idb__sidebar-card">
          <div class="idb__sidebar-icon idb__sidebar-icon--blue">
            <i class="pi pi-database" aria-hidden="true" />
          </div>
          <h4 class="idb__sidebar-title">Universo de Análisis</h4>
          <dl class="idb__sidebar-dl">
            <dt>Rango</dt>
            <dd>
              <template v-if="store?.meta">
                {{ store.meta.startDate }} → {{ store.meta.endDate }}
              </template>
              <template v-else>—</template>
            </dd>
            <dt>Total en rango</dt>
            <dd>{{ store?.rows.length?.toLocaleString('es-PE') ?? '—' }} tickets</dd>
            <dt>Abiertos de tribus</dt>
            <dd>{{ totalAbiertos.toLocaleString('es-PE') }}</dd>
          </dl>
        </div>

        <!-- Soporte al Negocio -->
        <div class="idb__sidebar-card">
          <div class="idb__sidebar-icon idb__sidebar-icon--sky">
            <i class="pi pi-briefcase" aria-hidden="true" />
          </div>
          <h4 class="idb__sidebar-title">Soporte al Negocio</h4>
          <p class="idb__sidebar-count">{{ (store?.conteos.soporteNegocio ?? 0).toLocaleString('es-PE') }}</p>
          <p class="idb__sidebar-hint">Tickets atendidos por equipo de soporte, excluidos del total operativo de tribus.</p>
          <RouterLink :to="{ name: 'incidentes-soporte' }" class="idb__sidebar-link">
            Ver consolidado <i class="pi pi-arrow-right" aria-hidden="true" />
          </RouterLink>
        </div>

        <!-- Guía Rápida -->
        <div class="idb__sidebar-card idb__sidebar-card--guide">
          <div class="idb__sidebar-icon idb__sidebar-icon--violet">
            <i class="pi pi-book" aria-hidden="true" />
          </div>
          <h4 class="idb__sidebar-title">Guía Rápida</h4>
          <ul class="idb__guide-list">
            <li><strong>G1</strong> — Ratificación: ticket en análisis previo a desarrollo</li>
            <li><strong>G2</strong> — Desarrollo: asignado a squad, en ejecución</li>
            <li><strong>G3</strong> — Resuelto: cerrado o rechazado en el rango</li>
            <li><strong>Alerta</strong> — Sin avance por más de 15 días</li>
            <li><strong>Crítico</strong> — Sin avance por más de 30 días</li>
            <li>Haz clic en una tarjeta para filtrar la tabla inferior</li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ── Layout ───────────────────────────────────────────────────── */
.idb {
  display: flex;
  flex-direction: column;
}

.idb__layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: 1.25rem;
  align-items: start;
  animation: apex-fade-in 0.25s ease-out both;
}

.idb__main {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}

/* ── Section ──────────────────────────────────────────────────── */
.idb__section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.idb__section-title {
  margin: 0;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #1361b9;
}

/* ── Cards grid ───────────────────────────────────────────────── */
.idb__cards {
  display: grid;
  gap: 0.6rem;
}

.idb__cards--4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.idb__cards--3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

/* ── Card base ────────────────────────────────────────────────── */
.idb-card {
  display: grid;
  grid-template-columns: 1.75rem minmax(0, 1fr) auto;
  grid-template-areas:
    "icon label value"
    "icon sub value";
  align-items: center;
  column-gap: 0.55rem;
  row-gap: 0.05rem;
  min-height: 62px;
  padding: 0.6rem 0.75rem;
  border-radius: 10px;
  border: 1.5px solid #e2e8f0;
  background: #fff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
  cursor: pointer;
  text-align: left;
  transition: box-shadow 0.18s ease, border-color 0.18s ease, transform 0.18s ease, background 0.18s ease;
}

.idb-card:hover {
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.1);
  transform: translateY(-2px);
}

.idb-card--active {
  border-width: 2px;
  box-shadow: 0 4px 16px rgba(19, 97, 185, 0.14);
  transform: translateY(-1px);
}

.idb-card__icon {
  grid-area: icon;
  display: grid;
  place-items: center;
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 7px;
  font-size: 0.78rem;
}

.idb-card__label {
  grid-area: label;
  font-size: 11.5px;
  font-weight: 700;
  color: #64748b;
  line-height: 1.2;
}

.idb-card__value {
  grid-area: value;
  font-size: 1.45rem;
  line-height: 1;
  font-weight: 800;
  color: #0f172a;
  font-family: Omnes, system-ui, sans-serif;
}

.idb-card__sub {
  grid-area: sub;
  font-size: 10.5px;
  color: #94a3b8;
  font-weight: 600;
  line-height: 1.2;
}

/* Card color variants */
.idb-card--blue .idb-card__icon { background: rgba(19, 97, 185, 0.1); color: #1361b9; }
.idb-card--blue.idb-card--active { border-color: #1361b9; background: rgba(19, 97, 185, 0.04); }

.idb-card--indigo .idb-card__icon { background: rgba(79, 70, 229, 0.1); color: #4f46e5; }
.idb-card--indigo.idb-card--active { border-color: #4f46e5; background: rgba(79, 70, 229, 0.04); }

.idb-card--amber .idb-card__icon { background: rgba(217, 119, 6, 0.1); color: #d97706; }
.idb-card--amber.idb-card--active { border-color: #d97706; background: rgba(217, 119, 6, 0.04); }

.idb-card--green .idb-card__icon { background: rgba(0, 181, 85, 0.1); color: #00b555; }
.idb-card--green.idb-card--active { border-color: #00b555; background: rgba(0, 181, 85, 0.04); }

.idb-card--orange .idb-card__icon { background: rgba(234, 88, 12, 0.1); color: #ea580c; }
.idb-card--orange.idb-card--active { border-color: #ea580c; background: rgba(234, 88, 12, 0.05); }

.idb-card--red .idb-card__icon { background: rgba(241, 70, 73, 0.1); color: #f14649; }
.idb-card--red.idb-card--active { border-color: #f14649; background: rgba(241, 70, 73, 0.05); }

.idb-card--slate .idb-card__icon { background: rgba(100, 116, 139, 0.1); color: #64748b; }
.idb-card--slate.idb-card--active { border-color: #64748b; background: rgba(100, 116, 139, 0.05); }

.idb-card--sky .idb-card__icon { background: rgba(2, 132, 199, 0.1); color: #0284c7; }
.idb-card--sky.idb-card--active { border-color: #0284c7; background: rgba(2, 132, 199, 0.04); }

.idb-card--violet .idb-card__icon { background: rgba(124, 58, 237, 0.1); color: #7c3aed; }
.idb-card--violet.idb-card--active { border-color: #7c3aed; background: rgba(124, 58, 237, 0.04); }

/* ── Table section ────────────────────────────────────────────── */
.idb__section--table {
  gap: 0.75rem;
}

.idb__table-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.idb__table-filter-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.25rem 0 0;
}

.idb__filter-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.65rem;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(19, 97, 185, 0.1);
  color: #1361b9;
}

.idb__filter-chip--alert {
  background: rgba(234, 88, 12, 0.1);
  color: #c2410c;
}

.idb__filter-count {
  font-size: 12px;
  color: #64748b;
}

.idb__export-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.85rem;
  border-radius: 10px;
  border: 1px solid #e2e8f0;
  background: #fff;
  font-size: 12.5px;
  font-weight: 700;
  color: #475569;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}

.idb__export-btn:hover {
  border-color: #1361b9;
  color: #1361b9;
  box-shadow: 0 2px 8px rgba(19, 97, 185, 0.12);
}

.idb__table-wrap {
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
}

.idb__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.idb__table thead th {
  padding: 0.6rem 0.85rem;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  white-space: nowrap;
  text-align: center;
}

.idb__table thead th:last-child {
  width: 3rem;
}

.idb__tr {
  border-bottom: 1px solid #f1f5f9;
  transition: background 0.12s ease;
}

.idb__tr:last-child {
  border-bottom: none;
}

.idb__tr:hover {
  background: #f0f7ff;
}

.idb__table td {
  padding: 0.6rem 0.85rem;
  vertical-align: middle;
  color: #334155;
}

.idb__table-empty {
  text-align: center;
  padding: 2.5rem 1rem;
}

.idb__gti-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 800;
  background: rgba(19, 97, 185, 0.08);
  color: #1361b9;
  white-space: nowrap;
}

.idb__td-titulo {
  max-width: 260px;
}

.idb__titulo {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.idb__squad-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.15rem 0.5rem;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  background: rgba(79, 70, 229, 0.08);
  color: #4f46e5;
  white-space: nowrap;
}

.idb__squad-chip--muted {
  background: rgba(100, 116, 139, 0.08);
  color: #64748b;
}

.idb__muted {
  color: #94a3b8;
}

.idb__alerta-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  border: 1.5px solid var(--alerta-color);
  color: var(--alerta-color);
  background: transparent;
  white-space: nowrap;
  opacity: 0.95;
}

.idb__estado {
  font-size: 12px;
  color: #475569;
}

.idb__td-fecha {
  white-space: nowrap;
  font-size: 12px;
  color: #64748b;
}

.idb__action-btn {
  display: inline-grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #475569;
  text-decoration: none;
  font-size: 0.75rem;
  transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
}

.idb__action-btn:hover {
  border-color: #1361b9;
  color: #1361b9;
  background: rgba(19, 97, 185, 0.06);
}

/* ── Sidebar ──────────────────────────────────────────────────── */
.idb__sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  position: sticky;
  top: 1rem;
}

.idb__sidebar-card {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 1rem 1.1rem;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #fff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
}

.idb__sidebar-card--guide {
  background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
}

.idb__sidebar-icon {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  font-size: 0.85rem;
}

.idb__sidebar-icon--blue { background: rgba(19, 97, 185, 0.1); color: #1361b9; }
.idb__sidebar-icon--sky { background: rgba(2, 132, 199, 0.1); color: #0284c7; }
.idb__sidebar-icon--violet { background: rgba(124, 58, 237, 0.1); color: #7c3aed; }

.idb__sidebar-title {
  margin: 0;
  font-size: 13px;
  font-weight: 800;
  color: #0f172a;
}

.idb__sidebar-dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.3rem 0.75rem;
  margin: 0;
  font-size: 12px;
}

.idb__sidebar-dl dt {
  font-weight: 700;
  color: #64748b;
  white-space: nowrap;
}

.idb__sidebar-dl dd {
  margin: 0;
  color: #334155;
  word-break: break-word;
}

.idb__sidebar-count {
  margin: 0;
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
  color: #0284c7;
  font-family: Omnes, system-ui, sans-serif;
}

.idb__sidebar-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: #64748b;
}

.idb__sidebar-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 12.5px;
  font-weight: 800;
  color: #1361b9;
  text-decoration: none;
  transition: color 0.15s ease;
}

.idb__sidebar-link:hover {
  color: #006bf0;
}

.idb__guide-list {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 12px;
  line-height: 1.65;
  color: #475569;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

/* ── Responsive ───────────────────────────────────────────────── */
@media (max-width: 1100px) {
  .idb__layout {
    grid-template-columns: 1fr;
  }

  .idb__sidebar {
    position: static;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .idb__cards--4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .idb__sidebar {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .idb__cards--4,
  .idb__cards--3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 440px) {
  .idb__cards--4,
  .idb__cards--3 {
    grid-template-columns: 1fr;
  }
}
</style>
