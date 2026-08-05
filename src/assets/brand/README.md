# Recursos de marca (Interseguro) — Apex

Aquí centralizamos **logos, iconos propios e imágenes** del front.

## Guía «Portal Sistemas» (colores, componentes, plantillas)

Los **tokens CSS** del producto (`#1361B9`, `#006BF0`, `#FF429B`, `#00A94F`, `#CFDFEA`, `#C9C9C9`, radios 4/8px, etc.) están aplicados en `src/styles/design-system.css` y `primevue-brand.css`, extraídos de la guía en Documentos (*Estilos* / *Componentes*). Referencias SVG livianas y script de copia: `style-guide-source/README.md` y `npm run styleguide:sync`.

## Cómo entregar los archivos (elige una)

1. **Copiar al repo** (recomendado): arrastra los archivos a esta carpeta en tu PC y haces commit, o abres el proyecto en Cursor y pegas archivos en `src/assets/brand/...`.
2. **Adjuntar en el chat**: útil para SVG o PNG pequeños; yo te indico el diff o aplico el cambio.
3. **Enlace interno** (SharePoint / Drive): pega la URL si el entorno lo permite; si no, descárgalos y usa la opción 1.

## Estructura

| Carpeta | Uso |
|---------|-----|
| `logos/` | Logo cabecera (`logo-header.svg`), copia de referencia `logo-interseguro-color.svg` si aplica |
| `icons/` | Iconografía custom (no PrimeIcons) |
| `images/` | Ilustraciones, fotos, diagramas de pantalla |

## Logo (cabecera y variantes)

- **Formato preferido:** **SVG** (vector), texto convertido a curvas si la marca lo exige.
- **Alternativa:** **PNG** con transparencia, **al menos 2×** la resolución de uso (p. ej. si en UI mide ~140px de ancho, entrega ≥280px de ancho).
- **Nombre en repo:** `logos/logo-header.svg` (o `logo-header.png`) — es el que importa `AppHeader.vue`. Sustituye el archivo; **no hace falta renombrar código** si mantienes ese nombre.
- **Variantes opcionales:** `logo-login.svg` / `logo-footer.svg` si marca distinta; luego cableamos el import en la vista correspondiente.
- **Favicon / PWA:** coloca `favicon.ico` o `favicon.svg` en `frontend/public/` (no en `src/assets`) y avisa para enlazarlo en `index.html`.

## Iconos

- **Preferido:** **SVG** por archivo, `viewBox` cuadrado típico `0 0 24 24` (o el que use vue diseño), trazo único color `currentColor` para poder teñirlos con CSS.
- **Alternativa:** set **SVG sprite** (un solo `.svg` con símbolos) — indícalo y lo integramos con `<use>`.
- **Evitar para iconos UI:** PNG salvo iconos muy ilustrativos; escalan peor.
- **PrimeIcons:** ya vienen con el proyecto (`pi pi-*`); úsalo para acciones estándar; `brand/icons/` es para pictogramas **específicos del producto/marca**.

## Imágenes (fotos, banners)

- **Web:** **WebP** o **PNG/JPEG** optimizados; tamaño razonable (<300 KB por hero si es posible).
- **Nombres:** kebab-case, p. ej. `hero-dashboard.webp`.

## “Componentes” de diseño (Figma, etc.)

- Si te refieres a **biblioteca Figma:** expórtanos **SVG** (iconos, logos) o **PNG @2x** (maquetas raster).
- Si te refieren a **componentes Vue/React:** pégalos como `.vue` en el chat o en `src/components/` y los adaptamos al stack del proyecto (Vue 3 + PrimeVue).

## Qué necesito de ti para el logo correcto

1. Archivo oficial **horizontal** para barra superior (ideal **SVG**).
2. Si existe **versión clara / oscura**, ambas o la que corresponda al fondo blanco del header.
3. **Zona de respeto** si el manual lo indica (margen mínimo alrededor del logo en px o en proporción del alto del logo).

Cuando reemplaces `logos/logo-header.svg`, guarda el mismo nombre o actualiza el import en `AppHeader.vue`.
