<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { IsDataTable, IsColumn, IsButton, IsSelect, IsTag, useConfirm, useToast } from 'is-uikit-components-vue';
import type { TagSeverity } from '@/lib/tag-ui';
import type { SelectOption } from '@/types/forms';
import type { IntegranteProyectoHu025 } from '@/types/poc-data';
import type {
  ActividadItemApi,
  ActividadPayload,
  CronogramaGrupoExtApi,
  NuevaActividadModalPreset,
} from '@/lib/actividades-api';
import {
  fetchCronogramaLista,
  createActividad,
  cerrarActividadApi,
  deleteHitoApi,
} from '@/lib/actividades-api';
import { uploadActividadDocumento } from '@/lib/proyectos-api';
import { buildPayloadCierreActividad } from '@/lib/actividades-cierre-ui';
import ActividadModal from './ActividadModal.vue';
import ActividadCierreFechasModal, { type CierreFila } from './ActividadCierreFechasModal.vue';
import ActividadDetalleModal from './ActividadDetalleModal.vue';
import HitoCierreModal from './HitoCierreModal.vue';
import HitoDetalleModal from './HitoDetalleModal.vue';
import HitoReprogramacionDrawer from './HitoReprogramacionDrawer.vue';
import { esHitoActivo } from '@/composables/proyectos/useEstadoRules';

const props = defineProps<{
  proyectoId: string;
  proyectoNombre: string;
  integrantes: IntegranteProyectoHu025[];
  canGestor: boolean;
  /** Contador que incrementa el padre al refrescar detalle del proyecto. */
  detailRevision?: number;
}>();

const emit = defineEmits<{
  'refresh-detail': [];
}>();

const confirm = useConfirm();
const toast = useToast();

const resumen = ref({ total: 0, completados: 0, enProceso: 0, enRiesgo: 0, sinIniciar: 0 });
const grupos = ref<CronogramaGrupoExtApi[]>([]);
const loading = ref(false);
const ganttFiltro = ref<'todos' | 'completados' | 'proceso' | 'riesgo' | 'sinIniciar'>('todos');
const leyendaOpen = ref(false);
const expanded = ref<Set<string>>(new Set());
/** Hitos colapsados manualmente en lista: al volver a Gantt no se fuerza su expansión. */
const ganttEscala = ref<'dia' | 'semana' | 'quincena' | 'mes' | 'trimestre'>('semana');
/** Ancla izquierda de la ventana en vista Diaria (5 semanas); se reinicia al cambiar de proyecto. */
const ganttVentanaDesde = ref('');

const ganttEscalaOptions: SelectOption[] = [
  { value: 'dia', label: 'Día' },
  { value: 'semana', label: 'Semana' },
  { value: 'quincena', label: 'Quincena' },
  { value: 'mes', label: 'Mes' },
  { value: 'trimestre', label: 'Trimestre' },
];

function escalaStorageKey(): string {
  return `itp-gantt-escala:${props.proyectoId}`;
}

function expandedStorageKey(): string {
  return `itp-gantt-expanded:${props.proyectoId}`;
}

const modalOpen = ref(false);
const modalPreset = ref<NuevaActividadModalPreset | null>(null);
const saveLoading = ref(false);
const detalleActividadOpen = ref(false);
const detalleActividadId = ref<string | null>(null);
const detalleHitoOpen = ref(false);
const detalleHitoId = ref<string | null>(null);
const cierreHitoOpen = ref(false);
const cierreHitoGrupo = ref<CronogramaGrupoExtApi | null>(null);
const histDrawerOpen = ref(false);
const histHitoId = ref<string | null>(null);
const histHitoNombre = ref('');

type CierrePendiente = {
  titulo: string;
  descripcion?: string;
  filas: CierreFila[];
  ejecutar: (fechas: Record<string, string>) => Promise<void>;
};

const cierrePendiente = ref<CierrePendiente | null>(null);

const hitoOptions = computed<SelectOption[]>(() =>
  grupos.value.map((g) => ({
    value: g.hitoId,
    label: `${g.hitoNombre} (${formatIsoEs(g.hitoFechaFinPlan)})`,
  })),
);

function formatIsoEs(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso;
  }
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatIsoEsFromRow(iso: string): string {
  return formatIsoEs(iso);
}

function responsableNombre(value: string): string {
  return String(value ?? '').replace(/^[^:]{1,60}:\s*/, '').trim() || '—';
}

type MainRow = { id: string; indent: number; act: ActividadItemApi };

function mainRowsForGrupo(g: CronogramaGrupoExtApi): MainRow[] {
  const out: MainRow[] = [];
  for (const it of g.items ?? []) {
    out.push({ id: it.id, indent: 0, act: it });
    for (const st of it.subtareas ?? []) {
      out.push({ id: st.id, indent: 1, act: st });
    }
  }
  return out;
}

function toggleExpand(hitoId: string): void {
  const next = new Set(expanded.value);
  if (next.has(hitoId)) {
    next.delete(hitoId);
  } else {
    next.add(hitoId);
  }
  expanded.value = next;
  try {
    localStorage.setItem(expandedStorageKey(), JSON.stringify([...next]));
  } catch {
    /* ignore */
  }
}

function isExpanded(hitoId: string): boolean {
  return expanded.value.has(hitoId);
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    const d = await fetchCronogramaLista(props.proyectoId);
    resumen.value = d.resumen;
    grupos.value = d.grupos ?? [];
    let stored = '';
    try {
      stored = localStorage.getItem(escalaStorageKey()) ?? '';
    } catch {
      stored = '';
    }
    if (['dia', 'semana', 'quincena', 'mes', 'trimestre'].includes(stored)) {
      ganttEscala.value = stored as typeof ganttEscala.value;
    } else {
      const starts = grupos.value.map((g) => parseIsoUtcMs(g.hitoFechaInicioPlan)).filter((x): x is number => x != null);
      const ends = grupos.value.map((g) => parseIsoUtcMs(g.hitoFechaFinPlan)).filter((x): x is number => x != null);
      const duration = starts.length && ends.length
        ? Math.max(0, Math.round((Math.max(...ends) - Math.min(...starts)) / 86400000))
        : 0;
      ganttEscala.value = duration < 30 ? 'dia' : duration <= 90 ? 'semana' : duration <= 180 ? 'quincena' : 'mes';
    }
  } catch {
    resumen.value = { total: 0, completados: 0, enProceso: 0, enRiesgo: 0, sinIniciar: 0 };
    grupos.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.proyectoId,
  () => {
    try {
      const raw = JSON.parse(localStorage.getItem(expandedStorageKey()) ?? '[]') as unknown;
      expanded.value = new Set(Array.isArray(raw) ? raw.map(String) : []);
    } catch {
      expanded.value = new Set();
    }
    void load();
  },
  { immediate: true },
);

watch(
  () => props.detailRevision,
  () => {
    void load();
  },
);

/** Al entrar en Gantt, expandir hitos con actividades salvo los que el usuario colapsó en lista. */
function prioridadSeverity(p: string): TagSeverity {
  if (p === 'Alta') {
    return 'danger';
  }
  if (p === 'Media') {
    return 'warn';
  }
  return 'secondary';
}

function estadoSeverity(e: string): TagSeverity {
  const t = e.trim();
  if (t === 'Cerrado') {
    return 'success';
  }
  if (t === 'Bloqueado') {
    return 'danger';
  }
  if (t === 'Desestimado') {
    return 'contrast';
  }
  if (t === 'En Progreso') {
    return 'info';
  }
  return 'secondary';
}

function hitoEstadoSeverity(g: CronogramaGrupoExtApi): TagSeverity {
  const base: Record<string, TagSeverity> = {
    abierto: 'secondary',
    progreso: 'info',
    bloqueado: 'danger',
    cerrado: 'success',
  };
  return base[g.cronogramaEstadoBadgeCss] ?? 'secondary';
}

function desfaseCellClass(g: CronogramaGrupoExtApi): string {
  return `pc-def pc-def--${g.cronogramaDesfaseCss}`;
}

function barClass(g: CronogramaGrupoExtApi): string {
  return `pc-bar pc-bar--${g.cronogramaAvanceBarCss}`;
}

function tipoIcon(tipo: string): string {
  switch (tipo) {
    case 'actividad':
      return 'pi pi-bookmark';
    case 'sub_actividad':
      return 'pi pi-list';
    case 'pendiente':
      return 'pi pi-clock';
    default:
      return 'pi pi-circle';
  }
}

function todayIsoLima(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function parseIsoUtcMs(iso: string | null | undefined): number | null {
  const s = String(iso ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return null;
  }
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

const todayUtcMs = computed(() => parseIsoUtcMs(todayIsoLima()) ?? Date.now());

watch(
  () => props.proyectoId,
  () => {
    ganttVentanaDesde.value = todayIsoLima();
  },
  { immediate: true },
);

const ganttRange = computed(() => {
  const padWeek = 7 * 86400000;
  const padQuincena = 14 * 86400000;
  const padMes = 31 * 86400000;
  const padTrimestre = 92 * 86400000;
  if (ganttEscala.value === 'dia') {
    const anchor = parseIsoUtcMs(ganttVentanaDesde.value) ?? todayUtcMs.value;
    const fiveWeeks = 35 * 86400000;
    return { start: anchor, end: anchor + fiveWeeks };
  }
  const pad =
    ganttEscala.value === 'trimestre'
      ? padTrimestre
      : ganttEscala.value === 'mes'
        ? padMes
        : ganttEscala.value === 'quincena'
          ? padQuincena
          : padWeek;
  let minT = todayUtcMs.value;
  let maxT = todayUtcMs.value;
  for (const g of grupos.value) {
    const cand: number[] = [];
    const p0 = parseIsoUtcMs(g.hitoFechaInicioPlan);
    const p1 = parseIsoUtcMs(g.hitoFechaFinPlan);
    const r0 = parseIsoUtcMs(g.hitoFechaInicioReal);
    const r1 = parseIsoUtcMs(g.hitoFechaCierreReal);
    if (p0 != null) {
      cand.push(p0);
    }
    if (p1 != null) {
      cand.push(p1);
    }
    if (r0 != null) {
      cand.push(r0);
    }
    if (r1 != null) {
      cand.push(r1);
    }
    if (String(g.hitoEstado).trim() !== 'Cerrado') {
      cand.push(todayUtcMs.value);
    }
    const pushActDates = (a: ActividadItemApi): void => {
      const ai = parseIsoUtcMs(a.fechaInicioPlan);
      const af = parseIsoUtcMs(a.fechaFinPlan);
      const ac = a.fechaCierre && /^\d{4}-\d{2}-\d{2}/.test(String(a.fechaCierre)) ? parseIsoUtcMs(String(a.fechaCierre).slice(0, 10)) : null;
      if (ai != null) {
        cand.push(ai);
      }
      if (af != null) {
        cand.push(af);
      }
      if (ac != null) {
        cand.push(ac);
      }
      if (String(a.estado ?? '').trim() !== 'Cerrado') {
        cand.push(todayUtcMs.value);
      }
    };
    for (const it of g.items) {
      pushActDates(it);
      for (const st of it.subtareas ?? []) {
        pushActDates(st);
      }
    }
    for (const t of cand) {
      minT = Math.min(minT, t);
      maxT = Math.max(maxT, t);
    }
  }
  return { start: minT - pad, end: maxT + pad };
});

type GanttTick = { label: string; leftPct: number };
type GanttTooltip = {
  visible: boolean;
  x: number;
  y: number;
  nombre: string;
  inicio: string;
  fin: string;
  finReal: string;
  estado: string;
  avance: string;
  responsable: string;
  reprogramaciones: number;
  riesgo: boolean;
};

const ganttTooltip = ref<GanttTooltip>({
  visible: false,
  x: 0,
  y: 0,
  nombre: '',
  inicio: '',
  fin: '',
  finReal: '',
  estado: '',
  avance: '',
  responsable: '—',
  reprogramaciones: 0,
  riesgo: false,
});
const ganttTooltipEl = ref<HTMLElement | null>(null);
const ganttTooltipPosition = ref({ left: 0, top: 0 });
let ganttTooltipFrame: number | null = null;
let ganttTooltipPendingPoint = { x: 0, y: 0 };

const ganttTicks = computed((): GanttTick[] => {
  const { start, end } = ganttRange.value;
  const span = end - start;
  if (span <= 0) {
    return [];
  }
  let step: number;
  if (ganttEscala.value === 'dia') {
    step = 86400000;
  } else if (ganttEscala.value === 'trimestre') {
    step = 92 * 86400000;
  } else if (ganttEscala.value === 'mes') {
    step = 31 * 86400000;
  } else if (ganttEscala.value === 'quincena') {
    step = 14 * 86400000;
  } else {
    step = 7 * 86400000;
  }
  const out: GanttTick[] = [];
  for (let t = start; t <= end; t += step) {
    const d = new Date(t);
    let label: string;
    if (ganttEscala.value === 'trimestre') {
      label = `T${Math.floor(d.getUTCMonth() / 3) + 1}`;
    } else if (ganttEscala.value === 'mes') {
      label = `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    } else {
      label = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    out.push({ label, leftPct: ((t - start) / span) * 100 });
  }
  if (ganttEscala.value === 'dia' && out.length > 14) {
    return out.map((tk, i) => (i % 5 === 0 ? tk : { ...tk, label: '' }));
  }
  return out.length > 36 ? out.filter((_, i) => i % 2 === 0) : out;
});

const ganttTodayLinePct = computed((): number | null => {
  const { start, end } = ganttRange.value;
  const span = end - start;
  if (span <= 0) {
    return null;
  }
  const t = todayUtcMs.value;
  if (t < start || t > end) {
    return null;
  }
  return ((t - start) / span) * 100;
});

const ganttTodayLabel = computed(() => {
  const iso = todayIsoLima();
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
});

const ganttProjectEndPct = computed((): number | null => {
  const projectEnd = grupos.value.reduce(
    (max, group) => (group.hitoFechaFinPlan > max ? group.hitoFechaFinPlan : max),
    '',
  );
  const t = parseIsoUtcMs(projectEnd);
  const { start, end } = ganttRange.value;
  if (t == null || t < start || t > end || end <= start) return null;
  return ((t - start) / (end - start)) * 100;
});

const ganttMonthTicks = computed(() => {
  const { start, end } = ganttRange.value;
  const span = end - start;
  if (span <= 0) return [];
  const cursor = new Date(start);
  cursor.setUTCDate(1);
  const out: GanttTick[] = [];
  while (cursor.getTime() <= end) {
    const t = cursor.getTime();
    if (t >= start) {
      const raw = new Intl.DateTimeFormat('es-PE', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(cursor);
      out.push({ label: raw.charAt(0).toUpperCase() + raw.slice(1), leftPct: ((t - start) / span) * 100 });
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
});

function showGanttTooltip(ev: MouseEvent, data: {
  nombre: string;
  inicio: string | null | undefined;
  fin: string | null | undefined;
  finReal?: string | null | undefined;
  estado?: string | null | undefined;
  avance?: string | number | null | undefined;
  responsable?: string | null | undefined;
  reprogramaciones?: number | null | undefined;
}): void {
  ganttTooltipPosition.value = {
    left: ev.clientX + 12,
    top: ev.clientY + 12,
  };
  ganttTooltip.value = {
    visible: true,
    x: ev.clientX,
    y: ev.clientY,
    nombre: data.nombre,
    inicio: data.inicio ? formatIsoEs(data.inicio) : '—',
    fin: data.fin ? formatIsoEs(data.fin) : '—',
    finReal: data.finReal ? formatIsoEs(String(data.finReal).slice(0, 10)) : '—',
    estado: String(data.estado ?? '—').trim() || '—',
    avance: data.avance == null || data.avance === '' ? 'Pend.' : `${data.avance}%`,
    responsable: responsableNombre(String(data.responsable ?? '')),
    reprogramaciones: Math.max(0, Number(data.reprogramaciones ?? 0)),
    riesgo:
      String(data.estado ?? '').trim() !== 'Cerrado' &&
      Boolean(data.fin && /^\d{4}-\d{2}-\d{2}$/.test(data.fin) && data.fin < todayIsoLima()),
  };
  void nextTick(() => scheduleGanttTooltipPosition(ev.clientX, ev.clientY));
}

function moveGanttTooltip(ev: MouseEvent): void {
  if (!ganttTooltip.value.visible) {
    return;
  }
  scheduleGanttTooltipPosition(ev.clientX, ev.clientY);
}

function hideGanttTooltip(): void {
  if (ganttTooltipFrame != null) {
    cancelAnimationFrame(ganttTooltipFrame);
    ganttTooltipFrame = null;
  }
  ganttTooltip.value = { ...ganttTooltip.value, visible: false };
}

function scheduleGanttTooltipPosition(x: number, y: number): void {
  ganttTooltipPendingPoint = { x, y };
  if (ganttTooltipFrame != null) return;
  ganttTooltipFrame = requestAnimationFrame(() => {
    ganttTooltipFrame = null;
    const offset = 12;
    const margin = 8;
    const rect = ganttTooltipEl.value?.getBoundingClientRect();
    const width = rect?.width ?? 320;
    const height = rect?.height ?? 220;
    const point = ganttTooltipPendingPoint;
    const left =
      point.x + offset + width > window.innerWidth - margin
        ? point.x - width - offset
        : point.x + offset;
    const top =
      point.y + offset + height > window.innerHeight - margin
        ? point.y - height - offset
        : point.y + offset;
    ganttTooltip.value = { ...ganttTooltip.value, x: point.x, y: point.y };
    ganttTooltipPosition.value = {
      left: Math.max(margin, left),
      top: Math.max(margin, top),
    };
  });
}

const ganttTooltipStyle = computed(() => ({
  left: `${ganttTooltipPosition.value.left}px`,
  top: `${ganttTooltipPosition.value.top}px`,
}));

onBeforeUnmount(() => {
  if (ganttTooltipFrame != null) cancelAnimationFrame(ganttTooltipFrame);
});

type GanttBarPiece = { kind: 'plan' | 'real' | 'excess' | 'done'; left: number; width: number };

function ganttBarsForGrupo(g: CronogramaGrupoExtApi): GanttBarPiece[] {
  const rs = ganttRange.value.start;
  const re = ganttRange.value.end;
  const span = re - rs;
  if (span <= 0) {
    return [];
  }
  const seg = (t0: number, t1: number): { left: number; width: number } => {
    const a = Math.min(t0, t1);
    const b = Math.max(t0, t1);
    let left = ((a - rs) / span) * 100;
    let width = ((b - a) / span) * 100;
    width = Math.max(width, 0.45);
    left = Math.max(0, Math.min(left, 99.55));
    if (left + width > 100) {
      width = 100 - left;
    }
    return { left, width: Math.max(width, 0.25) };
  };
  const p0 = parseIsoUtcMs(g.hitoFechaInicioPlan) ?? parseIsoUtcMs(g.hitoFechaFinPlan);
  const p1 = parseIsoUtcMs(g.hitoFechaFinPlan);
  if (p0 == null || p1 == null) {
    return [];
  }
  const cerrado = String(g.hitoEstado).trim() === 'Cerrado';
  if (cerrado) {
    return [{ kind: 'done', ...seg(p0, p1) }];
  }
  const pieces: GanttBarPiece[] = [{ kind: 'plan', ...seg(p0, p1) }];
  const r0 = parseIsoUtcMs(g.hitoFechaInicioReal);
  const r1closed = parseIsoUtcMs(g.hitoFechaCierreReal);
  const r1 = r1closed ?? todayUtcMs.value;
  if (r0 != null) {
    const grayEnd = Math.min(r1, p1);
    if (r0 <= grayEnd) {
      pieces.push({ kind: 'real', ...seg(r0, grayEnd) });
    }
    if (r1 > p1) {
      const redA = Math.max(r0, p1);
      const redB = r1;
      if (redA < redB) {
        pieces.push({ kind: 'excess', ...seg(redA, redB) });
      }
    }
  }
  return pieces;
}

function ganttUpperBars(g: CronogramaGrupoExtApi): GanttBarPiece[] {
  return ganttBarsForGrupo(g).filter((b) => b.kind === 'plan' || b.kind === 'done');
}

function ganttLowerBars(g: CronogramaGrupoExtApi): GanttBarPiece[] {
  return ganttBarsForGrupo(g).filter((b) => b.kind === 'real' || b.kind === 'excess');
}

type GanttChildRow = { id: string; nombre: string; indent: number; act: ActividadItemApi };

function ganttChildRowsForGrupo(g: CronogramaGrupoExtApi): GanttChildRow[] {
  const out: GanttChildRow[] = [];
  for (const it of g.items) {
    out.push({ id: it.id, nombre: it.nombre, indent: 0, act: it });
    for (const st of it.subtareas ?? []) {
      out.push({ id: st.id, nombre: st.nombre, indent: 1, act: st });
    }
  }
  return out;
}

function ganttTooltipHito(g: CronogramaGrupoExtApi): string {
  const ini = g.hitoFechaInicioPlan ? formatIsoEs(g.hitoFechaInicioPlan) : '—';
  const fin = formatIsoEs(g.hitoFechaFinPlan);
  return `${g.hitoNombre} · Plan ${ini} – ${fin} · ${g.hitoEstado}`;
}

function ganttTooltipActividad(a: ActividadItemApi): string {
  return [
    (a.nombre ?? '').trim() || 'Actividad',
    a.tipoLabel,
    `Plan ${formatIsoEs(a.fechaInicioPlan)} – ${formatIsoEs(a.fechaFinPlan)}`,
    String(a.estado ?? '').trim(),
  ].join(' · ');
}

void ganttTooltipHito;
void ganttTooltipActividad;

function ganttActividadBarClass(row: GanttChildRow, kind: GanttBarPiece['kind']): string {
  const risk = actividadVencidaNoCerrada(row.act) ? ' pc__gantt-bar--risk' : '';
  if (kind === 'done') {
    return 'pc__gantt-bar--done';
  }
  if (kind === 'real') {
    return 'pc__gantt-bar--real';
  }
  if (kind === 'excess') {
    return 'pc__gantt-bar--excess';
  }
  const base = row.indent > 0 || row.act.tipo === 'sub_actividad' ? 'pc__gantt-bar--sub-plan' : 'pc__gantt-bar--act-plan';
  return `${base}${risk}`;
}

function hitoGanttBarClass(g: CronogramaGrupoExtApi, kind: GanttBarPiece['kind']): Record<string, boolean> {
  const risk = String(g.hitoEstado).trim() !== 'Cerrado' && g.hitoFechaFinPlan < todayIsoLima();
  return {
    'pc__gantt-bar--hito-plan': kind === 'plan',
    'pc__gantt-bar--done': kind === 'done',
    'pc__gantt-bar--risk': risk && kind === 'plan',
    'pc__gantt-bar--estado-abierto': String(g.hitoEstado).trim() === 'Abierto',
    'pc__gantt-bar--estado-progreso': String(g.hitoEstado).trim() === 'En Progreso',
    'pc__gantt-bar--estado-bloqueado': String(g.hitoEstado).trim() === 'Bloqueado',
  };
}

function hitoEstadoBarClass(g: CronogramaGrupoExtApi): string {
  const estado = String(g.hitoEstado ?? '').trim();
  if (estado === 'Cerrado') return 'pc__gantt-progress--cerrado';
  if (estado === 'En Progreso') return 'pc__gantt-progress--progreso';
  if (estado === 'Bloqueado') return 'pc__gantt-progress--bloqueado';
  return 'pc__gantt-progress--abierto';
}

function ganttGhostBar(g: CronogramaGrupoExtApi): { left: number; width: number } | null {
  const original = parseIsoUtcMs(g.hitoFechaFinPlanOriginal);
  const start = parseIsoUtcMs(g.hitoFechaInicioPlan) ?? original;
  const range = ganttRange.value;
  if (original == null || start == null || range.end <= range.start) return null;
  const left = ((Math.min(start, original) - range.start) / (range.end - range.start)) * 100;
  const width = (Math.abs(original - start) / (range.end - range.start)) * 100;
  return { left: Math.max(0, left), width: Math.max(0.35, width) };
}

function hitoEnRiesgo(g: CronogramaGrupoExtApi): boolean {
  return esHitoActivo(g.hitoEstado) && g.hitoFechaFinPlan < todayIsoLima();
}

function hitoMatchesFiltro(g: CronogramaGrupoExtApi): boolean {
  const estado = String(g.hitoEstado ?? '').trim();
  if (ganttFiltro.value === 'todos') {
    return true;
  }
  if (ganttFiltro.value === 'completados') {
    return estado === 'Cerrado';
  }
  if (ganttFiltro.value === 'proceso') {
    return estado === 'En Progreso' || estado === 'Bloqueado';
  }
  if (ganttFiltro.value === 'riesgo') {
    return hitoEnRiesgo(g);
  }
  return estado === 'Abierto';
}

const ganttGrupos = computed(() => grupos.value.filter(hitoMatchesFiltro));

function setGanttFiltro(next: typeof ganttFiltro.value): void {
  ganttFiltro.value = ganttFiltro.value === next && next !== 'todos' ? 'todos' : next;
}

function ganttBarsForActividad(a: ActividadItemApi): GanttBarPiece[] {
  const rs = ganttRange.value.start;
  const re = ganttRange.value.end;
  const span = re - rs;
  if (span <= 0) {
    return [];
  }
  const seg = (t0: number, t1: number): { left: number; width: number } => {
    const x0 = Math.min(t0, t1);
    const x1 = Math.max(t0, t1);
    let left = ((x0 - rs) / span) * 100;
    let width = ((x1 - x0) / span) * 100;
    width = Math.max(width, 0.45);
    left = Math.max(0, Math.min(left, 99.55));
    if (left + width > 100) {
      width = 100 - left;
    }
    return { left, width: Math.max(width, 0.25) };
  };
  const p0 = parseIsoUtcMs(a.fechaInicioPlan) ?? parseIsoUtcMs(a.fechaFinPlan);
  const p1 = parseIsoUtcMs(a.fechaFinPlan);
  if (p0 == null || p1 == null) {
    return [];
  }
  const cerrado = String(a.estado ?? '').trim() === 'Cerrado';
  if (cerrado) {
    const fc = String(a.fechaCierre ?? '').trim();
    const cMs = /^\d{4}-\d{2}-\d{2}/.test(fc) ? parseIsoUtcMs(fc.slice(0, 10)) : null;
    const endMs = cMs != null ? Math.max(p1, cMs) : p1;
    return [{ kind: 'done', ...seg(p0, endMs) }];
  }
  return [{ kind: 'plan', ...seg(p0, p1) }];
}

function setGanttEscala(v: unknown): void {
  const s = String(v);
  if (s === 'dia' || s === 'semana' || s === 'quincena' || s === 'mes' || s === 'trimestre') {
    ganttEscala.value = s;
  } else {
    ganttEscala.value = 'semana';
  }
  try {
    localStorage.setItem(escalaStorageKey(), ganttEscala.value);
  } catch {
    /* ignore */
  }
}

function actividadVencidaNoCerrada(act: ActividadItemApi): boolean {
  if (String(act.estado ?? '').trim() === 'Cerrado') {
    return false;
  }
  const fin = String(act.fechaFinPlan ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fin)) {
    return false;
  }
  return fin < todayIsoLima();
}

function rowClass(data: MainRow | ActividadItemApi): string {
  const act = 'act' in data ? data.act : data;
  const cls: string[] = [];
  if (act.criticoDependencia) {
    cls.push('pc-row--critico');
  }
  if (act.estado === 'Cerrado') {
    cls.push('pc-row--cerrado');
  }
  if (actividadVencidaNoCerrada(act)) {
    cls.push('pc-row--vencida');
  }
  return cls.join(' ');
}

function dependenciaCell(act: ActividadItemApi): 'critico' | 'lock' | 'dash' {
  if (act.criticoDependencia) {
    return 'critico';
  }
  if (act.tipo === 'pendiente' && act.esDependencia) {
    return 'lock';
  }
  return 'dash';
}

function puedeAgregarSubActividad(act: ActividadItemApi): boolean {
  return act.tipo === 'actividad';
}

function hijosBloqueantesAbiertos(act: ActividadItemApi): ActividadItemApi[] {
  return (act.subtareas ?? []).filter((s) => {
    if (String(s.estado).trim() === 'Cerrado') {
      return false;
    }
    if (s.tipo === 'sub_actividad') {
      return true;
    }
    if (s.tipo === 'pendiente' && s.esDependencia === true) {
      return true;
    }
    return false;
  });
}

function mensajeCierreConHijos(lista: { nombre: string; estado: string }[]): string {
  const lines = lista.map((s) => `• ${s.nombre} — ${s.estado}`).join('\n');
  return `¿Estás seguro que deseas cerrar esta actividad? Al confirmar, los siguientes elementos bloqueantes también se cerrarán automáticamente:\n\n${lines}`;
}

function findActInGrupo(id: string, g: CronogramaGrupoExtApi): ActividadItemApi | undefined {
  return (g.items ?? []).find((it) => it.id === id) ?? (g.pendientesNivelHito ?? []).find((it) => it.id === id);
}

function willClosePadreClosingHijoBloqueanteInGrupo(row: ActividadItemApi, g: CronogramaGrupoExtApi): boolean {
  if (!row.padreId) {
    return false;
  }
  if (row.tipo !== 'sub_actividad' && !(row.tipo === 'pendiente' && row.esDependencia === true)) {
    return false;
  }
  const parent = findActInGrupo(row.padreId, g);
  if (!parent) {
    return false;
  }
  const ab = hijosBloqueantesAbiertos(parent);
  return ab.length === 1 && ab[0].id === row.id;
}

function nombrePadre(row: ActividadItemApi, g: CronogramaGrupoExtApi): string {
  return findActInGrupo(row.padreId ?? '', g)?.nombre ?? 'Actividad padre';
}

async function postCierreExitoso(): Promise<void> {
  toast.add({ severity: 'success', summary: 'Actividad cerrada', life: 3000 });
  await load();
  emit('refresh-detail');
}

async function aplicarCerrarActividadApi(
  row: ActividadItemApi,
  incluirSubtareas: boolean,
  fechas: Record<string, string>,
): Promise<void> {
  const p = buildPayloadCierreActividad(fechas);
  let res: Awaited<ReturnType<typeof cerrarActividadApi>>;
  try {
    res = await cerrarActividadApi(row.id, {
      cerrarSubtareasIncluidas: incluirSubtareas,
      ...p,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'No se pudo cerrar la actividad.';
    toast.add({
      severity: 'error',
      summary: 'No se puede cerrar',
      detail: msg,
      life: msg.length > 140 ? 10000 : 5000,
    });
    return;
  }
  if (res && typeof res === 'object' && 'code' in res && res.code === 'SUBTAREAS_ABIERTAS') {
    confirm.require({
      header: 'Cerrar actividad y elementos bloqueantes',
      message: mensajeCierreConHijos(res.subtareas),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Continuar',
      rejectLabel: 'Cancelar',
      defaultFocus: 'reject',
      rejectClass: 'p-button-secondary',
      accept: () => {
        const filas: CierreFila[] = [
          { clave: 'principal', etiqueta: `Cierre real — «${row.nombre}»` },
          ...res.subtareas.map((s) => ({
            clave: s.id,
            etiqueta: `Cierre real — «${s.nombre}»`,
          })),
        ];
        cierrePendiente.value = {
          titulo: 'Fechas de cierre real',
          descripcion: 'Indique la fecha de cierre real de la actividad principal y de cada elemento bloqueante.',
          filas,
          ejecutar: async (f2) => {
            try {
              await aplicarCerrarActividadApi(row, true, f2);
              await postCierreExitoso();
            } catch {
              toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cerrar la actividad.', life: 4000 });
            }
          },
        };
      },
    });
    return;
  }
  await postCierreExitoso();
}

function onCerrarRapido(row: ActividadItemApi, g: CronogramaGrupoExtApi): void {
  const abiertas = hijosBloqueantesAbiertos(row);
  if (willClosePadreClosingHijoBloqueanteInGrupo(row, g)) {
    const tipoEt = row.tipo === 'sub_actividad' ? 'sub-actividad' : 'pendiente bloqueante';
    cierrePendiente.value = {
      titulo: 'Fechas de cierre real',
      descripcion: `Es el último elemento bloqueante abierto del padre. Se cerrará y la actividad padre quedará en estado Cerrado.`,
      filas: [
        { clave: 'principal', etiqueta: `Cierre real — ${tipoEt} «${row.nombre}»` },
        { clave: 'padre', etiqueta: `Cierre real — padre «${nombrePadre(row, g)}»` },
      ],
      ejecutar: async (fechas) => {
        try {
          await aplicarCerrarActividadApi(row, false, fechas);
        } catch {
          toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cerrar la actividad.', life: 4000 });
        }
      },
    };
    return;
  }
  if (abiertas.length > 0) {
    confirm.require({
      header: 'Cerrar actividad y elementos bloqueantes',
      message: mensajeCierreConHijos(abiertas.map((s) => ({ nombre: s.nombre, estado: s.estado }))),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, continuar',
      rejectLabel: 'Cancelar',
      defaultFocus: 'reject',
      rejectClass: 'p-button-secondary',
      accept: () => {
        const filas: CierreFila[] = [
          { clave: 'principal', etiqueta: `Cierre real — «${row.nombre}»` },
          ...abiertas.map((s) => ({
            clave: s.id,
            etiqueta: `Cierre real — «${s.nombre}»`,
          })),
        ];
        cierrePendiente.value = {
          titulo: 'Fechas de cierre real',
          descripcion: 'Indique la fecha de cierre real de la actividad principal y de cada elemento bloqueante que se cerrará.',
          filas,
          ejecutar: async (fechas) => {
            try {
              await aplicarCerrarActividadApi(row, true, fechas);
            } catch {
              toast.add({
                severity: 'error',
                summary: 'Error',
                detail: 'No se pudo cerrar la actividad.',
                life: 4000,
              });
            }
          },
        };
      },
    });
    return;
  }
  cierrePendiente.value = {
    titulo: 'Fecha de cierre real',
    descripcion: `Actividad: «${row.nombre}».`,
    filas: [{ clave: 'principal', etiqueta: 'Fecha de cierre real' }],
    ejecutar: async (fechas) => {
      try {
        await aplicarCerrarActividadApi(row, false, fechas);
      } catch {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo cerrar la actividad.',
          life: 4000,
        });
      }
    },
  };
}

async function onCierreFechasConfirm(fechas: Record<string, string>): Promise<void> {
  const p = cierrePendiente.value;
  cierrePendiente.value = null;
  if (p) {
    await p.ejecutar(fechas);
  }
}

function onCierreFechasVisible(v: boolean): void {
  if (!v) {
    cierrePendiente.value = null;
  }
}

function openNuevoHito(): void {
  if (!props.canGestor) {
    return;
  }
  modalPreset.value = { fixedHito: true };
  modalOpen.value = true;
}

function openNuevaActividadDesdeHito(g: CronogramaGrupoExtApi): void {
  modalPreset.value = {
    hideHitoTipo: true,
    hideSubActividadTipo: true,
    presetHitoId: g.hitoId,
    lockHito: true,
  };
  modalOpen.value = true;
}

function openSubActividadDesdePadre(act: ActividadItemApi): void {
  modalPreset.value = {
    fixedSubActividad: true,
    presetHitoId: act.hitoId,
    lockHito: true,
    presetPadreId: act.id,
    lockPadre: true,
  };
  modalOpen.value = true;
}

function openDetalleActividad(id: string): void {
  detalleActividadId.value = id;
  detalleActividadOpen.value = true;
}

function openDetalleHito(id: string): void {
  detalleHitoId.value = id;
  detalleHitoOpen.value = true;
}

function onHitoOpenActividad(id: string): void {
  detalleHitoOpen.value = false;
  detalleHitoId.value = null;
  openDetalleActividad(id);
}

async function onHitoDetalleSaved(): Promise<void> {
  await load();
  emit('refresh-detail');
}

function openCierreHito(g: CronogramaGrupoExtApi): void {
  cierreHitoGrupo.value = g;
  cierreHitoOpen.value = true;
}

function openHistorialHito(g: CronogramaGrupoExtApi): void {
  histHitoId.value = g.hitoId;
  histHitoNombre.value = g.hitoNombre;
  histDrawerOpen.value = true;
}

async function onCierreHitoSaved(): Promise<void> {
  cierreHitoGrupo.value = null;
  await load();
  emit('refresh-detail');
  toast.add({ severity: 'success', summary: 'Hito cerrado', life: 3000 });
}

async function onSaveModal(payload: ActividadPayload): Promise<void> {
  saveLoading.value = true;
  try {
    const res = await createActividad(props.proyectoId, payload);
    if (res.kind === 'actividad' && 'documentosAdjuntos' in payload) {
      for (const file of payload.documentosAdjuntos ?? []) {
        await uploadActividadDocumento(res.id, file);
      }
    }
    modalOpen.value = false;
    modalPreset.value = null;
    if (payload.tipo === 'hito') {
      toast.add({ severity: 'success', summary: 'Hito registrado correctamente', life: 3000 });
    } else {
      toast.add({ severity: 'success', summary: 'Actividad registrada con éxito', life: 3000 });
    }
    await load();
    emit('refresh-detail');
  } catch (e) {
    const detail = e instanceof Error && e.message.trim() ? e.message : 'No se pudo guardar.';
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail,
      life: 4000,
    });
  } finally {
    saveLoading.value = false;
  }
}

function confirmDeleteHito(g: CronogramaGrupoExtApi): void {
  confirm.require({
    header: 'Eliminar hito',
    message: '¿Estás seguro que deseas eliminar este hito? Esta acción no se puede deshacer.',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Sí, eliminar',
    rejectLabel: 'Cancelar',
    defaultFocus: 'reject',
    rejectClass: 'p-button-secondary',
    acceptClass: 'p-button-danger',
    accept: () => {
      void (async () => {
        try {
          await deleteHitoApi(props.proyectoId, g.hitoId);
          toast.add({ severity: 'success', summary: 'Hito eliminado', life: 3000 });
          await load();
          emit('refresh-detail');
        } catch {
          toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar el hito.', life: 4000 });
        }
      })();
    },
  });
}

function deleteDisabled(g: CronogramaGrupoExtApi): boolean {
  return g.cronogramaActividadesCount > 0;
}
</script>

<template>
  <section class="pc">
    <div class="pc__toolbar">
      <strong class="pc__vista-label"><i class="pi pi-chart-bar" aria-hidden="true" /> Cronograma Gantt</strong>
      <IsButton
        v-if="canGestor"
        severity="primary"
        label="+ Agregar hito"
        @click="openNuevoHito"
      />
    </div>

    <div class="pc__resumen">
      <button type="button" class="pc__resumen-item" :class="{ 'pc__resumen-item--on': ganttFiltro === 'todos' }" @click="setGanttFiltro('todos')">
        <span class="pc__resumen-val">{{ resumen.total }}</span>
        <span class="pc__resumen-lbl">Total hitos</span>
      </button>
      <button type="button" class="pc__resumen-item" :class="{ 'pc__resumen-item--on': ganttFiltro === 'completados' }" @click="setGanttFiltro('completados')">
        <span class="pc__resumen-val">{{ resumen.completados }}</span>
        <span class="pc__resumen-lbl">Completados</span>
      </button>
      <button type="button" class="pc__resumen-item" :class="{ 'pc__resumen-item--on': ganttFiltro === 'proceso' }" @click="setGanttFiltro('proceso')">
        <span class="pc__resumen-val">{{ resumen.enProceso ?? 0 }}</span>
        <span class="pc__resumen-lbl">En proceso</span>
      </button>
      <button type="button" class="pc__resumen-item" :class="{ 'pc__resumen-item--on': ganttFiltro === 'riesgo' }" @click="setGanttFiltro('riesgo')">
        <span class="pc__resumen-val">{{ resumen.enRiesgo }}</span>
        <span class="pc__resumen-lbl">En riesgo</span>
      </button>
      <button type="button" class="pc__resumen-item" :class="{ 'pc__resumen-item--on': ganttFiltro === 'sinIniciar' }" @click="setGanttFiltro('sinIniciar')">
        <span class="pc__resumen-val">{{ resumen.sinIniciar }}</span>
        <span class="pc__resumen-lbl">Sin iniciar</span>
      </button>
    </div>

    <div class="pc__gantt">
      <div class="pc__gantt-head">
        <p class="pc__gantt-hint">
          Vista de solo lectura. Clic en la franja del hito o actividad para abrir el detalle.
        </p>
        <div class="pc__gantt-scale-wrap">
          <div class="pc__legend-pop">
            <IsButton
              text
              size="small"
              severity="secondary"
              icon="pi pi-info-circle"
              label="¿Qué significa cada color?"
              class="pc__legend-btn"
              @click="leyendaOpen = !leyendaOpen"
            />
            <div v-if="leyendaOpen" class="pc__gantt-leyenda">
              <span class="pc__ley"><span class="pc__ley-i pc__ley-i--hito" aria-hidden="true" /> Hito</span>
              <span class="pc__ley"><span class="pc__ley-i pc__ley-i--act" aria-hidden="true" /> Actividad</span>
              <span class="pc__ley"><span class="pc__ley-i pc__ley-i--sub" aria-hidden="true" /> Subactividad</span>
              <span class="pc__ley"><span class="pc__ley-i pc__ley-i--real" aria-hidden="true" /> Real</span>
              <span class="pc__ley"><span class="pc__ley-i pc__ley-i--excess" aria-hidden="true" /> Exceso</span>
              <span class="pc__ley"><span class="pc__ley-i pc__ley-i--done" aria-hidden="true" /> Cerrado</span>
              <span class="pc__ley"><span class="pc__ley-i pc__ley-i--hoy" aria-hidden="true" /> Hoy</span>
            </div>
          </div>
          <div class="pc__gantt-scale">
            <span class="pc__gantt-scale-lbl">Escala temporal</span>
            <IsSelect
              class="pc__gantt-scale-sel"
              :model-value="ganttEscala"
              :options="ganttEscalaOptions"
              option-label="label"
              option-value="value"
              @update:model-value="setGanttEscala"
            />
          </div>
          <div v-if="ganttEscala === 'dia'" class="pc__gantt-ventana">
            <AppDatePicker
              class="pc__gantt-ventana-inp"
              :model-value="ganttVentanaDesde"
              label="Ventana desde"
              @update:model-value="(v: string | null) => (ganttVentanaDesde = v ?? '')"
            />
          </div>
        </div>
      </div>
      <p v-if="!grupos.length && !loading" class="pc__empty">
        No hay hitos registrados en este proyecto.
        <template v-if="canGestor"> Haz clic en «+ Agregar hito» para comenzar a planificar.</template>
      </p>
      <p v-else-if="loading" class="pc__empty">Cargando cronograma…</p>
      <div v-else class="pc__gantt-body" :class="{ 'pc__gantt-body--day': ganttEscala === 'dia' }">
        <div class="pc__gantt-axis">
          <div class="pc__gantt-axis-spacer" />
          <div class="pc__gantt-axis-rows">
          <div class="pc__gantt-ticks pc__gantt-ticks--months">
            <span v-for="(tk, i) in ganttMonthTicks" :key="'m' + i" class="pc__gantt-tick" :style="{ left: tk.leftPct + '%' }">{{ tk.label }}</span>
          </div>
          <div class="pc__gantt-ticks">
            <span
              v-for="(tk, i) in ganttTicks"
              :key="i"
              class="pc__gantt-tick"
              :style="{ left: tk.leftPct + '%' }"
            >{{ tk.label }}</span>
            <span
              v-if="ganttTodayLinePct != null"
              class="pc__gantt-axis-today"
              :style="{ left: ganttTodayLinePct + '%' }"
            >
              {{ ganttTodayLabel }}
            </span>
            <span
              v-if="ganttProjectEndPct != null"
              class="pc__gantt-axis-end"
              :style="{ left: ganttProjectEndPct + '%' }"
            >Fin plan</span>
          </div>
          </div>
        </div>
        <p v-if="!ganttGrupos.length" class="pc__empty pc__empty--gantt">No hay hitos para el filtro seleccionado.</p>
        <div v-for="g in ganttGrupos" :key="g.hitoId" class="pc__gantt-block">
          <div class="pc__gantt-row pc__gantt-row--hito">
            <div class="pc__gantt-rowname pc__gantt-rowname--hito">
              <button
                type="button"
                class="pc__gantt-chev"
                :aria-expanded="isExpanded(g.hitoId)"
                :aria-label="isExpanded(g.hitoId) ? 'Colapsar actividades del hito' : 'Expandir actividades del hito'"
                @click.stop="toggleExpand(g.hitoId)"
              >
                <i
                  class="pi"
                  :class="isExpanded(g.hitoId) ? 'pi-chevron-down' : 'pi-chevron-right'"
                  aria-hidden="true"
                />
              </button>
              <span class="pc__gantt-rowname-txt" :title="g.hitoNombre">{{ g.hitoNombre }}</span>
            </div>
            <button
              type="button"
              class="pc__gantt-track"
              :aria-label="'Abrir detalle del hito ' + g.hitoNombre"
              @mouseenter="showGanttTooltip($event, { nombre: g.hitoNombre, inicio: g.hitoFechaInicioPlan, fin: g.hitoFechaFinPlan, finReal: g.hitoFechaCierreReal, estado: g.hitoEstado, avance: g.porcentajeAvance, responsable: g.hitoResponsable, reprogramaciones: g.hitoReprogramacionesCount })"
              @mousemove="moveGanttTooltip"
              @mouseleave="hideGanttTooltip"
              @click="openDetalleHito(g.hitoId)"
            >
              <span
                v-if="ganttTodayLinePct != null"
                class="pc__gantt-today-line"
                :style="{ left: ganttTodayLinePct + '%' }"
                aria-hidden="true"
              />
              <span
                v-if="ganttProjectEndPct != null"
                class="pc__gantt-project-line"
                :style="{ left: ganttProjectEndPct + '%' }"
                aria-hidden="true"
              />
              <div class="pc__gantt-lane">
                <span
                  v-if="ganttGhostBar(g)"
                  class="pc__gantt-bar pc__gantt-bar--ghost"
                  :style="{ left: `${ganttGhostBar(g)?.left}%`, width: `${ganttGhostBar(g)?.width}%` }"
                  :title="`Fecha original: ${formatIsoEs(g.hitoFechaFinPlanOriginal ?? '')}`"
                />
                <span
                  v-for="(b, bi) in ganttUpperBars(g)"
                  :key="'u' + bi"
                  class="pc__gantt-bar"
                  :class="hitoGanttBarClass(g, b.kind)"
                  :style="{ left: b.left + '%', width: b.width + '%' }"
                />
                <span
                  v-for="(b, bi) in ganttUpperBars(g)"
                  :key="'progress' + bi"
                  class="pc__gantt-progress"
                  :class="hitoEstadoBarClass(g)"
                  :style="{
                    left: b.left + '%',
                    width: `${b.width * Math.min(100, Math.max(0, g.porcentajeAvanceReal ?? g.porcentajeAvance)) / 100}%`,
                  }"
                />
              </div>
              <div class="pc__gantt-lane pc__gantt-lane--lower">
                <span
                  v-for="(b, bi) in ganttLowerBars(g)"
                  :key="'l' + bi"
                  class="pc__gantt-bar"
                  :class="{
                    'pc__gantt-bar--real': b.kind === 'real',
                    'pc__gantt-bar--excess': b.kind === 'excess',
                  }"
                  :style="{ left: b.left + '%', width: b.width + '%' }"
                />
              </div>
            </button>
          </div>
          <div
            v-for="row in ganttChildRowsForGrupo(g)"
            v-show="isExpanded(g.hitoId)"
            :key="row.id"
            class="pc__gantt-row pc__gantt-row--act"
          >
            <div
              class="pc__gantt-rowname pc__gantt-rowname--act"
              :title="row.nombre"
              :style="{ paddingLeft: `${0.35 + row.indent * 0.9}rem` }"
            >
              {{ row.nombre }}
            </div>
            <button
              type="button"
              class="pc__gantt-track pc__gantt-track--act"
              :aria-label="'Abrir actividad ' + row.nombre"
              @mouseenter="showGanttTooltip($event, { nombre: row.nombre, inicio: row.act.fechaInicioPlan, fin: row.act.fechaFinPlan, finReal: row.act.fechaCierre, estado: row.act.estado, avance: row.act.porcentajeAvanceReal, responsable: row.act.responsable })"
              @mousemove="moveGanttTooltip"
              @mouseleave="hideGanttTooltip"
              @click="openDetalleActividad(row.act.id)"
            >
              <span
                v-if="ganttTodayLinePct != null"
                class="pc__gantt-today-line"
                :style="{ left: ganttTodayLinePct + '%' }"
                aria-hidden="true"
              />
              <span
                v-if="ganttProjectEndPct != null"
                class="pc__gantt-project-line"
                :style="{ left: ganttProjectEndPct + '%' }"
                aria-hidden="true"
              />
              <div class="pc__gantt-lane pc__gantt-lane--act">
                <span
                  v-for="(b, bi) in ganttBarsForActividad(row.act)"
                  :key="'a' + bi"
                  class="pc__gantt-bar"
                  :class="ganttActividadBarClass(row, b.kind)"
                  :style="{ left: b.left + '%', width: b.width + '%' }"
                />
              </div>
            </button>
          </div>
        </div>
        <div
          v-if="ganttTooltip.visible"
          ref="ganttTooltipEl"
          class="pc__gantt-tooltip"
          :class="{ 'pc__gantt-tooltip--risk': ganttTooltip.riesgo }"
          :style="ganttTooltipStyle"
        >
          <strong class="pc__gantt-tooltip-title">{{ ganttTooltip.nombre }}</strong>
          <span
            v-if="ganttTooltip.reprogramaciones > 0"
            class="pc__gantt-tooltip-chip"
          >
            &#8634; {{ ganttTooltip.reprogramaciones }}
            {{ ganttTooltip.reprogramaciones === 1 ? 'reprogramación' : 'reprogramaciones' }}
          </span>
          <div class="pc__gantt-tooltip-divider"></div>
          <dl class="pc__gantt-tooltip-grid">
            <dt>Inicio planificado</dt>
            <dd>{{ ganttTooltip.inicio }}</dd>
            <dt>Fin planificado</dt>
            <dd>{{ ganttTooltip.fin }}</dd>
            <dt>Fin real</dt>
            <dd>{{ ganttTooltip.finReal }}</dd>
            <dt>Estado</dt>
            <dd>{{ ganttTooltip.estado }}</dd>
            <dt>Responsable</dt>
            <dd>{{ ganttTooltip.responsable }}</dd>
            <dt>% avance real</dt>
            <dd>{{ ganttTooltip.avance }}</dd>
          </dl>
        </div>
      </div>
    </div>

    <template v-if="false">
      <p v-if="!grupos.length && !loading" class="pc__empty">
        No hay hitos registrados en este proyecto.
        <template v-if="canGestor"> Haz clic en «+ Agregar hito» para comenzar a planificar.</template>
      </p>

      <div v-else class="pc__table-wrap">
        <table class="pc__table" :aria-busy="loading">
          <thead>
            <tr>
              <th class="pc__th pc__th--narrow" aria-label="Expandir" />
              <th class="pc__th">Hito</th>
              <th class="pc__th">Inicio Plan.</th>
              <th class="pc__th">Fin Plan.</th>
              <th class="pc__th">Inicio Real</th>
              <th class="pc__th">Fin Real</th>
              <th class="pc__th">Desfase</th>
              <th class="pc__th">Reprog.</th>
              <th class="pc__th">%Avance Plan</th>
              <th class="pc__th">Estado</th>
              <th class="pc__th">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="g in grupos" :key="g.hitoId">
              <tr class="pc__tr">
                <td class="pc__td pc__td--chev">
                  <button
                    type="button"
                    class="pc__chev"
                    :aria-expanded="isExpanded(g.hitoId)"
                    :aria-label="isExpanded(g.hitoId) ? 'Colapsar' : 'Expandir'"
                    @click="toggleExpand(g.hitoId)"
                  >
                    <i
                      class="pi"
                      :class="isExpanded(g.hitoId) ? 'pi-chevron-down' : 'pi-chevron-right'"
                      aria-hidden="true"
                    />
                  </button>
                </td>
                <td class="pc__td">
                  <button type="button" class="pc__hito-link" @click="openDetalleHito(g.hitoId)">{{ g.hitoNombre }}</button>
                </td>
                <td class="pc__td">{{ g.hitoFechaInicioPlan ? formatIsoEs(String(g.hitoFechaInicioPlan)) : '—' }}</td>
                <td class="pc__td">{{ formatIsoEs(g.hitoFechaFinPlan) }}</td>
                <td class="pc__td">{{ g.hitoFechaInicioReal ? formatIsoEs(String(g.hitoFechaInicioReal)) : '—' }}</td>
                <td class="pc__td">{{ g.hitoFechaCierreReal ? formatIsoEs(String(g.hitoFechaCierreReal)) : '—' }}</td>
                <td class="pc__td">
                  <span :class="desfaseCellClass(g)">{{ g.cronogramaDesfaseTexto }}</span>
                </td>
                <td class="pc__td">
                  <button
                    type="button"
                    class="pc__reprog"
                    :disabled="(g.hitoReprogramacionesCount ?? 0) === 0"
                    @click="(g.hitoReprogramacionesCount ?? 0) > 0 && openHistorialHito(g)"
                  >
                    {{ g.hitoReprogramacionesCount ?? 0 }}
                  </button>
                </td>
                <td class="pc__td">
                  <div class="pc__bar-wrap">
                    <div class="pc__bar-track">
                      <div :class="barClass(g)" :style="{ width: `${Math.min(100, g.porcentajeAvance)}%` }" />
                    </div>
                    <span class="pc__pct">{{ g.porcentajeAvance }}%</span>
                  </div>
                </td>
                <td class="pc__td">
                  <IsTag
                    rounded
                    :severity="hitoEstadoSeverity(g)"
                    :class="['pc-tag', { 'pc-tag--atraso': g.cronogramaHitoAtrasoVisual }]"
                    :value="g.hitoEstado"
                  />
                </td>
                <td class="pc__td">
                  <div class="pc__acciones">
                    <IsButton
                      v-if="canGestor"
                      severity="primary"
                      outlined
                      size="small"
                      label="+ Actividad"
                      class="pc__btn-act"
                      @click="openNuevaActividadDesdeHito(g)"
                    />
                    <IsButton
                      v-if="canGestor"
                      severity="secondary"
                      text
                      rounded
                      size="small"
                      icon="pi pi-pencil"
                      aria-label="Editar hito"
                      title="Editar"
                      @click="openDetalleHito(g.hitoId)"
                    />
                    <IsButton
                      v-if="canGestor"
                      severity="danger"
                      text
                      rounded
                      size="small"
                      icon="pi pi-trash"
                      :disabled="deleteDisabled(g)"
                      :title="
                        deleteDisabled(g)
                          ? 'No se puede eliminar un hito con actividades registradas. Elimina primero las actividades.'
                          : 'Eliminar hito'
                      "
                      aria-label="Eliminar hito"
                      @click="!deleteDisabled(g) && confirmDeleteHito(g)"
                    />
                    <IsButton
                      v-if="canGestor && g.hitoEstado !== 'Cerrado'"
                      severity="primary"
                      outlined
                      size="small"
                      label="Cerrar"
                      @click="openCierreHito(g)"
                    />
                  </div>
                </td>
              </tr>
              <tr v-if="isExpanded(g.hitoId)" class="pc__tr pc__tr--nested">
                <td class="pc__nested" colspan="11">
                  <IsDataTable
                    :value="mainRowsForGrupo(g)"
                    data-key="id"
                    striped-rows
                    class="pc__subtable"
                    :pt="{ root: { class: 'p-datatable-sm' } }"
                    :row-class="(d) => rowClass(d as MainRow)"
                  >
                    <template #empty>
                      <span class="pc__sub-empty">No hay actividades en este hito.</span>
                    </template>
                    <IsColumn style="min-width: 11rem">
                      <template #header><span class="pc-col-h">Tipo</span></template>
                      <template #body="{ data }">
                        <div
                          class="pc-tipo pc-tipo--inline"
                          :style="{ paddingLeft: `${(data as MainRow).indent * 1.1}rem` }"
                        >
                          <i :class="tipoIcon((data as MainRow).act.tipo)" class="pc-tipo__ico" aria-hidden="true" />
                          <span class="pc-tipo__lbl">{{ (data as MainRow).act.tipoLabel }}</span>
                          <button
                            v-if="
                              canGestor &&
                              puedeAgregarSubActividad((data as MainRow).act) &&
                              (data as MainRow).indent === 0
                            "
                            type="button"
                            class="pc-tipo__plus"
                            title="Agregar sub-actividad"
                            aria-label="Agregar sub-actividad"
                            @click.stop="openSubActividadDesdePadre((data as MainRow).act)"
                          >
                            +
                          </button>
                          <span
                            v-if="(data as MainRow).act.tipo === 'pendiente'"
                            class="pc-pend-tag"
                            :class="{ 'pc-pend-tag--hard': (data as MainRow).act.esDependencia === true, 'pc-pend-tag--soft': (data as MainRow).act.esDependencia === false }"
                          >
                            {{ (data as MainRow).act.esDependencia === true ? 'Bloqueante' : 'No bloqueante' }}
                          </span>
                        </div>
                      </template>
                    </IsColumn>
                    <IsColumn style="min-width: 14rem">
                      <template #header><span class="pc-col-h">Nombre</span></template>
                      <template #body="{ data }">
                        <button
                          type="button"
                          class="pc-nombre-link"
                          @click="openDetalleActividad((data as MainRow).act.id)"
                        >
                          {{ (data as MainRow).act.nombre }}
                        </button>
                      </template>
                    </IsColumn>
                    <IsColumn style="min-width: 10rem">
                      <template #header><span class="pc-col-h">Responsable</span></template>
                      <template #body="{ data }">{{ responsableNombre((data as MainRow).act.responsable) }}</template>
                    </IsColumn>
                    <IsColumn style="min-width: 9rem">
                      <template #header><span class="pc-col-h">Fecha Inicio Plan.</span></template>
                      <template #body="{ data }">{{ formatIsoEsFromRow((data as MainRow).act.fechaInicioPlan) }}</template>
                    </IsColumn>
                    <IsColumn style="min-width: 9rem">
                      <template #header><span class="pc-col-h">Fecha Fin Plan.</span></template>
                      <template #body="{ data }">{{ formatIsoEsFromRow((data as MainRow).act.fechaFinPlan) }}</template>
                    </IsColumn>
                    <IsColumn style="min-width: 7rem">
                      <template #header><span class="pc-col-h">Prioridad</span></template>
                      <template #body="{ data }">
                        <IsTag
                          rounded
                          class="pc-tag"
                          :severity="prioridadSeverity((data as MainRow).act.prioridad)"
                          :value="(data as MainRow).act.prioridad"
                        />
                      </template>
                    </IsColumn>
                    <IsColumn style="min-width: 8rem">
                      <template #header><span class="pc-col-h">Estado</span></template>
                      <template #body="{ data }">
                        <IsTag
                          rounded
                          class="pc-tag"
                          :severity="estadoSeverity((data as MainRow).act.estado)"
                          :value="(data as MainRow).act.estado"
                        />
                      </template>
                    </IsColumn>
                    <IsColumn style="min-width: 6.5rem">
                      <template #header><span class="pc-col-h">%Avance Real</span></template>
                      <template #body="{ data }">
                        <span class="pc-pct-cell">
                          <template v-if="(data as MainRow).act.porcentajeAvanceReal == null">Pend.</template>
                          <template v-else>{{ (data as MainRow).act.porcentajeAvanceReal }}%</template>
                        </span>
                      </template>
                    </IsColumn>
                    <IsColumn style="min-width: 9rem">
                      <template #header><span class="pc-col-h">Dependencia</span></template>
                      <template #body="{ data }">
                        <div class="pc__dep">
                          <template v-if="dependenciaCell((data as MainRow).act) === 'critico'">
                            <span class="pc__crit-badge">Dependencia crítica</span>
                          </template>
                          <template v-else-if="dependenciaCell((data as MainRow).act) === 'lock'">
                            <i class="pi pi-lock" aria-hidden="true" />
                          </template>
                          <template v-else>—</template>
                        </div>
                      </template>
                    </IsColumn>
                    <IsColumn style="width: 7.5rem">
                      <template #header><span class="pc-col-h">Acciones</span></template>
                      <template #body="{ data }">
                        <span class="pc__ico-row">
                          <IsButton
                            v-if="canGestor"
                            severity="secondary"
                            text
                            rounded
                            size="small"
                            icon="pi pi-pencil"
                            aria-label="Editar"
                            @click="openDetalleActividad((data as MainRow).act.id)"
                          />
                          <IsButton
                            v-if="canGestor && (data as MainRow).act.estado !== 'Cerrado'"
                            severity="success"
                            text
                            rounded
                            size="small"
                            icon="pi pi-check"
                            title="Cerrar"
                            @click="onCerrarRapido((data as MainRow).act, g)"
                          />
                        </span>
                      </template>
                    </IsColumn>
                  </IsDataTable>

                  <template v-if="(g.pendientesNivelHito ?? []).length">
                    <div class="pc-sep" role="separator" />
                    <p class="pc-sep__label">PENDIENTES A NIVEL HITO</p>
                    <IsDataTable
                      :value="g.pendientesNivelHito ?? []"
                      data-key="id"
                      striped-rows
                      class="pc__subtable pc__subtable--gestion"
                      :pt="{ root: { class: 'p-datatable-sm' } }"
                      :row-class="(d) => rowClass(d as ActividadItemApi)"
                    >
                      <IsColumn style="min-width: 11rem">
                        <template #header><span class="pc-col-h">Tipo</span></template>
                        <template #body="{ data }">
                          <div class="pc-tipo pc-tipo--inline">
                            <i :class="tipoIcon((data as ActividadItemApi).tipo)" class="pc-tipo__ico" aria-hidden="true" />
                            <span class="pc-tipo__lbl">{{ (data as ActividadItemApi).tipoLabel }}</span>
                            <span
                              class="pc-pend-tag"
                              :class="{ 'pc-pend-tag--hard': (data as ActividadItemApi).esDependencia === true, 'pc-pend-tag--soft': (data as ActividadItemApi).esDependencia === false }"
                            >
                              {{ (data as ActividadItemApi).esDependencia === true ? 'Bloqueante' : 'No bloqueante' }}
                            </span>
                          </div>
                        </template>
                      </IsColumn>
                      <IsColumn style="min-width: 14rem">
                        <template #header><span class="pc-col-h">Nombre</span></template>
                        <template #body="{ data }">
                          <button
                            type="button"
                            class="pc-nombre-link"
                            @click="openDetalleActividad((data as ActividadItemApi).id)"
                          >
                            {{ (data as ActividadItemApi).nombre }}
                          </button>
                        </template>
                      </IsColumn>
                      <IsColumn style="min-width: 10rem">
                        <template #header><span class="pc-col-h">Responsable</span></template>
                        <template #body="{ data }">{{ responsableNombre((data as ActividadItemApi).responsable) }}</template>
                      </IsColumn>
                      <IsColumn style="min-width: 9rem">
                        <template #header><span class="pc-col-h">Fecha Inicio Plan.</span></template>
                        <template #body="{ data }">{{ formatIsoEsFromRow((data as ActividadItemApi).fechaInicioPlan) }}</template>
                      </IsColumn>
                      <IsColumn style="min-width: 9rem">
                        <template #header><span class="pc-col-h">Fecha Fin Plan.</span></template>
                        <template #body="{ data }">{{ formatIsoEsFromRow((data as ActividadItemApi).fechaFinPlan) }}</template>
                      </IsColumn>
                      <IsColumn style="min-width: 7rem">
                        <template #header><span class="pc-col-h">Prioridad</span></template>
                        <template #body="{ data }">
                          <IsTag
                            rounded
                            class="pc-tag"
                            :severity="prioridadSeverity((data as ActividadItemApi).prioridad)"
                            :value="(data as ActividadItemApi).prioridad"
                          />
                        </template>
                      </IsColumn>
                      <IsColumn style="min-width: 8rem">
                        <template #header><span class="pc-col-h">Estado</span></template>
                        <template #body="{ data }">
                          <IsTag
                            rounded
                            class="pc-tag"
                            :severity="estadoSeverity((data as ActividadItemApi).estado)"
                            :value="(data as ActividadItemApi).estado"
                          />
                        </template>
                      </IsColumn>
                      <IsColumn style="min-width: 6.5rem">
                        <template #header><span class="pc-col-h">%Avance Real</span></template>
                        <template #body="{ data }">
                          <span class="pc-pct-cell">
                            <template v-if="(data as ActividadItemApi).porcentajeAvanceReal == null">Pend.</template>
                            <template v-else>{{ (data as ActividadItemApi).porcentajeAvanceReal }}%</template>
                          </span>
                        </template>
                      </IsColumn>
                      <IsColumn style="min-width: 9rem">
                        <template #header><span class="pc-col-h">Dependencia</span></template>
                        <template #body>—</template>
                      </IsColumn>
                      <IsColumn style="width: 7.5rem">
                        <template #header><span class="pc-col-h">Acciones</span></template>
                        <template #body="{ data }">
                          <span class="pc__ico-row">
                            <IsButton
                              v-if="canGestor"
                              severity="secondary"
                              text
                              rounded
                              size="small"
                              icon="pi pi-pencil"
                              aria-label="Editar"
                              @click="openDetalleActividad((data as ActividadItemApi).id)"
                            />
                            <IsButton
                              v-if="canGestor && (data as ActividadItemApi).estado !== 'Cerrado'"
                              severity="success"
                              text
                              rounded
                              size="small"
                              icon="pi pi-check"
                              title="Cerrar"
                              @click="onCerrarRapido(data as ActividadItemApi, g)"
                            />
                          </span>
                        </template>
                      </IsColumn>
                    </IsDataTable>
                  </template>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </template>

    <ActividadCierreFechasModal
      :visible="cierrePendiente !== null"
      :titulo="cierrePendiente?.titulo ?? ''"
      :descripcion="cierrePendiente?.descripcion"
      :filas="cierrePendiente?.filas ?? []"
      @update:visible="onCierreFechasVisible"
      @confirmar="onCierreFechasConfirm"
    />

    <ActividadModal
      v-model:visible="modalOpen"
      :proyecto-nombre="proyectoNombre"
      :hito-options="hitoOptions"
      :grupos="grupos"
      :integrantes="integrantes"
      :read-only="false"
      :initial="null"
      :save-loading="saveLoading"
      :nueva-actividad-preset="modalPreset"
      @save="onSaveModal"
    />

    <ActividadDetalleModal
      v-model:visible="detalleActividadOpen"
      :proyecto-id="proyectoId"
      :actividad-id="detalleActividadId"
      :hito-options="hitoOptions"
      :grupos="grupos"
      :integrantes="integrantes"
      :can-gestor="canGestor"
      @saved="() => void load()"
    />

    <HitoDetalleModal
      v-model:visible="detalleHitoOpen"
      :proyecto-id="proyectoId"
      :hito-id="detalleHitoId"
      :can-gestor="canGestor"
      @saved="onHitoDetalleSaved"
      @open-actividad="onHitoOpenActividad"
    />

    <HitoCierreModal
      v-model:visible="cierreHitoOpen"
      :proyecto-id="proyectoId"
      :hito-id="cierreHitoGrupo?.hitoId ?? null"
      :hito-nombre="cierreHitoGrupo?.hitoNombre ?? ''"
      @saved="onCierreHitoSaved"
    />

    <HitoReprogramacionDrawer
      v-model:visible="histDrawerOpen"
      :proyecto-id="proyectoId"
      :hito-id="histHitoId"
      :hito-nombre="histHitoNombre"
    />
  </section>
</template>

<style scoped>
.pc {
  margin-top: 0.5rem;
}
.pc__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}
.pc__vista {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.pc__seg {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 13px;
  font-weight: 600;
  padding: 0.4rem 0.85rem;
  border: 1px solid theme('colors.surface.300');
  background: #fff;
  color: theme('colors.surface.500');
  cursor: pointer;
}
.pc__seg:first-of-type {
  border-radius: 6px 0 0 6px;
}
.pc__seg:last-of-type {
  border-radius: 0 6px 6px 0;
  margin-left: -1px;
}
.pc__seg--on {
  border-color: theme('colors.surface.800');
  background: rgba(19, 97, 185, 0.08);
  color: theme('colors.surface.800');
}
.pc__seg:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  border-style: dashed;
}
.pc__resumen {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}
@media (max-width: 960px) {
  .pc__resumen {
    grid-template-columns: repeat(auto-fill, minmax(6.5rem, 1fr));
  }
}
.pc__resumen-item {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.35rem 0.6rem;
  border: 1px solid theme('colors.surface.300');
  border-radius: 8px;
  background: var(--apex-surface-panel);
  cursor: pointer;
  font: inherit;
  white-space: nowrap;
  overflow: hidden;
}
.pc__resumen-item:hover,
.pc__resumen-item--on {
  border-color: var(--apex-color-g100);
  background: rgba(19, 97, 185, 0.06);
  box-shadow: inset 0 0 0 1px rgba(19, 97, 185, 0.18);
}
.pc__resumen-val {
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1;
  color: theme('colors.surface.800');
}
.pc__resumen-lbl {
  min-width: 0;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: theme('colors.surface.500');
  overflow: hidden;
  text-overflow: ellipsis;
}
.pc__gantt {
  position: relative;
  z-index: 0;
  margin-bottom: 1rem;
  border: 1px solid theme('colors.surface.300');
  border-radius: 6px;
  background: #fff;
  overflow: hidden;
}
.pc__gantt-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  padding: 0.65rem 0.85rem;
  background: var(--apex-surface-bg);
  border-bottom: 1px solid theme('colors.surface.300');
}
.pc__gantt-hint {
  margin: 0;
  flex: 1;
  min-width: 12rem;
  font-size: 12px;
  line-height: 1.45;
  color: theme('colors.surface.500');
}
.pc__gantt-leyenda {
  position: absolute;
  right: 0;
  top: calc(100% + 0.35rem);
  z-index: 25;
  display: grid;
  gap: 0.5rem;
  min-width: 12rem;
  padding: 0.65rem;
  border: 1px solid var(--apex-border-brand);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
}
.pc__legend-pop {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.pc__legend-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: 2rem;
  border: 1px solid var(--apex-border-brand);
  border-radius: 6px;
  background: #fff;
  color: theme('colors.surface.700');
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.pc__legend-btn:hover {
  color: var(--apex-color-g100);
  border-color: rgba(19, 97, 185, 0.35);
}
.pc__ley {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 11px;
  font-weight: 600;
  color: theme('colors.surface.700');
}
.pc__ley-i {
  display: inline-block;
  width: 12px;
  height: 8px;
  border-radius: 2px;
}
.pc__ley-i--plan {
  background: var(--apex-color-g100);
}
.pc__ley-i--hito {
  background: var(--apex-color-g100);
}
.pc__ley-i--act {
  background: var(--apex-color-lb100);
}
.pc__ley-i--sub {
  background: #9ca3af;
}
.pc__ley-i--hoy {
  background: var(--apex-color-re);
}
.pc__ley-i--real {
  background: rgba(100, 100, 100, 0.45);
}
.pc__ley-i--excess {
  background: var(--apex-color-re);
}
.pc__ley-i--done {
  background: var(--apex-color-gh);
}
.pc__gantt-scale-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 0.75rem 1rem;
}
.pc__gantt-scale {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
.pc__gantt-ventana {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 11px;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.pc__gantt-ventana-lbl {
  white-space: nowrap;
}
.pc__gantt-ventana-inp {
  min-width: 9.5rem;
}
.pc__gantt-ventana-inp :deep(.app-date-picker__label) {
  margin-bottom: 0.2rem;
  font-size: 11px;
  white-space: nowrap;
}
.pc__gantt-ventana-inp :deep(.app-date-picker__control) {
  height: 34px;
}
.pc__gantt-scale-lbl {
  font-size: 12px;
  font-weight: 700;
  color: theme('colors.surface.800');
  white-space: nowrap;
}
.pc__gantt-scale-sel {
  min-width: 9.5rem;
}
.pc__gantt-body {
  position: relative;
  max-height: min(80vh, 780px);
  overflow: auto;
  padding: 0 0 0.5rem;
}
.pc__gantt-block {
  border-bottom: 1px solid #e8edf3;
}
.pc__gantt-block:last-child {
  border-bottom: none;
}
.pc__gantt-axis {
  display: flex;
  min-width: 720px;
  border-bottom: 1px solid var(--apex-border-table);
  padding: 0.35rem 0.5rem 0;
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
  box-shadow: 0 3px 6px rgba(15, 23, 42, 0.07);
}
.pc__gantt-axis-spacer {
  width: 11rem;
  flex-shrink: 0;
}
.pc__gantt-ticks {
  position: relative;
  flex: 1;
  height: 1.75rem;
  margin-left: 0.25rem;
  display: flex;
  align-items: center;
}
.pc__gantt-ticks::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--today-left, -999%);
  width: 2.8rem;
  transform: translateX(-50%);
  background: linear-gradient(90deg, transparent, rgba(241, 70, 73, 0.13), transparent);
  pointer-events: none;
}
.pc__gantt-tick {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 10px;
  font-weight: 700;
  color: theme('colors.surface.500');
  white-space: nowrap;
}
.pc__vista-label {
  display: inline-flex;
  align-items: center;
  height: 2rem;
  padding: 0 0.75rem;
  border-radius: 6px;
  border: 1px solid theme('colors.surface.300');
  background: #fff;
  color: theme('colors.surface.800');
  font-size: 0.8125rem;
  font-weight: 800;
  text-transform: uppercase;
}
.pc__gantt-axis-today {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  padding: 0.05rem 0.25rem;
  border-radius: 4px;
  background: var(--apex-color-re);
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.2;
  white-space: nowrap;
  z-index: 5;
}
.pc__gantt-row {
  display: flex;
  align-items: center;
  min-width: 720px;
  min-height: 52px;
  padding: 0.35rem 0.5rem;
}
.pc__gantt-row--act {
  min-height: 34px;
  background: #fbfcfe;
}
.pc__gantt-row--hito {
  min-height: 58px;
}
.pc__gantt-rowname {
  width: 11rem;
  flex-shrink: 0;
  padding: 0.35rem 0.5rem 0.35rem 0;
  font-size: 12px;
  font-weight: 600;
  color: theme('colors.surface.800');
  line-height: 1.3;
  display: flex;
  align-items: center;
  text-align: left;
  overflow: hidden;
}
.pc__gantt-rowname--hito {
  gap: 0.15rem;
  font-size: 13px;
  font-weight: 800;
}
.pc__gantt-chev {
  flex-shrink: 0;
  border: none;
  background: transparent;
  padding: 0.15rem;
  cursor: pointer;
  color: theme('colors.surface.800');
  border-radius: 4px;
  line-height: 1;
}
.pc__gantt-chev:hover {
  background: rgba(19, 97, 185, 0.08);
}
.pc__gantt-rowname-txt {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pc__gantt-rowname--act {
  font-size: 11px;
  font-weight: 500;
  color: theme('colors.surface.700');
}
.pc__gantt-track {
  flex: 1;
  position: relative;
  margin-left: 0.25rem;
  border: 1px solid var(--apex-border-table);
  border-radius: 4px;
  background: linear-gradient(90deg, rgba(19, 97, 185, 0.04) 0%, rgba(19, 97, 185, 0.02) 100%);
  cursor: pointer;
  padding: 4px 0;
  text-align: left;
  font: inherit;
}
.pc__gantt-track--act {
  padding: 3px 0;
  min-height: 22px;
}
.pc__gantt-track:hover {
  border-color: theme('colors.surface.800');
  background: rgba(19, 97, 185, 0.06);
  box-shadow: inset 0 0 0 1px rgba(19, 97, 185, 0.2);
}
.pc__gantt-track:focus-visible {
  outline: 2px solid theme('colors.interseguro-secondary.500');
  outline-offset: 1px;
}
.pc__gantt-lane {
  position: relative;
  height: 18px;
  margin: 0 2px;
}
.pc__gantt-lane--lower {
  margin-top: 4px;
}
.pc__gantt-lane--act {
  height: 13px;
  margin: 0 4px;
}
.pc__gantt-bar {
  position: absolute;
  top: 2px;
  height: 12px;
  border-radius: 3px;
  pointer-events: none;
}
.pc__gantt-row--hito .pc__gantt-bar {
  height: 14px;
}
.pc__gantt-bar--plan {
  background: var(--apex-color-g100);
  z-index: 1;
}
.pc__gantt-bar--hito-plan {
  background: var(--apex-color-g100);
  z-index: 1;
}
.pc__gantt-bar--act-plan {
  background: var(--apex-color-lb100);
  z-index: 1;
}
.pc__gantt-bar--sub-plan {
  background: #9ca3af;
  z-index: 1;
  height: 7px;
  top: 4px;
}
.pc__gantt-bar--risk {
  background: rgba(241, 70, 73, 0.25);
  border: 1px solid currentColor;
}
.pc__gantt-today-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  margin-left: -1.5px;
  background: var(--apex-color-re);
  z-index: 4;
  pointer-events: none;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.45), 0 0 0 12px rgba(241, 70, 73, 0.08);
}
.pc__gantt-bar--done {
  background: var(--apex-color-gh);
  z-index: 2;
}
.pc__gantt-bar--real {
  background: rgba(80, 80, 80, 0.42);
  z-index: 2;
}
.pc__gantt-bar--excess {
  background: var(--apex-color-re);
  z-index: 3;
}
.pc__gantt-tooltip {
  position: fixed;
  z-index: 80;
  max-width: min(320px, calc(100vw - 2rem));
  padding: 0.65rem 0.75rem;
  border-radius: 6px;
  border: 1px solid var(--apex-border-brand);
  background: #fff;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.18);
  color: theme('colors.surface.700');
  font-size: 12px;
  pointer-events: none;
}
.pc__gantt-tooltip strong,
.pc__gantt-tooltip span {
  display: block;
}
.pc__gantt-tooltip strong {
  margin-bottom: 0.35rem;
  color: theme('colors.surface.800');
}
.pc__empty {
  margin: 0 0 1rem;
  font-size: 14px;
  color: theme('colors.surface.700');
}
.pc__empty--gantt {
  margin: 1rem;
}

/* ISAC-like visual refinement */
.pc {
  gap: 0.9rem;
}

.pc__toolbar,
.pc__resumen,
.pc__gantt,
.pc__table {
  border-color: var(--apex-border-soft);
  border-radius: 12px;
}

.pc__toolbar {
  background: #fff;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
}

.pc__vista {
  border-color: var(--apex-border-soft);
  border-radius: 12px;
  background: var(--apex-surface-muted);
  padding: 0.35rem;
}

.pc__seg {
  border-radius: 8px;
  color: var(--apex-text-muted);
}

.pc__seg--on {
  background: #fff;
  color: var(--apex-text-strong);
  box-shadow:
    0 2px 8px rgba(15, 23, 42, 0.05),
    inset 0 -2px 0 0 var(--apex-brand-accent);
}

.pc__resumen {
  gap: 0.75rem;
}

.pc__resumen-item {
  border-color: var(--apex-border-soft);
  background: #fff;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.035);
}

.pc__resumen-val {
  color: var(--apex-text-strong);
}

.pc__resumen-lbl,
.pc__gantt-hint,
.pc__gantt-scale-lbl,
.pc__gantt-ventana-lbl {
  color: var(--apex-text-muted);
}

.pc__gantt {
  background: #fff;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
}

.pc__gantt-head,
.pc__gantt-axis,
.pc__gantt-row {
  border-color: var(--apex-border-soft);
}

.pc__gantt-rowname {
  background: #fff;
}

.pc__gantt-row--hito .pc__gantt-rowname {
  background: var(--apex-surface-bg);
}

.pc__gantt-track {
  border-color: var(--apex-border-soft);
  background: var(--apex-surface-bg);
}

.pc__gantt-track:hover {
  border-color: rgba(19, 97, 185, 0.35);
  background: #eff6ff;
}

.pc__legend-btn,
.pc__gantt-leyenda,
.pc__gantt-tooltip {
  border-color: var(--apex-border-soft);
  border-radius: 10px;
}

.pc__gantt-tooltip {
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.16);
}
.pc__gantt-axis-rows {
  flex: 1;
  min-width: 0;
}
.pc__gantt-ticks--months {
  height: 1.55rem;
  border-bottom: 1px solid var(--apex-border-soft);
}
.pc__gantt-ticks::after {
  display: none;
}
.pc__gantt-axis-end {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  padding: 0.05rem 0.25rem;
  border-radius: 4px;
  background: var(--apex-surface-muted);
  color: var(--apex-text-muted);
  font-size: 10px;
  font-weight: 800;
  white-space: nowrap;
  z-index: 5;
}
.pc__gantt-rowname {
  position: sticky;
  left: 0;
  z-index: 8;
  background: #fff;
}
.pc__gantt-row--hito .pc__gantt-rowname {
  background: var(--apex-surface-muted);
}
.pc__gantt-row--hito {
  min-height: 48px;
}
.pc__gantt-row--act {
  min-height: 30px;
}
.pc__gantt-track {
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.pc__gantt-track:hover {
  transform: translateY(-1px);
  box-shadow: var(--apex-shadow-panel);
}
.pc__gantt-lane {
  height: 28px;
}
.pc__gantt-lane--act {
  height: 18px;
}
.pc__gantt-row--hito .pc__gantt-bar {
  top: 0;
  height: 28px;
  border-radius: 6px;
  opacity: 0.4;
}
.pc__gantt-row--act .pc__gantt-bar {
  top: 0;
  height: 18px;
  border-radius: 5px;
}
.pc__gantt-progress {
  position: absolute;
  top: 0;
  height: 28px;
  border-radius: 6px 0 0 6px;
  z-index: 3;
  pointer-events: none;
}
.pc__gantt-progress--cerrado { background: var(--apex-color-gh); }
.pc__gantt-progress--progreso { background: var(--apex-color-g100); }
.pc__gantt-progress--bloqueado { background: var(--apex-color-re); }
.pc__gantt-progress--abierto { background: var(--apex-color-neutral); }
.pc__gantt-bar--estado-abierto { background: var(--apex-color-neutral) !important; }
.pc__gantt-bar--estado-progreso { background: var(--apex-color-g100) !important; }
.pc__gantt-bar--estado-bloqueado { background: var(--apex-color-re) !important; }
.pc__gantt-bar--ghost {
  top: 3px !important;
  height: 22px !important;
  background: var(--apex-color-neutral-light) !important;
  border: 1px dashed var(--apex-color-neutral);
  opacity: 0.55 !important;
  z-index: 0;
  pointer-events: auto;
}
.pc__gantt-today-line {
  width: 1px;
  margin-left: 0;
  background: transparent;
  border-left: 1px dashed var(--apex-color-o100);
  box-shadow: none;
}
.pc__gantt-project-line {
  position: absolute;
  inset-block: 0;
  width: 1px;
  border-left: 1px dashed var(--apex-color-neutral-light);
  z-index: 4;
  pointer-events: none;
}
.pc__gantt-axis-today {
  background: var(--apex-color-o100);
}
.pc__gantt-tooltip {
  min-width: 260px;
  max-width: min(320px, calc(100vw - 16px));
  padding: 12px 14px;
  border: 1px solid var(--apex-border-table);
  border-radius: 8px;
  background: var(--apex-surface-panel);
  box-shadow: var(--apex-shadow-tooltip);
  color: var(--apex-text-heading);
  pointer-events: none;
  animation: pc-tooltip-fade 150ms ease both;
}
.pc__gantt-tooltip--risk {
  border-top: 3px solid var(--apex-color-re);
}
.pc__gantt-tooltip-title {
  display: block;
  color: var(--apex-text-heading);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
}
.pc__gantt-tooltip-chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  margin-top: 6px;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--apex-surface-muted);
  color: var(--apex-text-label);
  font-size: 10px;
  font-weight: 500;
  line-height: 1.4;
}
.pc__gantt-tooltip-divider {
  height: 1px;
  margin: 10px 0;
  background: var(--apex-border-table);
}
.pc__gantt-tooltip-grid {
  display: grid;
  grid-template-columns: minmax(112px, 1fr) minmax(96px, auto);
  gap: 7px 14px;
  margin: 0;
}
.pc__gantt-tooltip-grid dt {
  color: var(--apex-text-label);
  font-size: 10px;
  font-weight: 500;
  line-height: 1.35;
  letter-spacing: 0.4px;
  text-transform: uppercase;
}
.pc__gantt-tooltip-grid dd {
  margin: 0;
  color: var(--apex-text-heading);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
  text-align: right;
}
@keyframes pc-tooltip-fade {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.pc__gantt-body--day .pc__gantt-track {
  background-image: repeating-linear-gradient(
    90deg,
    transparent 0,
    transparent calc(100% / 7 * 5),
    var(--apex-surface-muted) calc(100% / 7 * 5),
    var(--apex-surface-muted) 100%
  );
  background-size: 20% 100%;
}
.pc__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.pc__th {
  background: var(--apex-color-g100);
  color: #fff;
  text-align: left;
  padding: 0.5rem 0.65rem;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pc__th--narrow {
  width: 2.25rem;
}
.pc__td {
  border-bottom: 1px solid theme('colors.surface.300');
  padding: 0.45rem 0.65rem;
  vertical-align: middle;
}
.pc__td--chev {
  padding-left: 0.85rem;
  padding-right: 0.35rem;
}
.pc__chev {
  border: none;
  background: none;
  cursor: pointer;
  padding: 0.35rem 0.45rem;
  color: theme('colors.surface.800');
}
.pc__hito-link {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  font-weight: 600;
  color: theme('colors.interseguro-info.500');
  text-decoration: underline;
  cursor: pointer;
  text-align: left;
}
.pc-def--ahead {
  color: var(--apex-color-gh);
  font-weight: 700;
}
.pc-def--zero {
  color: var(--apex-text-label);
  font-weight: 600;
}
.pc-def--late {
  color: var(--apex-color-re);
  font-weight: 700;
}
.pc-def--dash {
  color: theme('colors.surface.500');
}
.pc__reprog {
  border: none;
  background: none;
  color: theme('colors.interseguro-info.500');
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
}
.pc__reprog:disabled {
  color: theme('colors.surface.500');
  cursor: default;
  text-decoration: none;
}
.pc__bar-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 6rem;
}
.pc__bar-track {
  flex: 1;
  min-width: 0;
  height: 8px;
  border-radius: 4px;
  background: var(--apex-border-table);
  overflow: hidden;
}
.pc__bar-track > .pc-bar {
  height: 100%;
  border-radius: 4px;
  min-width: 0;
}
.pc-bar--g100 {
  background: var(--apex-color-g100);
}
.pc-bar--oy {
  background: var(--apex-color-oy);
}
.pc-bar--re {
  background: var(--apex-color-re);
}
.pc-bar--gh {
  background: var(--apex-color-gh);
}
.pc__pct {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}
/* Tag compacto para tablas/gantt: ajusta el IsTag del kit a la densidad de la grilla. */
.pc-tag.p-tag {
  padding: 2px 9px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.pc-tag--atraso.p-tag {
  outline: 2px solid var(--apex-color-re);
  outline-offset: 1px;
}
.pc__estado-sel {
  min-width: 9rem;
}
.pc__acciones {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.pc__btn-act {
  padding: 0.2rem 0.5rem !important;
  font-size: 12px !important;
}
.pc__ico-row {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}
.pc__nested {
  padding: 0.75rem 0.5rem 1rem 2rem !important;
  background: #fafbfd;
}
.pc__subtable :deep(.p-datatable-thead > tr > th) {
  background: var(--apex-color-g100) !important;
  color: #fff !important;
}
.pc-col-h {
  display: block;
  width: 100%;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #fff;
}
.pc__subtable :deep(.p-datatable-tbody > tr > td:first-of-type) {
  padding-left: 0.85rem;
}
.pc-tipo {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding-left: 0.15rem;
}
.pc-tipo--inline {
  flex-wrap: nowrap;
}
.pc-tipo__lbl {
  flex-shrink: 0;
}
.pc-tipo__plus {
  margin-left: 0.15rem;
  border: 1px solid theme('colors.surface.300');
  background: #fff;
  width: 1.35rem;
  height: 1.35rem;
  padding: 0;
  line-height: 1.2;
  font-size: 14px;
  font-weight: 700;
  color: theme('colors.surface.800');
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}
.pc-tipo__plus:hover {
  border-color: theme('colors.surface.800');
  background: rgba(19, 97, 185, 0.06);
}
.pc-pend-tag {
  display: inline-flex;
  align-items: center;
  margin-left: 0.35rem;
  padding: 0 0.5rem;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: 999px;
  height: 18px;
  white-space: nowrap;
}
.pc-pend-tag--hard {
  background: rgba(192, 57, 43, 0.1);
  color: #9b1c26;
  border: 1px solid rgba(192, 57, 43, 0.4);
}
.pc-pend-tag--soft {
  background: rgba(120, 130, 145, 0.1);
  color: #4a5159;
  border: 1px solid rgba(120, 130, 145, 0.35);
}
.pc-pct-cell {
  display: block;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.pc-nombre-link {
  border: none;
  background: none;
  padding: 0;
  font: inherit;
  color: theme('colors.interseguro-info.500');
  cursor: pointer;
  text-align: left;
}
.pc__crit-badge {
  font-size: 10px;
  font-weight: 700;
  color: #b91c1c;
}
.pc-sep {
  height: 1px;
  margin: 0.75rem 0 0.35rem;
  background: linear-gradient(90deg, transparent, rgba(19, 97, 185, 0.2), transparent);
}
.pc-sep__label {
  margin: 0 0 0.35rem;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: theme('colors.surface.500');
}
.pc-row--vencida .pc-nombre-link {
  color: var(--apex-color-re);
}
</style>
