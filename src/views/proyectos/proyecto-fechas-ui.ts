import type { ActividadGrupoApi, ActividadItemApi } from '@/lib/actividades-api';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoToUtcMs(value: string | null | undefined): number | null {
  const s = String(value ?? '').trim();
  if (!ISO_DATE.test(s)) {
    return null;
  }
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function todayIsoLima(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function calcularAvancePlanificadoProyecto(
  fechaInicioPlan: string | null | undefined,
  fechaFinPlan: string | null | undefined,
  todayIso = todayIsoLima(),
): number | null {
  const ini = isoToUtcMs(fechaInicioPlan);
  const fin = isoToUtcMs(fechaFinPlan);
  const hoy = isoToUtcMs(todayIso);
  if (ini == null || fin == null || hoy == null || fin <= ini) {
    return null;
  }
  if (hoy <= ini) {
    return 0;
  }
  if (hoy >= fin) {
    return 100;
  }
  return Math.round(((hoy - ini) / (fin - ini)) * 100);
}

function maxIso(a: string, b: string): string {
  if (!ISO_DATE.test(a)) return b;
  if (!ISO_DATE.test(b)) return a;
  return a > b ? a : b;
}

function collectActividadFin(act: ActividadItemApi, includeAll: boolean): string {
  let max = '';
  const isBlockingPendiente = act.tipo === 'pendiente' && act.esDependencia === true;
  if (includeAll || act.tipo === 'actividad' || act.tipo === 'sub_actividad' || isBlockingPendiente) {
    max = String(act.fechaFinPlan ?? '').trim();
  }
  for (const st of act.subtareas ?? []) {
    max = maxIso(max, collectActividadFin(st, false));
  }
  return max;
}

export function calcularFechaFinPlanProyecto(grupos: ActividadGrupoApi[]): string {
  let max = '';
  for (const g of grupos ?? []) {
    max = maxIso(max, String(g.hitoFechaFinPlan ?? g.fechaFinPlan ?? '').trim());
    for (const it of g.items ?? []) {
      max = maxIso(max, collectActividadFin(it, true));
    }
    for (const p of g.pendientesNivelHito ?? []) {
      if (p.esDependencia === true) {
        max = maxIso(max, String(p.fechaFinPlan ?? '').trim());
      }
    }
  }
  return max;
}
