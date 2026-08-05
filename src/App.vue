<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { RouterView } from 'vue-router';
import { navigateToUrl } from 'single-spa';
import { IsNavMenu } from 'is-uikit-components-vue/org';
import { IsToast, IsConfirmDialog } from 'is-uikit-components-vue';
import { APEX_ROUTER_BASE_PATH } from '@/constants/apex-router-base';
import { waitForSharedApi } from '@/modules/shared/services/shared';
import { usePermisos } from '@/modules/shared/composables/usePermisos';
import router from '@/router';
import '@/assets/styles/main.css';

const currentPath = ref(window.location.pathname);
const { permisos } = usePermisos();

function pathFromNavigateUrl(url: string): string {
  const t = url.trim();
  if (/^https?:\/\//i.test(t)) {
    try {
      return new URL(t).pathname;
    } catch {
      return t;
    }
  }
  return t.startsWith('/') ? t : `/${t}`;
}

function mfResolveCandidates(pathname: string): string[] {
  const base = APEX_ROUTER_BASE_PATH.replace(/\/+$/, '');
  const p = pathname.trim() || '/';
  const out: string[] = [];
  if (p && !out.includes(p)) {
    out.push(p);
  }
  if (!p.startsWith(`${base}/`) && p !== base) {
    const tail = p.startsWith('/') ? p : `/${p}`;
    const prefixed = `${base}${tail === '/' ? '/proyectos' : tail}`;
    if (!out.includes(prefixed)) {
      out.push(prefixed);
    }
  }
  return out;
}

onMounted(async () => {
  currentPath.value = router.currentRoute.value.path;
  router.afterEach((to) => {
    currentPath.value = to.path;
  });
  try {
    const shared = await waitForSharedApi();
    await shared.ready();
    currentPath.value = router.currentRoute.value.path;
  } catch {
    // el host no expuso la shared API a tiempo
  }
});

function onNavigate(url: string): void {
  const pathname = pathFromNavigateUrl(url);
  currentPath.value = pathname;
  for (const candidate of mfResolveCandidates(pathname)) {
    const resolved = router.resolve(candidate);
    if (resolved.name != null && resolved.matched.length > 0) {
      void router.push(resolved);
      return;
    }
  }
  navigateToUrl(url);
}
</script>

<template>
  <IsToast position="top-right" />
  <IsConfirmDialog />

  <div class="apex-mf-shell">
    <IsNavMenu
      :items="permisos"
      :active-url="currentPath"
      title="Apex"
      @navigate="onNavigate"
    />
    <main class="apex-mf-content">
      <div class="apex-mf-view">
        <RouterView v-slot="{ Component, route: r }">
          <Transition name="apex-page" mode="out-in">
            <component :is="Component" :key="r.path" />
          </Transition>
        </RouterView>
      </div>
    </main>
  </div>
</template>

<style scoped>
.apex-mf-shell {
  display: flex;
  width: 100%;
  height: 100dvh;
  background: #fafafa;
  font-family: var(--primary-font);
  padding:
    calc(var(--portalti-header-height, 64px))
    0
    var(--portalti-footer-height, 44px);
  box-sizing: border-box;
  overflow: hidden;
}

@media (max-width: 640px) {
  .apex-mf-shell {
    padding:
      calc(var(--portalti-header-height, 64px))
      0
      var(--portalti-footer-height, 44px);
  }
}

.apex-mf-content {
  flex: 1;
  min-width: 0;
  overflow: auto;
  background: #f8fafc;
  overscroll-behavior: contain;
}

.apex-mf-view {
  width: 100%;
  min-width: 0;
  min-height: calc(100dvh - var(--portalti-header-height, 64px) - var(--portalti-footer-height, 44px));
  /* Mismo inset que la lista de proyectos (.pr): alinea el contenido respecto al menú en todos los módulos */
  padding: clamp(0.85rem, 1.7vw, 1.25rem) clamp(1.5rem, 3.5vw, 3rem) 2rem;
  box-sizing: border-box;
}

@media (max-width: 640px) {
  .apex-mf-view {
    padding: 0.85rem 0.75rem 1.5rem;
  }
}

/* Transición suave entre rutas */
.apex-page-enter-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.apex-page-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.apex-page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.apex-page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
