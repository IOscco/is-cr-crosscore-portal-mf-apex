export interface ProgramBoardRow {
  squad: string;
  epica: string;
  estatusGeneral: string;
  faseActual: string;
  fechaPap: string;
  ticketGti: string;
  tl: string;
  dev: string;
  priorizacion: string;
  hitoQ2: string;
  sprintCompromiso: string;
  sistema: string;
  tipoIniciativa: string;
  /** Sprint de pase a producción (puede diferir del sprint comprometido). */
  sprintPaseProduccion?: string;
  /** PI | Posterior | Nueva solicitud (HU listado iniciativas). */
  origenIniciativa?: string;
  /** ISO `yyyy-mm-dd` — fecha comprometida (filtros). */
  fechaComprometida?: string;
}

/** Origen de la fila en el listado de proyectos (PoC). */
export type ProyectoPocOrigen = 'program-board' | 'manual';

/**
 * Campos adicionales HU-ITP-025 (registro manual) y extensiones de seguimiento.
 * Las filas del board pueden omitirlos; las manuales suelen llevar `origen: 'manual'`.
 */
/** Integrante del equipo (HU-ITP-025 refinada). */
export interface IntegranteProyectoHu025 {
  rol: string;
  nombreApellido: string;
}

export interface ProyectoPocExtensions {
  origen?: ProyectoPocOrigen;
  descripcion?: string;
  /** ISO `yyyy-mm-dd` desde formulario. */
  fechaInicio?: string;
  /** ISO `yyyy-mm-dd` desde formulario. */
  fechaFinPlanificada?: string;
  /** Texto libre legado / resumen squad·proveedor (PoC). */
  squadOProveedor?: string;
  /** Indica si el pendiente es dependencia de otra actividad del hito. */
  dependenciaOtraActividadHito?: boolean;
  /** Detalle opcional de la actividad del hito relacionada. */
  actividadHitoDependencia?: string;
  /** HU-025: miembros del equipo con rol. */
  integrantesEquipo?: IntegranteProyectoHu025[];
  cbSquad?: boolean;
  cbProveedor?: boolean;
  cbNoAplica?: boolean;
  nombreSquad?: string;
  nombreProveedor?: string;
  /** HU-ITP-025 / HU-ITP-029 */
  esEvolution?: boolean;
}

/** Program Board + `id` para rutas /proyectos/:id (PoC). */
export type ProyectoPocRow = ProgramBoardRow & { id: string } & ProyectoPocExtensions;

export interface IncidentPocRow {
  gti: string;
  subcategoria: string;
  sistema: string;
  estado: string;
  usuarioActual: string;
  usuarioActualLogin?: string;
  usuarioActualEmail?: string;
  usuarioResolutor: string;
  squad: string;
  tpo: string;
  fecRegistro: string;
  fecUltimoEstado: string;
  diasEnEstado: string;
  diasSinCambio: number | null;
  alerta: string;
  area: string;
  titulo: string;
}

export interface IncidentsDashboardPoc {
  fuente: string;
  generado: string;
  iniciativasAbiertas?: number;
  iniciativasCerradas?: number;
  conteos: {
    g1Ratificacion: number;
    g2Desarrollo: number;
    g3Cerrados: number;
    soporteNegocio: number;
    /** Clasificación residual (no G1–G4). */
    otros?: number;
  };
  iniciativasPb: number;
  proyectosSueltos?: number;
  proyectosNota?: string;
}
