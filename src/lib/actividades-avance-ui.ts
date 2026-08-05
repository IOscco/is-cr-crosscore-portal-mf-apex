import type { ActividadItemApi } from '@/lib/actividades-api';

/**
 * % avance por fila (UI):
 * - sub_actividad: 100 si está cerrada, 0 si no.
 * - pendiente NO bloqueante: siempre 0 (no aporta al avance del hito).
 * - pendiente bloqueante: 100/0 según estado, o % de hijos cerrados si los tuviera (no aplica hoy).
 * - actividad: si tiene hijos (sub-actividad o pendiente bloqueante) calcula % por hijos cerrados;
 *   si no tiene hijos contables, 100/0 según estado.
 */
export function porcentajeAvanceFila(act: ActividadItemApi): number {
  const cerrado = String(act.estado ?? '').trim() === 'Cerrado';
  if (act.tipo === 'sub_actividad') {
    return cerrado ? 100 : 0;
  }
  if (act.tipo === 'pendiente') {
    if (act.esDependencia !== true) {
      return 0;
    }
    return cerrado ? 100 : 0;
  }
  if (act.tipo === 'actividad') {
    const hijos = (act.subtareas ?? []).filter(
      (s) => s.tipo === 'sub_actividad' || (s.tipo === 'pendiente' && s.esDependencia === true),
    );
    if (hijos.length > 0) {
      const c = hijos.filter((s) => String(s.estado ?? '').trim() === 'Cerrado').length;
      return Math.round((c / hijos.length) * 100);
    }
    return cerrado ? 100 : 0;
  }
  return 0;
}
