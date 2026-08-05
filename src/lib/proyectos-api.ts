import { apex, rethrowApiError } from '../plugins/axios';

export type ProyectoSemaforo = 'verde' | 'ambar' | 'rojo' | 'gris';
export type SaludProyectoApi = 'verde' | 'ambar' | 'rojo' | 'gris';

export type ProyectoListItemApi = {
  id: string;
  squadProveedor: string;
  nombreAlcance: string;
  estadoTexto: string;
  semaforo: ProyectoSemaforo;
  papFinPlan: string;
  fechaInicioPlan?: string | null;
  fechaFinPlan?: string | null;
  itProjectManager: string;
  tipo: string;
  porcentajeAvance: number;
  avancePlanificadoPct: number | null;
  avanceRealPct: number | null;
  saludProyecto: SaludProyectoApi;
  saludProyectoDesfasePct: number | null;
  esEvolution?: boolean;
};

export type ProyectosListMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type CreateProyectoPayload = {
  nombre: string;
  tipo?: string | null;
  descripcion?: string | null;
  estado?: string;
  responsable?: string | null;
  fechaInicioPlan?: string | null;
  fechaFinPlan?: string | null;
  cbSquad?: boolean;
  cbProveedor?: boolean;
  cbNoAplica?: boolean;
  nombreSquad?: string | null;
  nombreProveedor?: string | null;
  faseActual?: string;
  sprintCompromiso?: string | null;
  storyPoints?: number | null;
  dependenciasHu?: string | null;
  squadId?: string | null;
  squadName?: string | null;
  integrantes?: { rol: string; nombreApellido: string }[];
  equipo?: {
    sponsor: string;
    liderBO: string;
    itPmId: string;
    integrantes: { nombre: string; fromSquad: boolean }[];
  };
  hitos?: { nombre: string; fechaFinPlan: string; estado?: string }[];
  esEvolution?: boolean;
};

export type KpiSemaforoApi = 'verde' | 'ambar' | 'rojo';

export type ResumenKpisApi = {
  porcentajeAvanceHitos: number;
  avanceHitosDetalle: string;
  avanceHitosBadge: KpiSemaforoApi;
  hitosTotal: number;
  pendientesActivos: number;
  pendientesActivosBordeCritico: boolean;
  avancePlanificadoPct: number | null;
  avanceRealPct: number;
  planVsRealDesfasePct: number | null;
  planVsRealBadge: KpiSemaforoApi;
  saludProyecto: SaludProyectoApi;
  porcentajeAvance: number;
  actividadesActivas: number;
  actividadesTotal: number;
  pendientesVencidos: number;
  alertaPendientesVencidos: boolean;
  alertaPorcentajeVsEsperado: boolean;
};

export type ProximoVencimientoApi = {
  id: string;
  nombre: string;
  tipo: string;
  tipoLabel: string;
  hitoNombre: string;
  responsable: string;
  fechaFinPlan: string;
  diasRestantes: number;
  vencida: boolean;
  venceEnCincoODias: boolean;
  diasVencido: number;
};

export type ProximoVencimientoGestionApi = {
  id: string;
  nombre: string;
  tipo: 'actividad' | 'pendiente';
  hitoNombre: string;
  responsable: string;
  fechaLimite: string;
  diasRestantes: number;
  vencida: boolean;
  diasVencido: number;
};

export type PendienteActivoResumenApi = {
  id: string;
  nombre: string;
  estado: string;
  hitoNombre: string;
  responsable: string;
  fechaLimite: string;
  vencida: boolean;
  esDependencia: boolean;
};

export type ProyectoDetailApi = {
  proyecto: Record<string, unknown> & { squadAsignado?: unknown; squadId?: string | null };
  hitos: {
    id: string;
    nombre: string;
    descripcion?: string | null;
    fechaFinPlan: string;
    fechaInicioPlan?: string | null;
    estado: string;
    responsable?: string | null;
    fechaInicioReal?: string | null;
    fechaCierreReal?: string | null;
    desfaseDias?: number | null;
  }[];
  listRow: ProyectoListItemApi;
  resumen?: {
    kpis: ResumenKpisApi;
    proximosVencimientos: ProximoVencimientoApi[];
    proximoVencimiento?: ProximoVencimientoGestionApi | null;
    pendientesActivosLista?: PendienteActivoResumenApi[];
    tienePendientesNoBloqueantesAbiertos?: boolean;
  };
};

export type IndicadorProyectoApi = {
  clave: string;
  titulo: string;
  valorTexto: string;
  ayuda?: string;
  semaforo: 'verde' | 'ambar' | 'rojo';
};

export type ProyectoIndicadoresResponse = {
  indicadores: IndicadorProyectoApi[];
  detalle: {
    saludProyecto: SaludProyectoApi;
    avanceRealPct: number | null;
    avancePlanificadoPct: number | null;
    fechaFinPlan: string | null;
    diasRestantes: number | null;
    hitosRiesgo: number;
    hitosTotal: number;
    hitosPorEstado: { estado: string; total: number }[];
    reprogramaciones: number;
    reprogramacionesMensuales: { mes: string; total: number }[];
    desfaseDiasTotal: number;
    desfaseHitosCerrados: number;
    desfaseActividadesVivas: number;
    pendientesBloqueantesActivos: number;
    pendientesBloqueantesVencidos: number;
    pendientesBloqueantesPorVencer: number;
  };
  actualizadoEn: string;
};

export type ProyectoDocumentoApi = {
  id: string;
  nombreArchivo: string;
  tipo: string;
  contentType: string;
  sizeBytes: number;
  fechaCarga: string;
  createdAt: string;
  subidoPor: string;
  subidoPorEmail: string;
  hitoId: string | null;
  actividadId: string | null;
};

/** Métricas globales de proyectos (abiertos / cerrados) para el dashboard. */
export async function fetchProyectosDashboardMetricas(): Promise<{ abiertos: number; cerrados: number }> {
  try {
    const { data } = await apex.get<{ abiertos: number; cerrados: number }>('/proyectos/metricas-dashboard');
    return data;
  } catch (err) {
    rethrowApiError(err, 'GET metricas-dashboard');
  }
}

export type ProyectoEliminacionAuditoriaApi = {
  id: string;
  proyectoId: string;
  nombre: string;
  estado: string;
  eliminadoPor: string;
  eliminadoEn: string;
};

/** Lista paginada de proyectos con filtros, búsqueda y orden. */
export async function fetchProyectosList(params: {
  page: number;
  pageSize: 15 | 30 | 50;
  q: string;
  sortField?: string | null;
  sortOrder?: 1 | -1 | 0 | null;
  filterSquad?: string | null;
  filterEstado?: string | null;
  filterMes?: string | null;
  filterEvolution?: '' | 'si' | 'no' | null;
  cardOrder?: boolean;
}): Promise<{ data: ProyectoListItemApi[]; meta: ProyectosListMeta }> {
  const sp: Record<string, string> = {
    page: String(params.page),
    pageSize: String(params.pageSize),
  };
  if (params.q.trim()) {
    sp.q = params.q.trim();
  }
  if (params.sortField) {
    sp.sortField = params.sortField;
  }
  if (params.sortOrder === 1 || params.sortOrder === -1) {
    sp.sortOrder = String(params.sortOrder);
  }
  const fs = (params.filterSquad ?? '').trim();
  if (fs) {
    sp.filterSquad = fs;
  }
  const fe = (params.filterEstado ?? '').trim();
  if (fe) {
    sp.filterEstado = fe;
  }
  const fm = (params.filterMes ?? '').trim();
  if (fm) {
    sp.filterMes = fm;
  }
  const fevo = (params.filterEvolution ?? '').trim();
  if (fevo) {
    sp.filterEvolution = fevo;
  }
  if (params.cardOrder) {
    sp.cardOrder = 'true';
  }

  try {
    const { data } = await apex.get<{ data: ProyectoListItemApi[]; meta: ProyectosListMeta }>(
      '/proyectos',
      { params: sp },
    );
    return data;
  } catch (err) {
    rethrowApiError(err, 'No se pudo cargar el listado de proyectos.');
  }
}

/** Detalle agregado del proyecto (hitos, listRow, resumen KPIs). */
export async function fetchProyectoDetail(id: string): Promise<ProyectoDetailApi> {
  try {
    const { data } = await apex.get<ProyectoDetailApi>(`/proyectos/${encodeURIComponent(id)}`);
    return data;
  } catch (err) {
    rethrowApiError(err, `GET /proyectos/${id} failed`);
  }
}

/** Indicadores derivados (semáforos, etc.) del proyecto. */
export async function fetchProyectoIndicadores(id: string): Promise<ProyectoIndicadoresResponse> {
  try {
    const { data } = await apex.get<ProyectoIndicadoresResponse>(
      `/proyectos/${encodeURIComponent(id)}/indicadores`,
    );
    return data;
  } catch (err) {
    rethrowApiError(err, 'GET indicadores failed');
  }
}

export type ProyectoAuditoriaApi = {
  id: string;
  occurredAt: string;
  userEmail: string;
  entityType: 'hito' | 'actividad' | 'sub_actividad' | 'pendiente' | 'proyecto' | string;
  entityId: string;
  entityLabel: string | null;
  action: 'crear' | 'editar' | 'estado_cambio' | 'eliminar' | string;
  detail?: {
    estadoAnterior?: string;
    estadoNuevo?: string;
    campos?: string[];
  } | null;
};

/** Feed «Últimos cambios» de un proyecto (hitos, actividades y pendientes). */
export async function fetchProyectoAuditoria(id: string, limit = 20): Promise<ProyectoAuditoriaApi[]> {
  try {
    const { data } = await apex.get<{ data: ProyectoAuditoriaApi[] }>(
      `/proyectos/${encodeURIComponent(id)}/auditoria`,
      { params: { limit } },
    );
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET auditoría proyecto');
  }
}

export async function fetchProyectoDocumentos(id: string): Promise<{
  data: ProyectoDocumentoApi[];
  almacenamientoGcsActivo?: boolean;
}> {
  try {
    const { data } = await apex.get<{
      data: ProyectoDocumentoApi[];
      almacenamientoGcsActivo?: boolean;
    }>(`/proyectos/${encodeURIComponent(id)}/documentos`);
    return data;
  } catch (err) {
    rethrowApiError(err, 'GET documentos failed');
  }
}

/** Sube un archivo al bucket GCS y registra metadatos en BD. */
export async function uploadProyectoDocumento(
  proyectoId: string,
  file: File,
  asociacion?: { hitoId?: string | null; actividadId?: string | null },
): Promise<ProyectoDocumentoApi> {
  try {
    const body = new FormData();
    body.append('archivo', file, file.name);
    if (asociacion?.hitoId) {
      body.append('hitoId', asociacion.hitoId);
    }
    if (asociacion?.actividadId) {
      body.append('actividadId', asociacion.actividadId);
    }
    const { data } = await apex.post<{ data: ProyectoDocumentoApi }>(
      `/proyectos/${encodeURIComponent(proyectoId)}/documentos`,
      body,
    );
    return data.data;
  } catch (err) {
    rethrowApiError(err, 'POST documento failed');
  }
}

export async function deleteProyectoDocumento(proyectoId: string, docId: string): Promise<void> {
  try {
    await apex.delete(`/proyectos/${encodeURIComponent(proyectoId)}/documentos/${encodeURIComponent(docId)}`);
  } catch (err) {
    rethrowApiError(err, 'DELETE documento failed');
  }
}

export async function fetchActividadDocumentos(actividadId: string): Promise<{
  data: ProyectoDocumentoApi[];
  almacenamientoGcsActivo?: boolean;
}> {
  try {
    const { data } = await apex.get<{ data: ProyectoDocumentoApi[]; almacenamientoGcsActivo?: boolean }>(
      `/actividades/${encodeURIComponent(actividadId)}/documentos`,
    );
    return data;
  } catch (err) {
    rethrowApiError(err, 'GET actividad documentos failed');
  }
}

export async function uploadActividadDocumento(actividadId: string, file: File): Promise<ProyectoDocumentoApi> {
  try {
    const body = new FormData();
    body.append('archivo', file, file.name);
    const { data } = await apex.post<{ data: ProyectoDocumentoApi }>(
      `/actividades/${encodeURIComponent(actividadId)}/documentos`,
      body,
    );
    return data.data;
  } catch (err) {
    rethrowApiError(err, 'POST actividad documento failed');
  }
}

export async function fetchActividadDocumentoDescargaUrl(actividadId: string, docId: string): Promise<string> {
  try {
    const { data } = await apex.get(
      `/actividades/${encodeURIComponent(actividadId)}/documentos/${encodeURIComponent(docId)}/descarga`,
      { responseType: 'blob' },
    );
    return URL.createObjectURL(data as Blob);
  } catch (err) {
    rethrowApiError(err, 'GET actividad documento descarga failed');
  }
}

export async function deleteActividadDocumento(actividadId: string, docId: string): Promise<void> {
  try {
    await apex.delete(`/actividades/${encodeURIComponent(actividadId)}/documentos/${encodeURIComponent(docId)}`);
  } catch (err) {
    rethrowApiError(err, 'DELETE actividad documento failed');
  }
}

/** Descarga el archivo desde el backend y devuelve un blob URL temporal. */
export async function fetchProyectoDocumentoDescargaUrl(
  proyectoId: string,
  docId: string,
): Promise<string> {
  try {
    const { data } = await apex.get(
      `/proyectos/${encodeURIComponent(proyectoId)}/documentos/${encodeURIComponent(docId)}/descarga`,
      { responseType: 'blob' },
    );
    return URL.createObjectURL(data as Blob);
  } catch (err) {
    rethrowApiError(err, 'GET documento descarga failed');
  }
}

/** Edita los datos básicos del proyecto y/o sus integrantes. */
export async function patchProyectoApi(
  id: string,
  payload: {
    nombre?: string;
    descripcion?: string | null;
    responsable?: string | null;
    fechaInicioPlan?: string | null;
  fechaFinPlan?: string | null;
  esEvolution?: boolean;
  squadId?: string | null;
  integrantes?: { rol: string; nombreApellido: string }[];
    eliminarResponsableYReasignar?: { responsableLinea: string; reasignarA: string };
  },
): Promise<void> {
  try {
    await apex.patch(`/proyectos/${encodeURIComponent(id)}`, payload);
  } catch (err) {
    rethrowApiError(err, 'PATCH proyecto');
  }
}

/** Elimina un proyecto. */
export async function deleteProyectoApi(id: string): Promise<void> {
  try {
    await apex.delete(`/proyectos/${encodeURIComponent(id)}`);
  } catch (err) {
    rethrowApiError(err, 'DELETE proyecto');
  }
}

/** Crea un proyecto nuevo (HU-ITP-025); preserva `.status` para el caller. */
export async function createProyecto(payload: CreateProyectoPayload): Promise<{ id: string }> {
  try {
    console.log('Payload enviado:', JSON.stringify(payload, null, 2));
    const { data } = await apex.post<{ id: string }>('/proyectos', payload);
    return data;
  } catch (err) {
    rethrowApiError(err, 'No se pudo guardar el proyecto.');
  }
}

/** HU-ITP-049 — proyectos en papelera (soft delete). */
export type ProyectoPapeleraItemApi = {
  id: string;
  nombre: string;
  eliminadoEn: string;
  eliminadoPor: string;
};

export async function fetchProyectosPapelera(): Promise<ProyectoPapeleraItemApi[]> {
  const { data } = await apex.get<{ data: ProyectoPapeleraItemApi[] }>('/proyectos/papelera');
  return data.data ?? [];
}

export async function restoreProyectoPapelera(id: string): Promise<void> {
  await apex.post(`/proyectos/papelera/${encodeURIComponent(id)}/restore`, {});
}

export async function purgeProyectoPapelera(id: string): Promise<void> {
  await apex.delete(`/proyectos/papelera/${encodeURIComponent(id)}`);
}

/** Auditoría de proyectos eliminados (panel `/config`). */
export async function fetchAuditoriaProyectosEliminados(): Promise<ProyectoEliminacionAuditoriaApi[]> {
  try {
    const { data } = await apex.get<{ data: ProyectoEliminacionAuditoriaApi[] }>(
      '/config/auditoria/proyectos-eliminados',
    );
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET auditoría proyectos');
  }
}
