import { APEX_ROUTER_BASE_PATH } from '@/constants/apex-router-base';

export const APEX_ROLE_CODES = [
  'APEX_ADM',
  'INI_GEST',
  'INI_VIEWER',
  'PRY_GEST',
  'PRY_VIEWER',
  'INC_VIEWER',
] as const;

export type ApexRole = (typeof APEX_ROLE_CODES)[number];

const APEX_ROLE_SET = new Set<string>(APEX_ROLE_CODES);

export type ApexModule = 'dashboard' | 'iniciativas' | 'incidentes' | 'proyectos' | 'config';

export type ApexAccessSnapshot = {
  roles: ApexRole[];
  canAccessDashboard: boolean;
  canAccessIniciativas: boolean;
  canManageIniciativas: boolean;
  canAdminIniciativas: boolean;
  canAccessIncidentes: boolean;
  canAccessProyectos: boolean;
  canManageProyectos: boolean;
  canAccessConfig: boolean;
  canAccessConfigMantenedor: boolean;
  canAccessConfigAuditoria: boolean;
  canAccessConfigSquads: boolean;
  canSeeConfigMantenedorIniciativas: boolean;
  canSeeConfigMantenedorProyectos: boolean;
  canSeeConfigAuditIniciativas: boolean;
  canSeeConfigAuditProyectos: boolean;
  canSeeConfigProyectosEliminados: boolean;
};

/** Normaliza y valida una lista arbitraria de roles contra el catálogo Apex conocido. */
export function uniqueRoles(values: Iterable<string>): ApexRole[] {
  const out: ApexRole[] = [];
  for (const value of values) {
    const normalized = String(value).trim().toUpperCase();
    if (APEX_ROLE_SET.has(normalized) && !out.includes(normalized as ApexRole)) {
      out.push(normalized as ApexRole);
    }
  }
  return out;
}

export function hasRole(roles: readonly ApexRole[], role: ApexRole): boolean {
  return roles.includes(role);
}

export function isApexAdmin(roles: readonly ApexRole[]): boolean {
  return hasRole(roles, 'APEX_ADM');
}

export function buildApexAccess(roles: readonly ApexRole[]): ApexAccessSnapshot {
  const admin = isApexAdmin(roles);
  const canAccessDashboard = roles.length > 0;
  const canManageIniciativas = admin || hasRole(roles, 'INI_GEST');
  const canAccessIniciativas = canManageIniciativas || hasRole(roles, 'INI_VIEWER');
  const canAccessIncidentes = admin || hasRole(roles, 'INC_VIEWER');
  const canManageProyectos = admin || hasRole(roles, 'PRY_GEST');
  const canAccessProyectos = canManageProyectos || hasRole(roles, 'PRY_VIEWER');
  const canAccessConfig = admin || hasRole(roles, 'INI_GEST') || hasRole(roles, 'PRY_GEST');
  const canSeeConfigMantenedorIniciativas = admin || hasRole(roles, 'INI_GEST');
  const canSeeConfigMantenedorProyectos = admin || hasRole(roles, 'PRY_GEST');
  const canSeeConfigAuditIniciativas = admin || hasRole(roles, 'INI_GEST');
  const canSeeConfigAuditProyectos = admin || hasRole(roles, 'PRY_GEST');
  const canSeeConfigProyectosEliminados = admin || hasRole(roles, 'PRY_GEST');
  const canAccessConfigSquads = admin || hasRole(roles, 'INI_GEST');

  return {
    roles: [...roles],
    canAccessDashboard,
    canAccessIniciativas,
    canManageIniciativas,
    canAdminIniciativas: canManageIniciativas,
    canAccessIncidentes,
    canAccessProyectos,
    canManageProyectos,
    canAccessConfig,
    canAccessConfigMantenedor: canAccessConfig && (canSeeConfigMantenedorIniciativas || canSeeConfigMantenedorProyectos),
    canAccessConfigAuditoria: canAccessConfig && (canSeeConfigAuditIniciativas || canSeeConfigAuditProyectos),
    canAccessConfigSquads,
    canSeeConfigMantenedorIniciativas,
    canSeeConfigMantenedorProyectos,
    canSeeConfigAuditIniciativas,
    canSeeConfigAuditProyectos,
    canSeeConfigProyectosEliminados,
  };
}

export function moduleForRouteName(routeName: string): ApexModule | null {
  if (routeName === 'dashboard') {
    return 'dashboard';
  }
  if (routeName.startsWith('iniciativa')) {
    return 'iniciativas';
  }
  if (routeName.startsWith('incidentes')) {
    return 'incidentes';
  }
  if (routeName.startsWith('proyecto')) {
    return 'proyectos';
  }
  if (routeName.startsWith('config')) {
    return 'config';
  }
  return null;
}

function pathFromPermisoUrl(url: string | null | undefined): string {
  const raw = String(url ?? '').trim();
  if (!raw) {
    return '';
  }
  try {
    return new URL(raw, window.location.origin).pathname.replace(/\/+$/, '') || '/';
  } catch {
    const [withoutQuery] = raw.split(/[?#]/);
    return (withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`).replace(/\/+$/, '') || '/';
  }
}

function moduleForPermisoPath(url: string | null | undefined): ApexModule | null {
  const pathname = pathFromPermisoUrl(url);
  if (!pathname) {
    return null;
  }
  const base = APEX_ROUTER_BASE_PATH.replace(/\/+$/, '');
  const relative = pathname === base ? '/' : pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
  const firstSegment = relative.split('/').filter(Boolean)[0]?.toLowerCase();
  if (!firstSegment || firstSegment === 'dashboard') {
    return 'dashboard';
  }
  if (firstSegment === 'iniciativas') {
    return 'iniciativas';
  }
  if (firstSegment === 'incidentes') {
    return 'incidentes';
  }
  if (firstSegment === 'proyectos') {
    return 'proyectos';
  }
  if (firstSegment === 'config') {
    return 'config';
  }
  return null;
}

export function moduleForPermiso(permiso: PortalTiPermiso): ApexModule | null {
  const operation = String(permiso.NombreOperacion ?? '').trim().toLowerCase();
  const byRouteName = moduleForRouteName(operation);
  if (byRouteName) {
    return byRouteName;
  }
  const byPath = moduleForPermisoPath(permiso.Url);
  if (byPath) {
    return byPath;
  }
  const text = `${permiso.NombreOperacion} ${permiso.Titulo} ${permiso.Url}`.toLowerCase();
  if (text.includes('dashboard')) {
    return 'dashboard';
  }
  if (text.includes('iniciativa')) {
    return 'iniciativas';
  }
  if (text.includes('incidente') || text.includes('ticket') || text.includes('gti')) {
    return 'incidentes';
  }
  if (text.includes('config')) {
    return 'config';
  }
  if (text.includes('proyecto')) {
    return 'proyectos';
  }
  if (text.includes('apex')) {
    return 'dashboard';
  }
  return null;
}

export function canAccessRouteByRole(routeName: string, access: ApexAccessSnapshot): boolean {
  if (routeName === 'iniciativas-papelera') {
    return access.canManageIniciativas;
  }
  if (routeName === 'proyectos-papelera') {
    return access.canManageProyectos;
  }
  if (routeName === 'config-mantenedor') {
    return access.canAccessConfigMantenedor;
  }
  if (routeName === 'config-auditoria-proyectos') {
    return access.canSeeConfigProyectosEliminados;
  }
  if (routeName === 'config-auditoria-logs') {
    return access.canAccessConfigAuditoria;
  }
  if (routeName === 'config-squads') {
    return access.canAccessConfigSquads;
  }
  const module = moduleForRouteName(routeName);
  if (module === 'dashboard') {
    return access.canAccessDashboard;
  }
  if (module === 'iniciativas') {
    return access.canAccessIniciativas;
  }
  if (module === 'incidentes') {
    return access.canAccessIncidentes;
  }
  if (module === 'proyectos') {
    return access.canAccessProyectos;
  }
  if (module === 'config') {
    return access.canAccessConfig;
  }
  return false;
}
