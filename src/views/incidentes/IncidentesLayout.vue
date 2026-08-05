<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { useRoute, RouterLink, RouterView } from 'vue-router';
import { fetchGtiIntegrationStatus, type GtiIntegrationStatus } from '@/lib/incidentes-gti-api';
import { incidentesGtiLiveKey, useIncidentesGtiLive } from '@/composables/useIncidentesGtiLive';

const tabs = [
  { name: 'incidentes-dashboard' as const, label: 'Dashboard', icon: 'pi pi-chart-bar' },
  { name: 'incidentes-g1' as const, label: 'G1 · Ratificación', icon: 'pi pi-clock' },
  { name: 'incidentes-g2' as const, label: 'G2 · Desarrollo', icon: 'pi pi-users' },
  { name: 'incidentes-g3' as const, label: 'G3 · Resueltos', icon: 'pi pi-check-circle' },
  { name: 'incidentes-otros' as const, label: 'Otros', icon: 'pi pi-th-large' },
  { name: 'incidentes-soporte' as const, label: 'Soporte', icon: 'pi pi-briefcase' },
  { name: 'incidentes-sin-squad' as const, label: 'Pendientes', icon: 'pi pi-exclamation-triangle' },
] as const;

const route = useRoute();
const gtiStatus = ref<GtiIntegrationStatus | null>(null);
const gtiStatusError = ref(false);
const refreshProgress = ref(0);
const showRefreshProgress = ref(false);
let refreshProgressTimer: ReturnType<typeof setInterval> | null = null;
let refreshHideTimer: ReturnType<typeof setTimeout> | null = null;

const incidentesLive = useIncidentesGtiLive();
provide(incidentesGtiLiveKey, incidentesLive);

onMounted(async () => {
  await refreshStatus();
  await incidentesLive.load();
});

async function refreshStatus(): Promise<void> {
  try {
    gtiStatus.value = await fetchGtiIntegrationStatus();
    gtiStatusError.value = gtiStatus.value === null;
  } catch {
    gtiStatus.value = null;
    gtiStatusError.value = true;
  }
}

async function onRefresh(): Promise<void> {
  if (incidentesLive.loading) return;

  clearRefreshTimers();
  refreshProgress.value = 4;
  showRefreshProgress.value = true;
  refreshProgressTimer = setInterval(() => {
    if (refreshProgress.value < 90) {
      const increment = refreshProgress.value < 45 ? 7 : refreshProgress.value < 75 ? 4 : 2;
      refreshProgress.value = Math.min(90, refreshProgress.value + increment);
    }
  }, 180);

  try {
    await refreshStatus();
    incidentesLive.invalidateCache();
    await incidentesLive.load(true);
    refreshProgress.value = 100;
  } finally {
    if (refreshProgressTimer) {
      clearInterval(refreshProgressTimer);
      refreshProgressTimer = null;
    }
    refreshHideTimer = setTimeout(() => {
      showRefreshProgress.value = false;
      refreshProgress.value = 0;
      refreshHideTimer = null;
    }, 900);
  }
}

function clearRefreshTimers(): void {
  if (refreshProgressTimer) {
    clearInterval(refreshProgressTimer);
    refreshProgressTimer = null;
  }
  if (refreshHideTimer) {
    clearTimeout(refreshHideTimer);
    refreshHideTimer = null;
  }
}

onBeforeUnmount(clearRefreshTimers);

function tabClass(name: string): string {
  const base = 'inc-tab';
  return route.name === name ? `${base} ${base}--active` : base;
}

function formatRefreshed(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  try {
    return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
}
</script>

<template>
  <div class="inc-mod">
    <section class="inc-mod__hero">
      <div class="inc-mod__hero-copy">
        <p class="inc-mod__eyebrow">Módulo operativo</p>
        <h1 class="inc-mod__title">Incidentes GTI</h1>
        <p class="inc-mod__sub">
          Seguimiento de incidentes abiertos asignados a tribus de desarrollo, con bandejas separadas para Soporte al
          Negocio y pendientes de clasificación, además del detalle completo del ticket GTI.
        </p>
      </div>

      <div class="inc-mod__actions">
        <button type="button" class="inc-mod__refresh" :disabled="incidentesLive.loading" @click="onRefresh">
          <i class="pi pi-refresh" :class="{ 'inc-mod__refresh-icon--spin': incidentesLive.loading }" aria-hidden="true" />
          {{ incidentesLive.loading ? 'Actualizando…' : 'Actualizar datos' }}
        </button>
        <div
          v-if="showRefreshProgress"
          class="inc-mod__progress"
          role="progressbar"
          aria-label="Progreso de actualización"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="refreshProgress"
        >
          <div class="inc-mod__progress-head">
            <span>{{ refreshProgress === 100 ? 'Información actualizada' : 'Actualizando información' }}</span>
            <strong>{{ refreshProgress }}%</strong>
          </div>
          <div class="inc-mod__progress-track" aria-hidden="true">
            <span class="inc-mod__progress-fill" :style="{ width: `${refreshProgress}%` }" />
          </div>
        </div>
      </div>
    </section>

    <p v-if="gtiStatus?.disabled" class="inc-mod__banner inc-mod__banner--poc">
      <i class="pi pi-info-circle" aria-hidden="true" />
      <span>Modo local sin API GTI. Las bandejas se muestran vacías hasta habilitar la integración.</span>
    </p>
    <p v-else-if="gtiStatus?.configured && gtiStatus.available !== false" class="inc-mod__banner inc-mod__banner--ok">
      <i class="pi pi-database" aria-hidden="true" />
      <span>
        Datos en vivo: API GTI vía Apex ({{ gtiStatus.upstreamHost ?? 'host desconocido' }} · prefijo
        {{ gtiStatus.incidentesPrefix }}).
      </span>
    </p>
    <p v-else-if="gtiStatus?.configured && !gtiStatus.available" class="inc-mod__banner inc-mod__banner--warn">
      <i class="pi pi-exclamation-triangle" aria-hidden="true" />
      <span>
        API GTI no disponible en este entorno. No se mostrará información hasta que la integración responda.
      </span>
    </p>
    <p v-else-if="gtiStatus && !gtiStatus.configured" class="inc-mod__banner inc-mod__banner--poc">
      <i class="pi pi-info-circle" aria-hidden="true" />
      <span>
        API GTI no configurada en el backend (<code>GTI_API_BASE_URL</code>). Las bandejas se muestran vacías hasta
        habilitar la integración.
      </span>
    </p>
    <p v-else-if="gtiStatusError" class="inc-mod__banner inc-mod__banner--warn">
      <i class="pi pi-exclamation-triangle" aria-hidden="true" />
      <span>No se pudo consultar <code>/incidentes/gti/status</code>; se intentará cargar tickets igualmente.</span>
    </p>

    <p v-if="incidentesLive.error" class="inc-mod__err">
      <i class="pi pi-times-circle" aria-hidden="true" />
      <span>{{ incidentesLive.error }}</span>
    </p>
    <p v-else-if="incidentesLive.refreshedAt" class="inc-mod__meta">
      Última carga: {{ formatRefreshed(incidentesLive.refreshedAt) }} ·
      {{ incidentesLive.rows.length }} ticket(s) en rango
      <span v-if="!incidentesLive.squadMatchAvailable"> · match de squads no disponible</span>
    </p>

    <nav class="inc-tabs" aria-label="Secciones incidentes">
      <RouterLink v-for="t in tabs" :key="t.name" :to="{ name: t.name }" :class="tabClass(t.name)">
        <i :class="t.icon" aria-hidden="true" />
        <span>{{ t.label }}</span>
      </RouterLink>
    </nav>

    <div class="inc-mod__body">
      <RouterView />
    </div>
  </div>
</template>

<style scoped>
.inc-mod {
  display: flex;
  flex-direction: column;
  gap: 0.95rem;
}

.inc-mod__hero {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
}

.inc-mod__hero-copy {
  flex: 1 1 28rem;
  min-width: 0;
}

.inc-mod__eyebrow {
  margin: 0 0 0.25rem;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #1361b9;
}

.inc-mod__title {
  margin: 0 0 0.4rem;
  font-family: Omnes, system-ui, sans-serif;
  font-size: 1.5rem;
  font-weight: 800;
  color: theme('colors.surface.800');
}

.inc-mod__sub {
  margin: 0;
  max-width: 56rem;
  font-size: 13px;
  line-height: 1.58;
  color: #5a6f82;
}

.inc-mod__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.45rem;
  flex-shrink: 0;
  min-width: 220px;
}

.inc-mod__refresh {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 13px;
  font-weight: 800;
  padding: 0.5rem 0.95rem;
  border-radius: 10px;
  border: 1px solid theme('colors.surface.300');
  background: #fff;
  color: theme('colors.surface.800');
  cursor: pointer;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.04);
}

.inc-mod__refresh:hover:not(:disabled) {
  border-color: #1361b9;
  color: #1361b9;
}

.inc-mod__refresh:disabled {
  opacity: 0.65;
  cursor: default;
}

.inc-mod__refresh-icon--spin {
  animation: inc-refresh-spin 0.8s linear infinite;
}

.inc-mod__progress {
  width: 100%;
  padding: 0.45rem 0.55rem 0.5rem;
  border: 1px solid theme('colors.surface.200');
  border-radius: 9px;
  background: #fff;
  box-shadow: 0 5px 14px rgba(15, 23, 42, 0.06);
}

.inc-mod__progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.3rem;
  font-size: 11px;
  font-weight: 700;
  color: #5a6f82;
}

.inc-mod__progress-head strong {
  color: #1361b9;
}

.inc-mod__progress-track {
  height: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: #e8eef5;
}

.inc-mod__progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #1361b9, #00b555);
  transition: width 0.18s ease;
}

@keyframes inc-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

.inc-mod__banner,
.inc-mod__err {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  padding: 0.7rem 0.85rem;
  border-radius: 12px;
  border: 1px solid theme('colors.surface.200');
}

.inc-mod__banner code {
  font-size: 12px;
}

.inc-mod__banner--ok {
  background: rgba(0, 107, 240, 0.06);
  color: theme('colors.surface.800');
}

.inc-mod__banner--poc {
  background: theme('colors.surface.50');
  color: theme('colors.surface.700');
}

.inc-mod__banner--warn {
  background: rgba(240, 170, 0, 0.12);
  color: theme('colors.surface.800');
}

.inc-mod__err {
  color: #b00020;
  font-weight: 700;
  background: rgba(241, 70, 73, 0.08);
}

.inc-mod__meta {
  margin: 0;
  font-size: 12px;
  color: theme('colors.surface.700');
}

.inc-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.4rem;
  background: theme('colors.surface.50');
  border-radius: 12px;
  border: 1px solid theme('colors.surface.200');
}

.inc-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.6rem 0.95rem;
  text-decoration: none;
  font-size: 13px;
  font-weight: 700;
  color: theme('colors.surface.700');
  border-radius: 10px;
  border: 1px solid transparent;
  transition:
    background 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}

.inc-tab:hover {
  color: #006bf0;
  background: rgba(255, 255, 255, 0.7);
}

.inc-tab--active {
  font-weight: 800;
  color: theme('colors.surface.800');
  background: #fff;
  border-color: theme('colors.surface.200');
  box-shadow: inset 0 -2px 0 0 #ff4298;
}

.inc-mod__body {
  background: linear-gradient(180deg, #ffffff 0%, theme('colors.surface.50') 100%);
  border-radius: 16px;
  padding: 1.25rem 1.3rem;
  border: 1px solid theme('colors.surface.200');
  box-shadow: theme('boxShadow.sm');
}

@media (max-width: 768px) {
  .inc-mod__hero {
    align-items: stretch;
    flex-direction: column;
  }

  .inc-mod__actions,
  .inc-mod__refresh {
    width: 100%;
  }

  .inc-mod__refresh {
    justify-content: center;
  }

  .inc-tabs {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: thin;
  }

  .inc-tab {
    flex: 1 0 auto;
    justify-content: center;
    white-space: nowrap;
  }

  .inc-mod__body {
    padding: 1rem;
    border-radius: 12px;
  }
}
</style>
