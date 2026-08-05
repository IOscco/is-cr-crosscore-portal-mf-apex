import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import {
  getResolvedApiBaseUrl,
  resolveConfiguredApiBaseString,
  warnIfApiBaseBlockedOnHttpsPage,
} from '../config';
import { waitForSharedApi } from '../modules/shared/services/shared';

let warnedMissingApiBase = false;
let loggedApiBase = false;

async function resolveRequestBaseUrl(fixed?: string): Promise<string> {
  if (fixed) {
    return resolveConfiguredApiBaseString(fixed);
  }
  let resolved = getResolvedApiBaseUrl();
  if (resolved) {
    return resolved;
  }
  try {
    const shared = await waitForSharedApi();
    const fn = shared.getApexApiBaseUrl;
    if (typeof fn === 'function') {
      const raw = await fn();
      if (typeof raw === 'string' && raw.trim()) {
        resolved = resolveConfiguredApiBaseString(raw);
      }
    }
  } catch {
    /* host sin shared aún */
  }
  return resolved;
}

export function createApexAxios(baseURL?: string): AxiosInstance {
  const instance = axios.create({
    baseURL: baseURL ?? undefined,
    withCredentials: true,
  });

  instance.interceptors.request.use(async (cfg: InternalAxiosRequestConfig) => {
    const resolved = await resolveRequestBaseUrl(baseURL);
    if (resolved) {
      cfg.baseURL = resolved;
      warnIfApiBaseBlockedOnHttpsPage(resolved);
      if (import.meta.env.VITE_LOG_API_BASE === 'true' && !loggedApiBase) {
        loggedApiBase = true;
        console.info('[Apex] Peticiones HTTP → base:', resolved);
      }
    } else {
      cfg.baseURL = undefined;
      if (typeof window !== 'undefined' && !warnedMissingApiBase) {
        warnedMissingApiBase = true;
        console.warn(
          '[Apex] Sin URL base del API. Defina VITE_API_BASE_URL en el build, meta <meta name="apex-api-base" content="/ruta">, ' +
            'window.__APEX_API_BASE_URL__, o portaltiShared.getApexApiBaseUrl(). Las peticiones irán al origen del portal (404).',
        );
      }
    }
    try {
      const shared = await waitForSharedApi();
      const token = await shared.getToken();
      if (token && !cfg.headers.has('Authorization')) {
        cfg.headers.set('Authorization', `Bearer ${token}`);
      }
    } catch {
      // Deja que el host o el interceptor de 401 resuelvan la sesión.
    }
    return cfg;
  });

  instance.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        void waitForSharedApi()
          .then((shared) => shared.login())
          .catch(() => undefined);
      }
      return Promise.reject(error);
    },
  );

  return instance;
}

export const apex = createApexAxios();

function buildAttemptedRequestUrl(err: AxiosError): string {
  const cfgBase = err.config?.baseURL != null ? String(err.config.baseURL).trim() : '';
  const cfgUrl = err.config?.url != null ? String(err.config.url) : '';
  if (!cfgUrl) {
    return '';
  }
  if (/^https?:\/\//i.test(cfgUrl)) {
    return cfgUrl;
  }
  const fromInterceptor = cfgBase || (typeof window !== 'undefined' ? getResolvedApiBaseUrl() : '');
  const base = fromInterceptor.replace(/\/+$/, '');
  const path = cfgUrl.startsWith('/') ? cfgUrl : `/${cfgUrl}`;
  return base ? `${base}${path}` : path;
}

/**
 * Mensaje legible para UI y toasts. Si no hay `response`, Axios suele reportar «Network Error»
 * (CORS, certificado, contenido mixto, gateway que no enruta el método, etc.).
 */
export function extractApiMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: unknown } | undefined;
    if (data && typeof data.message === 'string' && data.message.trim()) {
      return data.message.trim();
    }
    if (err.response?.status) {
      return `${fallback}: ${err.response.status}`;
    }

    const summary = fallback.replace(/\s*\.\s*$/, '');
    const tried = buildAttemptedRequestUrl(err);
    const msgLower = (err.message ?? '').toLowerCase();

    if (err.code === 'ECONNABORTED' || msgLower.includes('timeout')) {
      return `${summary}. Tiempo de espera agotado al contactar el API.${tried ? ` URL: ${tried}` : ''}`;
    }

    if (err.message === 'Network Error' || err.code === 'ERR_NETWORK') {
      const syncBase = typeof window !== 'undefined' ? getResolvedApiBaseUrl() : '';
      const cfgBase = err.config?.baseURL != null ? String(err.config.baseURL).trim() : '';
      const mixedContent =
        typeof window !== 'undefined' &&
        window.location.protocol === 'https:' &&
        (syncBase.startsWith('http:') || cfgBase.startsWith('http:'));
      const parts = [
        `${summary}. No hubo respuesta del servidor (fallo de red o bloqueo del navegador).`,
        'En F12 → Red, revise la petición POST y la consola (CORS, certificado, políticas del portal).',
      ];
      if (mixedContent) {
        parts.push('La página es HTTPS y la base del API usa http://: el navegador bloquea eso (contenido mixto). Use la misma ruta HTTPS del gateway o meta apex-api-base con URL segura.');
      }
      if (tried) {
        parts.push(`URL intentada: ${tried}`);
      }
      return parts.join(' ');
    }

    return `${summary}: ${err.message?.trim() || 'Error desconocido'}`;
  }
  return fallback;
}

export function rethrowApiError(err: unknown, fallback: string): never {
  const e = new Error(extractApiMessage(err, fallback)) as Error & { status?: number };
  if (axios.isAxiosError(err) && err.response?.status) {
    e.status = err.response.status;
  }
  throw e;
}
