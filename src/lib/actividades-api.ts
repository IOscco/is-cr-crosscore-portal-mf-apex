import axios from 'axios';
import { apex, rethrowApiError } from '../plugins/axios';

export type TipoActividadApi = 'hito' | 'actividad' | 'sub_actividad' | 'pendiente';

export type ActividadItemApi = {
  id: string;
  hitoId: string;
  tipo: Exclude<TipoActividadApi, 'hito'>;
  tipoLabel: string;
  nombre: string;
  descripcion: string | null;
  fechaInicioPlan: string;
  fechaFinPlan: string;
  responsable: string;
  fechaLimite: string;
  prioridad: string;
  estado: string;
  porcentajeAvancePlan: number | null;
  porcentajeAvanceReal: number | null;
  esDependencia: boolean | null;
  criticoDependencia: boolean;
  notas: string | null;
  fechaCierre: string | null;
  padreId: string | null;
  subtareas: ActividadItemApi[];
};

export type ActividadGrupoApi = {
  hitoId: string;
  hitoNombre: string;
  hitoResponsable: string | null;
  hitoFechaInicioPlan: string | null;
  hitoFechaFinPlan: string;
  hitoEstado: string;
  hitoFechaInicioReal?: string | null;
  hitoFechaCierreReal?: string | null;
  hitoDesfaseDias?: number | null;
  hitoDesfaseProyectadoDias?: number | null;
  hitoReprogramacionesCount?: number;
  fechaFinPlan: string;
  porcentajeAvance: number;
  porcentajeAvancePlan: number | null;
  porcentajeAvanceReal: number | null;
  avanceRealCompleto: boolean;
  actividadesContables: number;
  items: ActividadItemApi[];
  /** Pendientes anclados directamente al hito (sin actividad padre). */
  pendientesNivelHito: ActividadItemApi[];
};

export type CronogramaResumenApi = {
  total: number;
  completados: number;
  enProceso: number;
  enRiesgo: number;
  sinIniciar: number;
};

export type CronogramaGrupoExtApi = ActividadGrupoApi & {
  hitoFechaFinPlanOriginal: string | null;
  cronogramaActividadesCount: number;
  cronogramaDesfaseTexto: string;
  cronogramaDesfaseCss: 'ahead' | 'zero' | 'late' | 'dash';
  cronogramaAvanceBarCss: 'g100' | 'oy' | 're' | 'gh';
  cronogramaEstadoBadgeCss: 'abierto' | 'progreso' | 'bloqueado' | 'cerrado';
  cronogramaHitoAtrasoVisual: boolean;
};

export type ActividadDetalleApi = ActividadItemApi & {
  hitoNombre: string;
  padreNombre: string | null;
};

export type HitoResumenActividadApi = {
  id: string;
  nombre: string;
  tipo: Exclude<TipoActividadApi, 'hito'>;
  tipoLabel: string;
  estado: string;
  fechaFinPlan: string;
  porcentajeAvanceReal: number | null;
};

export type HitoDetalleApi = {
  id: string;
  nombre: string;
  descripcion: string | null;
  responsable: string | null;
  fechaInicioPlan: string | null;
  fechaFinPlan: string;
  estado: string;
  fechaInicioReal?: string | null;
  fechaCierreReal?: string | null;
  desfaseDias?: number | null;
  reprogramacionesCount?: number;
  porcentajeAvance: number;
  porcentajeAvancePlan: number | null;
  porcentajeAvanceReal: number | null;
  avanceRealCompleto: boolean;
  actividadesContables: number;
  actividades: HitoResumenActividadApi[];
};

export type HitoReprogramacionApi = {
  id: string;
  fechaFinPlanAnterior: string;
  fechaFinPlanNuevo: string;
  changedBy: string;
  createdAt: string;
};

/** Presets al abrir «Nueva actividad» desde el cronograma. */
export type NuevaActividadModalPreset = {
  /** Oculta «Hito» al agregar desde un hito (solo actividades, sub-actividades o pendientes). */
  hideHitoTipo?: boolean;
  /** Oculta «Sub-actividad» en el selector (p. ej. desde encabezado de hito). */
  hideSubActividadTipo?: boolean;
  /** Permite preseleccionar un tipo cuando el origen del flujo lo determina. */
  presetTipo?: Exclude<TipoActividadApi, 'hito'>;
  lockTipo?: boolean;
  /** Abre solo creación de hito (HU-ITP-027). */
  fixedHito?: boolean;
  /** Hito prellenado al abrir. */
  presetHitoId?: string;
  /** El select de hito queda deshabilitado. */
  lockHito?: boolean;
  /** Abre como sub-actividad con padre e hito bloqueados. */
  fixedSubActividad?: boolean;
  /** Flujo desde el botÃ³n + de una actividad: solo permite Pendiente o Sub-actividad. */
  childOnly?: boolean;
  presetPadreId?: string;
  lockPadre?: boolean;
};

export type ActividadPayload =
  | {
      tipo: 'hito';
      nombre: string;
      descripcion?: string | null;
      responsable: string;
      fechaInicioPlan: string;
      fechaFinPlan: string;
    }
  | {
      tipo: Exclude<TipoActividadApi, 'hito'>;
      hitoId: string;
      nombre: string;
      descripcion?: string | null;
      responsable: string;
      fechaInicioPlan: string;
      fechaFinPlan: string;
      prioridad: string;
      estado?: string;
      porcentajeAvanceReal?: number | null;
      padreId?: string | null;
      esDependencia?: boolean | null;
      notas?: string | null;
      documentosAdjuntos?: File[];
    };

/** Cronograma + resumen del proyecto (KPIs y grupos por hito). */
export async function fetchCronogramaLista(
  proyectoId: string,
): Promise<{ resumen: CronogramaResumenApi; grupos: CronogramaGrupoExtApi[] }> {
  try {
    const { data } = await apex.get<{ resumen: CronogramaResumenApi; grupos: CronogramaGrupoExtApi[] }>(
      `/proyectos/${encodeURIComponent(proyectoId)}/cronograma`,
    );
    return data;
  } catch (err) {
    rethrowApiError(err, 'GET cronograma');
  }
}

/** Lista de actividades agrupadas por hito (con o sin cerradas). */
export async function fetchActividadesDeProyecto(
  proyectoId: string,
  mostrarCerrados: boolean,
): Promise<ActividadGrupoApi[]> {
  try {
    const { data } = await apex.get<{ data: ActividadGrupoApi[] }>(
      `/proyectos/${encodeURIComponent(proyectoId)}/actividades`,
      { params: mostrarCerrados ? { mostrarCerrados: 'true' } : undefined },
    );
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET actividades');
  }
}

/** Detalle completo de una actividad (incluye nombre de hito y padre). */
export async function fetchActividadDetalle(actividadId: string): Promise<ActividadDetalleApi> {
  try {
    const { data } = await apex.get<{ data: ActividadDetalleApi }>(
      `/actividades/${encodeURIComponent(actividadId)}`,
    );
    return data.data;
  } catch (err) {
    rethrowApiError(err, 'GET actividad');
  }
}

/** Detalle de un hito (incluye sus actividades como resumen). */
export async function fetchHitoDetalle(proyectoId: string, hitoId: string): Promise<HitoDetalleApi> {
  try {
    const { data } = await apex.get<{ data: HitoDetalleApi }>(
      `/proyectos/${encodeURIComponent(proyectoId)}/hitos/${encodeURIComponent(hitoId)}`,
    );
    return data.data;
  } catch (err) {
    rethrowApiError(err, 'GET hito detalle');
  }
}

/** Crea una actividad (hito, actividad, sub-actividad o pendiente). */
export async function createActividad(
  proyectoId: string,
  payload: ActividadPayload,
): Promise<{ id: string; kind: 'hito' | 'actividad' }> {
  try {
    const { documentosAdjuntos: _documentosAdjuntos, ...apiPayload } = payload as ActividadPayload & { documentosAdjuntos?: File[] };
    const { data } = await apex.post<{ id: string; kind: 'hito' | 'actividad' }>(
      `/proyectos/${encodeURIComponent(proyectoId)}/actividades`,
      apiPayload,
    );
    return data;
  } catch (err) {
    rethrowApiError(err, 'POST actividad');
  }
}

/**
 * Edita una actividad existente.
 * El backend devuelve `409 SUBTAREAS_ABIERTAS` cuando se intenta cerrar una
 * actividad con sub-actividades o pendientes bloqueantes abiertos; se devuelve
 * el body como `CerrarActividadConflict` para que el caller decida.
 */
export async function updateActividad(
  actividadId: string,
  payload: Partial<Extract<ActividadPayload, { tipo: Exclude<TipoActividadApi, 'hito'> }>> & {
    cerrarSubtareasIncluidas?: boolean;
    fechaCierreReal?: string;
    fechaCierreRealPadre?: string;
    fechasCierreSubtareas?: Record<string, string>;
    justificacionCambioBloqueante?: string;
  },
): Promise<void | CerrarActividadConflict> {
  try {
    await apex.put(`/actividades/${encodeURIComponent(actividadId)}`, payload);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      return err.response.data as CerrarActividadConflict;
    }
    rethrowApiError(err, 'PUT actividad');
  }
}

/** Crea un hito desde el cronograma (HU-ITP-027). */
export async function createHitoCronogramaApi(
  proyectoId: string,
  body: {
    nombre: string;
    descripcion?: string | null;
    responsable: string;
    fechaInicioPlan: string;
    fechaFinPlan: string;
  },
): Promise<{ id: string }> {
  try {
    const { data } = await apex.post<{ id: string }>(
      `/proyectos/${encodeURIComponent(proyectoId)}/hitos`,
      body,
    );
    return data;
  } catch (err) {
    rethrowApiError(err, 'POST hito');
  }
}

/** Elimina un hito del cronograma. */
export async function deleteHitoApi(proyectoId: string, hitoId: string): Promise<void> {
  try {
    await apex.delete(
      `/proyectos/${encodeURIComponent(proyectoId)}/hitos/${encodeURIComponent(hitoId)}`,
    );
  } catch (err) {
    rethrowApiError(err, 'DELETE hito');
  }
}

/** Edita un hito (datos básicos, fechas reales, estado). */
/** Elimina una actividad, sub-actividad o pendiente. */
export async function deleteActividadApi(actividadId: string): Promise<void> {
  try {
    await apex.delete(`/actividades/${encodeURIComponent(actividadId)}`);
  } catch (err) {
    rethrowApiError(err, 'DELETE actividad');
  }
}

export async function updateHitoApi(
  proyectoId: string,
  hitoId: string,
  payload: Partial<{
    nombre: string;
    descripcion: string | null;
    responsable: string | null;
    fechaInicioPlan: string | null;
    fechaFinPlan: string;
    estado: string;
    fechaInicioReal: string | null;
    fechaFinReal: string | null;
    fechaCierreReal: string | null;
  }>,
): Promise<void> {
  try {
    await apex.put(
      `/proyectos/${encodeURIComponent(proyectoId)}/hitos/${encodeURIComponent(hitoId)}`,
      payload,
    );
  } catch (err) {
    rethrowApiError(err, 'PUT hito');
  }
}

/** Lista de reprogramaciones (cambios de fechaFinPlan) de un hito. */
export async function fetchHitoReprogramaciones(
  proyectoId: string,
  hitoId: string,
): Promise<HitoReprogramacionApi[]> {
  try {
    const { data } = await apex.get<{ data: HitoReprogramacionApi[] }>(
      `/proyectos/${encodeURIComponent(proyectoId)}/hitos/${encodeURIComponent(hitoId)}/reprogramaciones`,
    );
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET reprogramaciones');
  }
}

/** Cierre de hito (PATCH con fechaCierreReal y notas). */
export async function cerrarHitoApi(
  proyectoId: string,
  hitoId: string,
  payload: { fechaCierreReal: string; notasCierre?: string | null },
): Promise<void> {
  try {
    await apex.patch(
      `/proyectos/${encodeURIComponent(proyectoId)}/hitos/${encodeURIComponent(hitoId)}/cerrar`,
      payload,
    );
  } catch (err) {
    rethrowApiError(err, 'PATCH cerrar hito');
  }
}

export type CerrarActividadConflict = {
  code: 'SUBTAREAS_ABIERTAS';
  subtareas: { id: string; nombre: string; estado: string }[];
};

export type CerrarActividadRequestBody = {
  cerrarSubtareasIncluidas?: boolean;
  fechaCierreReal?: string;
  fechaCierreRealPadre?: string;
  fechasCierreSubtareas?: Record<string, string>;
};

/**
 * Cierra una actividad. Igual que `updateActividad`, devuelve el body 409 si
 * hay sub-actividades / pendientes bloqueantes abiertos para que el caller
 * pida confirmación al usuario.
 */
export async function cerrarActividadApi(
  actividadId: string,
  opts?: CerrarActividadRequestBody,
): Promise<void | CerrarActividadConflict> {
  const body: Record<string, unknown> = {
    cerrarSubtareasIncluidas: Boolean(opts?.cerrarSubtareasIncluidas),
  };
  if (opts?.fechaCierreReal) {
    body.fechaCierreReal = opts.fechaCierreReal;
  }
  if (opts?.fechaCierreRealPadre) {
    body.fechaCierreRealPadre = opts.fechaCierreRealPadre;
  }
  if (opts?.fechasCierreSubtareas && Object.keys(opts.fechasCierreSubtareas).length > 0) {
    body.fechasCierreSubtareas = opts.fechasCierreSubtareas;
  }

  try {
    await apex.patch(`/actividades/${encodeURIComponent(actividadId)}/cerrar`, body);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      return err.response.data as CerrarActividadConflict;
    }
    rethrowApiError(err, 'PATCH cerrar actividad');
  }
}
