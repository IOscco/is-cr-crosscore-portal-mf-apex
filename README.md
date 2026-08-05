# `@portalti/mf-apex`

Microfrontend de Apex construido con `Vue 3`, `single-spa` y `is-uikit-components-vue`, alineado al estándar de `is-cr-crosscore-portalti-mf-example`.

## Arquitectura

- Entry point `single-spa`: `src/main.ts`
- Lifecycles exportados: `bootstrap`, `mount`, `unmount`
- Router interno: `vue-router`
- UI corporativa: `is-uikit-components-vue`
- Estado local: `pinia`

Este proyecto ya no corre con login standalone propio.
La sesión, token y permisos deben venir del host por medio de `window.portaltiShared`.

## Requisitos

- Node.js 18+
- npm 9+
- Un host o entorno que exponga `window.portaltiShared`
- Backend Apex disponible en la URL configurada por `VITE_API_BASE_URL` (URL absoluta **o** ruta bajo el mismo host del portal, p. ej. `/api/apex`, que se resuelve contra `window.location.origin`). El host también puede definir `window.__APEX_API_BASE_URL__`, un `<meta name="apex-api-base" content="...">`, o `portaltiShared.getApexApiBaseUrl()` antes de cargar el MF. Con `VITE_LOG_API_BASE=true` se imprime en consola la base usada en el primer request.

## Scripts

- `npm run dev`: levanta Vite en `http://localhost:9025`
- `npm run build`: genera el bundle del microfrontend
- `npm run preview`: sirve el build en `http://localhost:9020`
- `npm run typecheck`: ejecuta `vue-tsc --noEmit`
- `npm run poc:data`: regenera datos PoC desde `scripts/`

## Desarrollo

1. Instala dependencias con `npm install`.
2. Configura `VITE_API_BASE_URL`.
3. Ejecuta `npm run dev`.
4. Carga el microfrontend desde el host `single-spa` o desde el entorno donde se inyecte `portaltiShared`.

Ejemplo para desarrollo local contra el backend local:

```env
VITE_API_BASE_URL=http://127.0.0.1:3000
```

Ejemplo para integración/despliegue vía API Gateway:

```env
VITE_API_BASE_URL=https://<api-gateway>
```

El servidor Vite corre en `9025` y ya no actúa como proxy HTTP del backend.
Las llamadas API salen directamente hacia `VITE_API_BASE_URL`.

## Contrato con el host

El host debe exponer `window.portaltiShared` con el contrato tipado en `src/vite-env.d.ts`.

El microfrontend depende de estos métodos:

- `ready()`
- `login()`
- `getSession()`
- `getToken()`
- `getPermisos(appCode)`

## Permisos

- La navegación lateral se alimenta con `shared.getPermisos(config.appCode)`.
- La autorización de rutas valida `NombreOperacion === route.name`.
- Capacidades de UI como edición de proyectos o acceso a configuración se infieren desde los permisos visibles entregados por el host.

## Build

La configuración de build usa:

- formato `es`
- `entryFileNames: 'main.js'`
- `modulePreload: false`

Esto mantiene el bundle compatible con la carga como microfrontend en `single-spa`.

## Notas

- `src/main.ts` no monta la app en `#app`; solo exporta lifecycles `single-spa`.
- `src/modules/shared/services/shared.ts` no tiene fallback local: si `portaltiShared` no existe, el microfrontend no puede autenticarse.
- `src/plugins/axios.ts` obtiene el token desde la shared API del host.
- En local, el backend se consume directamente con `VITE_API_BASE_URL`; no se usan proxies de Vite.

## CI/CD

El repositorio mantiene artefactos de despliegue en `.github/workflows/` y `deployments/`.
Si se ajusta el pipeline, debe respetarse que este proyecto es un microfrontend host-driven y no una app standalone.
