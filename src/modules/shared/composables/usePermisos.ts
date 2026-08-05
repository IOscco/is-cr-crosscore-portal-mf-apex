/**
 * Composable de permisos del microfrontend (estándar Interseguro ARQ-327).
 * Carga con `shared.getPermisos(APP_CODE)` y valida acceso por `route.name` y, en su caso, `route.path` vs `permiso.Url`.
 */
import { computed, type ComputedRef } from 'vue';
import { usePermisosStore } from '../../../stores/permisosStore';
import { config } from '../../../config';
import {
  buildApexAccess,
  canAccessRouteByRole,
  moduleForPermiso,
  uniqueRoles,
  type ApexRole,
} from '../lib/apex-roles';

export const APP_CODE = config.appCode;

const iconSvgBySection = {
  iniciativas: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3.5c-3.2 0-5.7 2.5-5.7 5.6 0 2 .9 3.5 2.4 4.7.8.7 1.1 1.4 1.1 2.4h4.4c0-1 .3-1.7 1.1-2.4 1.5-1.2 2.4-2.7 2.4-4.7 0-3.1-2.5-5.6-5.7-5.6Z" />
      <path d="M9.7 19h4.6" />
      <path d="M10.5 21h3" />
    </svg>
  `,
  incidentes: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3.8 21 19.5H3L12 3.8Z" />
      <path d="M12 9v4.4" />
      <path d="M12 17h.01" />
    </svg>
  `,
  proyectos: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M3.8 7.2h6.4l1.7 2h8.3v9.6a1.8 1.8 0 0 1-1.8 1.8H5.6a1.8 1.8 0 0 1-1.8-1.8V7.2Z" />
      <path d="M3.8 7.2V5.8A1.8 1.8 0 0 1 5.6 4h4.1l1.8 2.1" />
    </svg>
  `,
  configuracion: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 7h10" />
      <path d="M18 7h2" />
      <circle cx="16" cy="7" r="2" />
      <path d="M4 17h2" />
      <path d="M10 17h10" />
      <circle cx="8" cy="17" r="2" />
      <path d="M4 12h5" />
      <path d="M13 12h7" />
      <circle cx="11" cy="12" r="2" />
    </svg>
  `,
  apex: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z" />
      <path d="M12 8.2 16.2 10.6v4.8L12 17.8l-4.2-2.4v-4.8L12 8.2Z" />
    </svg>
  `,
} as const;

function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}

function permisoSectionKey(permiso: PortalTiPermiso): keyof typeof iconSvgBySection | null {
  const module = moduleForPermiso(permiso);
  if (module === 'dashboard') {
    return null;
  }
  if (module === 'iniciativas') {
    return 'iniciativas';
  }
  if (module === 'incidentes') {
    return 'incidentes';
  }
  if (module === 'config') {
    return 'configuracion';
  }
  if (module === 'proyectos') {
    return 'proyectos';
  }
  const text = `${permiso.NombreOperacion} ${permiso.Titulo} ${permiso.Url}`.toLowerCase();
  if (text.includes('apex')) {
    return 'apex';
  }
  return null;
}

function withApexNavIcon(permiso: PortalTiPermiso): PortalTiPermiso {
  const key = permisoSectionKey(permiso);
  if (!key) {
    return permiso;
  }
  return {
    ...permiso,
    Icono: svgToDataUrl(iconSvgBySection[key]),
  };
}

export const usePermisos = (): {
  permisos: ComputedRef<PortalTiPermiso[]>;
  apexRoles: ComputedRef<ApexRole[]>;
  loadPermisos: (shared?: PortalTiSharedApi) => Promise<void>;
  hasPermiso: (routeName: string | null | undefined) => boolean;
} => {
  const store = usePermisosStore();

  const apexRoles = computed(() => store.apexRoles);
  // El servicio (`getPermisos`) ya devuelve el catálogo filtrado por rol; aquí solo se
  // respeta `Visible` y se decoran los íconos de navegación del MF.
  const permisos = computed(() => store.permisos.filter((p) => p.Visible).map(withApexNavIcon));

  const loadPermisos = async (shared?: PortalTiSharedApi): Promise<void> => {
    if (!shared) {
      return;
    }
    if (store.permisos.length > 0) {
      return;
    }
    const result = await shared.getPermisos(APP_CODE);
    store.setPermisos(result as PortalTiPermiso[]);
    store.setApexRoles(uniqueRoles(await shared.getRoles(APP_CODE)));
  };

  const hasPermiso = (routeName: string | null | undefined): boolean => {
    if (!routeName) {
      return false;
    }
    return canAccessRouteByRole(routeName, buildApexAccess(store.apexRoles));
  };

  return { permisos, apexRoles, loadPermisos, hasPermiso };
};
