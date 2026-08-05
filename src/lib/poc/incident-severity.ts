import type { IncidentPocRow } from '../../types/poc-data';

export type TrafficSeverity = 'danger' | 'warn' | 'success' | 'secondary';

/** Días sin actualización de estado calculados desde GTI. */
export function incidentDaysWithoutStatusChange(row: IncidentPocRow): number | null {
  return typeof row.diasSinCambio === 'number' && Number.isFinite(row.diasSinCambio) ? row.diasSinCambio : null;
}

/** Semáforo solicitado: OK <= 15, alerta <= 30, crítico > 30. */
export function incidentTrafficSeverity(row: IncidentPocRow): TrafficSeverity {
  const d = incidentDaysWithoutStatusChange(row);
  if (d === null) {
    return 'secondary';
  }
  if (d <= 15) {
    return 'success';
  }
  if (d <= 30) {
    return 'warn';
  }
  return 'danger';
}

export function incidentTrafficLabel(row: IncidentPocRow): string {
  const d = incidentDaysWithoutStatusChange(row);
  if (d === null) {
    return '—';
  }
  if (d <= 15) {
    return 'OK';
  }
  if (d <= 30) {
    return '>15 días';
  }
  return '>30 días';
}
