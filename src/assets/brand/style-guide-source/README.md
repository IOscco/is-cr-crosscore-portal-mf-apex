# Referencia «Portal Sistemas – Guía de Estilo»

Los **tokens CSS** del front viven en `src/styles/design-system.css` (prefijos `--ps-*` y alias `--color-*`), extraídos de:

- **Estilos** / `Colors.svg` — G100 `#1361B9`, interactivo `#006BF0`, acento GT `#FF429B`, éxito `#00A94F`, divisor `#CFDFEA`.
- **Componentes** / `ps-button.svg` — botón `rx="4"`, relleno `#1361B9`.
- **Componentes** / `ps-input.svg` — borde `#C9C9C9`.

En esta carpeta se conservan solo SVG **atomales** livianos para auditoría visual; los artboards completos (Fonts, Iconos, spacing, etc.) deben mantenerse en tu copia local de la guía.

## Sincronizar desde tu PC

Si actualizas la guía en Documentos, puedes volver a copiar referencias:

```powershell
cd frontend
powershell -ExecutionPolicy Bypass -File scripts/sync-portal-style-guide.ps1
```

Ajusta la ruta base dentro del script si tu carpeta difiere.
