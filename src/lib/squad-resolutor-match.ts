import type { GtiTicket } from '@/lib/incidentes-gti-types';
import type { SquadApi } from '@/lib/squads-api';

function normalizeIdentity(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function identityCandidates(value: string | null | undefined): string[] {
  const normalized = normalizeIdentity(value);
  if (!normalized) {
    return [];
  }
  const out = new Set<string>([normalized]);
  if (normalized.includes('@')) {
    out.add(normalized.split('@')[0]);
  }
  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length > 1 && !normalized.includes('@')) {
    out.add([...tokens].sort().join(' '));
  }
  return [...out];
}

function tokensForName(value: string | null | undefined): string[] {
  return normalizeIdentity(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !token.includes('@'));
}

function hasStrongNameTokenOverlap(left: string | null | undefined, right: string | null | undefined): boolean {
  const leftTokens = tokensForName(left);
  const rightTokens = tokensForName(right);
  if (leftTokens.length < 2 || rightTokens.length < 2) {
    return false;
  }
  const rightSet = new Set(rightTokens);
  const overlap = leftTokens.filter((token) => rightSet.has(token));
  const minSize = Math.min(leftTokens.length, rightTokens.length);
  return overlap.length >= 2 && overlap.length / minSize >= 0.66;
}

function findSquadBySource(
  source: string | null | undefined,
  squads: SquadApi[],
): { squad: SquadApi; source: string } | null {
  const rawSource = String(source ?? '').trim();
  if (!rawSource) {
    return null;
  }

  const sourceIdentities = identityCandidates(rawSource);
  if (!sourceIdentities.length) {
    return null;
  }

  const squad = squads.find((candidate) => {
    if (candidate.deletedAt || !candidate.miembros?.length) {
      return false;
    }
    return candidate.miembros.some((miembro) => {
      const memberIdentities = [
        ...identityCandidates(miembro.usuarioNombre),
        ...identityCandidates(miembro.usuarioLogin),
        ...identityCandidates(miembro.id),
      ];
      return (
        memberIdentities.some((identity) => sourceIdentities.includes(identity)) ||
        hasStrongNameTokenOverlap(rawSource, miembro.usuarioNombre)
      );
    });
  });

  return squad ? { squad, source: rawSource } : null;
}

export function resolveTicketSquad(ticket: GtiTicket, squads: SquadApi[]): GtiTicket {
  const matchResolutor = findSquadBySource(ticket.usuarioResolutor, squads);
  const matchUsuarioActual =
    findSquadBySource(ticket.usuarioActual, squads) ??
    findSquadBySource(ticket.usuarioActualLogin, squads) ??
    findSquadBySource(ticket.usuarioActualEmail, squads);

  const match = matchResolutor ?? matchUsuarioActual;
  if (!match) {
    return {
      ...ticket,
      squad: null,
      tpo: null,
    };
  }

  return {
    ...ticket,
    soporteNegocio: ticket.soporteNegocio || match.squad.tipoEquipo === 'SOPORTE_NEGOCIO',
    squad: match.squad.nombre,
    tpo: match.squad.miembros.find((miembro) => miembro.rol === 'tpo')?.usuarioNombre ?? null,
  };
}

export function resolveTicketsSquad(tickets: GtiTicket[], squads: SquadApi[]): GtiTicket[] {
  if (!squads.length) {
    return tickets.map((ticket) => ({
      ...ticket,
      squad: null,
      tpo: null,
    }));
  }
  return tickets.map((ticket) => resolveTicketSquad(ticket, squads));
}

export function matchSquadForResolutorLocal(
  usuarioResolutor: string | string[],
  squads: SquadApi[],
): { squadNombre: string; tpoNombre: string | null } | null {
  const ticketIdentities = new Set(
    (Array.isArray(usuarioResolutor) ? usuarioResolutor : [usuarioResolutor]).flatMap((value) => identityCandidates(value)),
  );
  if (ticketIdentities.size === 0) {
    return null;
  }
  for (const squad of squads) {
    if (squad.deletedAt || !squad.miembros?.length) {
      continue;
    }
    const hit = squad.miembros.some((miembro) => {
      const memberIdentities = [
        ...identityCandidates(miembro.usuarioLogin),
        ...identityCandidates(miembro.usuarioNombre),
        ...identityCandidates(miembro.id),
      ];
      return memberIdentities.some((identity) => ticketIdentities.has(identity));
    });
    if (hit) {
      const tpo = squad.miembros.find((x) => x.rol === 'tpo');
      return { squadNombre: squad.nombre, tpoNombre: tpo?.usuarioNombre ?? null };
    }
  }
  return null;
}
