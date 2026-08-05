/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

declare module '*.svg' {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_APP_CODE?: string;
  /** Fecha inicio (query `startDate`) para listar incidentes GTI; formato según api-gti. */
  readonly VITE_INCIDENTES_GTI_START_DATE?: string;
  /** TTL ms de caché en cliente para el listado de incidentes (evita golpear Apex en cada vista). */
  readonly VITE_INCIDENTES_GTI_CACHE_TTL_MS?: string;
  /**
   * `true`: inyecta `window.portaltiShared` de prueba (sesión + JWT + permisos) para `npm run dev` sin host Portal TI.
   */
  readonly VITE_STANDALONE_DEV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Contrato Portal TI (estándar Interseguro mf-example).
 * En Apex, la sesión, token y permisos se consumen desde `window.portaltiShared`
 * expuesto por el host. Estos tipos mantienen el contrato esperado por el
 * microfrontend para integrarse con Portal TI.
 * ────────────────────────────────────────────────────────────────────────── */

interface PortalTiUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  roles?: string[];
  role?: string;
}

interface PortalTiSession {
  user: PortalTiUser | null;
  token: string | null;
  initialized: boolean;
  authenticated: boolean;
  roles?: string[];
  role?: string;
}

interface PortalTiApp {
  id: string;
  role: string;
  name: string;
  description: string;
  logo: string | null;
  icon: string;
  path: string;
}

interface PortalTiMicrofrontInfo {
  id: number;
  nombre: string;
  urlBase: string;
  entrypoint: string | null;
  version: string;
  codigoSeguridad: string | null;
  estado: boolean;
}

interface PortalTiSystemInfo {
  id: number;
  nombre: string;
  codigo: string | null;
  descripcion: string | null;
  microfrontends: PortalTiMicrofrontInfo[];
}

interface PortalTiPermiso {
  CodigoOpcion: number;
  CodigoOpcionPadre: number | null;
  Titulo: string;
  Url: string;
  Icono: string;
  Tooltip: string;
  TipoOpcion: string;
  Orden: number;
  NumeroOperacion: number;
  NombreOperacion: string;
  DescripcionOperacion: string;
  Visible: boolean;
}

interface PortalTiSharedApi {
  ready(): Promise<void>;
  login(): Promise<void>;
  logout(): Promise<void>;
  getSession(): Promise<PortalTiSession>;
  getUser(): Promise<PortalTiUser | null>;
  getToken(): Promise<string | null>;
  subscribe(listener: (session: PortalTiSession) => void): () => void;
  getApps(): Promise<PortalTiApp[]>;
  subscribeApps(listener: (apps: PortalTiApp[]) => void): () => void;
  getSystemInfo(codigo: string): Promise<PortalTiSystemInfo>;
  loadApps(appCodes: string[]): Promise<PortalTiApp[]>;
  getPermisos(app: string): Promise<PortalTiPermiso[]>;
  /** Roles del usuario para la app (p. ej. `['APEX_ADM']`); fuente única de autorización del MF. */
  getRoles(app: string): Promise<string[]>;
  /** Opcional: base del API Apex (absoluta o `/ruta`); el MF la usa si no hay VITE_API_BASE_URL. */
  getApexApiBaseUrl?: () => string | Promise<string>;
}

interface Window {
  portaltiShared?: PortalTiSharedApi;
  /** Opcional: el host Portal TI puede fijar la base del API Apex sin recompilar el MF. */
  __APEX_API_BASE_URL__?: string;
}
