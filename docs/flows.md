# Flujos del microfrontend

Rutas internas bajo base `/portal-apex`. Los diagramas describen la interacción entre usuario, MF, host Portal TI y backend Apex.

## Autenticación y montaje (single-spa)

```mermaid
sequenceDiagram
  participant Host as Portal TI (host)
  participant MF as mf-apex
  participant Shared as portaltiShared
  participant API as Backend Apex

  Host->>MF: bootstrap / mount (main.js)
  MF->>Shared: ready()
  Shared-->>MF: sesión inicializada
  MF->>Shared: getToken()
  Shared-->>MF: JWT
  MF->>Shared: getPermisos(APEX)
  Shared-->>MF: menú y operaciones
  Note over MF: Router valida NombreOperacion vs route.name
  MF->>API: GET /proyectos (Authorization Bearer)
  API-->>MF: 200 lista proyectos
```

## GET /proyectos

```mermaid
sequenceDiagram
  participant U as Usuario
  participant V as ProyectosListView
  participant API as proyectos-api
  participant B as Backend Apex

  U->>V: Abre /portal-apex/proyectos
  V->>API: fetchProyectosList()
  API->>B: GET /proyectos?filtros
  B-->>API: { data, meta }
  API-->>V: filas renderizadas
  V-->>U: Tabla de proyectos
```

## POST /proyectos

```mermaid
sequenceDiagram
  participant U as Usuario
  participant D as NuevoProyectoDialog
  participant API as proyectos-api
  participant B as Backend Apex

  U->>D: Completa formulario y guarda
  D->>API: createProyecto(payload)
  API->>B: POST /proyectos
  B-->>API: { id }
  API-->>D: id nuevo
  D-->>U: Redirección a detalle
```

## GET /incidentes/gti/tickets

```mermaid
sequenceDiagram
  participant U as Usuario
  participant V as IncidentesGrupoView
  participant C as incidentes-gti-live-cache
  participant API as Backend Apex
  participant GTI as Upstream GTI

  U->>V: Abre bandeja G1/G2/G3
  V->>C: getTickets(grupo)
  alt caché válida
    C-->>V: tickets cacheados
  else caché expirada
    C->>API: GET /incidentes/gti/tickets
    API->>GTI: proxy upstream
    GTI-->>API: tickets
    API-->>C: JSON
    C-->>V: tickets normalizados
  end
  V-->>U: Tabla con alertas de antigüedad
```

## GET /config/catalog

```mermaid
sequenceDiagram
  participant U as Administrador
  participant V as ConfigMantenedorView
  participant API as config-api
  participant B as Backend Apex

  U->>V: Edita catálogo (p. ej. ESTADO_PROYECTO)
  V->>API: fetchCatalogAdmin(category)
  API->>B: GET /config/catalog/admin?category=...
  B-->>API: ítems activos e inactivos
  API-->>V: lista
  U->>V: PATCH ítem
  V->>API: patchCatalogItem(id, body)
  API->>B: PATCH /config/catalog/items/{id}
  B-->>API: ítem actualizado
  V-->>U: UI refrescada
```
