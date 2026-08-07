# Integraciones

## APIs HTTP Externas

| Dependencia | Propósito | Focalpoint |
| --- | --- | --- |
| Backend Apex (REST) | Proyectos, iniciativas, squads, configuración, actividades, documentos y proxy GTI de incidentes. Base URL: `VITE_API_BASE_URL` o inyección del host. | |
| Portal TI — `window.portaltiShared` | Sesión, token JWT, permisos de menú y roles; opcionalmente base del API Apex. | |
| Upstream GTI (vía backend Apex) | Listado de tickets de incidentes en bandejas G1/G2/G3 y soporte negocio. El MF solo llama a `/incidentes/gti/*` en Apex; Apex reenvía al sistema GTI. | |

## Detalles de Integración

### Portal TI (`window.portaltiShared`)

Contrato tipado en `src/vite-env.d.ts`. El microfrontend **no** implementa login propio.

- `ready()` — espera a que el host exponga la API compartida.
- `getToken()` — JWT enviado en `Authorization: Bearer` por el interceptor de Axios (`src/plugins/axios.ts`).
- `getPermisos(appCode)` — alimenta la navegación lateral; `NombreOperacion` debe coincidir con `route.name`.
- `getRoles(appCode)` — autorización de capacidades de edición y acceso a `/config`.
- `getApexApiBaseUrl()` (opcional) — resuelve la base del backend cuando no hay `VITE_API_BASE_URL` en el build.

En desarrollo local sin host: `VITE_STANDALONE_DEV=true` activa el shim en `src/dev-portalti-shared-shim.ts`.

### Backend Apex

Todas las funciones en `src/lib/*-api.ts` usan la instancia `apex` de Axios. Autenticación: Bearer token del host. Credenciales: `withCredentials: true`.

Principales prefijos consumidos:

- `/proyectos`, `/actividades` — gestión de proyectos y cronograma.
- `/iniciativas`, `/catalogos` — iniciativas y catálogos de negocio.
- `/squads` — equipos resolutores y tribus.
- `/config` — mantenedores, periodos y auditoría.
- `/incidentes/gti` — estado de integración y listado de tickets.

Referencia de paths HTTP: `docs/openapi.json` (contrato consumido por este MF; la especificación canónica del backend vive en el repositorio del API Apex).

### Incidentes GTI

1. El MF consulta `GET /incidentes/gti/status` para saber si la integración está configurada.
2. El listado en vivo usa `GET /incidentes/gti/tickets` con parámetros de filtro y `startDate` (configurable con `VITE_INCIDENTES_GTI_START_DATE`).
3. Respuestas se cachean en cliente según `VITE_INCIDENTES_GTI_CACHE_TTL_MS` (`src/lib/incidentes-gti-live-cache.ts`).

Si no hay token válido, el backend responde **401** y las tablas de incidentes quedan vacías.
