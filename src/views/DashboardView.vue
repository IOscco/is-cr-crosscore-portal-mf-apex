<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { IncidentsDashboardPoc } from '@/types/poc-data';
import dash from '@/data/poc/incidents-dashboard.json';
import { fetchProyectosDashboardMetricas } from '@/lib/proyectos-api';
import { getIncidentesGtiRows } from '@/lib/incidentes-gti-live-cache';
import { partitionIncidentesByGrupo } from '@/lib/incidentes-gti-classify';
import { fetchSquadsActive } from '@/lib/squads-api';
import { resolveTicketsSquad } from '@/lib/squad-resolutor-match';
import { apex } from '@/plugins/axios';

const readiness = ref<string>('…');
const d = dash as IncidentsDashboardPoc;
const incidentesKpi = ref({ abiertos: 0, cerrados: 0 });
const incidentesAbiertos = computed(() => incidentesKpi.value.abiertos);
const incidentesCerrados = computed(() => incidentesKpi.value.cerrados);
const iniciativasAbiertos = computed(() => d.iniciativasAbiertas ?? d.iniciativasPb);
const iniciativasCerrados = computed(() => d.iniciativasCerradas ?? 0);
const proyectosAbiertos = ref(0);
const proyectosCerrados = ref(0);

onMounted(async () => {
  try {
    // /readiness es un endpoint público de salud; responseType `text` evita
    // que axios intente parsear JSON cuando devuelve "OK".
    const res = await apex.get<string>('/readiness', { responseType: 'text' });
    readiness.value = `${res.status} — ${String(res.data).slice(0, 120)}`;
  } catch {
    readiness.value = 'No disponible';
  }
  try {
    const pr = await fetchProyectosDashboardMetricas();
    proyectosAbiertos.value = pr.abiertos;
    proyectosCerrados.value = pr.cerrados;
  } catch {
    proyectosAbiertos.value = 0;
    proyectosCerrados.value = 0;
  }
  try {
    const [{ rows, error }, squads] = await Promise.all([getIncidentesGtiRows(), fetchSquadsActive().catch(() => null)]);
    if (!error) {
      const p = partitionIncidentesByGrupo(squads ? resolveTicketsSquad(rows, squads) : rows, {
        requireSquad: Array.isArray(squads),
      });
      incidentesKpi.value = {
        abiertos: p.g1.length + p.g2.length + p.otros.length,
        cerrados: p.g3.length,
      };
    } else {
      incidentesKpi.value = {
        abiertos: d.conteos.g1Ratificacion + d.conteos.g2Desarrollo + (d.conteos.otros ?? 0),
        cerrados: d.conteos.g3Cerrados,
      };
    }
  } catch {
    incidentesKpi.value = {
      abiertos: d.conteos.g1Ratificacion + d.conteos.g2Desarrollo + (d.conteos.otros ?? 0),
      cerrados: d.conteos.g3Cerrados,
    };
  }
});
</script>

<template>
  <div class="dash">
    <h1 class="dash__h">Dashboard ejecutivo</h1>
    <p class="dash__sub">
      Indicadores globales de los tres módulos principales (HU-ITP-010). Los valores de proyectos se calculan en tiempo
      real desde la API.
    </p>

    <div class="dash-blocks">
      <RouterLink class="dash-block dash-block--link" :to="{ name: 'incidentes-dashboard' }">
        <h2 class="dash-block__title">Incidentes GTI</h2>
        <div class="dash-block__metrics">
          <div>
            <span class="dash-block__n">{{ incidentesAbiertos }}</span>
            <span class="dash-block__lbl">Abiertos</span>
          </div>
          <div>
            <span class="dash-block__n">{{ incidentesCerrados }}</span>
            <span class="dash-block__lbl">Cerrados</span>
          </div>
        </div>
        <span class="dash-block__cta">Ver detalle →</span>
      </RouterLink>

      <RouterLink class="dash-block dash-block--link" :to="{ name: 'iniciativas' }">
        <h2 class="dash-block__title">Iniciativas Q2</h2>
        <div class="dash-block__metrics">
          <div>
            <span class="dash-block__n">{{ iniciativasAbiertos }}</span>
            <span class="dash-block__lbl">Abiertos</span>
          </div>
          <div>
            <span class="dash-block__n">{{ iniciativasCerrados }}</span>
            <span class="dash-block__lbl">Cerrados</span>
          </div>
        </div>
        <span class="dash-block__cta">Ver detalle →</span>
      </RouterLink>

      <RouterLink class="dash-block dash-block--link" :to="{ name: 'proyectos' }">
        <h2 class="dash-block__title">Proyectos</h2>
        <div class="dash-block__metrics">
          <div>
            <span class="dash-block__n">{{ proyectosAbiertos }}</span>
            <span class="dash-block__lbl">Abiertos</span>
          </div>
          <div>
            <span class="dash-block__n">{{ proyectosCerrados }}</span>
            <span class="dash-block__lbl">Cerrados</span>
          </div>
        </div>
        <span class="dash-block__cta">Ver detalle →</span>
      </RouterLink>
    </div>

    <div class="kpi kpi--accent dash-readiness">
      <span class="kpi__label">Readiness API</span>
      <span class="kpi__value kpi__value--sm">{{ readiness }}</span>
    </div>
  </div>
</template>

<style scoped>
.dash__h {
  margin: 0 0 0.4rem;
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: theme('colors.surface.800');
  animation: apex-fade-in 0.25s ease-out both;
}
.dash__sub {
  margin: 0 0 1.35rem;
  font-size: 14px;
  color: theme('colors.surface.700');
  max-width: 640px;
  line-height: 1.55;
}
.dash-blocks {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.1rem;
  margin-bottom: 1.25rem;
  animation: apex-fade-in 0.3s ease-out 0.05s both;
}
.dash-block {
  position: relative;
  border-radius: 8px;
  padding: 1.2rem 1.35rem;
  background: linear-gradient(180deg, #ffffff 0%, theme('colors.surface.50') 100%);
  border: 1px solid theme('colors.surface.200');
  box-shadow: theme('boxShadow.md');
}
.dash-block--link {
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}
.dash-block--link::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: 8px 8px 0 0;
  background: linear-gradient(90deg, #1361b9 0%, #4a90e2 55%, #f0aa00 100%);
}
.dash-block--link:hover {
  border-color: rgba(19, 97, 185, 0.35);
  box-shadow: 0 8px 28px rgba(19, 97, 185, 0.12);
  transform: translateY(-3px);
}
.dash-block--link:focus-visible {
  outline: 2px solid #006bf0;
  outline-offset: 3px;
}
.dash-block__title {
  margin: 0.35rem 0 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.dash-block__metrics {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.dash-block__n {
  display: block;
  font-size: 1.65rem;
  font-weight: 700;
  color: theme('colors.surface.800');
  line-height: 1.1;
}
.dash-block__lbl {
  font-size: 12px;
  font-weight: 600;
  color: theme('colors.surface.700');
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.dash-block__cta {
  font-size: 13px;
  font-weight: 700;
  color: #1361b9;
}
.dash-readiness {
  max-width: 36rem;
}
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 1.1rem;
}
.kpi {
  position: relative;
  background: linear-gradient(180deg, #ffffff 0%, theme('colors.surface.50') 100%);
  border-radius: 8px;
  padding: 1.15rem 1.3rem;
  box-shadow: theme('boxShadow.md');
  border: 1px solid theme('colors.surface.200');
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  overflow: hidden;
}
.kpi--link::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: linear-gradient(90deg, #1361b9 0%, #4a90e2 55%, #f0aa00 100%);
  opacity: 0.9;
}
.kpi--link {
  text-decoration: none;
  color: inherit;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}
.kpi--link:hover {
  border-color: rgba(19, 97, 185, 0.35);
  box-shadow: theme('boxShadow.lg');
  transform: translateY(-2px);
}
.kpi--accent {
  border-color: theme('colors.surface.200');
  background: linear-gradient(135deg, #ffffff 0%, theme('colors.surface.50') 100%);
}
.kpi__label {
  font-size: 11px;
  font-weight: 700;
  color: theme('colors.surface.800');
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.kpi__value {
  font-size: 1.75rem;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.kpi--accent .kpi__value {
  color: theme('colors.surface.500');
}
.kpi__value--sm {
  font-size: 0.8rem;
  font-weight: 500;
  word-break: break-word;
  line-height: 1.35;
}
.kpi__hint {
  font-size: 12px;
  color: theme('colors.surface.700');
  line-height: 1.35;
}
</style>
