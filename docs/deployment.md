# Despliegue

## Dónde vive

**GCP Cloud Run** — contenedor Nginx sirve el bundle estático del microfrontend (`dist/`, entry `main.js`).

## Pipeline CI/CD

Workflow: `.github/workflows/build-deploy.yaml`

| Rama | Ambiente GitHub | Build | Deploy Cloud Run |
| --- | --- | --- | --- |
| `dev` | `dev_ci` / `dev_cd` | Sí | Sí |
| `main` | `main_ci` / `main_cd` | Sí | Sí |
| `integrator` | `integrator_ci` | Sí | No (solo build + imagen) |
| `test/release-*` | `test_ci` / `test_cd` | Sí | Sí |

Pasos relevantes:

1. `secrets.BUILD_SECRET` → archivo `.env` con variables `VITE_*` del ambiente.
2. `npm install` + `npm run build` → artefacto `dist/`.
3. Imagen Docker (`Dockerfile` + `deployments/nginx/nginx.conf`) → Artifact Registry.
4. `google-github-actions/deploy-cloudrun` publica la revisión en Cloud Run.

## Ambientes

| Ambiente | Uso típico | Notas |
| --- | --- | --- |
| **Dev** | Integración continua desde rama `dev` | Validar `VITE_API_BASE_URL` contra gateway de desarrollo |
| **Stg** | Pruebas pre-producción (`test/release-*`) | Mismo flujo WIF; secrets de ambiente `test_*` |
| **Prod** | Rama `main` | Base del API vía ruta HTTPS del portal o gateway productivo |

## Integración con Portal TI (single-spa)

- El host carga `main.js` desde la URL de Cloud Run del MF.
- `main.js` tiene cabeceras `Cache-Control: no-cache` en Nginx para forzar revalidación tras cada despliegue.
- Assets con hash pueden cachearse de forma inmutable.
- CORS: `Access-Control-Allow-Origin: *` en Nginx para permitir carga cross-origin desde el shell del portal.

## Puertos locales

| Comando | Puerto | Propósito |
| --- | --- | --- |
| `npm run dev` | `9025` | Vite + plugin single-spa |
| `npm run preview` | `9020` | Preview del build |
| Contenedor Cloud Run | `8080` | Nginx |
