import { apex, rethrowApiError } from '../plugins/axios';

export type SquadMiembroApi = {
  id: string;
  rol: string;
  usuarioLogin: string;
  usuarioNombre: string;
};

export type SquadUsuarioApi = {
  id: string;
  nombre: string;
  email: string;
};

export type SquadApi = {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string;
  tipoEquipo?: 'TRIBU_DESARROLLO' | 'SOPORTE_NEGOCIO';
  activo: boolean;
  deletedAt: string | null;
  deletedBy: string | null;
  miembros: SquadMiembroApi[];
  conteoPorRol: Record<string, number>;
};

export async function fetchSquadsActive(): Promise<SquadApi[]> {
  try {
    const { data } = await apex.get<{ data: SquadApi[] }>('/squads/active');
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET squads/active');
  }
}

export async function fetchSquadsCards(): Promise<SquadApi[]> {
  try {
    const { data } = await apex.get<{ data: SquadApi[] }>('/squads');
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET squads');
  }
}

export async function fetchSquadsPapelera(): Promise<SquadApi[]> {
  try {
    const { data } = await apex.get<{ data: SquadApi[] }>('/squads/papelera');
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET squads/papelera');
  }
}

export async function createSquadApi(body: {
  nombre: string;
  descripcion?: string | null;
  tipoEquipo?: 'TRIBU_DESARROLLO' | 'SOPORTE_NEGOCIO';
  miembros: { rol: string; usuarioLogin: string; usuarioNombre: string }[];
}): Promise<SquadApi> {
  try {
    const { data } = await apex.post<SquadApi>('/squads', body);
    return data;
  } catch (err) {
    rethrowApiError(err, 'POST squads');
  }
}

export async function searchSquadUsuarios(q: string): Promise<SquadUsuarioApi[]> {
  try {
    const { data } = await apex.get<{ data: SquadUsuarioApi[] }>('/squads/usuarios', {
      params: { q },
    });
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET squads/usuarios');
  }
}

export async function patchSquadApi(
  id: string,
  body: {
    nombre?: string;
    descripcion?: string | null;
    tipoEquipo?: 'TRIBU_DESARROLLO' | 'SOPORTE_NEGOCIO';
    activo?: boolean;
    miembros?: { rol: string; usuarioLogin: string; usuarioNombre: string }[];
  },
): Promise<SquadApi> {
  try {
    const { data } = await apex.patch<SquadApi>(`/squads/${encodeURIComponent(id)}`, body);
    return data;
  } catch (err) {
    rethrowApiError(err, 'PATCH squads');
  }
}

export async function deleteSquadApi(id: string): Promise<void> {
  try {
    await apex.delete(`/squads/${encodeURIComponent(id)}`);
  } catch (err) {
    rethrowApiError(err, 'DELETE squads');
  }
}

export async function restoreSquadPapelera(id: string): Promise<void> {
  try {
    await apex.post(`/squads/papelera/${encodeURIComponent(id)}/restore`, {});
  } catch (err) {
    rethrowApiError(err, 'POST squads restore');
  }
}

export async function purgeSquadPapelera(id: string): Promise<void> {
  try {
    await apex.delete(`/squads/papelera/${encodeURIComponent(id)}`);
  } catch (err) {
    rethrowApiError(err, 'DELETE squads purge');
  }
}

export async function fetchSquadMatchResolutor(text: string): Promise<{
  squadNombre: string;
  tpoNombre: string | null;
} | null> {
  try {
    const { data } = await apex.get<{ data: { squadNombre: string; tpoNombre: string | null } | null }>(
      '/squads/match-resolutor',
      { params: { text } },
    );
    return data.data ?? null;
  } catch (err) {
    rethrowApiError(err, 'GET squads/match-resolutor');
  }
}

export async function fetchSquadUsageWarnings(nombres: string[]): Promise<string[]> {
  try {
    const { data } = await apex.post<{ data: string[] }>('/squads/usage-warnings', { nombres });
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'POST squads/usage-warnings');
  }
}
