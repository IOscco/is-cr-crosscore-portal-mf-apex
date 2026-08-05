import { classifyIncidentGrupo } from '@/lib/incidentes-gti-classify';

export type NivelAlerta = 'OK' | 'ALERTA' | 'CRITICO' | 'SIN_FECHA' | 'NO_APLICA';

export interface ResultadoAlerta {
  nivel: NivelAlerta;
  dias: number | null;
  label: string;
  color: string;
}

export function calcularAlertaIncidente(
  fechaUltimoEstado: string | null,
  estadoActual: string | null | undefined,
): ResultadoAlerta {
  if (classifyIncidentGrupo(estadoActual) === 'G3') {
    return { nivel: 'NO_APLICA', dias: null, label: 'No aplica', color: '#94A3B8' };
  }
  if (!fechaUltimoEstado) {
    return { nivel: 'SIN_FECHA', dias: null, label: '—', color: '#9E9E9E' };
  }
  const dias = Math.floor((Date.now() - new Date(fechaUltimoEstado).getTime()) / 86_400_000);
  if (!Number.isFinite(dias)) {
    return { nivel: 'SIN_FECHA', dias: null, label: '—', color: '#9E9E9E' };
  }
  if (dias > 30) {
    return { nivel: 'CRITICO', dias, label: '>30 días', color: '#F14649' };
  }
  if (dias > 15) {
    return { nivel: 'ALERTA', dias, label: '>15 días', color: '#F0AA00' };
  }
  return { nivel: 'OK', dias, label: 'OK', color: '#00B555' };
}
