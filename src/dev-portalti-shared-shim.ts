/**
 * Solo desarrollo: simula `window.portaltiShared` cuando el MF corre en Vite sin host Portal TI.
 * Activar con `VITE_STANDALONE_DEV=true` en `.env` (ver `.env.example`).
 *
 * Importante: Apex exige `Authorization: Bearer <jwt>` decodificable (`sub` o `email`);
 * sin token, `/incidentes/gti/*` responde 401 y las tablas quedan vacías.
 */
import { APEX_ROUTER_BASE_PATH } from '@/constants/apex-router-base';
import type { ApexRole } from '@/modules/shared/lib/apex-roles';

/** JWT mínimo (firma no validada en Apex). Payload con `sub` y `email`. */
const STANDALONE_APEX_DEV_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhcGV4LWRldi1zdGFuZGFsb25lIiwiZW1haWwiOiJkZXZAbG9jYWwuaW52YWxpZCJ9.dev';
const DEFAULT_DEV_ROLES: ApexRole[] = ['APEX_ADM'];

function readDevApexRoles(): ApexRole[] {
  return DEFAULT_DEV_ROLES;
}

function permisoStub(
  i: number,
  nombreOperacion: string,
  urlPath: string,
): PortalTiPermiso {
  const base = APEX_ROUTER_BASE_PATH.replace(/\/+$/, '');
  const path = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
  return {
    CodigoOpcion: i,
    CodigoOpcionPadre: null,
    Titulo: nombreOperacion,
    Url: `${base}${path}`,
    Icono: 'mdi-view-dashboard',
    Tooltip: '',
    TipoOpcion: 'link',
    Orden: i,
    NumeroOperacion: i,
    NombreOperacion: nombreOperacion,
    DescripcionOperacion: '',
    Visible: true,
  };
}

function buildDevPermisos(): PortalTiPermiso[] {
  const base = APEX_ROUTER_BASE_PATH.replace(/\/+$/, '');
  let i = 1;
  const out: PortalTiPermiso[] = [
    permisoStub(i++, 'iniciativas-papelera', '/iniciativas/papelera'),
    permisoStub(i++, 'iniciativa-detail', '/iniciativas'),
    permisoStub(i++, 'incidentes', '/incidentes/dashboard'),
    permisoStub(i++, 'incidentes-dashboard', '/incidentes/dashboard'),
    permisoStub(i++, 'incidentes-g1', '/incidentes/g1'),
    permisoStub(i++, 'incidentes-g2', '/incidentes/g2'),
    permisoStub(i++, 'incidentes-g3', '/incidentes/g3'),
    permisoStub(i++, 'incidentes-soporte', '/incidentes/soporte'),
    permisoStub(i++, 'incidentes-otros', '/incidentes/otros'),
    permisoStub(i++, 'proyectos-papelera', '/proyectos/papelera'),
    permisoStub(i++, 'proyecto-detail', '/proyectos'),
    permisoStub(i++, 'config', '/config/mantenedor'),
    permisoStub(i++, 'config-mantenedor', '/config/mantenedor'),
    permisoStub(i++, 'config-auditoria-logs', '/config/auditoria/logs'),
    permisoStub(i++, 'config-auditoria-proyectos', '/config/auditoria/proyectos-eliminados'),
    permisoStub(i++, 'config-squads', '/config/squads'),
  ];
  out.push({
    CodigoOpcion: i,
    CodigoOpcionPadre: null,
    Titulo: 'Apex',
    Url: `${base}/`,
    Icono: 'mdi-apps',
    Tooltip: '',
    TipoOpcion: 'app',
    Orden: 0,
    NumeroOperacion: 0,
    NombreOperacion: 'apex-root',
    DescripcionOperacion: '',
    Visible: true,
  });
  return out;
}

function buildDevSession(): PortalTiSession {
  const roles = readDevApexRoles();
  return {
    user: {
      uid: 'dev-local',
      email: 'dev@local.invalid',
      displayName: `Desarrollo local (${roles.join(' + ')})`,
      roles,
      role: roles[0],
    },
    token: STANDALONE_APEX_DEV_JWT,
    initialized: true,
    authenticated: true,
    roles,
    role: roles[0],
  };
}

function buildDevApps(): PortalTiApp[] {
  const base = APEX_ROUTER_BASE_PATH.replace(/\/+$/, '');
  const roles = readDevApexRoles();
  return [
    {
      id: 'PORTAL-APEX',
      role: roles.join(','),
      name: 'Apex',
      description: 'Sistema de Gestión de Proyectos, Iniciativas e Incidentes',
      logo: null,
      icon: 'mdi-apps',
      path: `${base}/proyectos`,
    },
  ];
}

function install(): void {
  if (!import.meta.env.DEV) {
    return;
  }
  if (import.meta.env.VITE_STANDALONE_DEV !== 'true') {
    return;
  }
  if (window.portaltiShared) {
    return;
  }

  const apiBase =
    (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || 'http://127.0.0.1:3000';

  window.portaltiShared = {
    ready: async () => {},
    login: async () => {},
    logout: async () => {},
    getSession: async () => buildDevSession(),
    getUser: async () => buildDevSession().user,
    getToken: async () => STANDALONE_APEX_DEV_JWT,
    subscribe: () => () => {},
    getApps: async () => buildDevApps(),
    subscribeApps: () => () => {},
    getSystemInfo: async () =>
      ({
        id: 0,
        nombre: 'Dev',
        codigo: null,
        descripcion: null,
        microfrontends: [],
      }) as PortalTiSystemInfo,
    loadApps: async () => [],
    getPermisos: async () => buildDevPermisos(),
    getRoles: async () => readDevApexRoles(),
    getApexApiBaseUrl: () => apiBase,
  };

  window.dispatchEvent(new CustomEvent('portalti:shared-ready'));
}

install();
