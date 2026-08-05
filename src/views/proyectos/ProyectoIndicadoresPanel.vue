<script setup lang="ts">
import { computed } from 'vue';
import type {
  ProyectoIndicadoresResponse,
  ProximoVencimientoGestionApi,
  SaludProyectoApi,
} from '@/lib/proyectos-api';

const props = defineProps<{
  detalle: ProyectoIndicadoresResponse['detalle'];
  proximoVencimiento?: ProximoVencimientoGestionApi | null;
  actualizadoEn: string;
}>();

const emit = defineEmits<{
  'ver-pendientes': [];
  'abrir-vencimiento': [item: ProximoVencimientoGestionApi];
}>();

const estadoColors: Record<string, string> = {
  Cerrado: 'var(--apex-color-gh)',
  'En Progreso': 'var(--apex-color-g100)',
  Abierto: 'var(--apex-color-neutral)',
  Bloqueado: 'var(--apex-color-re)',
};

function saludLabel(s: SaludProyectoApi): string {
  if (s === 'ambar') return 'Ámbar';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toneDays(days: number | null): string {
  if (days == null) return 'gris';
  if (days < 0) return 'rojo';
  if (days <= 30) return 'ambar';
  return 'verde';
}

function toneRisk(value: number): string {
  if (value === 0) return 'verde';
  if (value === 1) return 'ambar';
  return 'rojo';
}

function toneReprogramaciones(value: number): string {
  if (value === 0) return 'verde';
  if (value <= 3) return 'ambar';
  return 'rojo';
}

function toneDesfase(value: number): string {
  if (value <= 0) return 'verde';
  if (value <= 10) return 'ambar';
  return 'rojo';
}

function daysLabel(days: number | null): string {
  if (days == null) return '—';
  if (days < 0) return `Vencido hace ${Math.abs(days)} días`;
  return String(days);
}

const brecha = computed(() => {
  const real = props.detalle.avanceRealPct;
  const plan = props.detalle.avancePlanificadoPct;
  return real == null || plan == null ? null : real - plan;
});

const hitosDistribucion = computed(() =>
  props.detalle.hitosPorEstado.filter((item) => item.total > 0),
);

const donutStyle = computed(() => {
  const total = hitosDistribucion.value.reduce((sum, item) => sum + item.total, 0);
  if (!total) return { background: 'var(--apex-surface-muted)' };
  let cursor = 0;
  const segments = hitosDistribucion.value.map((item) => {
    const start = cursor;
    cursor += (item.total / total) * 100;
    return `${estadoColors[item.estado] ?? 'var(--apex-color-neutral-light)'} ${start}% ${cursor}%`;
  });
  return { background: `conic-gradient(${segments.join(', ')})` };
});

const sparklinePoints = computed(() => {
  const values = props.detalle.reprogramacionesMensuales.map((item) => item.total);
  const max = Math.max(1, ...values);
  return values
    .map((value, index) => {
      const x = values.length <= 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 28 - (value / max) * 24;
      return `${x},${y}`;
    })
    .join(' ');
});

function proximoTexto(item: ProximoVencimientoGestionApi): string {
  if (item.vencida) return `Vencido hace ${item.diasVencido} días`;
  if (item.diasRestantes === 0) return 'Vence hoy';
  return `Vence en ${item.diasRestantes} días`;
}

function formatActualizado(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}
</script>

<template>
  <div class="pi-dashboard">
    <p class="pi-dashboard__meta">Actualizado al cargar la pestaña: {{ formatActualizado(actualizadoEn) }}</p>

    <section class="pi-dashboard__kpis">
      <article class="pi-card pi-card--large" :class="`pi-card--${detalle.saludProyecto}`">
        <span class="pi-card__label">Salud del proyecto</span>
        <strong class="pi-card__hero"><span class="pi-card__light" />{{ saludLabel(detalle.saludProyecto) }}</strong>
      </article>
      <article class="pi-card pi-card--large">
        <span class="pi-card__label">Avance real vs planificado</span>
        <strong class="pi-card__hero pi-card__hero--compact">
          {{ detalle.avanceRealPct == null ? 'Pend.' : `${detalle.avanceRealPct}%` }} real ·
          {{ detalle.avancePlanificadoPct == null ? '—' : `${detalle.avancePlanificadoPct}%` }} plan
        </strong>
        <span v-if="brecha != null" class="pi-card__delta" :class="brecha < 0 ? 'is-negative' : 'is-positive'">
          {{ brecha > 0 ? '+' : brecha < 0 ? '−' : '' }}{{ Math.abs(brecha) }} pp
        </span>
      </article>
      <article class="pi-card pi-card--large" :class="`pi-card--${toneDays(detalle.diasRestantes)}`">
        <span class="pi-card__label">Días restantes hasta fin plan</span>
        <strong class="pi-card__hero pi-card__hero--compact">{{ daysLabel(detalle.diasRestantes) }}</strong>
      </article>
      <article class="pi-card pi-card--large" :class="`pi-card--${toneRisk(detalle.hitosRiesgo)}`">
        <span class="pi-card__label">Hitos en riesgo</span>
        <strong class="pi-card__hero">{{ detalle.hitosRiesgo }} de {{ detalle.hitosTotal }}</strong>
      </article>
    </section>

    <section class="pi-dashboard__charts">
      <article class="pi-card">
        <h3>Plan vs Real</h3>
        <div class="pi-bars">
          <div>
            <span>Planificado</span><strong>{{ detalle.avancePlanificadoPct ?? 0 }}%</strong>
            <div class="pi-bars__track"><span class="pi-bars__plan" :style="{ width: `${detalle.avancePlanificadoPct ?? 0}%` }" /></div>
          </div>
          <div>
            <span>Real</span><strong>{{ detalle.avanceRealPct ?? 0 }}%</strong>
            <div class="pi-bars__track"><span class="pi-bars__real" :class="`is-${detalle.saludProyecto}`" :style="{ width: `${detalle.avanceRealPct ?? 0}%` }" /></div>
          </div>
        </div>
      </article>
      <article class="pi-card pi-donut-card">
        <h3>Distribución de hitos por estado</h3>
        <div class="pi-donut-card__body">
          <div class="pi-donut" :style="donutStyle"><strong>{{ detalle.hitosTotal }}</strong></div>
          <ul>
            <li v-for="item in hitosDistribucion" :key="item.estado">
              <span class="pi-donut__dot" :style="{ background: estadoColors[item.estado] ?? 'var(--apex-color-neutral-light)' }" />
              {{ item.estado }} <strong>{{ item.total }}</strong>
            </li>
          </ul>
        </div>
      </article>
    </section>

    <section class="pi-dashboard__management">
      <article class="pi-card" :class="`pi-card--${toneReprogramaciones(detalle.reprogramaciones)}`">
        <span class="pi-card__label">Reprogramaciones</span>
        <strong class="pi-card__value">{{ detalle.reprogramaciones }}</strong>
        <svg class="pi-spark" viewBox="0 0 100 32" role="img" aria-label="Reprogramaciones de los últimos seis meses">
          <polyline :points="sparklinePoints" fill="none" stroke="var(--apex-color-g100)" stroke-width="2.5" />
        </svg>
      </article>
      <article class="pi-card" :class="`pi-card--${toneDesfase(detalle.desfaseDiasTotal)}`">
        <span class="pi-card__label">Días de desfase acumulado</span>
        <strong class="pi-card__value">{{ detalle.desfaseDiasTotal }} días</strong>
        <span>Hitos cerrados con atraso: {{ detalle.desfaseHitosCerrados }} días</span>
        <span>Actividades vencidas vivas: {{ detalle.desfaseActividadesVivas }} días</span>
      </article>
      <article class="pi-card">
        <span class="pi-card__label">Pendientes bloqueantes activos</span>
        <strong class="pi-card__value">{{ detalle.pendientesBloqueantesActivos }}</strong>
        <span :class="{ 'is-negative': detalle.pendientesBloqueantesVencidos > 0 }">{{ detalle.pendientesBloqueantesVencidos }} vencidos</span>
        <span :class="{ 'is-warning': detalle.pendientesBloqueantesPorVencer > 0 }">{{ detalle.pendientesBloqueantesPorVencer }} por vencer (≤5 días)</span>
        <button type="button" class="pi-card__link" @click="emit('ver-pendientes')">Ver pendientes →</button>
      </article>
      <button
        v-if="proximoVencimiento"
        type="button"
        class="pi-card pi-card--button"
        @click="emit('abrir-vencimiento', proximoVencimiento)"
      >
        <span class="pi-card__label">Próximo vencimiento</span>
        <strong class="pi-card__next">{{ proximoVencimiento.nombre }}</strong>
        <span :class="{ 'is-negative': proximoVencimiento.vencida }">{{ proximoTexto(proximoVencimiento) }}</span>
      </button>
      <article v-else class="pi-card">
        <span class="pi-card__label">Próximo vencimiento</span>
        <strong class="pi-card__value">—</strong>
        <span>Sin actividades o pendientes bloqueantes vivos.</span>
      </article>
    </section>
  </div>
</template>

<style scoped>
.pi-dashboard { display: grid; gap: 1rem; }
.pi-dashboard__meta { margin: 0; color: var(--apex-text-muted); font-size: 0.8rem; }
.pi-dashboard__kpis, .pi-dashboard__management { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.85rem; }
.pi-dashboard__charts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem; }
.pi-card { display: flex; flex-direction: column; gap: 0.55rem; min-width: 0; padding: 1rem; border: 1px solid var(--apex-border-soft); border-radius: var(--apex-radius-panel); background: var(--apex-surface-panel); box-shadow: var(--apex-shadow-soft); color: var(--apex-text-strong); text-align: left; }
.pi-card h3 { margin: 0 0 0.4rem; font-size: 0.9rem; }
.pi-card--large { min-height: 9rem; align-items: center; justify-content: center; text-align: center; }
.pi-card__label { color: var(--apex-text-muted); font-size: 0.72rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
.pi-card__hero { display: flex; align-items: center; gap: 0.55rem; font-size: 1.8rem; }
.pi-card__hero--compact { font-size: 1.35rem; }
.pi-card__value { font-size: 1.75rem; }
.pi-card__next { font-size: 1.05rem; line-height: 1.35; }
.pi-card__light { width: 1.25rem; height: 1.25rem; border-radius: 50%; background: currentColor; }
.pi-card--verde { border-top: 3px solid var(--apex-color-gh); }
.pi-card--ambar { border-top: 3px solid var(--apex-color-oy); }
.pi-card--rojo { border-top: 3px solid var(--apex-color-re); }
.pi-card--gris { border-top: 3px solid var(--apex-color-neutral); }
.pi-card__delta, .is-negative, .is-positive, .is-warning { font-weight: 700; }
.is-negative { color: var(--apex-color-re); }
.is-positive { color: var(--apex-color-gh); }
.is-warning { color: var(--apex-color-oy); }
.pi-bars { display: grid; gap: 1rem; }
.pi-bars > div { display: grid; grid-template-columns: 1fr auto; gap: 0.35rem; }
.pi-bars__track { grid-column: 1 / -1; height: 14px; overflow: hidden; border-radius: 999px; background: var(--apex-surface-muted); }
.pi-bars__track span { display: block; height: 100%; border-radius: inherit; }
.pi-bars__plan { background: var(--apex-color-g100); }
.pi-bars__real.is-verde { background: var(--apex-color-gh); }
.pi-bars__real.is-ambar { background: var(--apex-color-oy); }
.pi-bars__real.is-rojo { background: var(--apex-color-re); }
.pi-bars__real.is-gris { background: var(--apex-color-neutral); }
.pi-donut-card__body { display: flex; align-items: center; justify-content: center; gap: 1.5rem; }
.pi-donut { display: grid; place-items: center; width: 128px; height: 128px; border-radius: 50%; }
.pi-donut::after { content: ''; grid-area: 1 / 1; width: 72px; height: 72px; border-radius: 50%; background: var(--apex-surface-panel); }
.pi-donut strong { grid-area: 1 / 1; z-index: 1; font-size: 1.45rem; }
.pi-donut-card ul { display: grid; gap: 0.45rem; margin: 0; padding: 0; list-style: none; }
.pi-donut-card li { display: flex; align-items: center; gap: 0.4rem; color: var(--apex-text-muted); }
.pi-donut-card li strong { margin-left: auto; color: var(--apex-text-strong); }
.pi-donut__dot { width: 0.65rem; height: 0.65rem; border-radius: 50%; }
.pi-spark { width: 100%; height: 3rem; margin-top: auto; }
.pi-card__link { align-self: flex-start; margin-top: auto; border: 0; background: transparent; color: var(--apex-color-g100); font-weight: 800; cursor: pointer; }
.pi-card--button { font: inherit; cursor: pointer; }
.pi-card--button:hover { border-color: var(--apex-color-g100); }
@media (max-width: 1050px) {
  .pi-dashboard__kpis, .pi-dashboard__management { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 700px) {
  .pi-dashboard__kpis, .pi-dashboard__management, .pi-dashboard__charts { grid-template-columns: 1fr; }
}
</style>
