import type { ActividadGrupoApi, ActividadItemApi } from '@/lib/actividades-api';

type BloqueoActividad = {
  pendientesBloqueantes: number;
  subActividades: number;
};

type CambioPadre =
  | { tipo: 'actividad'; id: string; estado: string; nombre: string }
  | { tipo: 'hito'; id: string; estado: string; nombre: string };

function estadoKey(estado: string | null | undefined): string {
  return String(estado ?? '').trim();
}

export function estadoEsCerradoODestimado(estado: string | null | undefined): boolean {
  return ['Cerrado', 'Desestimado'].includes(estadoKey(estado));
}

export function esHitoActivo(estado: string | null | undefined): boolean {
  return !estadoEsCerradoODestimado(estado);
}

export function buscarActividad(grupos: ActividadGrupoApi[], id: string): ActividadItemApi | null {
  for (const g of grupos) {
    for (const act of g.items ?? []) {
      if (act.id === id) return act;
      const sub = (act.subtareas ?? []).find((it) => it.id === id);
      if (sub) return sub;
    }
    const pend = (g.pendientesNivelHito ?? []).find((it) => it.id === id);
    if (pend) return pend;
  }
  return null;
}

export function buscarPadre(grupos: ActividadGrupoApi[], act: ActividadItemApi): ActividadItemApi | null {
  if (!act.padreId) return null;
  return buscarActividad(grupos, act.padreId);
}

export function buscarGrupo(grupos: ActividadGrupoApi[], hitoId: string): ActividadGrupoApi | null {
  return grupos.find((g) => g.hitoId === hitoId) ?? null;
}

export function bloqueosCerrarActividad(act: ActividadItemApi): BloqueoActividad {
  const out: BloqueoActividad = { pendientesBloqueantes: 0, subActividades: 0 };
  for (const child of act.subtareas ?? []) {
    if (estadoEsCerradoODestimado(child.estado)) continue;
    if (child.tipo === 'sub_actividad') out.subActividades += 1;
    if (child.tipo === 'pendiente' && child.esDependencia === true) out.pendientesBloqueantes += 1;
  }
  return out;
}

export function mensajeBloqueoCerrarActividad(act: ActividadItemApi): string | null {
  if (act.tipo !== 'actividad') return null;
  const b = bloqueosCerrarActividad(act);
  if (b.pendientesBloqueantes > 0) {
    return `No se puede cerrar. Hay ${b.pendientesBloqueantes} pendiente(s) bloqueante(s) sin cerrar.`;
  }
  if (b.subActividades > 0) {
    return `No se puede cerrar. Hay ${b.subActividades} sub-actividad(es) sin cerrar.`;
  }
  return null;
}

export function mensajeBloqueoCerrarHito(g: ActividadGrupoApi): string | null {
  const abiertas = (g.items ?? []).filter((it) => it.tipo === 'actividad' && !estadoEsCerradoODestimado(it.estado)).length;
  if (abiertas > 0) {
    return `No se puede cerrar el hito. Hay ${abiertas} actividad(es) sin cerrar.`;
  }
  const pendientes = pendientesBloqueantesNivelHitoAbiertosDespues(g, '', '');
  return pendientes > 0 ? `No se puede cerrar el hito. Hay ${pendientes} pendiente(s) bloqueante(s) sin cerrar.` : null;
}

function estadoChildDespues(child: ActividadItemApi, changedId: string, nuevo: string): string {
  return child.id === changedId ? nuevo : child.estado;
}

function bloqueantesAbiertosDespues(parent: ActividadItemApi, changedId: string, nuevo: string): number {
  return (parent.subtareas ?? []).filter((child) => {
    if (estadoEsCerradoODestimado(estadoChildDespues(child, changedId, nuevo))) return false;
    return child.tipo === 'sub_actividad' || (child.tipo === 'pendiente' && child.esDependencia === true);
  }).length;
}

function hijosBloqueantes(parent: ActividadItemApi): ActividadItemApi[] {
  return (parent.subtareas ?? []).filter((child) => child.tipo === 'sub_actividad' || (child.tipo === 'pendiente' && child.esDependencia === true));
}

function estadoPadreAlReabrir(parent: ActividadItemApi, changedId: string, nuevo: string): string {
  const hijos = hijosBloqueantes(parent);
  if (hijos.some((child) => estadoChildDespues(child, changedId, nuevo) === 'Bloqueado')) {
    return 'Bloqueado';
  }
  if (hijos.some((child) => estadoChildDespues(child, changedId, nuevo) === 'En Progreso')) {
    return 'En Progreso';
  }
  return 'En Progreso';
}

function actividadesAbiertasDespues(g: ActividadGrupoApi, changedId: string, nuevo: string): number {
  return (g.items ?? []).filter((act) => {
    const estado = act.id === changedId ? nuevo : act.estado;
    return act.tipo === 'actividad' && !estadoEsCerradoODestimado(estado);
  }).length;
}

function pendientesBloqueantesNivelHitoAbiertosDespues(g: ActividadGrupoApi, changedId: string, nuevo: string): number {
  return (g.pendientesNivelHito ?? []).filter((pendiente) => {
    if (pendiente.tipo !== 'pendiente' || pendiente.esDependencia !== true) {
      return false;
    }
    const estado = pendiente.id === changedId ? nuevo : pendiente.estado;
    return !estadoEsCerradoODestimado(estado);
  }).length;
}

export function propagacionesPostCambio(
  grupos: ActividadGrupoApi[],
  act: ActividadItemApi,
  nuevo: string,
  anterior?: string,
): CambioPadre[] {
  const cambios: CambioPadre[] = [];
  const parent = buscarPadre(grupos, act);
  const grupo = buscarGrupo(grupos, act.hitoId);
  const reabreHijoBloqueante =
    estadoEsCerradoODestimado(anterior) &&
    !estadoEsCerradoODestimado(nuevo) &&
    (act.tipo === 'sub_actividad' || (act.tipo === 'pendiente' && act.esDependencia === true));

  if (reabreHijoBloqueante && parent?.estado === 'Cerrado') {
    cambios.push({
      tipo: 'actividad',
      id: parent.id,
      estado: estadoPadreAlReabrir(parent, act.id, nuevo),
      nombre: parent.nombre,
    });
  }

  if (act.tipo === 'sub_actividad' && nuevo === 'En Progreso' && parent?.estado === 'Abierto') {
    cambios.push({ tipo: 'actividad', id: parent.id, estado: 'En Progreso', nombre: parent.nombre });
  }

  if (
    act.tipo === 'pendiente' &&
    act.esDependencia === true &&
    ['Abierto', 'Bloqueado'].includes(nuevo) &&
    parent?.estado === 'En Progreso'
  ) {
    cambios.push({ tipo: 'actividad', id: parent.id, estado: 'Bloqueado', nombre: parent.nombre });
  }

  if (
    act.tipo === 'pendiente' &&
    act.esDependencia === true &&
    estadoEsCerradoODestimado(nuevo) &&
    parent?.estado === 'Bloqueado' &&
    bloqueantesAbiertosDespues(parent, act.id, nuevo) === 0
  ) {
    cambios.push({ tipo: 'actividad', id: parent.id, estado: 'En Progreso', nombre: parent.nombre });
  }

  if (act.tipo === 'actividad' && nuevo === 'En Progreso' && grupo?.hitoEstado === 'Abierto') {
    cambios.push({ tipo: 'hito', id: grupo.hitoId, estado: 'En Progreso', nombre: grupo.hitoNombre });
  }

  return cambios;
}

export function sugerenciasPostCambio(grupos: ActividadGrupoApi[], act: ActividadItemApi, nuevo: string): string[] {
  const sugerencias: string[] = [];
  const parent = buscarPadre(grupos, act);
  const grupo = buscarGrupo(grupos, act.hitoId);

  if (
    parent &&
    (act.tipo === 'sub_actividad' || (act.tipo === 'pendiente' && act.esDependencia === true)) &&
    bloqueantesAbiertosDespues(parent, act.id, nuevo) === 0 &&
    !estadoEsCerradoODestimado(parent.estado)
  ) {
    sugerencias.push(`Todos los hijos de '${parent.nombre}' están cerrados. Puedes cerrar la actividad padre cuando estés listo.`);
  }

  if (
    grupo &&
    actividadesAbiertasDespues(grupo, act.id, nuevo) === 0 &&
    pendientesBloqueantesNivelHitoAbiertosDespues(grupo, act.id, nuevo) === 0 &&
    !estadoEsCerradoODestimado(grupo.hitoEstado)
  ) {
    sugerencias.push(`Todas las actividades están cerradas. Puedes cerrar el hito "${grupo.hitoNombre}".`);
  }

  return sugerencias;
}

export function maxFechaCierreHijos(act: ActividadItemApi): string | null {
  const fechas = (act.subtareas ?? [])
    .map((child) => String(child.fechaCierre ?? '').slice(0, 10))
    .filter((fecha) => /^\d{4}-\d{2}-\d{2}$/.test(fecha));
  return fechas.length ? fechas.sort().at(-1) ?? null : null;
}
