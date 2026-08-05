<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, RouterLink, RouterView } from 'vue-router';
import { usePortalAccess } from '@/modules/shared/composables/usePortalAccess';

const route = useRoute();
const { canAccessConfigMantenedor, canAccessConfigAuditoria, canAccessConfigSquads } = usePortalAccess();

const pageTitle = computed(() => {
  if (route.path.includes('/mantenedor')) {
    return 'Mantenedor';
  }
  if (route.path.includes('/auditoria/logs')) {
    return 'Logs de auditoría';
  }
  if (route.path.includes('/squads')) {
    return 'Squads';
  }
  return 'Configuración';
});
</script>

<template>
  <div class="cfg">
    <nav class="cfg__bc" aria-label="Breadcrumb">
      <RouterLink :to="{ name: 'config-mantenedor' }" class="cfg__bc-link">Configuración</RouterLink>
      <span class="cfg__bc-sep">›</span>
      <span class="cfg__bc-current">{{ pageTitle }}</span>
    </nav>
    <div class="cfg__subnav">
      <RouterLink v-if="canAccessConfigMantenedor" :to="{ name: 'config-mantenedor' }" class="cfg__sub" active-class="cfg__sub--active">
        Mantenedor
      </RouterLink>
      <RouterLink
        v-if="canAccessConfigAuditoria"
        :to="{ name: 'config-auditoria-logs' }"
        class="cfg__sub"
        active-class="cfg__sub--active"
      >
        Logs de auditoría
      </RouterLink>
      <RouterLink v-if="canAccessConfigSquads" :to="{ name: 'config-squads' }" class="cfg__sub" active-class="cfg__sub--active">Squads</RouterLink>
    </div>
    <RouterView />
  </div>
</template>

<style scoped>
.cfg__bc {
  font-size: 14px;
  color: theme('colors.surface.700');
  margin-bottom: 1rem;
}
.cfg__bc-link {
  color: #006bf0;
  text-decoration: none;
}
.cfg__bc-link:hover {
  text-decoration: underline;
}
.cfg__bc-current {
  color: #1a1a2e;
  font-weight: 600;
}
.cfg__bc-sep {
  margin: 0 0.35rem;
  color: #cbd5e1;
}
.cfg__subnav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  padding: 0.4rem;
  margin-bottom: 1.25rem;
  background: #eef5fc;
  border-radius: 8px;
  border: 1px solid #cfdfea;
}
.cfg__sub {
  font-size: 13px;
  font-weight: 600;
  color: #5a6f82;
  text-decoration: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  border: 1px solid transparent;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}
.cfg__sub:hover {
  color: #006bf0;
  background: rgba(255, 255, 255, 0.7);
}
.cfg__sub--active {
  color: theme('colors.surface.800');
  font-weight: 700;
  background: #ffffff;
  border-color: theme('colors.surface.200');
  box-shadow:
    0 2px 8px rgba(19, 97, 185, 0.1),
    inset 0 -3px 0 0 #f0aa00;
}

/* ISAC-like visual refinement */
.cfg__bc {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 1.75rem;
  padding: 0.2rem 0.65rem;
  border: 1px solid #e2e8f0;
  border-radius: 999px;
  background: #fff;
  color: #64748b;
  font-size: 13px;
}

.cfg__bc-link {
  color: #1361b9;
  font-weight: 700;
}

.cfg__bc-current {
  color: #1e293b;
}

.cfg__subnav {
  border-color: #e2e8f0;
  background: #f1f5f9;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.035);
}

.cfg__sub {
  border-radius: 8px;
  color: #64748b;
}

.cfg__sub--active {
  color: #1e293b;
  box-shadow:
    0 2px 8px rgba(15, 23, 42, 0.05),
    inset 0 -2px 0 0 #ff429b;
}
</style>
