/**
 * Configuración centralizada del frontend.
 *
 * Estándar Interseguro «Environment Configuration»: ningún componente o
 * servicio debe acceder a `import.meta.env` directamente. Toda variable
 * `VITE_*` se expone aquí.
 *
 * Orden de resolución de la base del API (sincrónica):
 * 1. `window.__APEX_API_BASE_URL__`
 * 2. `<meta name="apex-api-base" content="...">` en el documento del host
 * 3. `VITE_API_BASE_URL` (absoluta o ruta `/...` respecto a `window.location.origin`)
 * 4. En modo Vite **dev** (`import.meta.env.DEV`), si sigue vacío: `http://127.0.0.1:3000`
 *
 * Además, el interceptor de Axios puede completar la base con
 * `portaltiShared.getApexApiBaseUrl?.()` (async), tipado opcional en `vite-env.d.ts`.
 */

const rawAppCode = (import.meta.env.VITE_APP_CODE ?? 'PORTAL-APEX').trim() || 'PORTAL-APEX';

function trimTrailingSlashes(s: string): string {
  return s.replace(/\/+$/, '');
}

/**
 * Convierte un valor de configuración (env, meta, inyección) en URL base absoluta.
 */
export function resolveConfiguredApiBaseString(raw: string): string {
  const t = raw.trim();
  if (!t) {
    return '';
  }
  const noTrail = trimTrailingSlashes(t);
  if (/^https?:\/\//i.test(noTrail)) {
    return noTrail;
  }
  if (noTrail.startsWith('/') && typeof window !== 'undefined' && window.location?.origin) {
    return trimTrailingSlashes(`${window.location.origin}${noTrail}`);
  }
  return noTrail;
}

function readMetaApexApiBase(): string {
  if (typeof document === 'undefined') {
    return '';
  }
  return document.querySelector('meta[name="apex-api-base"]')?.getAttribute('content')?.trim() ?? '';
}

/**
 * URL base del backend Apex ya resuelta (absoluta), solo con fuentes sincrónicas.
 * Para `getApexApiBaseUrl` del portal, usar el interceptor en `plugins/axios.ts`.
 */
export function getResolvedApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const injected = window.__APEX_API_BASE_URL__;
    if (typeof injected === 'string' && injected.trim()) {
      return resolveConfiguredApiBaseString(injected);
    }
  }
  const meta = readMetaApexApiBase();
  if (meta) {
    return resolveConfiguredApiBaseString(meta);
  }
  const fromEnv = (import.meta.env.VITE_API_BASE_URL ?? '').trim();
  const envResolved = resolveConfiguredApiBaseString(fromEnv);
  if (envResolved) {
    return envResolved;
  }
  if (import.meta.env.DEV) {
    return 'http://127.0.0.1:3000';
  }
  return '';
}

export const config = {
  /** Código de aplicación. Se usará como `appCode` cuando el MF se embeba en Portal TI. */
  appCode: rawAppCode,
  /** Prefijo absoluto del API; preferir `getResolvedApiBaseUrl()` en código nuevo. */
  get apiBaseUrl(): string {
    return getResolvedApiBaseUrl();
  },
};

/** Construye una URL del backend respetando la base resuelta (solo sincrónico). */
export function buildApiUrl(path: string): string {
  const base = getResolvedApiBaseUrl();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${suffix}` : suffix;
}

let warnedHttpsPageAgainstHttpApi = false;

/**
 * Desde una página HTTPS (p. ej. Portal Apex), el navegador bloquea XHR/fetch hacia `http://`
 * (contenido mixto). `http://127.0.0.1` o `localhost` desde un build desplegado nunca debe usarse.
 */
export function warnIfApiBaseBlockedOnHttpsPage(resolvedBase: string): void {
  if (typeof window === 'undefined' || !resolvedBase || warnedHttpsPageAgainstHttpApi) {
    return;
  }
  if (window.location.protocol !== 'https:') {
    return;
  }
  if (!/^http:\/\//i.test(resolvedBase)) {
    return;
  }
  warnedHttpsPageAgainstHttpApi = true;
  console.error(
    '[Apex ITP] El portal es HTTPS pero la base del API es HTTP; el navegador bloquea esas peticiones.',
    'Revise VITE_API_BASE_URL en el build, la meta apex-api-base o portaltiShared.getApexApiBaseUrl():',
    'debe ser una ruta relativa al portal (p. ej. /api/itp) o una URL https:// del gateway.',
    `Base actual: ${resolvedBase}`,
  );
}
