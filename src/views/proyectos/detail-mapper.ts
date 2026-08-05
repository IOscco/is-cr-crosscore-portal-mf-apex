import type { ProyectoDetailApi } from '@/lib/proyectos-api';
import type { IntegranteProyectoHu025, ProyectoPocRow } from '@/types/poc-data';

/** Convierte respuesta GET /proyectos/:id al shape PoC usado por la vista de detalle. */
export function mapProyectoDetailApiToPocRow(d: ProyectoDetailApi): ProyectoPocRow {
  const p = d.proyecto as Record<string, unknown>;
  const lr = d.listRow;

  let integrantesEquipo: IntegranteProyectoHu025[] | undefined;
  const rawJson = p.integrantesJson;
  if (typeof rawJson === 'string' && rawJson.trim()) {
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (Array.isArray(parsed)) {
        integrantesEquipo = parsed as IntegranteProyectoHu025[];
      }
    } catch {
      /* ignorar JSON inválido */
    }
  }

  const dev =
    integrantesEquipo?.map((x) => `${x.rol}: ${x.nombreApellido}`).join('; ') || '—';

  const hitosStr =
    d.hitos?.length ? d.hitos.map((h) => `${h.nombre} (${h.fechaFinPlan})`).join('; ') : '—';

  const nombre = String(p.nombre ?? '');
  const estado = String(p.estado ?? lr.estadoTexto ?? '');
  const fase = String(p.faseActual ?? '');
  const resp =
    p.responsable != null && String(p.responsable).trim() ? String(p.responsable) : lr.itProjectManager;
  const tipo = p.tipo != null && String(p.tipo).trim() ? String(p.tipo) : lr.tipo;

  return {
    id: String(p.id ?? ''),
    origen: 'manual',
    squad: lr.squadProveedor,
    epica: nombre,
    estatusGeneral: estado,
    faseActual: fase || '—',
    fechaPap: lr.papFinPlan,
    ticketGti: '',
    tl: resp || '—',
    dev,
    priorizacion: '—',
    hitoQ2: hitosStr,
    sprintCompromiso:
      p.sprintCompromiso != null && String(p.sprintCompromiso).trim()
        ? String(p.sprintCompromiso)
        : '—',
    sistema: '—',
    tipoIniciativa: tipo !== '—' ? tipo : '—',
    descripcion: p.descripcion != null ? String(p.descripcion) : undefined,
    fechaInicio: p.fechaInicioPlan != null ? String(p.fechaInicioPlan) : undefined,
    fechaFinPlanificada: p.fechaFinPlan != null ? String(p.fechaFinPlan) : undefined,
    cbSquad: Boolean(p.cbSquad),
    cbProveedor: Boolean(p.cbProveedor),
    cbNoAplica: Boolean(p.cbNoAplica),
    nombreSquad: p.nombreSquad != null ? String(p.nombreSquad) : undefined,
    nombreProveedor: p.nombreProveedor != null ? String(p.nombreProveedor) : undefined,
    integrantesEquipo,
    esEvolution: Boolean(p.esEvolution),
  };
}
