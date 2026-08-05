import { apex, rethrowApiError } from '../plugins/axios';

export type ConfigCatalogCategory =
  | 'TIPO_INICIATIVA'
  | 'ESTADO_PROYECTO'
  | 'ROL_EQUIPO'
  | 'RESPONSABLE'
  | 'ESTATUS_INICIATIVA'
  | 'FASE_INICIATIVA'
  | 'PRIORIZACION_INICIATIVA';

export function labelToSnakeCode(label: string): string {
  const base = label
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return base || `item_${Date.now().toString(36)}`;
}

export type CatalogItemDto = {
  id: string;
  category: ConfigCatalogCategory;
  code: string;
  label: string;
  activo: boolean;
  cardinalidad: 'single' | 'multiple' | null;
  sortOrder: number;
};

export type PeriodoConfigDto = {
  id: string;
  periodo: string;
  activo: boolean;
  createdAt?: string;
};

export type NamedConfigDto = {
  id: string;
  nombre: string;
  activo: boolean;
  createdAt?: string;
};

/** Catálogo activo (visible para el usuario común). */
export async function fetchCatalogActive(category: ConfigCatalogCategory): Promise<CatalogItemDto[]> {
  try {
    const { data } = await apex.get<{ data: CatalogItemDto[] }>('/config/catalog', {
      params: { category },
    });
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, `GET catalog ${category}`);
  }
}

/** Catálogo administrativo (incluye inactivos; HU-ITP-005). */
export async function fetchCatalogAdmin(category: ConfigCatalogCategory): Promise<CatalogItemDto[]> {
  try {
    const { data } = await apex.get<{ data: CatalogItemDto[] }>('/config/catalog/admin', {
      params: { category },
    });
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, `GET catalog admin ${category}`);
  }
}

/** Edita un ítem del catálogo (label, estado activo o cardinalidad). */
export async function patchCatalogItem(
  id: string,
  body: { activo?: boolean; label?: string; cardinalidad?: 'single' | 'multiple' | null },
): Promise<CatalogItemDto> {
  try {
    const { data } = await apex.patch<CatalogItemDto>(
      `/config/catalog/items/${encodeURIComponent(id)}`,
      body,
    );
    return data;
  } catch (err) {
    rethrowApiError(err, 'PATCH catalog item');
  }
}

/** Crea un ítem nuevo en el catálogo. */
export async function createCatalogItem(body: {
  category: ConfigCatalogCategory;
  label: string;
  code?: string;
  cardinalidad?: 'single' | 'multiple' | null;
}): Promise<CatalogItemDto> {
  try {
    const { data } = await apex.post<CatalogItemDto>('/config/catalog/items', body);
    return data;
  } catch (err) {
    rethrowApiError(err, 'POST catalog item');
  }
}

export async function fetchPeriodosAdmin(): Promise<PeriodoConfigDto[]> {
  try {
    const { data } = await apex.get<{ data: PeriodoConfigDto[] }>('/config/periodos', {
      params: { includeInactive: true },
    });
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET config periodos');
  }
}

export async function createPeriodoConfig(periodo: string): Promise<PeriodoConfigDto> {
  try {
    const { data } = await apex.post<PeriodoConfigDto>('/config/periodos', { periodo });
    return data;
  } catch (err) {
    rethrowApiError(err, 'POST config periodos');
  }
}

export async function patchPeriodoConfig(id: string, body: { activo?: boolean }): Promise<PeriodoConfigDto> {
  try {
    const { data } = await apex.patch<PeriodoConfigDto>(`/config/periodos/${encodeURIComponent(id)}`, body);
    return data;
  } catch (err) {
    rethrowApiError(err, 'PATCH config periodos');
  }
}

type NamedConfigKind = 'tipo-iniciativa' | 'area-negocio' | 'portafolio';

export async function fetchNamedConfig(kind: NamedConfigKind): Promise<NamedConfigDto[]> {
  try {
    const { data } = await apex.get<{ data: NamedConfigDto[] }>(`/config/${kind}`, {
      params: { includeInactive: true },
    });
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, `GET config ${kind}`);
  }
}

export async function createNamedConfig(kind: NamedConfigKind, nombre: string): Promise<NamedConfigDto> {
  try {
    const { data } = await apex.post<NamedConfigDto>(`/config/${kind}`, { nombre });
    return data;
  } catch (err) {
    rethrowApiError(err, `POST config ${kind}`);
  }
}

export async function patchNamedConfig(
  kind: NamedConfigKind,
  id: string,
  body: { nombre?: string; activo?: boolean },
): Promise<NamedConfigDto> {
  try {
    const { data } = await apex.patch<NamedConfigDto>(`/config/${kind}/${encodeURIComponent(id)}`, body);
    return data;
  } catch (err) {
    rethrowApiError(err, `PATCH config ${kind}`);
  }
}
