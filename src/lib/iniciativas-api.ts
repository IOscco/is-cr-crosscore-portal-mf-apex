import { apex, rethrowApiError } from '../plugins/axios';
import type { SquadApi } from './squads-api';

export type IniciativaApiRow = {
  id: string;
  sourceKey: string;
  periodo: string;
  squadNombre: string;
  epicaIniciativa: string;
  estatus: string;
  faseActual: string;
  descripcion: string | null;
  sistemaComponenteId: string | null;
  sistemaComponente: NamedCatalogApi | null;
  tipoIniciativaId: string | null;
  tipoIniciativa: NamedCatalogApi | null;
  areaNegocioId: string | null;
  areaNegocio: NamedCatalogApi | null;
  devEncargado: string | null;
  tlEncargado: string | null;
  liderIniciativa: string | null;
  sprintComprometido: string | null;
  sprintPaseProduccion: string | null;
  hito: string | null;
  hitoComprometido: string | null;
  origenIniciativa: string | null;
  origen: string | null;
  esCross: boolean;
  impactoSox: boolean;
  notas: string | null;
  payload: Record<string, unknown>;
  squadId: string | null;
  squad: SquadApi | null;
  deletedAt: string | null;
  deletedBy: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type IniciativaInput = {
  periodo: string;
  squad: string;
  epicaIniciativa: string;
  estatus: string;
  faseActual: string;
  descripcion?: string | null;
  sistemaComponenteId?: string | null;
  tipoIniciativaId?: string | null;
  areaNegocioId?: string | null;
  devEncargado?: string | null;
  tlEncargado?: string | null;
  liderIniciativa?: string | null;
  sprintComprometido?: string | null;
  sprintPaseProduccion?: string | null;
  hito?: string | null;
  hitoComprometido?: string | null;
  origenIniciativa?: string | null;
  origen?: string | null;
  esCross?: boolean | null;
  impactoSox?: boolean | null;
  notas?: string | null;
};

export type ColorCatalogApi = {
  valor: string;
  label: string;
  colorHex: string;
  textoOscuro: boolean;
};

export type NamedCatalogApi = {
  id: string;
  nombre: string;
  activo: boolean;
  createdAt?: string;
};

export type IniciativasCatalogos = {
  estatus: string[];
  fases: string[];
};

export type IniciativaImportResult = {
  imported: number;
  omitted: number;
  errors: { index: number; errors: string[] }[];
  data: IniciativaApiRow[];
};

export async function fetchIniciativas(periodo?: string | null): Promise<IniciativaApiRow[]> {
  try {
    const { data } = await apex.get<{ data: IniciativaApiRow[] }>('/iniciativas', {
      params: periodo ? { periodo } : undefined,
    });
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET iniciativas');
  }
}

export async function fetchIniciativasPeriodos(): Promise<string[]> {
  try {
    const { data } = await apex.get<{ data: string[] }>('/iniciativas/periodos');
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET iniciativas periodos');
  }
}

export async function fetchIniciativasCatalogos(): Promise<IniciativasCatalogos> {
  try {
    const { data } = await apex.get<IniciativasCatalogos>('/iniciativas/catalogos');
    return data;
  } catch (err) {
    rethrowApiError(err, 'GET iniciativas catalogos');
  }
}

export async function fetchEstadosGeneral(): Promise<ColorCatalogApi[]> {
  try {
    const { data } = await apex.get<{ data: ColorCatalogApi[] }>('/catalogos/estados');
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET catalogos estados');
  }
}

export async function fetchFasesActuales(): Promise<ColorCatalogApi[]> {
  try {
    const { data } = await apex.get<{ data: ColorCatalogApi[] }>('/catalogos/fases');
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET catalogos fases');
  }
}

export async function fetchTipoIniciativaCatalog(includeInactive = false): Promise<NamedCatalogApi[]> {
  try {
    const { data } = await apex.get<{ data: NamedCatalogApi[] }>('/catalogos/tipo-iniciativa', {
      params: includeInactive ? { includeInactive } : undefined,
    });
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET catalogos tipo-iniciativa');
  }
}

export async function fetchAreaNegocioCatalog(includeInactive = false): Promise<NamedCatalogApi[]> {
  try {
    const { data } = await apex.get<{ data: NamedCatalogApi[] }>('/catalogos/area-negocio', {
      params: includeInactive ? { includeInactive } : undefined,
    });
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET catalogos area-negocio');
  }
}

export async function fetchPortafolioCatalog(includeInactive = false): Promise<NamedCatalogApi[]> {
  try {
    const { data } = await apex.get<{ data: NamedCatalogApi[] }>('/catalogos/portafolio', {
      params: includeInactive ? { includeInactive } : undefined,
    });
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET catalogos portafolio');
  }
}

export async function fetchIniciativaById(id: string): Promise<IniciativaApiRow> {
  try {
    const { data } = await apex.get<IniciativaApiRow>(`/iniciativas/${encodeURIComponent(id)}`);
    return data;
  } catch (err) {
    rethrowApiError(err, 'GET iniciativa');
  }
}

export async function fetchIniciativasPapelera(): Promise<IniciativaApiRow[]> {
  try {
    const { data } = await apex.get<{ data: IniciativaApiRow[] }>('/iniciativas/papelera');
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET iniciativas/papelera');
  }
}

export async function patchIniciativaSquad(id: string, squadId: string | null): Promise<IniciativaApiRow> {
  try {
    const { data } = await apex.patch<IniciativaApiRow>(`/iniciativas/${encodeURIComponent(id)}/squad`, {
      squadId,
    });
    return data;
  } catch (err) {
    rethrowApiError(err, 'PATCH iniciativa squad');
  }
}

export async function createIniciativaApi(payload: IniciativaInput): Promise<IniciativaApiRow> {
  try {
    const { data } = await apex.post<IniciativaApiRow>('/iniciativas', payload);
    return data;
  } catch (err) {
    rethrowApiError(err, 'POST iniciativa');
  }
}

export async function updateIniciativaApi(id: string, payload: IniciativaInput): Promise<IniciativaApiRow> {
  try {
    const { data } = await apex.patch<IniciativaApiRow>(`/iniciativas/${encodeURIComponent(id)}`, payload);
    return data;
  } catch (err) {
    rethrowApiError(err, 'PATCH iniciativa');
  }
}

export async function importIniciativasApi(
  periodo: string,
  rows: IniciativaInput[],
  skipInvalid: boolean,
): Promise<IniciativaImportResult> {
  try {
    const { data } = await apex.post<IniciativaImportResult>('/iniciativas/import', {
      periodo,
      rows,
      skipInvalid,
    });
    return data;
  } catch (err) {
    rethrowApiError(err, 'POST iniciativas import');
  }
}

export async function downloadIniciativasCargaTemplate(): Promise<Blob> {
  try {
    const { data } = await apex.get<Blob>('/iniciativas/plantilla-carga', {
      responseType: 'blob',
    });
    return data;
  } catch (err) {
    rethrowApiError(err, 'GET iniciativas plantilla-carga');
  }
}

export async function cargaMasivaIniciativasApi(rows: IniciativaInput[]): Promise<IniciativaImportResult> {
  try {
    const { data } = await apex.post<IniciativaImportResult>('/iniciativas/carga-masiva', { rows });
    return data;
  } catch (err) {
    rethrowApiError(err, 'POST iniciativas carga-masiva');
  }
}

export async function deleteIniciativaApi(id: string): Promise<void> {
  try {
    await apex.delete(`/iniciativas/${encodeURIComponent(id)}`);
  } catch (err) {
    rethrowApiError(err, 'DELETE iniciativa');
  }
}

export async function restoreIniciativaPapelera(id: string): Promise<void> {
  try {
    await apex.post(`/iniciativas/papelera/${encodeURIComponent(id)}/restore`, {});
  } catch (err) {
    rethrowApiError(err, 'POST iniciativa restore');
  }
}

export async function purgeIniciativaPapelera(id: string): Promise<void> {
  try {
    await apex.delete(`/iniciativas/papelera/${encodeURIComponent(id)}`);
  } catch (err) {
    rethrowApiError(err, 'DELETE iniciativa purge');
  }
}
