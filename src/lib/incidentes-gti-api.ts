import { apex } from '@/plugins/axios';

export type GtiIntegrationStatus = {
  configured: boolean;
  disabled?: boolean;
  available?: boolean;
  upstreamHost: string | null;
  incidentesPrefix: string;
};

/** Estado de la integración (configuración y disponibilidad del upstream GTI). */
export async function fetchGtiIntegrationStatus(): Promise<GtiIntegrationStatus | null> {
  try {
    const { data } = await apex.get<GtiIntegrationStatus>('/incidentes/gti/status');
    return data;
  } catch {
    return null;
  }
}
