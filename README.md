# @portalti/mf-apex

## Descripción y propósito

Microfrontend de **Apex** (Portal de gestión de proyectos, iniciativas, squads e incidentes GTI) construido con Vue 3, single-spa e `is-uikit-components-vue`. Se embebe en Portal TI: la sesión, el JWT y los permisos los provee el host vía `window.portaltiShared`; el MF consume el backend Apex REST configurado en build o inyectado en runtime.

## Repositorio

https://github.com/IOscco/is-cr-crosscore-portal-mf-apex

## Requisitos

- Node.js 18+ (CI usa Node 20 LTS)
- npm 9+
- Host Portal TI que exponga `window.portaltiShared`, o `VITE_STANDALONE_DEV=true` para desarrollo local
- Backend Apex accesible en la URL de `VITE_API_BASE_URL` (absoluta o ruta bajo el mismo host HTTPS del portal)

## Estructura del proyecto

```
is-cr-crosscore-portal-mf-apex/
├── .github/workflows/          # CI/CD build y deploy Cloud Run
├── deployments/nginx/          # Configuración Nginx del contenedor
├── docs/                       # Documentación obligatoria (config, openapi, flujos)
├── scripts/                    # Utilidades PoC y sync de style guide
├── src/
│   ├── main.ts                 # Lifecycles single-spa (bootstrap, mount, unmount)
│   ├── config.ts               # Variables VITE_* y resolución de API base
│   ├── router/                 # Rutas vue-router bajo /portal-apex
│   ├── plugins/axios.ts        # Cliente HTTP con token del host
│   ├── lib/                    # Clientes API (proyectos, iniciativas, squads, etc.)
│   ├── views/                  # Pantallas por módulo
│   ├── components/             # Layout y componentes compartidos
│   ├── modules/shared/         # Integración portaltiShared y permisos
│   └── data/poc/               # JSON de demostración (PoC)
├── Dockerfile                  # Imagen Nginx + dist
├── vite.config.ts              # Build MF (puerto dev 9025, entry main.js)
└── README.md                   # Este archivo
```

## Quickstart

```bash
npm install
cp .env.example .env
# Editar VITE_API_BASE_URL y, si aplica, VITE_STANDALONE_DEV=true
npm run dev
```

- Dev: http://localhost:9025
- Preview del build: `npm run build && npm run preview` → http://localhost:9020
- Typecheck: `npm run typecheck`

## Configuración esencial

| Variable | Descripción |
| --- | --- |
| `VITE_APP_CODE` | Código de app para permisos (`APEX`) |
| `VITE_API_BASE_URL` | Base del backend Apex |
| `VITE_STANDALONE_DEV` | Mock de `portaltiShared` en local |
| `VITE_LOG_API_BASE` | Log de la base API en consola |

Detalle completo: [docs/configurations.md](docs/configurations.md).

Ejemplo desarrollo local:

```env
VITE_APP_CODE=APEX
VITE_API_BASE_URL=http://127.0.0.1:3000
VITE_STANDALONE_DEV=true
```

Ejemplo despliegue embebido en portal HTTPS:

```env
VITE_APP_CODE=APEX
VITE_API_BASE_URL=/ruta-del-gateway/itp-api
```

## Contrato con el host

El host debe exponer `window.portaltiShared` (tipos en `src/vite-env.d.ts`):

- `ready()`, `login()`, `getSession()`, `getToken()`, `getPermisos(appCode)`
- Opcional: `getApexApiBaseUrl()`, `getRoles(appCode)`

La navegación lateral usa permisos del host; la autorización de rutas valida `NombreOperacion === route.name`.

## Despliegue

Dónde vive: GCP Cloud Run

Ambientes: Dev / Stg / Prod → [docs/deployment.md](docs/deployment.md)

Integraciones HTTP: [docs/integrations.md](docs/integrations.md)

Flujos principales: [docs/flows.md](docs/flows.md)

API consumida (OpenAPI): [docs/openapi.json](docs/openapi.json)

## Notas técnicas

- Entry single-spa: `src/main.ts` exporta lifecycles; no monta en `#app` standalone.
- Build: formato ES, `entryFileNames: main.js`, `modulePreload: false`.
- Sin `portaltiShared` (y sin `VITE_STANDALONE_DEV`), el MF no puede autenticarse.
- En HTTPS del portal, no usar `http://127.0.0.1` como base del API (contenido mixto).
