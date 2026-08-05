const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Convierte las claves del modal (`principal`, `padre`, ids de hijos) al body del API. */
export function buildPayloadCierreActividad(f: Record<string, string>): {
  fechaCierreReal: string;
  fechaCierreRealPadre?: string;
  fechasCierreSubtareas?: Record<string, string>;
} {
  const principal = String(f.principal ?? '').trim();
  if (!ISO_DATE.test(principal)) {
    throw new Error('Fecha de cierre principal inválida');
  }
  const padre = String(f.padre ?? '').trim();
  const fechasCierreSubtareas: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) {
    if (k === 'principal' || k === 'padre') {
      continue;
    }
    const t = String(v ?? '').trim();
    if (!ISO_DATE.test(t)) {
      throw new Error(`Fecha de cierre inválida para el hijo (${k})`);
    }
    fechasCierreSubtareas[k] = t;
  }
  const out: {
    fechaCierreReal: string;
    fechaCierreRealPadre?: string;
    fechasCierreSubtareas?: Record<string, string>;
  } = { fechaCierreReal: principal };
  if (ISO_DATE.test(padre)) {
    out.fechaCierreRealPadre = padre;
  }
  if (Object.keys(fechasCierreSubtareas).length > 0) {
    out.fechasCierreSubtareas = fechasCierreSubtareas;
  }
  return out;
}
