import { defineStore } from 'pinia';
import type { ApexRole } from '@/modules/shared/lib/apex-roles';

/**
 * Catálogo de opciones de menú / operaciones expuesto por Portal TI (`getPermisos`).
 * Misma forma que el ejemplo `helloWorldStore` del estándar ARQ-327.
 */
export const usePermisosStore = defineStore('permisos', {
  state: () => ({
    permisos: [] as PortalTiPermiso[],
    apexRoles: [] as ApexRole[],
  }),
  actions: {
    setPermisos(permisos: PortalTiPermiso[]): void {
      this.permisos = permisos;
    },
    setApexRoles(roles: ApexRole[]): void {
      this.apexRoles = roles;
    },
    clearPermisos(): void {
      this.permisos = [];
      this.apexRoles = [];
    },
  },
});
