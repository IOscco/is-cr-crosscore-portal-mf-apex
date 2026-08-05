import { apex, rethrowApiError } from '../plugins/axios';

export type AuditLogEntryApi = {
  id: string;
  occurredAt: string;
  userEmail: string;
  module: string;
  entityType: string;
  entityId: string;
  entityLabel: string | null;
  action: string;
  detail: unknown;
};

export async function fetchAuditLogs(params: {
  module?: string;
  action?: string;
  userEmail?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<AuditLogEntryApi[]> {
  try {
    const { data } = await apex.get<{ data: AuditLogEntryApi[] }>('/config/auditoria/logs', {
      params: {
        module: params.module || undefined,
        action: params.action || undefined,
        userEmail: params.userEmail || undefined,
        from: params.from || undefined,
        to: params.to || undefined,
        limit: params.limit,
      },
    });
    return data.data ?? [];
  } catch (err) {
    rethrowApiError(err, 'GET audit logs');
  }
}

export function auditLogsToCsv(rows: AuditLogEntryApi[]): string {
  const esc = (v: unknown): string => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/[",\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = ['occurredAt', 'userEmail', 'module', 'entityType', 'entityId', 'entityLabel', 'action', 'detail'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        esc(r.occurredAt),
        esc(r.userEmail),
        esc(r.module),
        esc(r.entityType),
        esc(r.entityId),
        esc(r.entityLabel),
        esc(r.action),
        esc(r.detail),
      ].join(','),
    );
  }
  return lines.join('\n');
}
