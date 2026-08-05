import { computed } from 'vue';
import { usePermisosStore } from '@/stores/permisosStore';
import { buildApexAccess } from '@/modules/shared/lib/apex-roles';

export function usePortalAccess() {
  const store = usePermisosStore();
  const access = computed(() => buildApexAccess(store.apexRoles));

  return {
    apexRoles: computed(() => store.apexRoles),
    access,
    canAccessDashboard: computed(() => access.value.canAccessDashboard),
    canAccessConfig: computed(() => access.value.canAccessConfig),
    canAccessConfigMantenedor: computed(() => access.value.canAccessConfigMantenedor),
    canAccessConfigAuditoria: computed(() => access.value.canAccessConfigAuditoria),
    canAccessConfigSquads: computed(() => access.value.canAccessConfigSquads),
    canSeeConfigMantenedorIniciativas: computed(() => access.value.canSeeConfigMantenedorIniciativas),
    canSeeConfigMantenedorProyectos: computed(() => access.value.canSeeConfigMantenedorProyectos),
    canSeeConfigAuditIniciativas: computed(() => access.value.canSeeConfigAuditIniciativas),
    canSeeConfigAuditProyectos: computed(() => access.value.canSeeConfigAuditProyectos),
    canSeeConfigProyectosEliminados: computed(() => access.value.canSeeConfigProyectosEliminados),
    canAccessIniciativas: computed(() => access.value.canAccessIniciativas),
    canManageIniciativas: computed(() => access.value.canManageIniciativas),
    canAdminIniciativas: computed(() => access.value.canAdminIniciativas),
    canAccessIncidentes: computed(() => access.value.canAccessIncidentes),
    canAccessProyectos: computed(() => access.value.canAccessProyectos),
    canManageProyectos: computed(() => access.value.canManageProyectos),
  };
}
