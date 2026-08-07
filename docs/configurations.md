# Variables de entorno

Este microfrontend no expone endpoints HTTP propios. Las variables `VITE_*` se inyectan en **tiempo de build** (Vite) y se centralizan en `src/config.ts`. En runtime, el host Portal TI puede sobreescribir la base del API Apex sin recompilar.

| Variable | Descripción | Valores |
| --- | --- | --- |
| `VITE_APP_CODE` | Código de aplicación usado al consultar permisos y roles en `window.portaltiShared`. | `APEX` (por defecto en `.env.example`), `PORTAL-APEX` si no se define |
| `VITE_API_BASE_URL` | URL base del backend Apex. Puede ser absoluta (`https://...`) o ruta relativa al portal (`/api/itp`). En dev, si queda vacía, se usa `http://127.0.0.1:3000`. | `http://127.0.0.1:3000` (solo dev local), `/ruta-del-gateway/itp-api`, `https://<api-gateway>` |
| `VITE_LOG_API_BASE` | Si es `true`, imprime en consola la base del API usada en el primer request HTTP. | `true`, omitir o cualquier otro valor |
| `VITE_STANDALONE_DEV` | Si es `true`, inyecta un `window.portaltiShared` mock para desarrollo sin host Portal TI (sesión, permisos y JWT de prueba). | `true`, omitir |
| `VITE_INCIDENTES_GTI_START_DATE` | Fecha inicial (`startDate`) enviada al listar tickets GTI vía `/incidentes/gti/tickets`. | Fecha en formato aceptado por el backend GTI (p. ej. `2024-01-01`) |
| `VITE_INCIDENTES_GTI_CACHE_TTL_MS` | TTL en milisegundos de la caché en cliente para el listado de incidentes GTI. | Número entero (p. ej. `300000`) |

## Configuración en runtime (host Portal TI)

Estas opciones no son variables de entorno del MF; las define el shell que carga `main.js`:

| Mecanismo | Descripción | Valores |
| --- | --- | --- |
| `window.__APEX_API_BASE_URL__` | Inyección global de la base del API antes de montar el MF. | URL absoluta o ruta `/...` |
| `<meta name="apex-api-base" content="...">` | Meta tag en el HTML del host. | Ruta relativa o URL absoluta |
| `portaltiShared.getApexApiBaseUrl()` | Método opcional del contrato shared API del portal. | `string` o `Promise<string>` |

**Orden de resolución (sincrónico):** `__APEX_API_BASE_URL__` → meta `apex-api-base` → `VITE_API_BASE_URL` → fallback dev `http://127.0.0.1:3000`. El interceptor de Axios puede completar con `getApexApiBaseUrl()` si las fuentes anteriores están vacías.

## Consideraciones de despliegue

- Desde una página **HTTPS** del portal, la base del API **no puede** ser `http://127.0.0.1` ni `http://localhost` (contenido mixto bloqueado por el navegador).
- Use una ruta relativa al mismo host del portal o una URL `https://` del API Gateway.
- En CI/CD, el workflow escribe `secrets.BUILD_SECRET` en `.env` antes de `npm run build`; debe incluir al menos `VITE_API_BASE_URL` y `VITE_APP_CODE` para el ambiente destino.
