import type { NavigationGuardNext, RouteLocationNormalized, Router } from 'vue-router';
import { waitForSharedApi } from '../modules/shared/services/shared';
import { usePermisos } from '../modules/shared/composables/usePermisos';

const FALLBACK_ROUTE_NAMES = ['proyectos', 'iniciativas', 'incidentes-dashboard', 'config-mantenedor'] as const;

/** Primera sección navegable a la que el rol del usuario tiene acceso, o `null`. */
function firstPermittedRoute(hasPermiso: (name: string) => boolean): string | null {
  return FALLBACK_ROUTE_NAMES.find((name) => hasPermiso(name)) ?? null;
}

export function createAuthorizationMiddleware(router: Router) {
  return async function authorizationMiddleware(
    to: RouteLocationNormalized,
    _from: RouteLocationNormalized,
    next: NavigationGuardNext,
  ): Promise<void> {
    const knownRouteNames = router.getRoutes().map((r) => r.name).filter((n) => n != null);
    const isKnownRoute = knownRouteNames.some((name) => name === to.name);

    try {
      const shared = await waitForSharedApi();
      const session = await shared.getSession();

      if (!session.authenticated) {
        await shared.login();
        return;
      }

      const { loadPermisos, hasPermiso } = usePermisos();

      try {
        await loadPermisos(shared);
      } catch (permisosError) {
        // Sin permisos cargados no podemos resolver un destino seguro: fail closed.
        console.warn('[Apex] No se pudieron cargar los permisos:', permisosError);
        next(false);
        return;
      }

      // Ruta conocida y autorizada: navegar directamente.
      if (isKnownRoute && hasPermiso(String(to.name))) {
        next();
        return;
      }

      // Ruta desconocida (p. ej. `/`) o conocida-pero-no-autorizada: redirigir a la
      // primera sección permitida en un solo salto.
      const fallback = firstPermittedRoute(hasPermiso);
      if (fallback && fallback !== to.name) {
        next({ name: fallback });
      } else {
        next(false);
      }
    } catch (error) {
      console.error('[Apex] No se pudo validar la sesión del portal:', error);
      next(false);
    }
  };
}
