import { apex, extractApiMessage } from '@/plugins/axios';
import type { GtiTicket, GtiTicketListResponse, GtiTicketRawDto } from '@/lib/incidentes-gti-types';

const DEFAULT_TTL_MS = 120_000;

function defaultStartDate(): string {
  const fromEnv = import.meta.env.VITE_INCIDENTES_GTI_START_DATE?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : '2025-01-01 00:00:00';
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function pickText(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cleanText(value);
    if (text) {
      return text;
    }
  }
  return null;
}

function isTruthyGtiFlag(value: unknown): boolean {
  const text = cleanText(value).toLowerCase();
  return ['true', '1', 'si', 'sí', 's', 'yes', 'y'].includes(text);
}

function isSoporteNegocio(item: GtiTicketRawDto): boolean {
  const patron = pickText(item.patron_squad);
  return isTruthyGtiFlag(item.es_soporte) || String(patron ?? '').trim().toLowerCase() === 'soporte al negocio';
}

export function formatGtiDate(value: unknown): string {
  const raw = cleanText(value);
  if (!raw) {
    return '\u2014';
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return '\u2014';
  }
  const date = d.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('es-PE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${date} ${time}`;
}

export function mapGtiTicketDtoToIncidentRow(item: GtiTicketRawDto): GtiTicket {
  return {
    gti: cleanText(item.gti ?? item.id),
    subcategoria: pickText(item.subcategoria, item.subcategory),
    sistema: pickText(item.sistema, item.system),
    estadoActual: pickText(item.estadoactual, item.currentStatus),
    usuarioActual: pickText(item.usuarioactual, item.currentUserName, item.codusuarioactual, item.currentUserLogin),
    usuarioActualLogin: pickText(item.codusuarioactual, item.currentUserLogin),
    usuarioActualEmail: pickText(item.currentUserEmail),
    usuarioResolutor: pickText(item.UsuarioResolutor, item.resolverUser, item.Cod_UsuarioResolutor),
    fechaRegistro: pickText(item.fec_registro, item.createdAt),
    fechaUltimoEstado: pickText(item.fec_ultimoestado, item.lastStatusAt),
    area: pickText(item.areausuarioregistro, item.area),
    descripcion: pickText(item.gls_descripcion, item.description),
    titulo: pickText(item.gls_titulo, item.title),
    soporteNegocio: isSoporteNegocio(item),
    patronSquad: pickText(item.patron_squad),
    tpoLeadGti: pickText(item['TPO / Lead']),
    squad: null,
    tpo: null,
  };
}

type CacheEntry = { ts: number; rows: GtiTicket[]; meta: GtiTicketListResponse['meta'] | null };

let cache: CacheEntry | null = null;

export function invalidateIncidentesGtiCache(): void {
  cache = null;
}

export function getIncidentesGtiCacheTtlMs(): number {
  const n = Number(import.meta.env.VITE_INCIDENTES_GTI_CACHE_TTL_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MS;
}

export async function getIncidentesGtiRows(options?: {
  force?: boolean;
}): Promise<{ rows: GtiTicket[]; error: string | null; meta: GtiTicketListResponse['meta'] | null }> {
  const ttl = getIncidentesGtiCacheTtlMs();
  if (!options?.force && cache && Date.now() - cache.ts < ttl) {
    return { rows: cache.rows, error: null, meta: cache.meta };
  }
  try {
    const response = await apex.get<GtiTicketListResponse | GtiTicketRawDto[]>('/incidentes/gti/tickets', {
      params: {
        category: 'incidentes',
        startDate: defaultStartDate(),
      },
    });
    const data = response.data;
    const rawItems = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    const rows = rawItems
      .filter((item): item is GtiTicketRawDto => Boolean(item && typeof item === 'object'))
      .map((item) => mapGtiTicketDtoToIncidentRow(item));
    const meta = Array.isArray(data) ? null : data?.meta ?? null;
    cache = { ts: Date.now(), rows, meta };
    return { rows, error: null, meta };
  } catch (e) {
    return {
      rows: [],
      error: extractApiMessage(e, 'No se pudieron cargar los incidentes GTI'),
      meta: null,
    };
  }
}
