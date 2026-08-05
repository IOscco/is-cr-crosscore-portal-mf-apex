<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { IsButton, IsSelect } from 'is-uikit-components-vue';
import type { SelectOption } from '@/types/forms';
import BadgePill from '@/components/ui/BadgePill.vue';
import type { ProgramBoardRow } from '@/types/poc-data';
import { estatusGeneralToPillVariant } from '@/lib/estado-badge';
import { fetchIniciativaById, patchIniciativaSquad, type IniciativaApiRow } from '@/lib/iniciativas-api';
import { fetchSquadsActive, type SquadApi } from '@/lib/squads-api';
import { usePortalAccess } from '@/modules/shared/composables/usePortalAccess';

const route = useRoute();
const id = computed(() => String(route.params.id ?? ''));
const { canManageIniciativas } = usePortalAccess();

const apiRow = ref<IniciativaApiRow | null>(null);
const loading = ref(false);
const err = ref<string | null>(null);
const squads = ref<SquadApi[]>([]);
const squadPick = ref<string | null>(null);

const row = computed<ProgramBoardRow | null>(() => {
  if (!apiRow.value) {
    return null;
  }
  const p = apiRow.value.payload as Record<string, unknown>;
  return {
    squad: String(p.squad ?? ''),
    epica: String(p.epica ?? ''),
    estatusGeneral: String(p.estatusGeneral ?? ''),
    faseActual: String(p.faseActual ?? ''),
    fechaPap: String(p.fechaPap ?? ''),
    ticketGti: String(p.ticketGti ?? ''),
    tl: String(p.tl ?? ''),
    dev: String(p.dev ?? ''),
    priorizacion: String(p.priorizacion ?? ''),
    hitoQ2: String(apiRow.value.hitoComprometido ?? apiRow.value.hito ?? p.hito ?? p.hitoQ2 ?? ''),
    sprintCompromiso: String(apiRow.value.sprintComprometido ?? p.sprintCompromiso ?? ''),
    sprintPaseProduccion: '',
    sistema: String(apiRow.value.sistemaComponente?.nombre ?? p.sistema ?? ''),
    tipoIniciativa: String(apiRow.value.tipoIniciativa?.nombre ?? p.tipoIniciativa ?? ''),
    origenIniciativa: String(apiRow.value.origen ?? apiRow.value.origenIniciativa ?? p.origenIniciativa ?? p.origenDeLaIniciativa ?? ''),
    fechaComprometida: String(p.fechaComprometida ?? p.fechaCompromiso ?? ''),
  };
});

const squadOptions = computed<SelectOption[]>(() => [
  { value: '', label: 'Sin Squad' },
  ...squads.value.map((s) => ({ value: s.id, label: s.nombre })),
]);

async function load(): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id.value)) {
    apiRow.value = null;
    err.value = 'Identificador inválido';
    return;
  }
  loading.value = true;
  err.value = null;
  try {
    apiRow.value = await fetchIniciativaById(id.value);
    squadPick.value = apiRow.value.squadId ?? '';
  } catch {
    apiRow.value = null;
    err.value = 'No se pudo cargar la iniciativa.';
  } finally {
    loading.value = false;
  }
}

watch(id, () => {
  void load();
});

void (async () => {
  try {
    squads.value = await fetchSquadsActive();
  } catch {
    squads.value = [];
  }
})();

async function guardarSquad(): Promise<void> {
  if (!apiRow.value) {
    return;
  }
  const sid = squadPick.value === '' || squadPick.value == null ? null : squadPick.value;
  try {
    apiRow.value = await patchIniciativaSquad(apiRow.value.id, sid);
    squadPick.value = apiRow.value.squadId ?? '';
  } catch {
    err.value = 'No se pudo actualizar el Squad.';
  }
}

const fields: { key: keyof ProgramBoardRow; label: string }[] = [
  { key: 'squad', label: 'Squad' },
  { key: 'epica', label: 'Épica (iniciativa)' },
  { key: 'estatusGeneral', label: 'Estatus general' },
  { key: 'faseActual', label: 'Fase actual' },
  { key: 'fechaPap', label: 'Fecha planificada PaP' },
  { key: 'ticketGti', label: '# Ticket GTI' },
  { key: 'tl', label: 'TL encargado' },
  { key: 'dev', label: 'Dev encargado' },
  { key: 'priorizacion', label: 'Priorización' },
  { key: 'hitoQ2', label: 'Hito' },
  { key: 'sprintCompromiso', label: 'Sprint comprometido' },
  { key: 'sistema', label: 'Sistema / componente' },
  { key: 'tipoIniciativa', label: 'Tipo de iniciativa' },
  { key: 'origenIniciativa', label: 'Origen de la iniciativa' },
  { key: 'fechaComprometida', label: 'Fecha comprometida' },
];

function tpoNombre(s: SquadApi | null | undefined): string {
  if (!s?.miembros) {
    return '—';
  }
  const tpo = s.miembros.find((m) => m.rol === 'tpo');
  return tpo?.usuarioNombre ?? '—';
}
</script>

<template>
  <div class="det">
    <RouterLink :to="{ name: 'iniciativas' }" class="det__back">
      <IsButton severity="primary" text size="small" label="← Volver al listado" />
    </RouterLink>

    <div v-if="loading" class="det__skeleton" aria-label="Cargando iniciativa" aria-busy="true">
      <span class="apex-skeleton det__skeleton-title" />
      <span class="apex-skeleton det__skeleton-badge" />
      <div class="det__skeleton-fields">
        <span v-for="i in 10" :key="i" class="apex-skeleton det__skeleton-field" :style="{ width: `${55 + (i % 4) * 12}%`, animationDelay: `${i * 40}ms` }" />
      </div>
    </div>
    <p v-else-if="err" class="det__missing">{{ err }}</p>

    <template v-else-if="row && apiRow">
      <header class="det__head">
        <h2 class="det__title">{{ row.epica || 'Iniciativa' }}</h2>
        <div class="det__tags">
          <BadgePill
            v-if="row.estatusGeneral"
            :variant="estatusGeneralToPillVariant(row.estatusGeneral)"
            :title="row.estatusGeneral"
          >
            {{ row.estatusGeneral }}
          </BadgePill>
          <span class="det__id">ID: {{ apiRow.id }}</span>
        </div>
      </header>

      <section v-if="apiRow.squad || canManageIniciativas" class="det__squad">
        <h3 class="det__squad-h">Squad asignado (HU-ITP-055)</h3>
        <template v-if="apiRow.squad">
          <p><strong>{{ apiRow.squad.nombre }}</strong> · TPO: {{ tpoNombre(apiRow.squad) }}</p>
          <ul class="det__squad-ul">
            <li v-for="m in apiRow.squad.miembros" :key="m.id">{{ m.rol }}: {{ m.usuarioNombre }}</li>
          </ul>
        </template>
        <p v-else class="det__muted">Sin Squad asignado.</p>
        <div v-if="canManageIniciativas" class="det__squad-edit">
          <IsSelect
            v-model="squadPick"
            :options="squadOptions"
            option-label="label"
            option-value="value"
            placeholder="Squad"
            fluid
            class="det__squad-sel"
          />
          <IsButton size="small" label="Guardar asignación" @click="guardarSquad" />
        </div>
      </section>

      <dl class="det__grid">
        <template v-for="f in fields" :key="f.key">
          <dt>{{ f.label }}</dt>
          <dd>{{ row[f.key] || '—' }}</dd>
        </template>
      </dl>
    </template>

    <p v-else class="det__missing">No se encontró la iniciativa para el identificador «{{ id }}».</p>
  </div>
</template>

<style scoped>
.det {
  display: flex;
  flex-direction: column;
}
.det__back {
  margin-bottom: 1rem;
  align-self: flex-start;
}
.det__muted {
  font-size: 13px;
  color: theme('colors.surface.700');
}
.det__head {
  margin-bottom: 1.25rem;
}
.det__title {
  margin: 0 0 0.5rem;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: theme('colors.surface.800');
  line-height: 1.35;
}
.det__tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
.det__id {
  font-size: 12px;
  color: theme('colors.surface.700');
}
.det__squad {
  margin-bottom: 1.25rem;
  padding: 1rem 1.1rem;
  border-radius: 8px;
  border: 1px solid theme('colors.surface.200');
  background: #f8fafc;
}
.det__squad-h {
  margin: 0 0 0.5rem;
  font-size: 0.95rem;
  font-weight: 700;
}
.det__squad-ul {
  margin: 0.35rem 0 0;
  padding-left: 1.1rem;
  font-size: 13px;
}
.det__squad-edit {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  margin-top: 0.75rem;
}
.det__squad-sel {
  flex: 1 1 14rem;
  max-width: 22rem;
}
.det__grid {
  display: grid;
  grid-template-columns: 11rem 1fr;
  gap: 0.65rem 1.25rem;
  margin: 0;
  padding: 1.25rem 1.35rem;
  font-size: 14px;
  border-radius: 8px;
  border: 1px solid theme('colors.surface.200');
  background: linear-gradient(180deg, #ffffff 0%, theme('colors.surface.50') 100%);
  box-shadow: theme('boxShadow.sm');
}
.det__grid dt {
  margin: 0;
  color: theme('colors.surface.800');
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.det__grid dd {
  margin: 0;
  color: theme('colors.surface.500');
}
.det__missing {
  color: #c0392b;
  font-size: 14px;
}

/* ── Skeleton ─────────────────────────────────────────────────── */
.det__skeleton {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  animation: apex-fade-in 0.2s ease-out both;
}
.det__skeleton-title {
  width: 55%;
  height: 1.5rem;
  border-radius: 8px;
}
.det__skeleton-badge {
  width: 6rem;
  height: 1.5rem;
  border-radius: 999px;
}
.det__skeleton-fields {
  display: grid;
  gap: 0.55rem;
  margin-top: 0.5rem;
}
.det__skeleton-field {
  height: 0.875rem;
}

/* ── Mejora visual del grid ──────────────────────────────────── */
.det__head {
  animation: apex-fade-in 0.25s ease-out both;
}
.det__grid {
  animation: apex-fade-in 0.25s ease-out 0.05s both;
  border-color: #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
}
.det__squad {
  animation: apex-fade-in 0.25s ease-out 0.03s both;
  border-color: #e2e8f0;
  border-radius: 12px;
  background: #f8fafc;
}
</style>
