import { computed, reactive, ref, type InjectionKey } from 'vue';
import type { GtiTicket, GtiTicketListResponse } from '@/lib/incidentes-gti-types';
import { getIncidentesGtiRows, invalidateIncidentesGtiCache } from '@/lib/incidentes-gti-live-cache';
import { partitionIncidentesByGrupo } from '@/lib/incidentes-gti-classify';
import { fetchSquadsActive } from '@/lib/squads-api';
import { resolveTicketsSquad } from '@/lib/squad-resolutor-match';

export function useIncidentesGtiLive() {
  const rows = ref<GtiTicket[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const meta = ref<GtiTicketListResponse['meta'] | null>(null);
  const refreshedAt = ref<string | null>(null);
  const squadMatchAvailable = ref(false);

  const byGrupo = computed(() => partitionIncidentesByGrupo(rows.value, { requireSquad: squadMatchAvailable.value }));

  const conteos = computed(() => ({
    g1Ratificacion: byGrupo.value.g1.length,
    g2Desarrollo: byGrupo.value.g2.length,
    g3Cerrados: byGrupo.value.g3.length,
    otros: byGrupo.value.otros.length,
    sinSquad: byGrupo.value.sinSquad.length,
    soporteNegocio: byGrupo.value.soporteNegocio.length,
  }));

  async function load(force = false): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const [{ rows: next, error: err, meta: m }, squadsResult] = await Promise.all([
        getIncidentesGtiRows({ force }),
        fetchSquadsActive().catch(() => null),
      ]);
      squadMatchAvailable.value = Array.isArray(squadsResult);
      rows.value = squadsResult ? resolveTicketsSquad(next, squadsResult) : next;
      error.value = err;
      meta.value = m;
      refreshedAt.value = new Date().toISOString();
    } finally {
      loading.value = false;
    }
  }

  return reactive({
    rows,
    loading,
    error,
    meta,
    refreshedAt,
    squadMatchAvailable,
    load,
    invalidateCache: invalidateIncidentesGtiCache,
    byGrupo,
    conteos,
  });
}

export type IncidentesGtiLiveStore = ReturnType<typeof useIncidentesGtiLive>;

export const incidentesGtiLiveKey: InjectionKey<IncidentesGtiLiveStore> = Symbol('incidentesGtiLive');
