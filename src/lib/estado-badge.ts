import type { BadgePillVariant, BadgeXSVariant } from '@/types/badge-ui';
import type { TrafficSeverity } from '@/lib/poc/incident-severity';

export type { BadgePillVariant, BadgeXSVariant };

/**
 * Estatus de proyecto / iniciativa (HU-025, Program Board, texto libre).
 * Prioriza prefijos numéricos 1–6 cuando existan.
 */
export function estatusGeneralToPillVariant(raw: string): BadgePillVariant {
  const s = String(raw ?? '').trim();
  const t = s.toLowerCase();
  if (!s || s === '—') {
    return 'gray';
  }
  if (t === 'no iniciado' || t.includes('no iniciado') || t.includes('abierto') || t.includes('pendiente planificar')) {
    return 'gray';
  }
  if (t.includes('bloque')) {
    return 'red';
  }
  if (t.includes('desestim')) {
    return 'gray';
  }
  if (t.includes('planificación') || t.includes('planificacion')) {
    return 'purple';
  }
  if (t.includes('pausa')) {
    return 'orange';
  }
  if (t.includes('cancelado')) {
    return 'red';
  }
  if (/^1[\.\s]/.test(s) || t.includes('por iniciar')) {
    return 'sky';
  }
  if (/^2[\.\s]/.test(s) || t.includes('planific')) {
    return 'purple';
  }
  if (/^3[\.\s]/.test(s) || t.includes('progreso')) {
    return 'blue';
  }
  if (/^4[\.\s]/.test(s) || t.includes('riesgo') || t.includes('atras')) {
    return 'orange';
  }
  if (/^5[\.\s]/.test(s) || t.includes('deten') || t.includes('cancel')) {
    return 'red';
  }
  if (/^6[\.\s]/.test(s) || t.includes('complet') || t.includes('cerrad')) {
    return 'teal';
  }
  if (t.includes('progreso')) {
    return 'blue';
  }
  if (t.includes('planif')) {
    return 'purple';
  }
  if (t.includes('inici')) {
    return 'sky';
  }
  if (t.includes('riesgo') || t.includes('atras')) {
    return 'orange';
  }
  if (t.includes('deten') || t.includes('cancel')) {
    return 'red';
  }
  if (t.includes('complet')) {
    return 'teal';
  }
  return 'gray';
}

export function trafficSeverityToPillVariant(s: TrafficSeverity): BadgePillVariant {
  if (s === 'danger') {
    return 'red';
  }
  if (s === 'warn') {
    return 'orange';
  }
  if (s === 'success') {
    return 'teal';
  }
  return 'gray';
}

/** Estado textual de ticket GTI (PoC). */
export function estadoTicketToPillVariant(raw: string): BadgePillVariant {
  const t = String(raw ?? '').toLowerCase().trim();
  if (!t) {
    return 'gray';
  }
  if (t.includes('cerrad') || t.includes('resuelto') || t.includes('finaliz')) {
    return 'teal';
  }
  if (t.includes('rechaz') || t.includes('anul')) {
    return 'red';
  }
  if (t.includes('observ') || t.includes('pendiente') || t.includes('ratif')) {
    return 'orange';
  }
  if (t.includes('asign') || t.includes('desarrollo') || t.includes('progreso') || t.includes('curso')) {
    return 'blue';
  }
  if (t.includes('nuevo') || t.includes('ingres') || t.includes('abiert')) {
    return 'sky';
  }
  return 'purple';
}

/** Compacto para celdas densas (Label_Status_XS). */
export function estatusGeneralToXSVariant(raw: string): BadgeXSVariant {
  const v = estatusGeneralToPillVariant(raw);
  if (v === 'red' || v === 'orange') {
    return 'observed';
  }
  if (v === 'teal' || v === 'blue') {
    return 'approved';
  }
  if (v === 'gray') {
    return 'pending';
  }
  return 'sent';
}
