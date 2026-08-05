import type { GtiTicket } from '@/lib/incidentes-gti-types';

function normEst(estado: string): string {
  return estado
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

const ESTADOS_G1 = new Set(['pase ejecutado derivado a validacion analista']);

const ESTADOS_G2 = new Set([
  'asignado',
  'asignado a desarrollo',
  'asignado para priorizar',
  'en ejecucion',
  'reasignar',
]);

const ESTADOS_G3 = new Set(['cerrado aceptado', 'rechazado', 'rechazado por el vp', 'rechazado por vp']);

export function classifyIncidentGrupo(estadoRaw: string | null | undefined): 'G1' | 'G2' | 'G3' | 'OTROS' {
  const key = normEst(estadoRaw ?? '');
  if (!key) {
    return 'OTROS';
  }
  if (ESTADOS_G3.has(key)) {
    return 'G3';
  }
  if (ESTADOS_G1.has(key)) {
    return 'G1';
  }
  if (ESTADOS_G2.has(key)) {
    return 'G2';
  }
  return 'OTROS';
}

export function isClosedIncidentState(estadoRaw: string | null | undefined): boolean {
  return classifyIncidentGrupo(estadoRaw) === 'G3';
}

export function partitionIncidentesByGrupo(
  rows: GtiTicket[],
  options: { requireSquad?: boolean } = {},
): {
  g1: GtiTicket[];
  g2: GtiTicket[];
  g3: GtiTicket[];
  otros: GtiTicket[];
  sinSquad: GtiTicket[];
  soporteNegocio: GtiTicket[];
} {
  const g1: GtiTicket[] = [];
  const g2: GtiTicket[] = [];
  const g3: GtiTicket[] = [];
  const otros: GtiTicket[] = [];
  const sinSquad: GtiTicket[] = [];
  const soporteNegocio: GtiTicket[] = [];
  const requireSquad = options.requireSquad ?? true;

  for (const r of rows) {
    if (r.soporteNegocio) {
      soporteNegocio.push(r);
      continue;
    }
    if (requireSquad && !r.squad) {
      sinSquad.push(r);
      continue;
    }
    const g = classifyIncidentGrupo(r.estadoActual);
    if (g === 'G1') {
      g1.push(r);
    } else if (g === 'G2') {
      g2.push(r);
    } else if (g === 'G3') {
      g3.push(r);
    } else {
      otros.push(r);
    }
  }
  return { g1, g2, g3, otros, sinSquad, soporteNegocio };
}
