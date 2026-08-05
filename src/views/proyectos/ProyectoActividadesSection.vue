<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  IsDataTable,
  IsColumn,
  IsButton,
  IsInputText,
  IsSelect,
  IsToggleSwitch,
  IsTag,
  useConfirm,
  useToast,
} from 'is-uikit-components-vue';
import type { TagSeverity } from '@/lib/tag-ui';
import type { SelectOption } from '@/types/forms';
import type { IntegranteProyectoHu025 } from '@/types/poc-data';
import type {
  ActividadGrupoApi,
  ActividadItemApi,
  ActividadPayload,
  NuevaActividadModalPreset,
} from '@/lib/actividades-api';
import type {
  ProyectoAuditoriaApi,
  ProyectoDetailApi,
  PendienteActivoResumenApi,
  ProximoVencimientoApi,
  ProximoVencimientoGestionApi,
  ResumenKpisApi,
} from '@/lib/proyectos-api';
import {
  fetchActividadesDeProyecto,
  createActividad,
  cerrarActividadApi,
  deleteActividadApi,
  deleteHitoApi,
  updateActividad,
  updateHitoApi,
} from '@/lib/actividades-api';
import { fetchProyectoAuditoria, uploadActividadDocumento } from '@/lib/proyectos-api';
import { buildPayloadCierreActividad } from '@/lib/actividades-cierre-ui';
import {
  estadoEsCerradoODestimado,
  buscarPadre,
  maxFechaCierreHijos,
  mensajeBloqueoCerrarActividad,
  propagacionesPostCambio,
  sugerenciasPostCambio,
} from '@/composables/proyectos/useEstadoRules';
import ActividadModal from './ActividadModal.vue';
import ActividadDetalleModal from './ActividadDetalleModal.vue';
import ActividadCierreFechasModal, { type CierreFila } from './ActividadCierreFechasModal.vue';
import HitoDetalleModal from './HitoDetalleModal.vue';

const props = defineProps<{
  proyectoId: string;
  proyectoNombre: string;
  hitos: ProyectoDetailApi['hitos'];
  integrantes: IntegranteProyectoHu025[];
  canGestor: boolean;
  /** Contador que incrementa el padre al refrescar detalle del proyecto (listas alineadas con resumen). */
  detailRevision?: number;
  /** KPIs del resumen para las tarjetas superiores de la pestaña Detalle. */
  kpis?: ResumenKpisApi | null;
  /** Avance planificado recalculado en el padre (puede diferir del KPI). */
  avancePlanificado?: number | null;
  proximosVencimientos?: ProximoVencimientoApi[];
  pendientesActivos?: PendienteActivoResumenApi[];
  proximoVencimiento?: ProximoVencimientoGestionApi | null;
  fechaFinPlan?: string;
}>();

const emit = defineEmits<{
  'refresh-detail': [];
  'ver-pendientes-criticos': [];
  'ver-vencimientos': [];
  'ver-historial': [];
}>();

const confirm = useConfirm();
const toast = useToast();

const grupos = ref<ActividadGrupoApi[]>([]);
const loading = ref(false);
const mostrarCerrados = ref(false);
const modalOpen = ref(false);
const modalPreset = ref<NuevaActividadModalPreset | null>(null);
const saveLoading = ref(false);
const detalleActividadOpen = ref(false);
const detalleActividadId = ref<string | null>(null);
const detalleHitoOpen = ref(false);
const detalleHitoId = ref<string | null>(null);
const estadoMenuOpenId = ref<string | null>(null);
const estadoMenuActividad = ref<ActividadItemApi | null>(null);
const estadoMenuStyle = ref<Record<string, string>>({});

type CierrePendiente = {
  titulo: string;
  descripcion?: string;
  filas: CierreFila[];
  defaultFechas?: Record<string, string>;
  minFechas?: Record<string, string>;
  ejecutar: (fechas: Record<string, string>) => Promise<void>;
};

const cierrePendiente = ref<CierrePendiente | null>(null);

const opcionesEstadoInline: SelectOption[] = [
  { value: 'Abierto', label: 'Abierto' },
  { value: 'En Progreso', label: 'En Progreso' },
  { value: 'Bloqueado', label: 'Bloqueado' },
  { value: 'Cerrado', label: 'Cerrado' },
  { value: 'Desestimado', label: 'Desestimado' },
];

const ESTADO_MENU_WIDTH = 160;
const ESTADO_MENU_HEIGHT = 184;
const ESTADO_MENU_GAP = 8;

function closeEstadoMenu(): void {
  estadoMenuOpenId.value = null;
  estadoMenuActividad.value = null;
  estadoMenuStyle.value = {};
}

function toggleEstadoMenu(event: MouseEvent, act: ActividadItemApi): void {
  if (estadoMenuOpenId.value === act.id) {
    closeEstadoMenu();
    return;
  }

  const button = event.currentTarget as HTMLElement | null;
  if (!button) {
    return;
  }
  closeAccionesMenu();

  const rect = button.getBoundingClientRect();
  const margin = 8;
  const left = Math.min(
    Math.max(rect.left + rect.width / 2 - ESTADO_MENU_WIDTH / 2, margin),
    window.innerWidth - ESTADO_MENU_WIDTH - margin,
  );
  const hasSpaceBelow = rect.bottom + ESTADO_MENU_GAP + ESTADO_MENU_HEIGHT <= window.innerHeight - margin;
  const top = hasSpaceBelow
    ? rect.bottom + ESTADO_MENU_GAP
    : Math.max(rect.top - ESTADO_MENU_GAP - ESTADO_MENU_HEIGHT, margin);

  estadoMenuOpenId.value = act.id;
  estadoMenuActividad.value = act;
  estadoMenuStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${ESTADO_MENU_WIDTH}px`,
  };
}

function onEstadoOverlayOption(nuevo: string): void {
  const act = estadoMenuActividad.value;
  if (!act) {
    return;
  }
  void onInlineEstado(act, nuevo);
}

/* ── Menú de acciones (kebab ⋮) para hitos y filas ───────────────────── */
type AccionMenuItem = { label: string; icon: string; danger?: boolean; disabled?: boolean; action: () => void };
const accionesMenuOpenId = ref<string | null>(null);
const accionesMenuItems = ref<AccionMenuItem[]>([]);
const accionesMenuStyle = ref<Record<string, string>>({});
const ACCIONES_MENU_WIDTH = 210;

function closeAccionesMenu(): void {
  accionesMenuOpenId.value = null;
  accionesMenuItems.value = [];
  accionesMenuStyle.value = {};
}

function openAccionesMenu(event: MouseEvent, id: string, items: AccionMenuItem[]): void {
  if (accionesMenuOpenId.value === id) {
    closeAccionesMenu();
    return;
  }
  closeEstadoMenu();
  const button = event.currentTarget as HTMLElement | null;
  if (!button || !items.length) {
    return;
  }
  const rect = button.getBoundingClientRect();
  const margin = 8;
  const height = items.length * 38 + 12;
  const left = Math.min(Math.max(rect.right - ACCIONES_MENU_WIDTH, margin), window.innerWidth - ACCIONES_MENU_WIDTH - margin);
  const below = rect.bottom + 6 + height <= window.innerHeight - margin;
  const top = below ? rect.bottom + 6 : Math.max(rect.top - 6 - height, margin);
  accionesMenuOpenId.value = id;
  accionesMenuItems.value = items;
  accionesMenuStyle.value = { left: `${left}px`, top: `${top}px`, width: `${ACCIONES_MENU_WIDTH}px` };
}

function runAccion(item: AccionMenuItem): void {
  if (item.disabled) {
    return;
  }
  closeAccionesMenu();
  item.action();
}

function openAccionesHito(event: MouseEvent, g: ActividadGrupoApi): void {
  const items: AccionMenuItem[] = [];
  if (props.canGestor) {
    items.push({ label: 'Agregar actividad', icon: 'pi pi-plus', action: () => openNuevaActividadDesdeHito(g) });
    items.push({
      label: 'Eliminar hito',
      icon: 'pi pi-trash',
      danger: true,
      disabled: hitoTieneContenido(g),
      action: () => requestDeleteHito(g),
    });
  }
  openAccionesMenu(event, `hito:${g.hitoId}`, items);
}

function openAccionesActividad(event: MouseEvent, act: ActividadItemApi, indent: number): void {
  const items: AccionMenuItem[] = [
    { label: props.canGestor ? 'Editar' : 'Ver detalle', icon: 'pi pi-pencil', action: () => openDetalleActividad(act.id) },
  ];
  if (props.canGestor && puedeAgregarSubActividad(act) && indent === 0) {
    items.push({ label: 'Agregar sub-actividad', icon: 'pi pi-plus', action: () => openSubActividadDesdePadre(act) });
  }
  if (props.canGestor) {
    items.push({ label: 'Eliminar', icon: 'pi pi-trash', danger: true, action: () => requestDeleteActividad(act) });
  }
  openAccionesMenu(event, `act:${act.id}`, items);
}

function closeAllMenus(): void {
  closeEstadoMenu();
  closeAccionesMenu();
}

onMounted(() => {
  document.addEventListener('click', closeAllMenus);
  window.addEventListener('resize', closeAllMenus);
  window.addEventListener('scroll', closeAllMenus, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeAllMenus);
  window.removeEventListener('resize', closeAllMenus);
  window.removeEventListener('scroll', closeAllMenus, true);
});

const hitoOptions = computed<SelectOption[]>(() =>
  (props.hitos ?? []).map((h) => ({
    value: h.id,
    label: `${h.nombre} (${formatIsoEs(h.fechaFinPlan)})`,
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

type MainRow = { id: string; indent: number; act: ActividadItemApi; hitoLevel?: boolean };
type VisualRow =
  | { kind: 'item'; id: string; indent: number; act: ActividadItemApi; hitoLevel?: boolean }
  | { kind: 'separator'; id: string };

const expandedRows = ref<Set<string>>(new Set());

function pushActivityRows(out: MainRow[], item: ActividadItemApi, indent: number): void {
  out.push({ id: item.id, indent, act: item });
  for (const child of item.subtareas ?? []) {
    pushActivityRows(out, child, indent + 1);
  }
}

function mainRowsForGrupo(g: ActividadGrupoApi): MainRow[] {
  const out: MainRow[] = [];
  for (const it of g.items ?? []) {
    pushActivityRows(out, it, 0);
  }
  return out;
}

function visibleRowsForItem(out: VisualRow[], item: ActividadItemApi, indent: number): void {
  out.push({ kind: 'item', id: item.id, indent, act: item });
  if (!isExpanded(item.id)) {
    return;
  }
  for (const child of item.subtareas ?? []) {
    visibleRowsForItem(out, child, indent + 1);
  }
}

function visualRowsForGrupo(g: ActividadGrupoApi): VisualRow[] {
  const out: VisualRow[] = [];
  for (const it of g.items ?? []) {
    visibleRowsForItem(out, it, 0);
  }
  if ((g.pendientesNivelHito ?? []).length) {
    out.push({ kind: 'separator', id: `${g.hitoId}-pendientes-hito` });
    for (const p of g.pendientesNivelHito ?? []) {
      out.push({ kind: 'item', id: p.id, indent: 0, act: p, hitoLevel: true });
    }
  }
  return out;
}

function hasChildren(act: ActividadItemApi): boolean {
  return (act.subtareas ?? []).length > 0;
}

function isExpanded(id: string): boolean {
  return expandedRows.value.has(id);
}

function toggleExpanded(id: string): void {
  const next = new Set(expandedRows.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expandedRows.value = next;
}

function expandedIdsFromGroups(items: ActividadGrupoApi[]): Set<string> {
  const ids = new Set<string>();
  const visit = (act: ActividadItemApi): void => {
    if ((act.subtareas ?? []).length > 0) {
      ids.add(act.id);
    }
    for (const child of act.subtareas ?? []) {
      visit(child);
    }
  };
  for (const g of items) {
    for (const it of g.items ?? []) {
      visit(it);
    }
  }
  return ids;
}

const hitoCodeById = computed(() => {
  const map = new Map<string, string>();
  grupos.value.forEach((g, idx) => map.set(g.hitoId, `H${idx + 1}`));
  return map;
});

const actividadCodeById = computed(() => {
  const map = new Map<string, string>();
  let actividadN = 1;
  let subActividadN = 1;
  let pendienteN = 1;
  for (const g of grupos.value) {
    const visit = (it: ActividadItemApi): void => {
      if (it.tipo === 'actividad') {
        map.set(it.id, `A${actividadN++}`);
      } else if (it.tipo === 'sub_actividad') {
        map.set(it.id, `S${subActividadN++}`);
      } else if (it.tipo === 'pendiente') {
        map.set(it.id, `P${pendienteN++}`);
      }
      for (const child of it.subtareas ?? []) {
        visit(child);
      }
    };
    for (const it of g.items ?? []) {
      visit(it);
    }
    (g.pendientesNivelHito ?? []).forEach((p, idx) => {
      map.set(p.id, `${hitoCodeById.value.get(g.hitoId) ?? 'H'}-P${idx + 1}`);
    });
  }
  return map;
});

function hitoCode(g: ActividadGrupoApi): string {
  return hitoCodeById.value.get(g.hitoId) ?? 'H-';
}

function rowCode(act: ActividadItemApi, g: ActividadGrupoApi): string {
  return actividadCodeById.value.get(act.id) ?? hitoCode(g);
}

function tipoLabel(act: ActividadItemApi): string {
  if (act.tipo === 'sub_actividad') {
    return 'Subactividad';
  }
  return act.tipoLabel || (act.tipo === 'actividad' ? 'Actividad' : 'Pendiente');
}

async function load(): Promise<void> {
  loading.value = true;
  try {
    grupos.value = await fetchActividadesDeProyecto(props.proyectoId, mostrarCerrados.value);
    expandedRows.value = expandedIdsFromGroups(grupos.value);
  } catch {
    grupos.value = [];
    expandedRows.value = new Set();
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.proyectoId,
  () => {
    void load();
  },
  { immediate: true },
);

watch(mostrarCerrados, () => {
  void load();
});

watch(
  () => props.detailRevision,
  () => {
    void load();
  },
);

function estadoSeverity(e: string): TagSeverity {
  const t = e.trim();
  if (t === 'Cerrado') {
    return 'success';
  }
  if (t === 'Bloqueado') {
    return 'danger';
  }
  if (t === 'En Progreso') {
    return 'info';
  }
  if (t === 'Desestimado') {
    return 'contrast';
  }
  return 'secondary';
}

function openModalNuevo(preset: NuevaActividadModalPreset | null = null): void {
  if (!props.canGestor) {
    return;
  }
  modalPreset.value = preset;
  modalOpen.value = true;
}

function openNuevaActividadDesdeHito(g: ActividadGrupoApi): void {
  openModalNuevo({
    presetHitoId: g.hitoId,
    lockHito: true,
    hideHitoTipo: true,
  });
}

function openSubActividadDesdePadre(act: ActividadItemApi): void {
  openModalNuevo({
    childOnly: true,
    presetHitoId: act.hitoId,
    lockHito: true,
    presetPadreId: act.id,
    lockPadre: true,
  });
}

function puedeAgregarSubActividad(act: ActividadItemApi): boolean {
  return act.tipo === 'actividad';
}

function hijosBloqueantesAbiertos(act: ActividadItemApi): ActividadItemApi[] {
  return (act.subtareas ?? []).filter((s) => {
    if (estadoEsCerradoODestimado(s.estado)) {
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

function findActInGrupo(id: string, g: ActividadGrupoApi): ActividadItemApi | undefined {
  return (g.items ?? []).find((it) => it.id === id) ?? (g.pendientesNivelHito ?? []).find((it) => it.id === id);
}

function willClosePadreClosingHijoBloqueanteInGrupo(row: ActividadItemApi, g: ActividadGrupoApi): boolean {
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

function nombrePadre(row: ActividadItemApi, g: ActividadGrupoApi): string {
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

function onCerrarRapido(row: ActividadItemApi, g: ActividadGrupoApi): void {
  if (!props.canGestor) {
    return;
  }
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
void onCerrarRapido;

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

function openDetalleActividad(id: string): void {
  detalleActividadId.value = id;
  detalleActividadOpen.value = true;
}

function openDetalleHito(hitoId: string): void {
  detalleHitoId.value = hitoId;
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

async function onDetalleActividadSaved(): Promise<void> {
  await load();
  emit('refresh-detail');
}

async function onSaveModal(payload: ActividadPayload): Promise<void> {
  if (!props.canGestor) {
    return;
  }
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
    if (res.kind === 'hito') {
      toast.add({
        severity: 'success',
        summary: 'Hito registrado correctamente',
        life: 3000,
      });
    } else {
      toast.add({
        severity: 'success',
        summary: 'Actividad registrada con éxito',
        life: 3000,
      });
    }
    await load();
    emit('refresh-detail');
  } catch (e) {
    const detail = e instanceof Error && e.message.trim() ? e.message : 'No se pudo guardar la actividad.';
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

function todayIsoLima(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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

function rowClass(data: MainRow | VisualRow | ActividadItemApi): string {
  if ('kind' in data && data.kind === 'separator') {
    return 'pa-row--section';
  }
  const act = 'act' in data ? data.act : data;
  const cls: string[] = [];
  if ('hitoLevel' in data && data.hitoLevel) {
    cls.push('pa-row--hito-pending');
  }
  if (act.tipo === 'actividad') {
    cls.push('pa-row--actividad');
  }
  if (act.tipo === 'sub_actividad') {
    cls.push('pa-row--subactividad');
  }
  if (act.tipo === 'pendiente') {
    cls.push('pa-row--pendiente');
  }
  if (act.tipo === 'pendiente' && act.esDependencia === true) {
    cls.push('pa-row--bloqueante');
  }
  if (act.criticoDependencia) {
    cls.push('pa-row--critico');
  }
  if (act.estado === 'Cerrado') {
    cls.push('pa-row--cerrado');
  }
  return cls.join(' ');
}

function hitoTieneContenido(g: ActividadGrupoApi): boolean {
  return mainRowsForGrupo(g).length > 0 || (g.pendientesNivelHito ?? []).length > 0;
}

function requestDeleteActividad(act: ActividadItemApi): void {
  const tieneHijos = (act.subtareas ?? []).length > 0;
  confirm.require({
    header: 'Eliminar actividad',
    message: tieneHijos
      ? '¿Estás seguro que deseas eliminar esta actividad? También se eliminarán sus sub-actividades y pendientes asociados.'
      : '¿Estás seguro que deseas eliminar este registro? Esta acción no se puede deshacer.',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Sí, eliminar',
    rejectLabel: 'Cancelar',
    defaultFocus: 'reject',
    rejectClass: 'p-button-secondary',
    acceptClass: 'p-button-danger',
    accept: () => {
      void (async () => {
        try {
          await deleteActividadApi(act.id);
          toast.add({ severity: 'success', summary: 'Actividad eliminada', life: 3000 });
          await load();
          emit('refresh-detail');
        } catch {
          toast.add({
            severity: 'error',
            summary: 'Error',
            detail: 'No se pudo eliminar la actividad.',
            life: 4000,
          });
        }
      })();
    },
  });
}

function requestDeleteHito(g: ActividadGrupoApi): void {
  if (hitoTieneContenido(g)) {
    toast.add({
      severity: 'warn',
      summary: 'No se puede eliminar el hito',
      detail: 'Elimina primero sus actividades, sub-actividades o pendientes.',
      life: 4500,
    });
    return;
  }
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
          toast.add({
            severity: 'error',
            summary: 'Error',
            detail: 'No se pudo eliminar el hito.',
            life: 4000,
          });
        }
      })();
    },
  });
}

function fechaFinRealStr(act: ActividadItemApi): string {
  const raw = act.fechaCierre;
  if (!raw) {
    return '—';
  }
  const s = String(raw).slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }
  return '—';
}

function avanceRealStr(act: ActividadItemApi): string {
  return act.porcentajeAvanceReal == null ? 'Pend.' : `${act.porcentajeAvanceReal}%`;
}

function isoToUtcDate(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? ''))) {
    return null;
  }
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function avancePlanificadoEsperado(act: ActividadItemApi): number | null {
  const ini = isoToUtcDate(String(act.fechaInicioPlan ?? ''));
  const fin = isoToUtcDate(String(act.fechaFinPlan ?? ''));
  const hoy = isoToUtcDate(todayIsoLima());
  if (ini == null || fin == null || hoy == null || fin <= ini) {
    return null;
  }
  if (hoy <= ini) return 0;
  if (hoy >= fin) return 100;
  return Math.round(((hoy - ini) / (fin - ini)) * 100);
}

function avanceDelta(act: ActividadItemApi): { expected: number; delta: number; tone: string; icon: string; title: string } | null {
  if (act.porcentajeAvanceReal == null) {
    return null;
  }
  const expected = avancePlanificadoEsperado(act);
  if (expected == null) {
    return null;
  }
  const delta = Number(act.porcentajeAvanceReal) - expected;
  const tone = delta >= 0 ? 'ok' : delta >= -10 ? 'warn' : 'danger';
  return {
    expected,
    delta,
    tone,
    icon: delta >= 0 ? '↑' : '↓',
    title: `Avance planificado esperado: ${expected}%. Delta exacto: ${delta > 0 ? '+' : ''}${delta}%.`,
  };
}

function avanceRealHitoStr(g: ActividadGrupoApi): string {
  if (!g.avanceRealCompleto) {
    return 'Pend. asignar %avance real a alguna actividad';
  }
  return `${g.porcentajeAvanceReal ?? 0}%`;
}

function responsableNombre(value: string): string {
  return String(value ?? '').replace(/^[^:]{1,60}:\s*/, '').trim() || '—';
}

async function onInlineEstado(act: ActividadItemApi, nuevo: string): Promise<void> {
  if (!props.canGestor || String(act.estado) === nuevo) {
    closeEstadoMenu();
    return;
  }
  closeEstadoMenu();
  const anterior = act.estado;
  const parent = buscarPadre(grupos.value, act);
  const reabreHijoBloqueante =
    estadoEsCerradoODestimado(anterior) &&
    !estadoEsCerradoODestimado(nuevo) &&
    (act.tipo === 'sub_actividad' || (act.tipo === 'pendiente' && act.esDependencia === true));

  if (reabreHijoBloqueante && parent?.estado === 'Cerrado') {
    confirm.require({
      header: 'Reabrir actividad padre',
      message: `Al reabrir este elemento, la actividad '${parent.nombre}' también será reabierta y perderá su fecha de cierre real. ¿Deseas continuar?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Confirmar',
      rejectLabel: 'Cancelar',
      defaultFocus: 'reject',
      rejectClass: 'p-button-secondary',
      accept: () => {
        void aplicarCambioEstado(act, nuevo, anterior);
      },
    });
    return;
  }
  await aplicarCambioEstado(act, nuevo, anterior);
}

async function aplicarCambioEstado(act: ActividadItemApi, nuevo: string, anterior: string): Promise<void> {
  if (nuevo === 'Cerrado') {
    const bloqueo = mensajeBloqueoCerrarActividad(act);
    if (bloqueo) {
      toast.add({
        severity: 'warn',
        summary: 'No se puede cerrar',
        detail: bloqueo,
        life: 5000,
      });
      return;
    }
    const minPadre = act.tipo === 'actividad' ? maxFechaCierreHijos(act) : null;
    cierrePendiente.value = {
      titulo: 'Fecha de cierre real',
      descripcion: `Actividad: «${act.nombre}».`,
      filas: [{ clave: 'principal', etiqueta: 'Fecha de cierre real' }],
      defaultFechas: minPadre ? { principal: minPadre } : undefined,
      minFechas: minPadre ? { principal: minPadre } : undefined,
      ejecutar: async (fechas) => {
        act.estado = 'Cerrado';
        try {
          await updateActividad(act.id, {
            estado: 'Cerrado',
            ...buildPayloadCierreActividad(fechas),
          });
          await aplicarPropagacionesPostCambio(act, 'Cerrado', anterior);
          mostrarSugerenciasPostCambio(act, 'Cerrado');
          toast.add({ severity: 'success', summary: 'Estado actualizado', life: 2200 });
          await load();
          emit('refresh-detail');
        } catch {
          act.estado = anterior;
          toast.add({ severity: 'error', summary: 'No se pudo actualizar el estado', life: 3500 });
        }
      },
    };
    return;
  }
  act.estado = nuevo;
  try {
    await updateActividad(act.id, { estado: nuevo });
    await aplicarPropagacionesPostCambio(act, nuevo, anterior);
    mostrarSugerenciasPostCambio(act, nuevo);
    toast.add({ severity: 'success', summary: 'Estado actualizado', life: 2200 });
    await load();
    emit('refresh-detail');
  } catch {
    act.estado = anterior;
    toast.add({ severity: 'error', summary: 'No se pudo actualizar el estado', life: 3500 });
  }
}

async function aplicarPropagacionesPostCambio(act: ActividadItemApi, nuevo: string, anterior?: string): Promise<void> {
  for (const cambio of propagacionesPostCambio(grupos.value, act, nuevo, anterior)) {
    try {
      if (cambio.tipo === 'actividad') {
        await updateActividad(cambio.id, { estado: cambio.estado });
      } else {
        await updateHitoApi(props.proyectoId, cambio.id, { estado: cambio.estado });
      }
    } catch {
      toast.add({
        severity: 'warn',
        summary: 'Actualización automática pendiente',
        detail: `No se pudo actualizar automáticamente "${cambio.nombre}" a ${cambio.estado}.`,
        life: 4500,
      });
    }
  }
}

function mostrarSugerenciasPostCambio(act: ActividadItemApi, nuevo: string): void {
  for (const detail of sugerenciasPostCambio(grupos.value, act, nuevo)) {
    toast.add({
      severity: 'info',
      summary: 'Sugerencia de cierre',
      detail,
      life: 6000,
    });
  }
}

/* ── Toolbar: búsqueda, filtros y densidad ───────────────────────────── */
const search = ref('');
const filtroResponsable = ref('');
const filtroEstado = ref('');
const filtroTipo = ref('');
type Densidad = 'comoda' | 'media' | 'compacta';
const densidad = ref<Densidad>('media');

const responsableOptions = computed<SelectOption[]>(() => {
  const set = new Set<string>();
  const visit = (a: ActividadItemApi): void => {
    const r = responsableNombre(a.responsable);
    if (r && r !== '—') set.add(r);
    for (const c of a.subtareas ?? []) visit(c);
  };
  for (const g of grupos.value) {
    for (const it of g.items ?? []) visit(it);
    for (const p of g.pendientesNivelHito ?? []) visit(p);
  }
  return [
    { value: '', label: 'Responsable: Todos' },
    ...[...set].sort((a, b) => a.localeCompare(b, 'es')).map((r) => ({ value: r, label: r })),
  ];
});

const estadoOptions = computed<SelectOption[]>(() => {
  const set = new Set<string>();
  const visit = (a: ActividadItemApi): void => {
    if (a.estado) set.add(a.estado);
    for (const c of a.subtareas ?? []) visit(c);
  };
  for (const g of grupos.value) {
    for (const it of g.items ?? []) visit(it);
    for (const p of g.pendientesNivelHito ?? []) visit(p);
  }
  return [
    { value: '', label: 'Estado: Todos' },
    ...[...set].sort((a, b) => a.localeCompare(b, 'es')).map((e) => ({ value: e, label: e })),
  ];
});

const tipoOptions: SelectOption[] = [
  { value: '', label: 'Tipo: Todos' },
  { value: 'actividad', label: 'Actividad' },
  { value: 'sub_actividad', label: 'Subactividad' },
  { value: 'pendiente', label: 'Pendiente' },
];

const hayFiltrosActivos = computed(
  () =>
    Boolean(search.value.trim()) ||
    Boolean(filtroResponsable.value) ||
    Boolean(filtroEstado.value) ||
    Boolean(filtroTipo.value),
);

function rowMatchesFilters(act: ActividadItemApi): boolean {
  const q = search.value.trim().toLowerCase();
  if (q) {
    const code = (actividadCodeById.value.get(act.id) ?? '').toLowerCase();
    if (!act.nombre.toLowerCase().includes(q) && !code.includes(q)) return false;
  }
  if (filtroResponsable.value && responsableNombre(act.responsable) !== filtroResponsable.value) return false;
  if (filtroEstado.value && act.estado !== filtroEstado.value) return false;
  if (filtroTipo.value && act.tipo !== filtroTipo.value) return false;
  return true;
}

/** Filas visuales del grupo aplicando los filtros de la toolbar. */
function visualRowsFiltradas(g: ActividadGrupoApi): VisualRow[] {
  const base = visualRowsForGrupo(g);
  if (!hayFiltrosActivos.value) return base;
  return base.filter((vr) => vr.kind === 'item' && rowMatchesFilters(vr.act));
}

const gruposVisibles = computed<ActividadGrupoApi[]>(() => {
  if (!hayFiltrosActivos.value) return grupos.value;
  return grupos.value.filter((g) => visualRowsFiltradas(g).length > 0);
});

function limpiarFiltros(): void {
  search.value = '';
  filtroResponsable.value = '';
  filtroEstado.value = '';
  filtroTipo.value = '';
}

/* ── Tarjetas KPI superiores ─────────────────────────────────────────── */
function pctClamp(v: number | null | undefined): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function ringStyle(pct: number, kind: 'plan' | 'real'): Record<string, string> {
  const color = kind === 'plan' ? '#2563eb' : '#16a34a';
  return {
    background: `conic-gradient(${color} ${pct * 3.6}deg, #e5e7eb ${pct * 3.6}deg)`,
  };
}

const avancePlanPct = computed(() =>
  pctClamp(props.avancePlanificado ?? props.kpis?.avancePlanificadoPct ?? null),
);
/** % de avance por hitos (centro del anillo de la tarjeta "Avance plan"). */
const avanceHitosPct = computed(() => pctClamp(props.kpis?.porcentajeAvanceHitos ?? null));

/** Tono de color del hito según su estado, para el acento de la tarjeta. */
function hitoEstadoTone(g: ActividadGrupoApi): 'cerrado' | 'progreso' | 'bloqueado' | 'abierto' {
  const e = String(g.hitoEstado ?? '').trim();
  if (e === 'Cerrado') return 'cerrado';
  if (e === 'En Progreso') return 'progreso';
  if (e === 'Bloqueado') return 'bloqueado';
  return 'abierto';
}
const avanceRealPendiente = computed(() => props.kpis?.saludProyecto === 'gris');
const avanceRealPct = computed(() => pctClamp(props.kpis?.avanceRealPct ?? null));

const hitosResumen = computed(() => {
  const total = grupos.value.length;
  const cerrados = grupos.value.filter((g) => String(g.hitoEstado).trim() === 'Cerrado').length;
  const abiertos = total - cerrados;
  const pctCerrados = total ? Math.round((cerrados / total) * 100) : 0;
  return { total, cerrados, abiertos, pctCerrados };
});

const pendientesBloqueantes = computed(() =>
  (props.pendientesActivos ?? []).filter((p) => p.esDependencia === true),
);
const pendientesBloqueantesVencidos = computed(() =>
  pendientesBloqueantes.value.filter((p) => p.vencida).length,
);

/* ── Sidebar: Pendientes críticos ────────────────────────────────────── */
function diasHastaIso(iso: string): number | null {
  const d = isoToUtcDate(String(iso ?? '').slice(0, 10));
  const hoy = isoToUtcDate(todayIsoLima());
  if (d == null || hoy == null) return null;
  return Math.round((d - hoy) / 86400000);
}

const pendientesCriticos = computed(() => {
  const lista = (props.pendientesActivos ?? []).filter((p) => p.esDependencia === true);
  const vencidos = lista.filter((p) => p.vencida).length;
  const porVencer7 = lista.filter((p) => {
    if (p.vencida) return false;
    const d = diasHastaIso(p.fechaLimite);
    return d != null && d >= 0 && d <= 7;
  }).length;
  return { lista, vencidos, porVencer7 };
});

/** Código del hito (H3) del próximo vencimiento, para el badge de la tarjeta KPI. */
const proximoVencCode = computed(() => {
  const nom = String(props.proximoVencimiento?.hitoNombre ?? '').trim();
  if (!nom) return '';
  const g = grupos.value.find((x) => String(x.hitoNombre).trim() === nom);
  return g ? hitoCodeById.value.get(g.hitoId) ?? '' : '';
});

/* ── Sidebar: Vencimientos ───────────────────────────────────────────── */
const vencimientosOrdenados = computed<ProximoVencimientoApi[]>(() =>
  [...(props.proximosVencimientos ?? [])]
    .sort((a, b) => String(a.fechaFinPlan).localeCompare(String(b.fechaFinPlan)))
    .slice(0, 8),
);

function vencimientoTagTone(it: ProximoVencimientoApi): 'rojo' | 'ambar' | 'normal' {
  if (it.vencida) return 'rojo';
  if (it.diasRestantes <= 5) return 'ambar';
  return 'normal';
}

function vencimientoCode(it: ProximoVencimientoApi): string {
  return actividadCodeById.value.get(it.id) ?? '';
}

/* ── Sidebar: Últimos cambios (auditoría del proyecto) ───────────────── */
const ultimosCambios = ref<ProyectoAuditoriaApi[]>([]);
const ultimosCambiosLoading = ref(false);

async function loadUltimosCambios(): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(props.proyectoId)) {
    ultimosCambios.value = [];
    return;
  }
  ultimosCambiosLoading.value = true;
  try {
    ultimosCambios.value = await fetchProyectoAuditoria(props.proyectoId, 12);
  } catch {
    ultimosCambios.value = [];
  } finally {
    ultimosCambiosLoading.value = false;
  }
}

function cambioCode(c: ProyectoAuditoriaApi): string {
  return actividadCodeById.value.get(c.entityId) ?? hitoCodeById.value.get(c.entityId) ?? '';
}

function cambioActionLabel(c: ProyectoAuditoriaApi): string {
  switch (c.action) {
    case 'crear':
      return 'Creado';
    case 'eliminar':
      return 'Eliminado';
    case 'estado_cambio':
      return 'Cambio de estado';
    default:
      return 'Actualizado';
  }
}

/** Detalle legible del cambio: transición de estado o campos editados. */
function cambioDetalleTexto(c: ProyectoAuditoriaApi): string {
  const d = c.detail;
  if (!d) return '';
  if (d.estadoNuevo) {
    return d.estadoAnterior ? `${d.estadoAnterior} → ${d.estadoNuevo}` : d.estadoNuevo;
  }
  if (Array.isArray(d.campos) && d.campos.length) {
    return d.campos.join(', ');
  }
  return '';
}

function cambioTipoLabel(entityType: string): string {
  switch (entityType) {
    case 'hito':
      return 'Hito';
    case 'pendiente':
      return 'Pendiente';
    case 'sub_actividad':
      return 'Subactividad';
    case 'proyecto':
      return 'Proyecto';
    default:
      return 'Actividad';
  }
}

function tiempoRelativo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'Hace instantes';
  if (min < 60) return `Hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Hace ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `Hace ${d} día${d === 1 ? '' : 's'}`;
  return formatIsoEs(iso.slice(0, 10));
}

function actorNombre(email: string): string {
  const e = String(email ?? '').trim();
  if (!e || e === 'sistema') return 'Sistema';
  const local = e.split('@')[0] ?? e;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}

watch(
  () => props.proyectoId,
  () => {
    void loadUltimosCambios();
  },
  { immediate: true },
);

watch(
  () => props.detailRevision,
  () => {
    void loadUltimosCambios();
  },
);

defineExpose({ openDetalleActividad });

</script>

<template>
  <section class="pa">
    <!-- Tarjetas KPI superiores -->
    <div v-if="kpis" class="pa-kpis">
      <article class="pa-kpi">
        <div class="pa-kpi__ring" :style="ringStyle(avanceHitosPct, 'plan')" aria-hidden="true" />
        <div class="pa-kpi__body">
          <p class="pa-kpi__title">Avance plan</p>
          <p class="pa-kpi__big">{{ avanceHitosPct }}%</p>
          <p class="pa-kpi__sub">Planificado {{ avancePlanPct }}%</p>
        </div>
      </article>
      <article class="pa-kpi">
        <div class="pa-kpi__ring" :style="ringStyle(avanceRealPendiente ? 0 : avanceRealPct, 'real')" aria-hidden="true" />
        <div class="pa-kpi__body">
          <p class="pa-kpi__title">Avance real</p>
          <p class="pa-kpi__big">{{ avanceRealPendiente ? '—' : `${avanceRealPct}%` }}</p>
          <p class="pa-kpi__sub">Ejecutado {{ avanceRealPendiente ? 'Pend.' : `${kpis.avanceRealPct}%` }}</p>
        </div>
      </article>
      <article class="pa-kpi">
        <span class="pa-kpi__icon pa-kpi__icon--flag" aria-hidden="true"><i class="pi pi-flag-fill" /></span>
        <div class="pa-kpi__body">
          <p class="pa-kpi__title">Hitos abiertos</p>
          <p class="pa-kpi__big">{{ hitosResumen.abiertos }} <span class="pa-kpi__big-frac">/ {{ hitosResumen.total }}</span></p>
          <p class="pa-kpi__sub">{{ hitosResumen.pctCerrados }}% del total</p>
        </div>
      </article>
      <article class="pa-kpi" :class="{ 'pa-kpi--alert': pendientesBloqueantesVencidos > 0 }">
        <span class="pa-kpi__icon pa-kpi__icon--alert" aria-hidden="true"><i class="pi pi-exclamation-triangle" /></span>
        <div class="pa-kpi__body">
          <p class="pa-kpi__title">Pendientes bloqueantes</p>
          <p class="pa-kpi__big">{{ pendientesBloqueantes.length }}</p>
          <p v-if="pendientesBloqueantesVencidos" class="pa-kpi__sub pa-kpi__sub--rojo">{{ pendientesBloqueantesVencidos }} vencidos</p>
          <p v-else class="pa-kpi__sub">Sin vencidos</p>
        </div>
      </article>
      <article class="pa-kpi">
        <span class="pa-kpi__icon pa-kpi__icon--cal" aria-hidden="true"><i class="pi pi-calendar" /></span>
        <div class="pa-kpi__body">
          <p class="pa-kpi__title">Próximo vencimiento</p>
          <template v-if="proximoVencimiento">
            <p class="pa-kpi__big pa-kpi__big--sm">{{ formatIsoEs(String(proximoVencimiento.fechaLimite).slice(0, 10)) }}</p>
            <p class="pa-kpi__sub pa-kpi__venc-line" :title="proximoVencimiento.nombre">
              <span class="pa-kpi__venc-name">{{ proximoVencimiento.nombre }}</span>
              <span v-if="proximoVencCode" class="pa-code pa-code--hito pa-kpi__venc-code">{{ proximoVencCode }}</span>
            </p>
          </template>
          <p v-else class="pa-kpi__sub">Sin vencimientos próximos</p>
        </div>
      </article>
    </div>

    <div class="pa-layout">
      <div class="pa-main">
        <div class="pa__head">
          <div class="pa__head-copy">
            <h3 class="pa__title">Detalle del proyecto</h3>
            <span class="pa__subtitle">Hitos y actividades</span>
          </div>
          <span class="pa__legend-note">
            <span class="pa__legend-line" aria-hidden="true" />
            Pendiente bloqueante
          </span>
        </div>

        <div class="pa-toolbar">
          <div class="pa-toolbar__search">
            <i class="pi pi-search" aria-hidden="true" />
            <IsInputText v-model="search" placeholder="Buscar actividad o pendiente" />
          </div>
          <IsSelect
            v-model="filtroResponsable"
            :options="responsableOptions"
            option-label="label"
            option-value="value"
            placeholder="Responsable: Todos"
            class="pa-toolbar__select"
          />
          <IsSelect
            v-model="filtroEstado"
            :options="estadoOptions"
            option-label="label"
            option-value="value"
            placeholder="Estado: Todos"
            class="pa-toolbar__select"
          />
          <IsSelect
            v-model="filtroTipo"
            :options="tipoOptions"
            option-label="label"
            option-value="value"
            placeholder="Tipo: Todos"
            class="pa-toolbar__select"
          />
          <IsButton
            v-if="hayFiltrosActivos"
            text
            size="small"
            icon="pi pi-filter-slash"
            label="Limpiar"
            @click="limpiarFiltros"
          />
          <span class="pa-toolbar__spacer" />
          <label class="pa__toggle">
            <IsToggleSwitch v-model="mostrarCerrados" />
            <span>Mostrar cerrados</span>
          </label>
          <span class="pa-density__label">Densidad:</span>
          <div class="pa-density" role="group" aria-label="Densidad de la tabla">
            <button type="button" :class="{ 'is-active': densidad === 'comoda' }" title="Cómoda" @click="densidad = 'comoda'">
              <i class="pi pi-bars" aria-hidden="true" />
            </button>
            <button type="button" :class="{ 'is-active': densidad === 'media' }" title="Media" @click="densidad = 'media'">
              <i class="pi pi-list" aria-hidden="true" />
            </button>
            <button type="button" :class="{ 'is-active': densidad === 'compacta' }" title="Compacta" @click="densidad = 'compacta'">
              <i class="pi pi-table" aria-hidden="true" />
            </button>
          </div>
          <IsButton
            v-if="canGestor"
            severity="primary"
            size="small"
            label="+ Agregar"
            @click="openModalNuevo(null)"
          />
        </div>

        <template v-if="!grupos.length && !loading">
          <p class="pa__hint">Registra hitos desde la pestaña Cronograma para gestionar actividades por hito.</p>
        </template>
        <template v-else-if="!gruposVisibles.length && !loading">
          <p class="pa__hint">Ningún elemento coincide con los filtros aplicados.</p>
        </template>

    <div v-if="gruposVisibles.length" class="pa-table">
    <div
      v-for="g in gruposVisibles"
      :key="g.hitoId"
      class="pa-grupo"
      :class="[`pa-grupo--${densidad}`, `pa-grupo--${hitoEstadoTone(g)}`]"
    >
      <header class="pa-grupo__head">
        <div class="pa-grupo__head-block">
          <button type="button" class="pa-grupo__title pa-grupo__link" @click="openDetalleHito(g.hitoId)">
            <span class="pa-code pa-code--hito">{{ hitoCode(g) }}</span>
            {{ g.hitoNombre }}
          </button>
          <IsTag
            rounded
            class="pa-tag pa-grupo__badge-estado"
            :severity="estadoSeverity(g.hitoEstado)"
            :value="g.hitoEstado"
          />
          <span class="pa-grupo__meta"
            >Inicio plan: {{ g.hitoFechaInicioPlan ? formatIsoEs(g.hitoFechaInicioPlan) : '—' }}</span
          >
          <span class="pa-grupo__meta">Fin plan: {{ formatIsoEs(g.hitoFechaFinPlan) }}</span>
          <span class="pa-grupo__meta pa-grupo__meta--pct">%Avance Plan: {{ g.porcentajeAvancePlan ?? 0 }}%</span>
          <span class="pa-grupo__meta pa-grupo__meta--pct">%Avance Real: {{ avanceRealHitoStr(g) }}</span>
          <span class="pa-grupo__bar" aria-hidden="true">
            <span class="pa-grupo__bar-fill" :style="{ width: `${pctClamp(g.porcentajeAvanceReal)}%` }" />
          </span>
        </div>
        <div v-if="canGestor" class="pa-grupo__actions">
          <button
            type="button"
            class="pa-kebab"
            aria-label="Acciones del hito"
            title="Acciones"
            @click.stop="openAccionesHito($event, g)"
          >
            <i class="pi pi-ellipsis-v" aria-hidden="true" />
          </button>
        </div>
      </header>

      <div class="pa-grid-wrap">
        <div class="pa-grid" role="table" aria-label="Hitos y actividades">
          <div class="pa-grid__header" role="row">
            <div class="pa-grid__th pa-grid__th--tipo" role="columnheader">Tipo</div>
            <div class="pa-grid__th pa-grid__th--nombre" role="columnheader">Nombre</div>
            <div class="pa-grid__th" role="columnheader">Responsable</div>
            <div class="pa-grid__th" role="columnheader">Fecha Fin Plan</div>
            <div class="pa-grid__th pa-grid__th--avance" role="columnheader">%Avance Real</div>
            <div class="pa-grid__th" role="columnheader">Fecha Fin Real</div>
            <div class="pa-grid__th" role="columnheader">Estado</div>
            <div class="pa-grid__th pa-grid__th--acc" role="columnheader"><span class="pa-sr-only">Acciones</span></div>
          </div>

          <template v-if="visualRowsFiltradas(g).length">
            <template v-for="vr in visualRowsFiltradas(g)" :key="vr.id">
              <div v-if="vr.kind === 'separator'" class="pa-grid__section" role="row">
                <span>Pendientes asociados al hito</span>
              </div>

              <div v-else class="pa-grid__row" :class="rowClass(vr)" role="row">
                <div class="pa-grid__cell pa-grid__cell--tipo" role="cell">
                  <div class="pa-tipo pa-tipo--inline">
                    <i
                      :class="tipoIcon(vr.act.tipo)"
                      class="pa-tipo__ico"
                      :title="tipoLabel(vr.act)"
                      aria-hidden="true"
                    />
                    <span class="pa-tipo__lbl">{{ tipoLabel(vr.act) }}</span>
                    <i
                      v-if="vr.act.tipo === 'pendiente' && vr.act.esDependencia === true"
                      class="pi pi-lock pa-lock pa-lock--tipo"
                      title="Pendiente bloqueante: su resolucion es necesaria para el cierre del hito o actividad asociada."
                      aria-hidden="true"
                    />
                    <span
                      v-else-if="vr.act.tipo === 'pendiente' && vr.act.esDependencia === false"
                      class="pa-info-tip"
                      tabindex="0"
                      aria-label="Este pendiente no es bloqueante para el cierre."
                    >
                      <i class="pi pi-info-circle" aria-hidden="true" />
                      <span class="pa-tooltip">Este pendiente no es bloqueante para el cierre.</span>
                    </span>
                  </div>
                </div>

                <div class="pa-grid__cell pa-grid__cell--nombre" role="cell">
                  <div class="pa-name-row" :style="{ paddingLeft: `${vr.indent * 1.25}rem` }">
                    <button
                      v-if="hasChildren(vr.act)"
                      type="button"
                      class="pa-disclose"
                      :aria-expanded="isExpanded(vr.act.id)"
                      :aria-label="isExpanded(vr.act.id) ? 'Contraer fila' : 'Desglosar fila'"
                      @click.stop="toggleExpanded(vr.act.id)"
                    >
                      <i :class="isExpanded(vr.act.id) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" aria-hidden="true" />
                    </button>
                    <span v-else class="pa-disclose pa-disclose--spacer" aria-hidden="true" />

                    <button
                      type="button"
                      class="pa-nombre-link"
                      :class="{ 'pa-nombre-link--cerrado': vr.act.estado === 'Cerrado' }"
                      @click="openDetalleActividad(vr.act.id)"
                    >
                      <span
                        v-if="rowCode(vr.act, g)"
                        class="pa-code"
                        :class="{ 'pa-code--actividad': vr.act.tipo === 'actividad' }"
                      >
                        {{ rowCode(vr.act, g) }}
                      </span>
                      {{ vr.act.nombre }}
                    </button>

                    <span v-if="vr.hitoLevel" class="pa-badge-sub">A nivel hito</span>
                    <i
                      v-if="actividadVencidaNoCerrada(vr.act)"
                      class="pi pi-exclamation-triangle pa-name-alert"
                      title="Vencida respecto a Fecha Fin Plan."
                      aria-hidden="true"
                    />
                  </div>
                </div>

                <div class="pa-grid__cell" role="cell">
                  <span class="pa-responsable" :title="responsableNombre(vr.act.responsable)">
                    {{ responsableNombre(vr.act.responsable) }}
                  </span>
                </div>
                <div class="pa-grid__cell" role="cell">{{ formatIsoEsFromRow(vr.act.fechaFinPlan) }}</div>
                <div class="pa-grid__cell pa-grid__cell--avance" role="cell">
                  <span class="pa-pct-cell">
                    <span class="pa-pct-bar" aria-hidden="true">
                      <span
                        class="pa-pct-bar__fill"
                        :class="`pa-pct-bar__fill--${avanceDelta(vr.act)?.tone ?? 'ok'}`"
                        :style="{ width: `${pctClamp(vr.act.porcentajeAvanceReal)}%` }"
                      />
                    </span>
                    <span class="pa-pct-cell__val">{{ avanceRealStr(vr.act) }}</span>
                    <span
                      v-if="avanceDelta(vr.act)"
                      class="pa-delta"
                      :class="`pa-delta--${avanceDelta(vr.act)?.tone}`"
                      tabindex="0"
                    >
                      <i
                        class="pi pa-delta__arrow"
                        :class="(avanceDelta(vr.act)?.delta ?? 0) >= 0 ? 'pi-arrow-up' : 'pi-arrow-down'"
                        aria-hidden="true"
                      />
                      {{ Math.abs(avanceDelta(vr.act)?.delta ?? 0) }}%
                      <span class="pa-tooltip">
                        Avance planificado esperado para hoy: {{ avanceDelta(vr.act)?.expected }}%.
                        Delta vs avance real: {{ (avanceDelta(vr.act)?.delta ?? 0) > 0 ? '+' : '' }}{{ avanceDelta(vr.act)?.delta }}%.
                      </span>
                    </span>
                  </span>
                </div>
                <div class="pa-grid__cell" role="cell">{{ fechaFinRealStr(vr.act) }}</div>
                <div class="pa-grid__cell" role="cell">
                  <div class="pa-est-cell">
                    <div v-if="canGestor" class="pa-state">
                      <button
                        type="button"
                        class="pa-state__trigger"
                        @click.stop="toggleEstadoMenu($event, vr.act)"
                      >
                        <IsTag
                          rounded
                          class="pa-tag"
                          :severity="estadoSeverity(vr.act.estado)"
                          :value="vr.act.estado"
                        />
                        <i class="pi pi-chevron-down" aria-hidden="true" />
                      </button>
                    </div>
                    <IsTag
                      v-else
                      rounded
                      class="pa-tag"
                      :severity="estadoSeverity(vr.act.estado)"
                      :value="vr.act.estado"
                    />
                  </div>
                </div>
                <div class="pa-grid__cell pa-grid__cell--acc" role="cell">
                  <button
                    type="button"
                    class="pa-kebab"
                    aria-label="Acciones de la fila"
                    title="Acciones"
                    @click.stop="openAccionesActividad($event, vr.act, vr.indent)"
                  >
                    <i class="pi pi-ellipsis-v" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </template>
          </template>

          <span v-else class="pa__empty">No hay actividades en este hito.</span>
        </div>
      </div>

      <IsDataTable
        v-if="false"
        :value="mainRowsForGrupo(g)"
        data-key="id"
        striped-rows
        scrollable
        size="small"
        :table-style="{ minWidth: canGestor ? '76rem' : '70rem' }"
        :loading="loading"
        class="pa__table"
        :row-class="(d) => rowClass(d as MainRow)"
      >
        <template #empty>
          <span class="pa__empty">No hay actividades en este hito.</span>
        </template>
        <IsColumn header="Tipo" frozen style="width: 7.5rem">
          <template #body="{ data }">
            <div
              class="pa-tipo pa-tipo--inline"
              :style="{ paddingLeft: `${(data as MainRow).indent * 1.1}rem` }"
            >
              <i
                :class="tipoIcon((data as MainRow).act.tipo)"
                class="pa-tipo__ico"
                :title="(data as MainRow).act.tipoLabel"
                aria-hidden="true"
              />
              <span class="pa-tipo__lbl">{{ (data as MainRow).act.tipoLabel }}</span>
              <i
                v-if="(data as MainRow).act.tipo === 'pendiente' && (data as MainRow).act.esDependencia === true"
                class="pi pi-lock pa-lock pa-lock--tipo"
                title="Pendiente bloqueante: su resolución es necesaria para el cierre del hito o actividad asociada."
                aria-hidden="true"
              />
              <span
                v-else-if="(data as MainRow).act.tipo === 'pendiente' && (data as MainRow).act.esDependencia === false"
                class="pa-info-tip"
                tabindex="0"
                aria-label="Este pendiente no es bloqueante para el cierre."
              >
                <i class="pi pi-info-circle" aria-hidden="true" />
                <span class="pa-tooltip">Este pendiente no es bloqueante para el cierre.</span>
              </span>
              <IsButton
                v-if="
                  canGestor &&
                  puedeAgregarSubActividad((data as MainRow).act) &&
                  (data as MainRow).indent === 0
                "
                severity="secondary"
                text
                rounded
                size="small"
                icon="pi pi-plus"
                title="Agregar sub-actividad"
                aria-label="Agregar sub-actividad"
                @click.stop="openSubActividadDesdePadre((data as MainRow).act)"
              />
            </div>
          </template>
        </IsColumn>
        <IsColumn header="Nombre" frozen style="min-width: 17.5rem">
          <template #body="{ data }">
            <span class="pa-name-cell">
              <button
                type="button"
                class="pa-nombre-link"
                :class="{ 'pa-nombre-link--cerrado': (data as MainRow).act.estado === 'Cerrado' }"
                @click="openDetalleActividad((data as MainRow).act.id)"
              >
                <span v-if="rowCode((data as MainRow).act, g)" class="pa-code" :class="{ 'pa-code--actividad': (data as MainRow).act.tipo === 'actividad' }">
                  {{ rowCode((data as MainRow).act, g) }}
                </span>
                {{ (data as MainRow).act.nombre }}
              </button>
              <i
                v-if="actividadVencidaNoCerrada((data as MainRow).act)"
                class="pi pi-exclamation-triangle pa-name-alert"
                title="Vencida respecto a Fecha Fin Plan."
                aria-hidden="true"
              />
            </span>
          </template>
        </IsColumn>
        <IsColumn header="Responsable" style="width: 11.25rem">
          <template #body="{ data }">
            <span class="pa-responsable" :title="responsableNombre((data as MainRow).act.responsable)">
              {{ responsableNombre((data as MainRow).act.responsable) }}
            </span>
          </template>
        </IsColumn>
        <IsColumn header="Fecha Fin Plan." style="width: 8.125rem">
          <template #body="{ data }">
            {{ formatIsoEsFromRow((data as MainRow).act.fechaFinPlan) }}
          </template>
        </IsColumn>
        <IsColumn header="%Avance Real" style="width: 8.75rem">
          <template #body="{ data }">
            <span class="pa-pct-cell">
              <span>{{ avanceRealStr((data as MainRow).act) }}</span>
              <span
                v-if="avanceDelta((data as MainRow).act)"
                class="pa-delta"
                :class="`pa-delta--${avanceDelta((data as MainRow).act)?.tone}`"
              >
                <i class="pi pi-exclamation-triangle" aria-hidden="true" />
                {{ avanceDelta((data as MainRow).act)?.icon }} {{ Math.abs(avanceDelta((data as MainRow).act)?.delta ?? 0) }}%
                <span class="pa-tooltip">
                  Avance planificado esperado para hoy: {{ avanceDelta((data as MainRow).act)?.expected }}%.
                  Delta vs avance real: {{ (avanceDelta((data as MainRow).act)?.delta ?? 0) > 0 ? '+' : '' }}{{ avanceDelta((data as MainRow).act)?.delta }}%.
                </span>
              </span>
            </span>
          </template>
        </IsColumn>
        <IsColumn header="Fecha fin real" style="width: 8.125rem">
          <template #body="{ data }">
            {{ fechaFinRealStr((data as MainRow).act) }}
          </template>
        </IsColumn>
        <IsColumn header="Estado" style="width: 8.75rem">
          <template #body="{ data }">
            <div class="pa-est-cell">
              <div v-if="canGestor" class="pa-state">
                <button
                  type="button"
                  class="pa-state__trigger"
                  @click.stop="toggleEstadoMenu($event, (data as MainRow).act)"
                >
                  <IsTag
                    rounded
                    class="pa-tag"
                    :severity="estadoSeverity((data as MainRow).act.estado)"
                    :value="(data as MainRow).act.estado"
                  />
                  <i class="pi pi-chevron-down" aria-hidden="true" />
                </button>
              </div>
              <IsTag
                v-else
                rounded
                class="pa-tag"
                :severity="estadoSeverity((data as MainRow).act.estado)"
                :value="(data as MainRow).act.estado"
              />
            </div>
          </template>
        </IsColumn>
        <IsColumn
          v-if="canGestor"
          header="Acciones"
          frozen
          align-frozen="right"
          style="width: 6rem"
        >
          <template #body="{ data }">
            <span class="pa__ico-row">
              <IsButton
                icon="pi pi-pencil"
                text
                rounded
                size="small"
                aria-label="Editar actividad"
                title="Editar"
                @click="openDetalleActividad((data as MainRow).act.id)"
              />
              <IsButton
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                aria-label="Eliminar actividad"
                title="Eliminar"
                @click="requestDeleteActividad((data as MainRow).act)"
              />
            </span>
          </template>
        </IsColumn>
      </IsDataTable>

      <template v-if="false && (g.pendientesNivelHito ?? []).length">
        <div class="pa-sep" role="separator" />
        <p class="pa-sep__label">PENDIENTES A NIVEL HITO</p>
        <IsDataTable
          :value="g.pendientesNivelHito ?? []"
          data-key="id"
          striped-rows
          scrollable
          size="small"
          :table-style="{ minWidth: canGestor ? '76rem' : '70rem' }"
          class="pa__table pa__table--gestion"
          :row-class="(d) => rowClass(d as ActividadItemApi)"
        >
          <IsColumn header="Tipo" frozen style="width: 7.5rem">
            <template #body="{ data }">
              <div class="pa-tipo pa-tipo--inline">
                <i
                  :class="tipoIcon((data as ActividadItemApi).tipo)"
                  class="pa-tipo__ico"
                  :title="(data as ActividadItemApi).tipoLabel"
                  aria-hidden="true"
                />
                <span class="pa-tipo__lbl">{{ (data as ActividadItemApi).tipoLabel }}</span>
                <i
                  v-if="(data as ActividadItemApi).tipo === 'pendiente' && (data as ActividadItemApi).esDependencia === true"
                  class="pi pi-lock pa-lock pa-lock--tipo"
                  title="Pendiente bloqueante: su resolución es necesaria para el cierre del hito o actividad asociada."
                  aria-hidden="true"
                />
                <span
                  v-else-if="(data as ActividadItemApi).tipo === 'pendiente' && (data as ActividadItemApi).esDependencia === false"
                  class="pa-info-tip"
                  tabindex="0"
                  aria-label="Este pendiente no es bloqueante para el cierre."
                >
                  <i class="pi pi-info-circle" aria-hidden="true" />
                  <span class="pa-tooltip">Este pendiente no es bloqueante para el cierre.</span>
                </span>
              </div>
            </template>
          </IsColumn>
          <IsColumn header="Nombre" frozen style="min-width: 17.5rem">
            <template #body="{ data }">
              <span class="pa-name-cell">
                <button
                  type="button"
                  class="pa-nombre-link"
                  :class="{ 'pa-nombre-link--cerrado': (data as ActividadItemApi).estado === 'Cerrado' }"
                  @click="openDetalleActividad((data as ActividadItemApi).id)"
                >
                  <span class="pa-code">{{ hitoCode(g) }}</span>
                  {{ (data as ActividadItemApi).nombre }}
                </button>
                <i
                  v-if="actividadVencidaNoCerrada(data as ActividadItemApi)"
                  class="pi pi-exclamation-triangle pa-name-alert"
                  title="Vencida respecto a Fecha Fin Plan."
                  aria-hidden="true"
                />
              </span>
            </template>
          </IsColumn>
          <IsColumn header="Responsable" style="width: 11.25rem">
            <template #body="{ data }">
              <span class="pa-responsable" :title="responsableNombre((data as ActividadItemApi).responsable)">
                {{ responsableNombre((data as ActividadItemApi).responsable) }}
              </span>
            </template>
          </IsColumn>
          <IsColumn header="Fecha Fin Plan." style="width: 8.125rem">
            <template #body="{ data }">
              {{ formatIsoEsFromRow((data as ActividadItemApi).fechaFinPlan) }}
            </template>
          </IsColumn>
          <IsColumn header="%Avance Real" style="width: 8.75rem">
          <template #body="{ data }">
              <span class="pa-pct-cell">
                <span>{{ avanceRealStr(data as ActividadItemApi) }}</span>
                <span
                  v-if="avanceDelta(data as ActividadItemApi)"
                  class="pa-delta"
                  :class="`pa-delta--${avanceDelta(data as ActividadItemApi)?.tone}`"
                >
                  <i class="pi pi-exclamation-triangle" aria-hidden="true" />
                  {{ avanceDelta(data as ActividadItemApi)?.icon }} {{ Math.abs(avanceDelta(data as ActividadItemApi)?.delta ?? 0) }}%
                  <span class="pa-tooltip">
                    Avance planificado esperado para hoy: {{ avanceDelta(data as ActividadItemApi)?.expected }}%.
                    Delta vs avance real: {{ (avanceDelta(data as ActividadItemApi)?.delta ?? 0) > 0 ? '+' : '' }}{{ avanceDelta(data as ActividadItemApi)?.delta }}%.
                  </span>
                </span>
              </span>
          </template>
          </IsColumn>
          <IsColumn header="Fecha fin real" style="width: 8.125rem">
            <template #body="{ data }">
              {{ fechaFinRealStr(data as ActividadItemApi) }}
            </template>
          </IsColumn>
          <IsColumn header="Estado" style="width: 8.75rem">
            <template #body="{ data }">
              <div class="pa-est-cell">
                <div v-if="canGestor" class="pa-state">
                  <button
                    type="button"
                    class="pa-state__trigger"
                    @click.stop="toggleEstadoMenu($event, data as ActividadItemApi)"
                  >
                    <IsTag
                      rounded
                      class="pa-tag"
                      :severity="estadoSeverity((data as ActividadItemApi).estado)"
                      :value="(data as ActividadItemApi).estado"
                    />
                    <i class="pi pi-chevron-down" aria-hidden="true" />
                  </button>
                </div>
                <IsTag
                  v-else
                  rounded
                  class="pa-tag"
                  :severity="estadoSeverity((data as ActividadItemApi).estado)"
                  :value="(data as ActividadItemApi).estado"
                />
              </div>
            </template>
          </IsColumn>
          <IsColumn
            v-if="canGestor"
            header="Acciones"
            frozen
            align-frozen="right"
            style="width: 6rem"
          >
            <template #body="{ data }">
              <span class="pa__ico-row">
                <IsButton
                  icon="pi pi-pencil"
                  text
                  rounded
                  size="small"
                  aria-label="Editar"
                  title="Editar"
                  @click="openDetalleActividad((data as ActividadItemApi).id)"
                />
                <IsButton
                  icon="pi pi-trash"
                  severity="danger"
                  text
                  rounded
                  size="small"
                  aria-label="Eliminar actividad"
                  title="Eliminar"
                  @click="requestDeleteActividad(data as ActividadItemApi)"
                />
              </span>
            </template>
          </IsColumn>
        </IsDataTable>
      </template>
    </div>
    </div>
      </div>

      <aside class="pa-aside">
        <!-- Pendientes críticos -->
        <section class="pa-card pa-card--criticos">
          <header class="pa-card__head">
            <span class="pa-card__title"><i class="pi pi-exclamation-triangle" aria-hidden="true" /> Pendientes críticos</span>
            <span class="pa-card__count">{{ pendientesCriticos.lista.length }}</span>
          </header>
          <ul class="pa-card__stats">
            <li><span class="pa-card__stat-num pa-card__stat-num--rojo">{{ pendientesCriticos.vencidos }}</span> Vencidos</li>
            <li><span class="pa-card__stat-num pa-card__stat-num--rojo">{{ pendientesCriticos.porVencer7 }}</span> Por vencer en los próximos 7 días</li>
          </ul>
          <button v-if="pendientesCriticos.lista.length" type="button" class="pa-card__link" @click="emit('ver-pendientes-criticos')">
            Ver todos los pendientes críticos
          </button>
          <p v-else class="pa-card__empty">Sin pendientes bloqueantes activos.</p>
        </section>

        <!-- Vencimientos -->
        <section class="pa-card">
          <header class="pa-card__head">
            <span class="pa-card__title"><i class="pi pi-calendar" aria-hidden="true" /> Vencimientos</span>
          </header>
          <ul v-if="vencimientosOrdenados.length" class="pa-venc">
            <li
              v-for="it in vencimientosOrdenados"
              :key="it.id"
              class="pa-venc__item pa-venc__item--action"
              role="button"
              tabindex="0"
              :title="it.nombre"
              @click="openDetalleActividad(it.id)"
              @keydown.enter.prevent="openDetalleActividad(it.id)"
            >
              <div class="pa-venc__main">
                <span class="pa-venc__date">{{ formatIsoEs(String(it.fechaFinPlan).slice(0, 10)) }}</span>
                <span v-if="vencimientoCode(it)" class="pa-code pa-code--actividad">{{ vencimientoCode(it) }}</span>
                <span class="pa-venc__name">{{ it.nombre }}</span>
                <span class="pa-venc__meta">{{ it.hitoNombre }} · {{ responsableNombre(it.responsable) }}</span>
              </div>
              <span class="pa-venc__tag" :class="`pa-venc__tag--${vencimientoTagTone(it)}`">
                {{ it.vencida ? 'Vencido' : it.diasRestantes === 0 ? 'Hoy' : `${it.diasRestantes}d` }}
              </span>
            </li>
          </ul>
          <p v-else class="pa-card__empty">No hay próximos vencimientos.</p>
          <button v-if="vencimientosOrdenados.length" type="button" class="pa-card__link" @click="emit('ver-vencimientos')">
            Ver todos los vencimientos
          </button>
        </section>

        <!-- Últimos cambios -->
        <section class="pa-card">
          <header class="pa-card__head">
            <span class="pa-card__title"><i class="pi pi-history" aria-hidden="true" /> Últimos cambios</span>
          </header>
          <p v-if="ultimosCambiosLoading" class="pa-card__empty">Cargando…</p>
          <template v-else-if="ultimosCambios.length">
            <ul class="pa-cambios">
              <li v-for="c in ultimosCambios" :key="c.id" class="pa-cambios__item">
                <div class="pa-cambios__main">
                  <span v-if="cambioCode(c)" class="pa-code pa-code--actividad">{{ cambioCode(c) }}</span>
                  <span v-else class="pa-cambios__tipo">{{ cambioTipoLabel(c.entityType) }}</span>
                  <span class="pa-cambios__name">{{ c.entityLabel || 'Elemento' }}</span>
                </div>
                <span class="pa-cambios__meta">
                  {{ cambioActionLabel(c) }} por {{ actorNombre(c.userEmail) }}
                </span>
                <span v-if="cambioDetalleTexto(c)" class="pa-cambios__detalle">{{ cambioDetalleTexto(c) }}</span>
                <span class="pa-cambios__time">{{ tiempoRelativo(c.occurredAt) }}</span>
              </li>
            </ul>
            <button type="button" class="pa-card__link" @click="emit('ver-historial')">
              Ver historial de cambios
            </button>
          </template>
          <p v-else class="pa-card__empty">Aún no se registran cambios en este proyecto.</p>
        </section>
      </aside>
    </div>

    <Teleport to="body">
      <div
        v-if="estadoMenuActividad"
        class="pa-state__menu pa-state__menu--overlay"
        :style="estadoMenuStyle"
        @click.stop
      >
        <button
          v-for="op in opcionesEstadoInline"
          :key="op.value"
          type="button"
          class="pa-state__option"
          @click="onEstadoOverlayOption(String(op.value))"
        >
          <IsTag
            rounded
            class="pa-tag"
            :severity="estadoSeverity(String(op.value))"
            :value="op.label"
          />
        </button>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="accionesMenuOpenId"
        class="pa-acciones-menu"
        :style="accionesMenuStyle"
        role="menu"
        @click.stop
      >
        <button
          v-for="(item, idx) in accionesMenuItems"
          :key="idx"
          type="button"
          class="pa-acciones-menu__item"
          :class="{ 'pa-acciones-menu__item--danger': item.danger, 'pa-acciones-menu__item--disabled': item.disabled }"
          :disabled="item.disabled"
          role="menuitem"
          @click="runAccion(item)"
        >
          <i :class="item.icon" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </button>
      </div>
    </Teleport>

    <ActividadCierreFechasModal
      :visible="cierrePendiente !== null"
      :titulo="cierrePendiente?.titulo ?? ''"
      :descripcion="cierrePendiente?.descripcion"
      :filas="cierrePendiente?.filas ?? []"
      :default-fechas="cierrePendiente?.defaultFechas"
      :min-fechas="cierrePendiente?.minFechas"
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
      @saved="onDetalleActividadSaved"
    />

    <HitoDetalleModal
      v-model:visible="detalleHitoOpen"
      :proyecto-id="proyectoId"
      :hito-id="detalleHitoId"
      :can-gestor="canGestor"
      @saved="onHitoDetalleSaved"
      @open-actividad="onHitoOpenActividad"
    />
  </section>
</template>

<style scoped>
.pa {
  margin-top: 1.75rem;
}

/* ── Tarjetas KPI superiores ───────────────────────────────────────── */
.pa-kpis {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.pa-kpi {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  padding: 1rem 1.1rem;
  background: #fff;
  border: 1px solid theme('colors.surface.200');
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}
.pa-kpi--alert {
  border-color: #fecaca;
  background: #fef2f2;
}
.pa-kpi__ring {
  position: relative;
  flex: none;
  width: 56px;
  height: 56px;
  border-radius: 50%;
}
.pa-kpi__ring::after {
  content: '';
  position: absolute;
  inset: 8px;
  background: #fff;
  border-radius: 50%;
}
.pa-kpi__icon {
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-size: 19px;
}
.pa-kpi__icon--flag { background: #eff6ff; color: #2563eb; }
.pa-kpi__icon--alert { background: #fee2e2; color: #dc2626; }
.pa-kpi__icon--cal { background: #eef2ff; color: #4f46e5; }
.pa-kpi__body { min-width: 0; }
.pa-kpi__title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: theme('colors.surface.500');
}
.pa-kpi__big {
  margin: 0.05rem 0 0;
  font-size: 26px;
  font-weight: 800;
  color: theme('colors.surface.800');
  line-height: 1.05;
}
.pa-kpi__big--sm { font-size: 17px; }
.pa-kpi__big-frac { font-size: 14px; font-weight: 600; color: theme('colors.surface.400'); }
.pa-kpi__sub {
  margin: 0.15rem 0 0;
  font-size: 12px;
  color: theme('colors.surface.500');
}
.pa-kpi__sub--rojo { color: #dc2626; font-weight: 700; }
.pa-kpi__sub--ellipsis {
  max-width: 11rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pa-kpi__venc-line {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}
.pa-kpi__venc-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pa-kpi__venc-code {
  flex: none;
  min-width: auto;
  margin-right: 0;
  font-size: 10px;
}

/* ── Layout de 2 columnas ──────────────────────────────────────────── */
.pa-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 1.25rem;
  align-items: start;
}
.pa-main { min-width: 0; }
.pa__subtitle {
  font-size: 12px;
  color: theme('colors.surface.500');
  font-weight: 500;
}

/* ── Toolbar ───────────────────────────────────────────────────────── */
.pa-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 1rem;
}
.pa-toolbar__search {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 1 1 16rem;
  min-width: 12rem;
}
.pa-toolbar__search > i {
  position: absolute;
  left: 0.7rem;
  color: theme('colors.surface.400');
  font-size: 13px;
  pointer-events: none;
}
.pa-toolbar__search :deep(input) {
  width: 100%;
  padding-left: 2rem;
}
.pa-toolbar__select { min-width: 9.5rem; }
.pa-toolbar__spacer { flex: 1 1 0; }
.pa-density__label {
  font-size: 12px;
  font-weight: 600;
  color: theme('colors.surface.500');
}
.pa-density {
  display: inline-flex;
  border: 1px solid theme('colors.surface.300');
  border-radius: 8px;
  overflow: hidden;
}
.pa-density button {
  border: 0;
  background: #fff;
  padding: 0.35rem 0.5rem;
  cursor: pointer;
  color: theme('colors.surface.500');
  font-size: 13px;
}
.pa-density button + button { border-left: 1px solid theme('colors.surface.200'); }
.pa-density button.is-active { background: #eff6ff; color: #2563eb; }

/* ── Densidad de filas ─────────────────────────────────────────────── */
.pa-grupo--compacta :deep(.pa-grid__row),
.pa-grupo--compacta :deep(.pa-grid__cell) { padding-top: 0.2rem; padding-bottom: 0.2rem; }
.pa-grupo--comoda :deep(.pa-grid__row),
.pa-grupo--comoda :deep(.pa-grid__cell) { padding-top: 0.7rem; padding-bottom: 0.7rem; }

/* ── Barras de avance ──────────────────────────────────────────────── */
.pa-pct-cell {
  display: grid;
  grid-template-columns: minmax(3.6rem, 4.25rem) 2.45rem 3.35rem;
  align-items: center;
  justify-content: center;
  width: 100%;
  column-gap: 0.35rem;
}
.pa-pct-cell__val {
  min-width: 0;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  text-align: right;
}
.pa-pct-bar {
  display: block;
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: #eef2f6;
  overflow: hidden;
}
.pa-pct-bar__fill { display: block; height: 100%; border-radius: 999px; background: #16a34a; transition: width 0.3s ease; }
.pa-pct-bar__fill--warn { background: #f59e0b; }
.pa-pct-bar__fill--danger { background: #dc2626; }
.pa-grupo__bar {
  display: inline-block;
  width: 120px;
  height: 8px;
  border-radius: 999px;
  background: #eef2f6;
  overflow: hidden;
  vertical-align: middle;
}
.pa-grupo__bar-fill {
  display: block;
  height: 100%;
  background: var(--hito-accent);
  border-radius: 999px;
  transition: width 0.3s ease;
}

/* ── Sidebar ───────────────────────────────────────────────────────── */
.pa-aside {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  position: sticky;
  top: 1rem;
}
.pa-card {
  background: #fff;
  border: 1px solid theme('colors.surface.200');
  border-radius: 14px;
  padding: 1rem;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}
.pa-card--criticos { border-color: #fde68a; background: #fffbeb; }
.pa-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.65rem;
}
.pa-card__title {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 13px;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.pa-card__count {
  font-size: 12px;
  font-weight: 800;
  color: #dc2626;
  background: #fee2e2;
  border-radius: 999px;
  padding: 0.05rem 0.5rem;
}
.pa-card__stats { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.4rem; }
.pa-card__stats li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 12px;
  color: theme('colors.surface.600');
}
.pa-card__stat-num {
  font-size: 14px;
  font-weight: 800;
  min-width: 1.4rem;
  text-align: center;
}
.pa-card__stat-num--rojo { color: #dc2626; }
.pa-card__stat-num--ambar { color: #d97706; }
.pa-card__link {
  margin-top: 0.7rem;
  border: 0;
  background: transparent;
  padding: 0;
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
.pa-card__link:hover { text-decoration: underline; }
.pa-card__empty { margin: 0; font-size: 12px; color: theme('colors.surface.500'); }

.pa-venc { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.55rem; }
.pa-venc__item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid theme('colors.surface.200');
  border-radius: 10px;
}
.pa-venc__item--action { cursor: pointer; }
.pa-venc__item--action:hover { background: theme('colors.surface.50'); }
.pa-venc__main { min-width: 0; display: grid; gap: 0.1rem; }
.pa-venc__date { font-size: 12px; font-weight: 700; color: theme('colors.surface.700'); }
.pa-venc__name {
  font-size: 12px;
  color: theme('colors.surface.700');
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 13rem;
}
.pa-venc__meta {
  font-size: 11px;
  color: theme('colors.surface.500');
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 13rem;
}
.pa-venc__tag {
  flex: none;
  font-size: 11px;
  font-weight: 800;
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
  background: theme('colors.surface.100');
  color: theme('colors.surface.600');
}
.pa-venc__tag--rojo { background: #fee2e2; color: #dc2626; }
.pa-venc__tag--ambar { background: #fef3c7; color: #b45309; }

.pa-cambios { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
.pa-cambios__item {
  display: grid;
  gap: 0.1rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid theme('colors.surface.100');
}
.pa-cambios__item:last-child { border-bottom: 0; padding-bottom: 0; }
.pa-cambios__main { display: inline-flex; align-items: center; gap: 0.35rem; min-width: 0; }
.pa-cambios__name {
  font-size: 12px;
  font-weight: 600;
  color: theme('colors.surface.800');
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pa-cambios__meta { font-size: 11px; color: theme('colors.surface.500'); }
.pa-cambios__detalle {
  font-size: 11px;
  font-weight: 600;
  color: theme('colors.surface.600');
  background: theme('colors.surface.100');
  border-radius: 6px;
  padding: 0.05rem 0.4rem;
  width: fit-content;
}
.pa-cambios__tipo {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: theme('colors.surface.500');
  background: theme('colors.surface.100');
  border-radius: 6px;
  padding: 0.05rem 0.35rem;
}
.pa-cambios__time { font-size: 11px; color: theme('colors.surface.400'); }

@media (max-width: 1100px) {
  .pa-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pa-layout { grid-template-columns: minmax(0, 1fr); }
  .pa-aside { position: static; }
}

.pa__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}
.pa__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: theme('colors.surface.800');
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.pa__head-copy {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}
.pa__legend-note {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 12px;
  font-weight: 700;
  color: theme('colors.surface.600');
}
.pa__legend-line {
  width: 4px;
  height: 1.2rem;
  border-radius: 999px;
  background: var(--apex-color-re);
}
.pa__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
}
.pa__toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 13px;
  font-weight: 600;
  color: theme('colors.surface.700');
}
.pa__hint {
  margin: 0 0 1rem;
  font-size: 13px;
  color: theme('colors.surface.500');
}
/* Contenedor de tabla única que agrupa todos los hitos */
.pa-table {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #ffffff;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}
.pa-grupo {
  --hito-accent: #94a3b8;
  --hito-accent-soft: #f1f5f9;
  border-left: 4px solid var(--hito-accent);
  background: #ffffff;
}
.pa-grupo + .pa-grupo {
  border-top: 1px solid #e5e7eb;
}
/* Acento de color por estado del hito */
.pa-grupo--cerrado { --hito-accent: #16a34a; --hito-accent-soft: #ecfdf5; }
.pa-grupo--progreso { --hito-accent: #2563eb; --hito-accent-soft: #eff6ff; }
.pa-grupo--bloqueado { --hito-accent: #dc2626; --hito-accent-soft: #fef2f2; }
.pa-grupo--abierto { --hito-accent: #94a3b8; --hito-accent-soft: #f8fafc; }
.pa-grupo__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem 1rem;
  margin-bottom: 0;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #eef2f6;
  background: #ffffff;
}
.pa-grupo__head-block {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1.25rem;
  min-width: 0;
  flex: 1;
}
.pa-grupo__badge-estado {
  flex-shrink: 0;
}
.pa-grupo__meta--pct {
  color: theme('colors.surface.800');
  font-weight: 700;
}
.pa-grupo__btn-act {
  flex-shrink: 0;
}
.pa-grupo__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  flex-shrink: 0;
  margin-left: auto;
}
.pa-grupo__title {
  margin: 0;
  font-size: 15px;
  font-weight: 800;
  color: theme('colors.surface.800');
}
.pa-grupo__link {
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: theme('colors.surface.800');
  text-decoration: none;
}
.pa-grupo__link:hover {
  color: theme('colors.interseguro-info.500');
  text-decoration: underline;
  text-underline-offset: 2px;
}
.pa-grupo__meta {
  font-size: 12px;
  font-weight: 600;
  color: theme('colors.surface.500');
}
.pa-grupo__meta--muted {
  font-weight: 500;
  color: theme('colors.surface.400');
}
.pa__table {
  font-size: 13px;
  margin: 0;
}
.pa__table--gestion {
  margin-top: 0.35rem;
}
.pa__empty {
  display: block;
  padding: 0.85rem 1rem;
  color: theme('colors.surface.500');
}
.pa-grid-wrap {
  width: 100%;
  overflow-x: auto;
}
.pa-grid {
  min-width: 75.5rem;
  font-size: 13px;
}
.pa-grid__header,
.pa-grid__row {
  display: grid;
  grid-template-columns: 8.25rem minmax(22rem, 1.8fr) minmax(10rem, 0.85fr) 8.5rem 11.75rem 8.5rem 9rem 2.75rem;
}
.pa-grid__th--acc,
.pa-grid__cell--acc {
  justify-content: center;
  padding-left: 0;
  padding-right: 0.35rem;
  position: sticky;
  right: 0;
  background: inherit;
  box-shadow: -6px 0 6px -6px rgba(15, 23, 42, 0.12);
}
.pa-grid__th--acc {
  background: #f8fafc;
}
.pa-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
/* Botón kebab (acciones) */
.pa-kebab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: theme('colors.surface.500');
  cursor: pointer;
  font-size: 14px;
  transition: background 0.15s ease, color 0.15s ease;
}
.pa-kebab:hover {
  background: theme('colors.surface.100');
  color: theme('colors.surface.800');
}
/* Menú flotante de acciones */
.pa-acciones-menu {
  position: fixed;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  padding: 0.3rem;
  background: #fff;
  border: 1px solid theme('colors.surface.200');
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.14);
}
.pa-acciones-menu__item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.5rem 0.6rem;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: theme('colors.surface.700');
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
}
.pa-acciones-menu__item:hover {
  background: theme('colors.surface.100');
}
.pa-acciones-menu__item--danger {
  color: #dc2626;
}
.pa-acciones-menu__item--danger:hover {
  background: #fef2f2;
}
.pa-acciones-menu__item--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.pa-acciones-menu__item--disabled:hover {
  background: transparent;
}
.pa-grid__header {
  min-height: 2.35rem;
  border-bottom: 1px solid #eef2f6;
  background: #f8fafc;
}
.pa-grid__th {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.55rem 0.75rem;
  color: theme('colors.surface.500');
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  white-space: nowrap;
}
.pa-grid__th--tipo,
.pa-grid__th--nombre {
  justify-content: flex-start;
}
.pa-grid__row {
  min-height: 2.6rem;
  border-bottom: 1px solid #f1f5f9;
  background: #fff;
}
.pa-grid__row:nth-of-type(even) {
  background: #fcfdfe;
}
.pa-grid__row:hover {
  background: var(--hito-accent-soft);
}
.pa-grid__row:last-child {
  border-bottom: none;
}
.pa-grid__cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 0.45rem 0.75rem;
  color: theme('colors.surface.800');
  line-height: 1.25;
}
.pa-grid__cell--tipo,
.pa-grid__cell--nombre {
  justify-content: flex-start;
}
.pa-grid__cell--tipo {
  color: theme('colors.surface.700');
}
.pa-grid__section {
  display: flex;
  align-items: center;
  min-height: 2.15rem;
  padding: 0.45rem 1rem;
  border-bottom: 1px solid rgba(245, 158, 11, 0.22);
  border-left: 4px solid #f59e0b;
  background: #fffbeb;
  color: #8a6100;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.pa-row--hito-pending {
  background: #fffdf7;
}
.pa-row--bloqueante {
  box-shadow: inset 4px 0 0 var(--apex-color-re);
}
.pa-row--subactividad .pa-grid__cell--nombre {
  background: linear-gradient(90deg, rgba(19, 97, 185, 0.04), transparent 65%);
}
.pa-name-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
  width: 100%;
}
.pa-disclose {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  flex: 0 0 1.35rem;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: theme('colors.surface.500');
  cursor: pointer;
}
.pa-disclose:hover {
  border-color: rgba(19, 97, 185, 0.16);
  background: #eff6ff;
  color: var(--apex-color-g100);
}
.pa-disclose--spacer {
  pointer-events: none;
}
.pa-row-action {
  flex: 0 0 auto;
}
.pa-row-tools {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.14s ease;
}
.pa-grid__row:hover .pa-row-tools,
.pa-grid__row:focus-within .pa-row-tools {
  opacity: 1;
}
.pa-sep {
  height: 1px;
  margin: 1rem 1rem 0.35rem;
  background: linear-gradient(90deg, transparent, rgba(19, 97, 185, 0.2), transparent);
  border: none;
}
.pa-sep__label {
  margin: 0 1rem 0.35rem;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: theme('colors.surface.500');
}
.pa-nombre-link {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  font: inherit;
  color: theme('colors.interseguro-info.500');
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.pa-code {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  margin-right: 0.4rem;
  padding: 0.12rem 0.35rem;
  border-radius: 4px;
  background: rgba(19, 97, 185, 0.1);
  color: var(--apex-color-g100);
  font-size: 11px;
  font-weight: 900;
  text-decoration: none;
}
.pa-code--hito {
  background: var(--hito-accent-soft);
  color: var(--hito-accent);
}
.pa-code--actividad {
  background: rgba(85, 172, 237, 0.18);
  color: #0b5f98;
}
.pa-nombre-link:hover {
  color: theme('colors.surface.800');
}
.pa-nombre-link--cerrado {
  text-decoration: line-through;
  color: theme('colors.surface.500');
}
.pa-name-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}
.pa-name-alert {
  color: var(--apex-color-re);
  font-size: 0.9rem;
  flex-shrink: 0;
}
.pa__table :deep(.p-datatable-thead > tr > th:nth-child(2)),
.pa__table :deep(.p-datatable-tbody > tr > td:nth-child(2)) {
  text-align: left;
}
.pa__table :deep(.p-datatable-thead > tr > th:nth-child(2) .p-column-header-content) {
  justify-content: flex-start;
}
.pa-responsable {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pa-tipo {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
  padding-left: 0.15rem;
}
.pa-tipo__ico {
  color: theme('colors.surface.800');
  font-size: 0.95rem;
}
.pa-tipo--inline {
  flex-wrap: nowrap;
  align-items: center;
}
.pa-tipo__lbl {
  flex-shrink: 0;
}
.pa-pct-cell {
  display: grid;
  grid-template-columns: minmax(3.6rem, 4.25rem) 2.45rem 3.35rem;
  align-items: center;
  justify-content: center;
  width: 100%;
  column-gap: 0.35rem;
  text-align: center;
  font-size: 12px;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.pa-pct-cell__val {
  min-width: 0;
  text-align: right;
}
.pa-delta {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  width: 3.25rem;
  min-width: 3.25rem;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  line-height: 1.2;
  white-space: nowrap;
  cursor: help;
}
.pa-delta__arrow {
  font-size: 9px;
  font-weight: 900;
}
.pa-delta--ok {
  color: #057a3d;
  background: rgba(0, 181, 85, 0.12);
}
.pa-delta--warn {
  color: #8a6100;
  background: rgba(240, 170, 0, 0.16);
}
.pa-delta--danger {
  color: #9b1c26;
  background: rgba(241, 70, 73, 0.14);
}
.pa-lock {
  color: var(--apex-color-re);
  font-size: 0.8rem;
}
.pa-lock--tipo {
  margin-left: -0.15rem;
}
.pa-info-tip {
  position: relative;
  display: inline-flex;
  align-items: center;
  color: var(--apex-color-g100);
  font-size: 0.82rem;
  cursor: help;
}
.pa-tooltip {
  position: absolute;
  z-index: 40;
  left: 50%;
  bottom: calc(100% + 0.5rem);
  transform: translateX(-50%);
  display: none;
  width: max-content;
  max-width: 17rem;
  padding: 0.5rem 0.65rem;
  border: 1px solid #dbe2ea;
  border-radius: 8px;
  background: #ffffff;
  color: theme('colors.surface.800');
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.35;
  text-align: left;
  white-space: normal;
  pointer-events: none;
}
.pa-tooltip::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -5px;
  width: 8px;
  height: 8px;
  transform: translateX(-50%) rotate(45deg);
  border-right: 1px solid #dbe2ea;
  border-bottom: 1px solid #dbe2ea;
  background: #fff;
}
.pa-delta:hover .pa-tooltip,
.pa-delta:focus-within .pa-tooltip,
.pa-info-tip:hover .pa-tooltip,
.pa-info-tip:focus .pa-tooltip {
  display: block;
}
.pa-badge-sub {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(19, 97, 185, 0.1);
  color: theme('colors.surface.800');
  border: 1px solid rgba(19, 97, 185, 0.25);
}
/* Tag compacto para tablas: ajusta el IsTag del kit a la densidad de la grilla. */
.pa-tag.p-tag {
  padding: 2px 9px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.pa-est-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.pa-est-cell__alert {
  color: var(--apex-color-re);
  font-size: 0.95rem;
}
.pa-est-inline {
  min-width: 8.5rem;
}
.pa-state {
  position: relative;
  display: inline-flex;
}
.pa-state__trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 7.8rem;
  justify-content: center;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: theme('colors.surface.500');
}
.pa-state__option {
  display: flex;
  justify-content: center;
  border: none;
  background: transparent;
  padding: 0.1rem;
  cursor: pointer;
  border-radius: 6px;
}
.pa-state__option:hover {
  background: var(--apex-surface-muted);
}
.pa-state__menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 0.35rem);
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 9.5rem;
  height: auto;
  max-height: none;
  overflow: visible;
  padding: 0.5rem;
  border: 1px solid var(--apex-border-soft);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
}
.pa-state__menu--overlay {
  position: fixed;
  z-index: 1100;
  top: auto;
  left: auto;
  transform: none;
}
.pa__dep {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}
.pa__crit-badge {
  font-size: 11px;
  font-weight: 700;
  color: #9b1c26;
  white-space: nowrap;
}
.pa__lock {
  color: theme('colors.surface.800');
  font-size: 1rem;
}
.pa__ico-row {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* ISAC-like visual refinement */
.pa__title,
.pa-grupo__title {
  color: var(--apex-text-strong);
}

.pa__hint,
.pa__legend-note,
.pa-grupo__meta {
  color: var(--apex-text-muted);
}

/* Cabecera del hito en blanco; el acento de estado vive en el borde izquierdo de la tarjeta */
.pa-grupo__head {
  background: #ffffff;
}

.pa-code {
  border-radius: 8px;
}
.pa-code--actividad {
  background: rgba(85, 172, 237, 0.18);
  color: #0b5f98;
}
/* Código de hito neutro (gris), como el mockup; el color de estado vive en el riel y el tag */
.pa-code--hito {
  background: #f1f5f9;
  color: #475569;
}

</style>

<style>
.pa__table .pa-row--cerrado > td {
  color: #767676;
}
.pa-desc--cerrado {
  text-decoration: line-through;
  color: #767676;
}
</style>
