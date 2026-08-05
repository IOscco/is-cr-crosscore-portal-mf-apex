<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter, RouterLink } from 'vue-router';
import { IsButton, IsColumn, IsDataTable, IsDialog, IsInputText, IsSelect, IsTag, useToast } from 'is-uikit-components-vue';
import { estatusGeneralToTag } from '@/lib/tag-ui';
import type { ProyectoPocRow } from '@/types/poc-data';
import { useProyectosPocStore } from '@/stores/proyectosPoc';
import type {
  PendienteActivoResumenApi,
  ProyectoDetailApi,
  ProyectoDocumentoApi,
  ProyectoIndicadoresResponse,
  ProximoVencimientoApi,
  ProximoVencimientoGestionApi,
  ResumenKpisApi,
} from '@/lib/proyectos-api';
import {
  deleteProyectoDocumento,
  fetchProyectoDetail,
  fetchProyectoIndicadores,
  fetchProyectoDocumentos,
  uploadProyectoDocumento,
  fetchProyectoDocumentoDescargaUrl,
} from '@/lib/proyectos-api';
import { fetchActividadesDeProyecto, type ActividadGrupoApi, type ActividadItemApi } from '@/lib/actividades-api';
import { mapProyectoDetailApiToPocRow } from './detail-mapper';
import { calcularAvancePlanificadoProyecto, calcularFechaFinPlanProyecto } from './proyecto-fechas-ui';
import DocumentoPreviewModal from './DocumentoPreviewModal.vue';
import ProyectoActividadesSection from './ProyectoActividadesSection.vue';
import ProyectoCronogramaSection from './ProyectoCronogramaSection.vue';
import ProyectoDatosProyectoEditor from './ProyectoDatosProyectoEditor.vue';
import ProyectoIndicadoresPanel from './ProyectoIndicadoresPanel.vue';
import { usePortalAccess } from '@/modules/shared/composables/usePortalAccess';

type DetalleTab = 'resumen' | 'detalle' | 'pendientes' | 'cronograma' | 'indicadores' | 'documentos';

const route = useRoute();
const router = useRouter();
const store = useProyectosPocStore();
const { canManageProyectos } = usePortalAccess();
const id = computed(() => String(route.params.id ?? ''));

const apiRow = ref<ProyectoPocRow | null>(null);
const apiDetail = ref<ProyectoDetailApi | null>(null);
const actividadesSectionRef = ref<InstanceType<typeof ProyectoActividadesSection> | null>(null);
/** Se incrementa tras cada refresco de detalle para que Actividades y Cronograma vuelvan a cargar listas desde API. */
const detailRevision = ref(0);

const activeTab = ref<DetalleTab>('resumen');
const visitedTabs = ref<Set<DetalleTab>>(new Set(['resumen']));

const indicadoresPayload = ref<ProyectoIndicadoresResponse | null>(null);
const indicadoresLoading = ref(false);
const documentosList = ref<ProyectoDocumentoApi[]>([]);
const documentosGrupos = ref<ActividadGrupoApi[]>([]);
const documentosGcsActivo = ref(false);
/** Si true, el GET de documentos falló (401, red, etc.): no confundir con «falta bucket». */
const documentosFetchFailed = ref(false);
const documentosLoading = ref(false);
const documentosUploading = ref(false);
const documentosSearch = ref('');
const documentosHitoFilter = ref('');
const documentosTipoFilter = ref('');
const pendientesGrupos = ref<ActividadGrupoApi[]>([]);
const pendientesLoading = ref(false);
const pendientesTipoFilter = ref('');
const pendientesEstadoFilter = ref('');
const pendientesSoloBloqueantesActivos = ref(false);
const pendienteDestacadoId = ref<string | null>(null);
const archivoDocumentoInput = ref<HTMLInputElement | null>(null);
const documentoModalOpen = ref(false);
const documentoAsociarA = ref('');
const documentoModalFileInput = ref<HTMLInputElement | null>(null);
const documentoModalFiles = ref<File[]>([]);
const docPreviewOpen = ref(false);
const docPreviewDoc = ref<ProyectoDocumentoApi | null>(null);
const docPreviewUrl = ref('');

const toast = useToast();

const canGestor = computed(() => canManageProyectos.value);

type SquadAsignadoDto = {
  id: string;
  nombre: string;
  miembros?: { id: string; rol: string; usuarioNombre: string }[];
};

const squadAsignado = computed(() => {
  const raw = apiDetail.value?.proyecto?.squadAsignado as SquadAsignadoDto | undefined | null;
  return raw?.id ? raw : null;
});

function tabFromQuery(q: unknown): DetalleTab {
  const t = typeof q === 'string' ? q : '';
  if (t === 'actividades' || t === 'detalle') {
    return 'detalle';
  }
  if (t === 'pendientes' || t === 'cronograma' || t === 'indicadores' || t === 'documentos') {
    return t;
  }
  return 'resumen';
}

watch(
  () => route.query.tab,
  (q) => {
    activeTab.value = tabFromQuery(q);
    visitedTabs.value.add(activeTab.value);
  },
  { immediate: true },
);

function setTab(t: DetalleTab): void {
  activeTab.value = t;
  visitedTabs.value.add(t);
  const nextQuery = { ...route.query } as Record<string, string | string[] | undefined>;
  if (t === 'resumen') {
    delete nextQuery.tab;
  } else {
    nextQuery.tab = t;
  }
  void router.replace({ path: route.path, query: nextQuery });
}

async function refreshProyectoDetail(): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id.value)) {
    return;
  }
  try {
    const d = await fetchProyectoDetail(id.value);
    apiDetail.value = d;
    apiRow.value = mapProyectoDetailApiToPocRow(d);
    void loadPendientes();
    detailRevision.value += 1;
  } catch {
    apiDetail.value = null;
    apiRow.value = null;
  }
}

async function loadIndicadores(): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id.value)) {
    return;
  }
  indicadoresLoading.value = true;
  try {
    indicadoresPayload.value = await fetchProyectoIndicadores(id.value);
  } catch {
    indicadoresPayload.value = null;
  } finally {
    indicadoresLoading.value = false;
  }
}

async function loadDocumentos(): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id.value)) {
    return;
  }
  documentosLoading.value = true;
  documentosFetchFailed.value = false;
  documentosGcsActivo.value = false;
  try {
    const r = await fetchProyectoDocumentos(id.value);
    documentosGrupos.value = await fetchActividadesDeProyecto(id.value, true);
    documentosList.value = r.data;
    documentosGcsActivo.value = r.almacenamientoGcsActivo ?? false;
  } catch {
    documentosList.value = [];
    documentosGrupos.value = [];
    documentosFetchFailed.value = true;
  } finally {
    documentosLoading.value = false;
  }
}

async function loadPendientes(): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id.value)) {
    return;
  }
  pendientesLoading.value = true;
  try {
    pendientesGrupos.value = await fetchActividadesDeProyecto(id.value, true);
  } catch {
    pendientesGrupos.value = [];
  } finally {
    pendientesLoading.value = false;
  }
}

watch(activeTab, (t) => {
  if (t === 'indicadores') {
    void loadIndicadores();
  }
  if (t === 'pendientes') {
    void loadPendientes();
  }
  if (t === 'documentos') {
    void loadDocumentos();
  }
});

watch(id, () => {
  if (activeTab.value === 'documentos') {
    void loadDocumentos();
  }
});

onMounted(async () => {
  store.hydrate();
  await refreshProyectoDetail();
});

const row = computed(() => apiRow.value ?? store.allRows.find((r) => r.id === id.value) ?? null);

const kpis = computed<ResumenKpisApi | null>(() => apiDetail.value?.resumen?.kpis ?? null);

const estatusTag = computed(() => estatusGeneralToTag(row.value?.estatusGeneral ?? ''));

const fechaFinPlanCalculada = computed(() => {
  const fromGroups = calcularFechaFinPlanProyecto(pendientesGrupos.value);
  if (fromGroups) {
    return fromGroups;
  }
  return (apiDetail.value?.hitos ?? []).reduce((max, h) => {
    const f = String(h.fechaFinPlan ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(f) && f > max ? f : max;
  }, '');
});

const avancePlanificadoCalculado = computed(() =>
  calcularAvancePlanificadoProyecto(
    row.value?.fechaInicio ?? '',
    fechaFinPlanCalculada.value || (row.value?.fechaFinPlanificada ?? ''),
  ),
);

const proximos = computed<ProximoVencimientoApi[]>(() => apiDetail.value?.resumen?.proximosVencimientos ?? []);

function kpiHitosSubtexto(k: ResumenKpisApi): string {
  const detalle = String(k.avanceHitosDetalle ?? '');
  const m = detalle.match(/(\d+)\s+de\s+(\d+)\s+hitos/i);
  if (m) {
    return `${m[1]} de ${m[2]} hitos completados`;
  }
  return `0 de ${k.hitosTotal ?? 0} hitos completados`;
}

function pctValue(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(Number(value))) {
    return 0;
  }
  return Math.min(100, Math.max(0, Number(value)));
}

function kpiPlanValue(k: ResumenKpisApi): string {
  const v = avancePlanificadoCalculado.value ?? k.avancePlanificadoPct;
  return v == null ? '—' : `${v}%`;
}

function kpiRealPendiente(k: ResumenKpisApi): boolean {
  return k.saludProyecto === 'gris';
}

function kpiRealValue(k: ResumenKpisApi): string {
  return kpiRealPendiente(k) ? 'Pend.' : `${k.avanceRealPct}%`;
}

function brechaLabel(k: ResumenKpisApi): string {
  if (kpiRealPendiente(k) || k.planVsRealDesfasePct == null || k.planVsRealDesfasePct === 0) {
    return 'Sin brecha';
  }
  return `Brecha: ${Math.abs(k.planVsRealDesfasePct)}%`;
}

const proximosPorHito = computed(() => {
  const hitoFechas = new Map<string, string>();
  for (const h of apiDetail.value?.hitos ?? []) {
    const nombre = String(h.nombre ?? '').trim() || '—';
    const fecha = String(h.fechaFinPlan ?? '').trim();
    hitoFechas.set(nombre, fecha);
  }
  const grupos = new Map<
    string,
    { hitoNombre: string; fechaLimite: string; actividades: ProximoVencimientoApi[] }
  >();
  for (const it of proximos.value) {
    const hitoNombre = String(it.hitoNombre ?? '').trim();
    if (!hitoNombre || hitoNombre === '—') {
      continue;
    }
    const current =
      grupos.get(hitoNombre) ?? {
        hitoNombre,
        fechaLimite: hitoFechas.get(hitoNombre) ?? '',
        actividades: [],
      };
    current.actividades.push(it);
    grupos.set(hitoNombre, current);
  }
  return [...grupos.values()]
    .map((g) => ({
      ...g,
      actividades: [...g.actividades].sort((a, b) => a.fechaFinPlan.localeCompare(b.fechaFinPlan)),
    }))
    .sort((a, b) => {
      const fa = a.fechaLimite || '9999-12-31';
      const fb = b.fechaLimite || '9999-12-31';
      if (fa !== fb) {
        return fa.localeCompare(fb);
      }
      return a.hitoNombre.localeCompare(b.hitoNombre, 'es');
    });
});

const pendientesActivosLista = computed<PendienteActivoResumenApi[]>(
  () => apiDetail.value?.resumen?.pendientesActivosLista ?? [],
);
const pendientesBloqueantesActivos = computed<PendienteActivoResumenApi[]>(() =>
  pendientesActivosLista.value.filter((p) => p.esDependencia === true),
);
const pendientesNoBloqueantesActivos = computed<PendienteActivoResumenApi[]>(() =>
  pendientesActivosLista.value.filter((p) => p.esDependencia !== true),
);

function abrirActividadDesdeResumen(actId: string): void {
  setTab('detalle');
  void nextTick(() => {
    void nextTick(() => {
      actividadesSectionRef.value?.openDetalleActividad(actId);
    });
  });
}

function resaltarPendiente(idPendiente?: string): void {
  if (!idPendiente) return;
  pendienteDestacadoId.value = idPendiente;
  void nextTick(() => {
    document.querySelector('.pdet-row--highlight')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  window.setTimeout(() => {
    if (pendienteDestacadoId.value === idPendiente) pendienteDestacadoId.value = null;
  }, 2000);
}

function verPendientesBloqueantes(): void {
  pendientesTipoFilter.value = 'Bloqueante';
  pendientesEstadoFilter.value = '';
  pendientesSoloBloqueantesActivos.value = true;
  setTab('pendientes');
}

function abrirProximoVencimiento(item: ProximoVencimientoGestionApi): void {
  if (item.tipo === 'actividad') {
    abrirActividadDesdeResumen(item.id);
    return;
  }
  pendientesTipoFilter.value = 'Bloqueante';
  pendientesEstadoFilter.value = '';
  pendientesSoloBloqueantesActivos.value = true;
  setTab('pendientes');
  void nextTick(() => resaltarPendiente(item.id));
}

function formatIsoEs(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso || '—';
  }
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatDocFecha(iso: string): string {
  const s = String(iso || '').trim();
  if (!s) {
    return '—';
  }
  const day = s.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return formatIsoEs(day);
  }
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
    }
  } catch {
    /* vacío */
  }
  return s;
}

function responsableNombre(value: string): string {
  return String(value ?? '').replace(/^[^:]{1,60}:\s*/, '').trim() || '—';
}

function abrirSelectorDocumento(): void {
  if (!canGestor.value) {
    return;
  }
  documentoModalOpen.value = true;
  documentoModalFiles.value = [];
  documentoAsociarA.value = '';
}

async function onArchivoDocumentoSeleccionado(ev: Event): Promise<void> {
  if (!canGestor.value) {
    return;
  }
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || !/^[0-9a-f-]{36}$/i.test(id.value)) {
    return;
  }
  documentosUploading.value = true;
  try {
    await uploadProyectoDocumento(id.value, file);
    toast.add({ severity: 'success', summary: 'Documento adjuntado', life: 3000 });
    await loadDocumentos();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudo subir el archivo.';
    toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 6000 });
  } finally {
    documentosUploading.value = false;
  }
}

function abrirSelectorDocumentoModal(): void {
  documentoModalFileInput.value?.click();
}

function onDocumentoModalFiles(ev: Event): void {
  const input = ev.target as HTMLInputElement;
  documentoModalFiles.value = Array.from(input.files ?? []);
  input.value = '';
}

const documentoAsociarOptions = computed(() => {
  const opts: { value: string; label: string }[] = [];
  for (const g of documentosGrupos.value) {
    opts.push({ value: `hito:${g.hitoId}`, label: g.hitoNombre });
    const pushAct = (a: ActividadItemApi, pref = '  '): void => {
      opts.push({ value: `actividad:${a.id}`, label: `${pref}${a.nombre}` });
      for (const s of a.subtareas ?? []) {
        pushAct(s, `${pref}  `);
      }
    };
    for (const a of g.items ?? []) {
      pushAct(a);
    }
    for (const p of g.pendientesNivelHito ?? []) {
      pushAct(p);
    }
  }
  return opts;
});

async function guardarDocumentoModal(): Promise<void> {
  if (!canGestor.value) {
    return;
  }
  if (!documentoModalFiles.value.length || !/^[0-9a-f-]{36}$/i.test(id.value)) {
    return;
  }
  documentosUploading.value = true;
  try {
    const assocRaw = documentoAsociarA.value;
    const assoc =
      assocRaw.startsWith('hito:')
        ? { hitoId: assocRaw.slice(5), actividadId: null }
        : assocRaw.startsWith('actividad:')
          ? { actividadId: assocRaw.slice(10), hitoId: null }
          : undefined;
    for (const file of documentoModalFiles.value) {
      await uploadProyectoDocumento(id.value, file, assoc);
    }
    documentoModalOpen.value = false;
    await loadDocumentos();
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: err instanceof Error ? err.message : 'No se pudo subir.', life: 5000 });
  } finally {
    documentosUploading.value = false;
  }
}

async function abrirDescargaDocumento(doc: ProyectoDocumentoApi): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id.value)) {
    return;
  }
  try {
    const url = await fetchProyectoDocumentoDescargaUrl(id.value, doc.id);
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudo obtener el enlace de descarga.';
    toast.add({ severity: 'error', summary: 'Error', detail: msg, life: 6000 });
  }
}

async function abrirPreviewDocumento(doc: ProyectoDocumentoApi): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id.value)) {
    return;
  }
  try {
    docPreviewUrl.value = await fetchProyectoDocumentoDescargaUrl(id.value, doc.id);
    docPreviewDoc.value = doc;
    docPreviewOpen.value = true;
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: err instanceof Error ? err.message : 'No se pudo abrir.', life: 5000 });
  }
}

async function eliminarDocumento(doc: ProyectoDocumentoApi): Promise<void> {
  if (!canGestor.value) {
    return;
  }
  if (!/^[0-9a-f-]{36}$/i.test(id.value)) {
    return;
  }
  await deleteProyectoDocumento(id.value, doc.id);
  await loadDocumentos();
}

type DocumentoTablaRow = ProyectoDocumentoApi & {
  ubicacion: string;
  hitoNombre: string;
  tipoGrupo: 'pdf' | 'docx' | 'xlsx' | 'imagen' | 'otros';
};

const documentoHitoOptions = computed(() => [
  { value: '', label: 'Todos los hitos' },
  ...documentosGrupos.value.map((g) => ({ value: g.hitoId, label: g.hitoNombre })),
  { value: 'general', label: 'General' },
]);

const documentoTipoOptions = [
  { value: '', label: 'Todos los tipos' },
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'DOCX' },
  { value: 'xlsx', label: 'XLSX' },
  { value: 'imagen', label: 'Imagen' },
  { value: 'otros', label: 'Otros' },
];

function documentoTipoGrupo(doc: ProyectoDocumentoApi): DocumentoTablaRow['tipoGrupo'] {
  const ct = String(doc.contentType || doc.tipo || '').toLowerCase();
  const name = doc.nombreArchivo.toLowerCase();
  if (ct.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (ct.includes('word') || name.endsWith('.doc') || name.endsWith('.docx')) return 'docx';
  if (ct.includes('sheet') || ct.includes('excel') || name.endsWith('.xls') || name.endsWith('.xlsx')) return 'xlsx';
  if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) return 'imagen';
  return 'otros';
}

function documentoIcon(doc: DocumentoTablaRow): string {
  if (doc.tipoGrupo === 'pdf') return 'pi pi-file-pdf';
  if (doc.tipoGrupo === 'docx') return 'pi pi-file-word';
  if (doc.tipoGrupo === 'xlsx') return 'pi pi-file-excel';
  if (doc.tipoGrupo === 'imagen') return 'pi pi-image';
  return 'pi pi-file';
}

function formatBytes(bytes: number): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

const documentosTabla = computed<DocumentoTablaRow[]>(() => {
  const hitoNames = new Map(documentosGrupos.value.map((g) => [g.hitoId, g.hitoNombre]));
  const actividadNames = new Map<string, string>();
  const collect = (a: ActividadItemApi): void => {
    actividadNames.set(a.id, a.nombre);
    for (const child of a.subtareas ?? []) collect(child);
  };
  for (const g of documentosGrupos.value) {
    for (const a of g.items ?? []) collect(a);
    for (const p of g.pendientesNivelHito ?? []) collect(p);
  }
  return documentosList.value.map((doc) => {
    const hitoNombre = doc.hitoId ? hitoNames.get(doc.hitoId) ?? 'Hito' : 'General';
    const actividadNombre = doc.actividadId ? actividadNames.get(doc.actividadId) : '';
    return {
      ...doc,
      hitoNombre,
      ubicacion: actividadNombre ? `${hitoNombre} › ${actividadNombre}` : hitoNombre,
      tipoGrupo: documentoTipoGrupo(doc),
    };
  });
});

const documentosFiltrados = computed(() => {
  const query = documentosSearch.value.trim().toLowerCase();
  return documentosTabla.value.filter((doc) => {
    if (query && !doc.nombreArchivo.toLowerCase().includes(query)) return false;
    if (documentosHitoFilter.value === 'general' && doc.hitoId) return false;
    if (
      documentosHitoFilter.value &&
      documentosHitoFilter.value !== 'general' &&
      doc.hitoId !== documentosHitoFilter.value
    ) return false;
    if (documentosTipoFilter.value && doc.tipoGrupo !== documentosTipoFilter.value) return false;
    return true;
  });
});

type PendienteRow = {
  id: string;
  padreCodigo: string;
  nombre: string;
  tipo: 'Bloqueante' | 'No bloqueante';
  responsable: string;
  fechaFinPlan: string;
  estado: string;
};

const pendientesRows = computed<PendienteRow[]>(() => {
  const out: PendienteRow[] = [];
  let hitoN = 1;
  let actividadN = 1;
  for (const g of pendientesGrupos.value) {
    const hCode = `H${hitoN++}`;
    const actCodes = new Map<string, string>();
    for (const a of g.items ?? []) {
      if (a.tipo === 'actividad') {
        actCodes.set(a.id, `A${actividadN++}`);
      }
    }
    const pushPend = (p: ActividadItemApi, padreCodigo: string): void => {
      out.push({
        id: p.id,
        padreCodigo,
        nombre: p.nombre,
        tipo: p.esDependencia === true ? 'Bloqueante' : 'No bloqueante',
        responsable: responsableNombre(p.responsable),
        fechaFinPlan: p.fechaFinPlan,
        estado: p.estado,
      });
    };
    for (const p of g.pendientesNivelHito ?? []) {
      pushPend(p, hCode);
    }
    for (const a of g.items ?? []) {
      const aCode = actCodes.get(a.id) ?? hCode;
      for (const st of a.subtareas ?? []) {
        if (st.tipo === 'pendiente') {
          pushPend(st, aCode);
        }
      }
    }
  }
  return out;
});

const pendientesTipoOptions = [
  { value: '', label: 'Todos los tipos' },
  { value: 'Bloqueante', label: 'Bloqueante' },
  { value: 'No bloqueante', label: 'No bloqueante' },
];

const pendientesEstadoOptions = computed(() => [
  { value: '', label: 'Todos los estados' },
  ...Array.from(new Set(pendientesRows.value.map((p) => p.estado).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((estado) => ({ value: estado, label: estado })),
]);

const pendientesRowsFiltrados = computed(() =>
  pendientesRows.value.filter((p) => {
    if (
      pendientesSoloBloqueantesActivos.value &&
      (p.tipo !== 'Bloqueante' || ['Cerrado', 'Desestimado'].includes(p.estado))
    ) {
      return false;
    }
    if (pendientesTipoFilter.value && p.tipo !== pendientesTipoFilter.value) {
      return false;
    }
    if (pendientesEstadoFilter.value && p.estado !== pendientesEstadoFilter.value) {
      return false;
    }
    return true;
  }),
);

function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportPendientesCsv(): void {
  const header = ['Codigo padre', 'Nombre del pendiente', 'Tipo', 'Responsable', 'Fecha fin planificada', 'Estado'];
  const lines = [
    header.join(';'),
    ...pendientesRowsFiltrados.value.map((p) =>
      [p.padreCodigo, p.nombre, p.tipo, p.responsable, formatIsoEs(p.fechaFinPlan), p.estado].map(csvEscape).join(';'),
    ),
  ];
  const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `pendientes-${id.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function textoProximo(it: ProximoVencimientoApi): string {
  if (it.vencida) {
    return `Vencida hace ${it.diasVencido} día${it.diasVencido === 1 ? '' : 's'}`;
  }
  if (it.diasRestantes === 0) {
    return 'Vence hoy';
  }
  return `${it.diasRestantes} día${it.diasRestantes === 1 ? '' : 's'} restantes`;
}

const tabs: { id: DetalleTab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'detalle', label: 'Detalle' },
  { id: 'pendientes', label: 'Pendientes' },
  { id: 'cronograma', label: 'Cronograma' },
  { id: 'indicadores', label: 'Indicadores' },
  { id: 'documentos', label: 'Documentos' },
];
</script>

<template>
  <div class="pdet">
    <template v-if="row">
      <div class="pdet__sticky">
        <nav class="pdet__crumb" aria-label="Miga de pan">
          <RouterLink class="pdet__crumb-link" :to="{ name: 'proyectos' }">Apex</RouterLink>
          <span class="pdet__crumb-sep" aria-hidden="true">›</span>
          <RouterLink class="pdet__crumb-link" :to="{ name: 'proyectos' }">Proyectos</RouterLink>
          <span class="pdet__crumb-sep" aria-hidden="true">›</span>
          <span class="pdet__crumb-current">{{ row.epica || 'Proyecto' }}</span>
        </nav>

        <header class="pdet__head">
          <div class="pdet__head-main">
            <h1 class="pdet__title">{{ row.epica || 'Proyecto' }}</h1>
          </div>
          <div class="pdet__head-meta">
            <IsTag
              v-if="row.estatusGeneral"
              rounded
              :class="['pdet__status-pill', estatusTag.toneClass]"
              :severity="estatusTag.severity"
              :value="row.estatusGeneral"
              :title="row.estatusGeneral"
            />
            <span class="pdet__meta-chip"><i class="pi pi-bookmark" aria-hidden="true" />Tipo: {{ row.tipoIniciativa || '—' }}</span>
            <span class="pdet__meta-chip"><i class="pi pi-calendar" aria-hidden="true" />Inicio plan: {{ formatIsoEs(row.fechaInicio ?? '') }}</span>
            <span class="pdet__meta-chip"><i class="pi pi-flag" aria-hidden="true" />Fin plan: {{ formatIsoEs(fechaFinPlanCalculada || row.fechaFinPlanificada || '') }}</span>
          </div>
        </header>

        <div class="pdet__tabs" role="tablist" aria-label="Secciones del proyecto">
          <button
            v-for="t in tabs"
            :key="t.id"
            type="button"
            role="tab"
            class="pdet__tab"
            :class="{ 'pdet__tab--active': activeTab === t.id }"
            :aria-selected="activeTab === t.id"
            @click="setTab(t.id)"
          >
            {{ t.label }}
          </button>
        </div>
      </div>

      <!-- Resumen -->
      <section v-show="activeTab === 'resumen'" class="pdet__panel" role="tabpanel">
        <template v-if="kpis">
          <h2 class="pdet__block-title">Indicadores clave</h2>
          <div class="pdet__kpi-row pdet__kpi-row--3">
            <article
              class="pdet__kpi pdet__kpi--compact"
              :class="`pdet__kpi--sem-${kpis.avanceHitosBadge ?? 'verde'}`"
            >
              <p class="pdet__kpi-lbl">% Avance por hitos</p>
              <p class="pdet__kpi-val">{{ kpis.porcentajeAvanceHitos }}%</p>
              <p class="pdet__kpi-sub">{{ kpiHitosSubtexto(kpis) }}</p>
            </article>
            <article class="pdet__kpi pdet__kpi--compact">
              <p class="pdet__kpi-lbl">% Avance Planificado</p>
              <p class="pdet__kpi-val">{{ kpiPlanValue(kpis) }}</p>
              <p class="pdet__kpi-sub">Avance esperado según cronograma</p>
            </article>
            <article class="pdet__kpi pdet__kpi--compact">
              <p class="pdet__kpi-lbl">% Avance Real</p>
              <p class="pdet__kpi-val">{{ kpiRealValue(kpis) }}</p>
              <p class="pdet__kpi-sub">Ingresado manualmente</p>
            </article>
          </div>
          <div class="pdet__kpi-row pdet__kpi-row--2">
            <article class="pdet__kpi pdet__kpi--compact">
              <p class="pdet__kpi-lbl">
                Actividades totales
                <span class="pdet__info-tip" tabindex="0" aria-label="Número total de actividades registradas en el proyecto.">
                  <i class="pi pi-info-circle" aria-hidden="true" />
                  <span class="pdet__tooltip">Número total de actividades registradas en el proyecto.</span>
                </span>
              </p>
              <p class="pdet__kpi-val">{{ kpis.actividadesTotal }}</p>
            </article>
            <article
              class="pdet__kpi pdet__kpi--compact"
              :class="{ 'pdet__kpi--border-alert': kpis.pendientesActivosBordeCritico }"
            >
              <p class="pdet__kpi-lbl">
                Actividades activas
                <span class="pdet__info-tip" tabindex="0" aria-label="Número de actividades que no están en estado Cerrado.">
                  <i class="pi pi-info-circle" aria-hidden="true" />
                  <span class="pdet__tooltip">Número de actividades que no están en estado Cerrado.</span>
                </span>
              </p>
              <p class="pdet__kpi-val">{{ kpis.actividadesActivas }}</p>
            </article>
          </div>
          <div class="pdet__kpi-dual" :class="`pdet__kpi-dual--${kpis.saludProyecto ?? kpis.planVsRealBadge ?? 'verde'}`">
            <p class="pdet__kpi-dual__label">% Avance Planificado vs. Real</p>
            <div class="pdet__compare">
              <div class="pdet__compare-row">
                <div class="pdet__compare-head">
                  <span>Planificado</span>
                  <strong>{{ kpiPlanValue(kpis) }}</strong>
                </div>
                <div class="pdet__compare-track" aria-hidden="true">
                  <span class="pdet__compare-bar pdet__compare-bar--plan" :style="{ width: `${pctValue(avancePlanificadoCalculado ?? kpis.avancePlanificadoPct)}%` }" />
                </div>
              </div>
              <div class="pdet__compare-row">
                <div class="pdet__compare-head">
                  <span>Real</span>
                  <strong>{{ kpiRealPendiente(kpis) ? 'Pendiente' : `${kpis.avanceRealPct}%` }}</strong>
                </div>
                <div class="pdet__compare-track" :class="{ 'pdet__compare-track--empty': kpiRealPendiente(kpis) }" aria-hidden="true">
                  <span
                    v-if="!kpiRealPendiente(kpis)"
                    class="pdet__compare-bar pdet__compare-bar--real"
                    :style="{ width: `${pctValue(kpis.avanceRealPct)}%` }"
                  />
                </div>
              </div>
            </div>
            <p class="pdet__kpi-dual__val">{{ brechaLabel(kpis) }}</p>
          </div>
        </template>

        <template v-if="row.origen !== 'program-board' && apiDetail">
          <ProyectoDatosProyectoEditor
            :proyecto-id="id"
            :can-edit="canGestor"
            :nombre="row.epica ?? ''"
            :descripcion="row.descripcion ?? ''"
            :responsable-tl="row.tl ?? ''"
            :es-evolution="row.esEvolution ?? false"
            :fecha-inicio="row.fechaInicio ?? ''"
            :fecha-fin="fechaFinPlanCalculada || row.fechaFinPlanificada || ''"
            :integrantes="row.integrantesEquipo ?? []"
            :squad-asignado="squadAsignado"
            @saved="refreshProyectoDetail"
          />

          <template v-if="row.dependenciaOtraActividadHito != null">
            <h3 class="pdet__sec">Dependencia actividad del hito</h3>
            <p class="pdet__hint-line">
              {{ row.dependenciaOtraActividadHito ? 'Sí' : 'No' }}
              <template v-if="row.dependenciaOtraActividadHito && row.actividadHitoDependencia">
                — {{ row.actividadHitoDependencia }}
              </template>
            </p>
          </template>
        </template>

        <h2 class="pdet__block-title">Próximos vencimientos</h2>
        <div v-if="proximosPorHito.length" class="pdet__prox-groups">
          <details v-for="grupo in proximosPorHito" :key="grupo.hitoNombre" class="pdet__prox-group" open>
            <summary class="pdet__prox-summary">
              <span class="pdet__prox-summary-main">
                <span class="pdet__prox-hito">{{ grupo.hitoNombre }}</span>
                <span class="pdet__prox-count">{{ grupo.actividades.length }} {{ grupo.actividades.length === 1 ? 'actividad' : 'actividades' }}</span>
              </span>
              <span v-if="grupo.fechaLimite" class="pdet__prox-date">Límite {{ formatIsoEs(grupo.fechaLimite) }}</span>
            </summary>
            <ul class="pdet__prox-rows">
          <li
            v-for="it in grupo.actividades"
            :key="it.id"
            class="pdet__prox-row pdet__prox-li--action"
            role="button"
            tabindex="0"
            title="Abrir detalle en Actividades"
            @click="abrirActividadDesdeResumen(it.id)"
            @keydown.enter.prevent="abrirActividadDesdeResumen(it.id)"
            @keydown.space.prevent="abrirActividadDesdeResumen(it.id)"
          >
            <span class="pdet__prox-icon" aria-hidden="true">
              <i class="pi pi-check-square" />
            </span>
            <span class="pdet__prox-row-main">
              <span class="pdet__prox-nombre">{{ it.nombre }}</span>
              <span class="pdet__prox-meta">{{ it.tipoLabel }} · {{ it.hitoNombre }}</span>
              <span class="pdet__prox-meta">Responsable: {{ it.responsable }}</span>
            </span>
            <span
              class="pdet__prox-dias"
              :class="{
                'pdet__prox-dias--rojo': it.vencida,
                'pdet__prox-dias--ambar': !it.vencida && it.diasRestantes === 0,
              }"
            >
              {{ textoProximo(it) }}
            </span>
          </li>
            </ul>
          </details>
        </div>
        <p v-else class="pdet__empty">No hay actividades próximas a vencer en los estados considerados.</p>

        <template v-if="pendientesActivosLista.length">
          <h3 class="pdet__pend-title">Pendientes activos</h3>
          <p class="pdet__pend-sub">
            Pendientes en Abierto, En progreso o Bloqueado, o con fecha límite vencida y sin cerrar.
          </p>
          <div class="pdet__pend-groups">
          <section v-if="pendientesBloqueantesActivos.length" class="pdet__pend-group pdet__pend-group--hard">
          <h4 class="pdet__pend-group-title">Bloqueantes <span>{{ pendientesBloqueantesActivos.length }}</span></h4>
          <ul class="pdet__pend">
            <li
              v-for="p in pendientesBloqueantesActivos"
              :key="p.id"
              class="pdet__pend-li pdet__pend-li--hard pdet__prox-li--action"
              role="button"
              tabindex="0"
              title="Abrir detalle en Actividades"
              @click="abrirActividadDesdeResumen(p.id)"
              @keydown.enter.prevent="abrirActividadDesdeResumen(p.id)"
              @keydown.space.prevent="abrirActividadDesdeResumen(p.id)"
            >
              <div class="pdet__prox-main">
                <span class="pdet__prox-nombre">{{ p.nombre }}</span>
                <span class="pdet__prox-meta">{{ p.hitoNombre }} · {{ p.estado }}</span>
                <span class="pdet__prox-meta">Responsable: {{ p.responsable }}</span>
              </div>
              <span
                class="pdet__prox-dias"
                :class="{ 'pdet__prox-dias--rojo': p.vencida, 'pdet__prox-dias--ambar': !p.vencida }"
              >
                <template v-if="p.fechaLimite !== '—'">Límite {{ formatIsoEs(p.fechaLimite) }}</template>
                <template v-else>Sin fecha límite</template>
                <template v-if="p.vencida"> · Vencida</template>
              </span>
            </li>
          </ul>
          </section>

          <section v-if="pendientesNoBloqueantesActivos.length" class="pdet__pend-group">
          <h4 class="pdet__pend-group-title">No bloqueantes <span>{{ pendientesNoBloqueantesActivos.length }}</span></h4>
          <ul class="pdet__pend">
            <li
              v-for="p in pendientesNoBloqueantesActivos"
              :key="p.id"
              class="pdet__pend-li pdet__prox-li--action"
              role="button"
              tabindex="0"
              title="Abrir detalle en Actividades"
              @click="abrirActividadDesdeResumen(p.id)"
              @keydown.enter.prevent="abrirActividadDesdeResumen(p.id)"
              @keydown.space.prevent="abrirActividadDesdeResumen(p.id)"
            >
              <div class="pdet__prox-main">
                <span class="pdet__prox-nombre">{{ p.nombre }}</span>
                <span class="pdet__prox-meta">{{ p.hitoNombre }} · {{ p.estado }}</span>
                <span class="pdet__prox-meta">Responsable: {{ p.responsable }}</span>
              </div>
              <span
                class="pdet__prox-dias"
                :class="{ 'pdet__prox-dias--rojo': p.vencida, 'pdet__prox-dias--ambar': !p.vencida }"
              >
                <template v-if="p.fechaLimite !== '—'">Límite {{ formatIsoEs(p.fechaLimite) }}</template>
                <template v-else>Sin fecha lÃ­mite</template>
                <template v-if="p.vencida"> · Vencida</template>
              </span>
            </li>
          </ul>
          </section>
          </div>
        </template>
      </section>

      <!-- Detalle -->
      <section v-show="activeTab === 'detalle'" class="pdet__panel" role="tabpanel">
        <ProyectoActividadesSection
          v-if="visitedTabs.has('detalle') && apiDetail"
          ref="actividadesSectionRef"
          :proyecto-id="id"
          :proyecto-nombre="row.epica || 'Proyecto'"
          :hitos="apiDetail.hitos"
          :integrantes="row.integrantesEquipo ?? []"
          :can-gestor="canGestor"
          :detail-revision="detailRevision"
          :kpis="kpis"
          :avance-planificado="avancePlanificadoCalculado"
          :proximos-vencimientos="proximos"
          :pendientes-activos="pendientesActivosLista"
          :proximo-vencimiento="apiDetail.resumen?.proximoVencimiento ?? null"
          :fecha-fin-plan="fechaFinPlanCalculada || row.fechaFinPlanificada || ''"
          @refresh-detail="refreshProyectoDetail"
          @ver-pendientes-criticos="verPendientesBloqueantes"
          @ver-vencimientos="setTab('resumen')"
          @ver-historial="router.push({ name: 'config-auditoria-logs' })"
        />
        <p v-else-if="!apiDetail" class="pdet__empty">Cargando actividades…</p>
      </section>

      <!-- Pendientes -->
      <section v-show="activeTab === 'pendientes'" class="pdet__panel" role="tabpanel">
        <div class="pdet__pend-head">
          <h2 class="pdet__block-title pdet__block-title--flush">Pendientes</h2>
          <IsButton severity="primary" outlined size="small" label="Exportar CSV" :disabled="!pendientesRowsFiltrados.length" @click="exportPendientesCsv" />
        </div>
        <div class="pdet__pend-filters">
          <IsSelect
            :model-value="pendientesTipoFilter"
            :options="pendientesTipoOptions"
            option-label="label"
            option-value="value"
            placeholder="Tipo"
            @update:model-value="(v) => { pendientesTipoFilter = String(v ?? ''); pendientesSoloBloqueantesActivos = false; }"
          />
          <IsSelect
            :model-value="pendientesEstadoFilter"
            :options="pendientesEstadoOptions"
            option-label="label"
            option-value="value"
            placeholder="Estado"
            @update:model-value="(v) => { pendientesEstadoFilter = String(v ?? ''); pendientesSoloBloqueantesActivos = false; }"
          />
        </div>
        <div v-if="pendientesLoading" class="pdet__skeleton-table" aria-label="Cargando pendientes" aria-busy="true">
          <div v-for="i in 6" :key="i" class="pdet__skeleton-row" :style="{ animationDelay: `${i * 60}ms` }">
            <span class="apex-skeleton pdet__skeleton-cell pdet__skeleton-cell--xs" />
            <span class="apex-skeleton pdet__skeleton-cell pdet__skeleton-cell--lg" />
            <span class="apex-skeleton pdet__skeleton-cell pdet__skeleton-cell--md" />
            <span class="apex-skeleton pdet__skeleton-cell pdet__skeleton-cell--md" />
            <span class="apex-skeleton pdet__skeleton-cell pdet__skeleton-cell--sm" />
            <span class="apex-skeleton pdet__skeleton-cell pdet__skeleton-cell--sm" />
          </div>
        </div>
        <IsDataTable
          v-else
          :value="pendientesRowsFiltrados"
          data-key="id"
          striped-rows
          class="pdet__pend-table"
          :pt="{ root: { class: 'p-datatable-sm' } }"
          :row-class="(data) => (pendienteDestacadoId === (data as PendienteRow).id ? 'pdet-row--highlight' : '')"
        >
          <template #empty>
            <span class="pdet__empty">No hay pendientes para mostrar.</span>
          </template>
          <IsColumn field="padreCodigo" header="Código padre" style="min-width: 8rem" />
          <IsColumn field="nombre" header="Nombre del pendiente" style="min-width: 16rem" />
          <IsColumn field="tipo" header="Tipo" style="min-width: 10rem" />
          <IsColumn field="responsable" header="Responsable" style="min-width: 12rem" />
          <IsColumn header="Fecha fin planificada" style="min-width: 10rem">
            <template #body="{ data }">{{ formatIsoEs((data as PendienteRow).fechaFinPlan) }}</template>
          </IsColumn>
          <IsColumn field="estado" header="Estado" style="min-width: 10rem" />
        </IsDataTable>
      </section>

      <!-- Cronograma -->
      <section v-show="activeTab === 'cronograma'" class="pdet__panel" role="tabpanel">
        <ProyectoCronogramaSection
          v-if="visitedTabs.has('cronograma') && apiDetail"
          :proyecto-id="id"
          :proyecto-nombre="row.epica || 'Proyecto'"
          :integrantes="row.integrantesEquipo ?? []"
          :can-gestor="canGestor"
          :detail-revision="detailRevision"
          @refresh-detail="refreshProyectoDetail"
        />
        <p v-else-if="!apiDetail" class="pdet__empty">Cargando cronograma…</p>
      </section>

      <!-- Indicadores -->
      <section v-show="activeTab === 'indicadores'" class="pdet__panel" role="tabpanel">
        <template v-if="indicadoresLoading">
          <div class="pdet__skeleton-indicators" aria-label="Calculando indicadores" aria-busy="true">
            <div class="pdet__kpi-row pdet__kpi-row--3">
              <div v-for="i in 3" :key="i" class="pdet__skeleton-kpi" :style="{ animationDelay: `${i * 80}ms` }">
                <span class="apex-skeleton" style="width: 65%; height: 0.7rem; margin-bottom: 0.65rem;" />
                <span class="apex-skeleton" style="width: 45%; height: 1.8rem; margin-bottom: 0.45rem;" />
                <span class="apex-skeleton" style="width: 80%; height: 0.65rem;" />
              </div>
            </div>
            <div class="pdet__kpi-row pdet__kpi-row--2" style="margin-top: 0.85rem;">
              <div v-for="i in 2" :key="i" class="pdet__skeleton-kpi" :style="{ animationDelay: `${(i + 3) * 80}ms` }">
                <span class="apex-skeleton" style="width: 55%; height: 0.7rem; margin-bottom: 0.65rem;" />
                <span class="apex-skeleton" style="width: 35%; height: 1.8rem;" />
              </div>
            </div>
          </div>
        </template>
        <ProyectoIndicadoresPanel
          v-else-if="indicadoresPayload"
          :detalle="indicadoresPayload.detalle"
          :proximo-vencimiento="apiDetail?.resumen?.proximoVencimiento"
          :actualizado-en="indicadoresPayload.actualizadoEn"
          @ver-pendientes="verPendientesBloqueantes"
          @abrir-vencimiento="abrirProximoVencimiento"
        />
        <p v-else class="pdet__empty">No se pudieron cargar los indicadores.</p>
      </section>

      <!-- Documentos -->
      <section v-show="activeTab === 'documentos'" class="pdet__panel pdet__panel--docs" role="tabpanel">
        <div class="pdet__docs-head">
          <h2 class="pdet__block-title pdet__block-title--flush">Documentos</h2>
          <input
            ref="archivoDocumentoInput"
            type="file"
            class="pdet__docs-file-input"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp,.zip"
            aria-hidden="true"
            tabindex="-1"
            @change="onArchivoDocumentoSeleccionado"
          />
          <IsButton
            v-if="canGestor"
            severity="primary"
            label="+ Adjuntar documento"
            :disabled="!documentosGcsActivo || documentosUploading || documentosFetchFailed"
            :loading="documentosUploading"
            :title="
              documentosFetchFailed
                ? 'No se pudo consultar el estado de almacenamiento. Revise sesión y URL del API.'
                : !documentosGcsActivo
                  ? 'Defina GCP_STORAGE_BUCKET en el backend y ADC local (gcloud auth application-default login)'
                  : undefined
            "
            class="pdet__docs-btn"
            @click="abrirSelectorDocumento"
          />
        </div>
        <div v-if="documentosLoading" class="pdet__skeleton-docs" aria-label="Cargando documentos" aria-busy="true">
          <div v-for="i in 4" :key="i" class="pdet__skeleton-doc-group" :style="{ animationDelay: `${i * 70}ms` }">
            <span class="apex-skeleton" style="width: 40%; height: 1rem; margin-bottom: 0.75rem;" />
            <div v-for="j in 2" :key="j" class="pdet__skeleton-doc-item">
              <span class="apex-skeleton" style="flex: 1; height: 0.875rem;" />
              <span class="apex-skeleton" style="width: 5rem; height: 1.75rem; border-radius: 6px;" />
              <span class="apex-skeleton" style="width: 5rem; height: 1.75rem; border-radius: 6px;" />
            </div>
          </div>
        </div>
        <template v-else>
          <p v-if="documentosFetchFailed" class="pdet__empty" role="alert">
            No se pudieron cargar los documentos (sesión, red o URL del API). Si el backend ya tiene
            <code>GCP_STORAGE_BUCKET</code>, confirme que el cliente apunta a ese mismo servicio
            (<code>VITE_API_BASE_URL</code> o la base configurada en el portal).
          </p>
          <p v-else-if="!documentosGcsActivo" class="pdet__docs-warn" role="status">
            Falta <code>GCP_STORAGE_BUCKET</code> en el backend. Con el bucket definido, la autenticación con Google usa
            Application Default Credentials en local (por ejemplo <code>gcloud auth application-default login</code>).
            Opcional: <code>GOOGLE_CLOUD_PROJECT</code> o <code>GCP_PROJECT_ID</code> si el SDK no detecta el proyecto.
          </p>
          <div v-else-if="documentosList.length" class="pdet__docs-flat">
            <div class="pdet__docs-toolbar">
              <IsInputText v-model="documentosSearch" placeholder="Buscar por nombre de archivo" />
              <IsSelect
                v-model="documentosHitoFilter"
                :options="documentoHitoOptions"
                option-label="label"
                option-value="value"
                placeholder="Todos los hitos"
              />
              <IsSelect
                v-model="documentosTipoFilter"
                :options="documentoTipoOptions"
                option-label="label"
                option-value="value"
                placeholder="Todos los tipos"
              />
              <strong class="pdet__docs-count">{{ documentosFiltrados.length }} documentos</strong>
            </div>
            <IsDataTable
              :value="documentosFiltrados"
              data-key="id"
              striped-rows
              sort-field="createdAt"
              :sort-order="-1"
              class="pdet__docs-table"
              :pt="{ root: { class: 'p-datatable-sm' } }"
            >
              <template #empty><span class="pdet__empty">No hay documentos para los filtros seleccionados.</span></template>
              <IsColumn field="nombreArchivo" header="Documento" style="min-width: 17rem">
                <template #body="{ data }">
                  <button type="button" class="pdet__doc-link" @click="abrirPreviewDocumento(data as DocumentoTablaRow)">
                    <i :class="documentoIcon(data as DocumentoTablaRow)" aria-hidden="true" />
                    {{ (data as DocumentoTablaRow).nombreArchivo }}
                  </button>
                </template>
              </IsColumn>
              <IsColumn field="ubicacion" header="Ubicación" style="min-width: 15rem">
                <template #body="{ data }"><span class="pdet__location-chip">{{ (data as DocumentoTablaRow).ubicacion }}</span></template>
              </IsColumn>
              <IsColumn field="sizeBytes" header="Tamaño" sortable style="min-width: 7rem">
                <template #body="{ data }">{{ formatBytes((data as DocumentoTablaRow).sizeBytes) }}</template>
              </IsColumn>
              <IsColumn field="subidoPor" header="Subido por" sortable style="min-width: 11rem">
                <template #body="{ data }"><span :title="(data as DocumentoTablaRow).subidoPorEmail">{{ (data as DocumentoTablaRow).subidoPor }}</span></template>
              </IsColumn>
              <IsColumn field="createdAt" header="Fecha" sortable style="min-width: 8rem">
                <template #body="{ data }">{{ formatDocFecha((data as DocumentoTablaRow).createdAt) }}</template>
              </IsColumn>
              <IsColumn header="Acciones" style="min-width: 13rem">
                <template #body="{ data }">
                  <div class="pdet__doc-actions">
                    <IsButton severity="secondary" text rounded size="small" icon="pi pi-eye" title="Vista previa" aria-label="Vista previa" @click="abrirPreviewDocumento(data as DocumentoTablaRow)" />
                    <IsButton severity="secondary" text rounded size="small" icon="pi pi-download" title="Descargar" aria-label="Descargar" @click="abrirDescargaDocumento(data as DocumentoTablaRow)" />
                    <IsButton v-if="canGestor" severity="danger" text rounded size="small" icon="pi pi-trash" title="Eliminar" aria-label="Eliminar" @click="eliminarDocumento(data as DocumentoTablaRow)" />
                  </div>
                </template>
              </IsColumn>
            </IsDataTable>
          </div>
          <p v-else class="pdet__empty">No hay documentos adjuntos a este proyecto.</p>
        </template>
      </section>
    </template>

    <p v-else class="pdet__missing">No se encontró el proyecto «{{ id }}».</p>
    <IsDialog v-model:visible="documentoModalOpen" modal header="Adjuntar documento" :style="{ width: 'min(520px, 94vw)' }">
      <div class="pdet__doc-modal">
        <input
          ref="documentoModalFileInput"
          type="file"
          multiple
          class="pdet__docs-file-input"
          accept=".pdf,.docx,.xlsx,.pptx,.txt,.png,.jpg,.jpeg"
          @change="onDocumentoModalFiles"
        />
        <IsButton severity="primary" outlined label="+ Adjuntar archivo" @click="abrirSelectorDocumentoModal" />
        <ul v-if="documentoModalFiles.length" class="pdet__doc-modal-files">
          <li v-for="f in documentoModalFiles" :key="f.name">{{ f.name }}</li>
        </ul>
        <div class="pdet__doc-modal-field">
          <label>Asociar a</label>
          <IsSelect
            v-model="documentoAsociarA"
            placeholder="Sin asociar"
            :options="documentoAsociarOptions"
            option-label="label"
            option-value="value"
            fluid
          />
        </div>
      </div>
      <template #footer>
        <IsButton severity="primary" outlined label="Cancelar" @click="documentoModalOpen = false" />
        <IsButton severity="primary" label="Guardar" :loading="documentosUploading" :disabled="!documentoModalFiles.length" @click="guardarDocumentoModal" />
      </template>
    </IsDialog>
    <DocumentoPreviewModal v-model:visible="docPreviewOpen" :documento="docPreviewDoc" :url="docPreviewUrl" />
  </div>
</template>

<style scoped>
.pdet {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  /* Padding de página: `.apex-mf-view` en App.vue */
  padding: 0;
}
.pdet__sticky {
  position: sticky;
  /* Por defecto 0: el scroll del MF es `.apex-mf-content`. Si el host hace scroll en viewport, puede fijar `--apex-mf-sticky-top` (p. ej. altura del header del portal). */
  top: var(--apex-mf-sticky-top, 0px);
  /* Evita tapar el header corporativo / zona del menú (p. ej. `#mf-menu-trigger`); antes 30 quedaba por encima del chrome azul. */
  z-index: 1;
  background: theme('colors.surface.50');
  margin: 0 0 1rem;
  padding: 0.5rem 0 0.35rem;
  border-bottom: 1px solid theme('colors.surface.300');
}
.pdet__crumb {
  font-size: 0.8125rem;
  margin: 0 0 0.5rem;
  color: theme('colors.surface.500');
}
.pdet__crumb-link {
  color: theme('colors.interseguro-info.500');
  text-decoration: none;
}
.pdet__crumb-link:hover {
  text-decoration: underline;
}
.pdet__crumb-sep {
  margin: 0 0.35rem;
  color: theme('colors.surface.400');
}
.pdet__crumb-current {
  color: theme('colors.surface.800');
  font-weight: 600;
}
.pdet__head {
  margin-bottom: 0.85rem;
}
.pdet__head-main {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}
.pdet__title {
  margin: 0;
  flex: 1;
  font-size: clamp(1.35rem, 2.5vw, 1.75rem);
  font-weight: 700;
  color: theme('colors.surface.800');
  line-height: 1.25;
}
.pdet__head-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.65rem;
  align-items: center;
}
.pdet__meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--apex-border-soft);
  border-radius: 999px;
  background: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
  color: theme('colors.surface.700');
  white-space: nowrap;
}
.pdet__meta-chip i {
  font-size: 0.75rem;
  color: theme('colors.surface.500');
}
.pdet__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1.25rem;
  border-bottom: 1px solid theme('colors.surface.300');
}
.pdet__tab {
  position: relative;
  border: none;
  background: none;
  padding: 0.55rem 0.15rem 0.65rem;
  font-size: 0.9375rem;
  font-weight: 600;
  color: theme('colors.surface.500');
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.pdet__tab:hover {
  color: theme('colors.surface.800');
}
.pdet__tab--active {
  color: theme('colors.surface.800');
  border-bottom-color: theme('colors.interseguro-secondary.500');
}
.pdet__panel {
  position: relative;
  z-index: 0;
  width: 100%;
  min-width: 0;
  padding-bottom: 2rem;
}
.pdet__block-title {
  margin: 1.5rem 0 0.75rem;
  font-size: 0.8125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: theme('colors.surface.800');
}
.pdet__block-title--flush {
  margin-top: 0;
}
.pdet__kpi-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.85rem;
}
.pdet__kpi {
  padding: 1rem 1.1rem;
  border-radius: 8px;
  border: 1px solid theme('colors.surface.300');
  background: var(--apex-surface-panel);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.pdet__kpi--compact {
  min-height: 7rem;
}
.pdet__kpi--alert {
  border-color: var(--apex-color-re);
  box-shadow: 0 0 0 1px rgba(241, 70, 73, 0.25);
}
.pdet__kpi-val {
  margin: 0;
  font-size: 1.65rem;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.pdet__kpi-lbl {
  margin: 0;
  font-size: 0.75rem;
  color: theme('colors.surface.500');
  line-height: 1.35;
  font-weight: 700;
}
.pdet__info-tip {
  position: relative;
  display: inline-flex;
  align-items: center;
  margin-left: 0.25rem;
  color: var(--apex-color-g100);
  cursor: help;
}
.pdet__tooltip {
  position: absolute;
  z-index: 30;
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
.pdet__info-tip:hover .pdet__tooltip,
.pdet__info-tip:focus .pdet__tooltip {
  display: block;
}
.pdet__kpi-sub {
  margin: 0.25rem 0 0;
  font-size: 0.8125rem;
  color: theme('colors.surface.500');
  line-height: 1.35;
}
.pdet__kpi-row--2 .pdet__kpi:first-child .pdet__kpi-val + .pdet__kpi-lbl {
  display: none;
}
.pdet__kpi-row--3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.pdet__kpi-row--2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin-top: 0.85rem;
}
.pdet__kpi-row--2 .pdet__kpi--compact {
  min-height: auto;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
@media (max-width: 720px) {
  .pdet__kpi-row--3,
  .pdet__kpi-row--2 {
    grid-template-columns: 1fr;
  }
}
.pdet__kpi-val--sm {
  font-size: 1.1rem;
  line-height: 1.25;
}
.pdet__kpi--sem-verde {
  border-color: rgba(0, 181, 85, 0.45);
}
.pdet__kpi--sem-ambar {
  border-color: rgba(240, 170, 0, 0.55);
}
.pdet__kpi--sem-rojo {
  border-color: rgba(241, 70, 73, 0.55);
}
.pdet__kpi--border-alert {
  border: 2px solid var(--apex-color-re);
}
.pdet__kpi-dual {
  margin-top: 1rem;
  padding: 1rem 1.15rem;
  border-radius: 8px;
  background: #fff;
  border: 1px solid theme('colors.surface.300');
}
.pdet__kpi-dual--verde {
  border-left: 4px solid var(--apex-color-gh);
}
.pdet__kpi-dual--ambar {
  border-left: 4px solid var(--apex-color-oy);
}
.pdet__kpi-dual--rojo {
  border-left: 4px solid var(--apex-color-re);
}
.pdet__kpi-dual--gris {
  border-left: 4px solid #9ca3af;
}
.pdet__kpi-dual__label {
  margin: 0 0 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: theme('colors.surface.500');
}
.pdet__kpi-dual__val {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  color: theme('colors.surface.800');
}
.pdet__compare {
  display: grid;
  gap: 0.85rem;
  margin-bottom: 0.75rem;
}
.pdet__compare-row {
  display: grid;
  gap: 0.35rem;
}
.pdet__compare-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  font-size: 0.8125rem;
  color: theme('colors.surface.500');
}
.pdet__compare-head strong {
  color: theme('colors.surface.800');
}
.pdet__compare-track {
  position: relative;
  height: 0.55rem;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
}
.pdet__compare-track--empty {
  background: repeating-linear-gradient(
    135deg,
    #e5e7eb 0,
    #e5e7eb 6px,
    var(--apex-surface-bg) 6px,
    var(--apex-surface-bg) 12px
  );
}
.pdet__compare-bar {
  display: block;
  height: 100%;
  border-radius: inherit;
}
.pdet__compare-bar--plan {
  background: var(--apex-color-g100);
}
.pdet__compare-bar--real {
  background: var(--apex-color-gh);
}
.pdet__prox {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.pdet__prox-groups {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.pdet__prox-group {
  border: 1px solid theme('colors.surface.300');
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}
.pdet__prox-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 0.9rem;
  cursor: pointer;
  background: #fafcfe;
}
.pdet__prox-summary-main {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
}
.pdet__prox-hito {
  font-weight: 800;
  color: theme('colors.surface.800');
}
.pdet__prox-count,
.pdet__prox-date {
  font-size: 0.8125rem;
  color: theme('colors.surface.500');
  white-space: nowrap;
}
.pdet__prox-rows {
  list-style: none;
  margin: 0;
  padding: 0.25rem 0.75rem 0.75rem;
}
.pdet__prox-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.25rem;
  border-bottom: 1px solid theme('colors.surface.200');
}
.pdet__prox-row:last-child {
  border-bottom: none;
}
.pdet__prox-icon {
  color: theme('colors.interseguro-info.500');
  font-size: 0.9rem;
  flex-shrink: 0;
}
.pdet__prox-row-main {
  flex: 1;
  min-width: 0;
}
.pdet__prox-row-main .pdet__prox-meta:first-of-type {
  display: none;
}
.pdet__prox-li {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.85rem 1rem;
  border-radius: 8px;
  border: 1px solid theme('colors.surface.300');
  background: #fff;
}
.pdet__prox-li--action {
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.pdet__prox-li--action:hover {
  border-color: theme('colors.interseguro-info.500');
  box-shadow: 0 0 0 1px rgba(19, 97, 185, 0.12);
}
.pdet__prox-li--action:focus-visible {
  outline: 2px solid theme('colors.interseguro-secondary.500');
  outline-offset: 2px;
}
.pdet__pend-title {
  margin: 1.75rem 0 0.35rem;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: theme('colors.surface.500');
}
.pdet__pend-sub {
  margin: 0 0 0.65rem;
  font-size: 0.8125rem;
  color: theme('colors.surface.500');
  line-height: 1.4;
}
.pdet__pend {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.pdet__pend-groups {
  display: grid;
  gap: 0.85rem;
}
.pdet__pend-group {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.pdet__pend-group-title {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  font-size: 0.78rem;
  font-weight: 800;
  color: theme('colors.surface.700');
}
.pdet__pend-group-title span {
  min-width: 1.35rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: theme('colors.surface.200');
  color: theme('colors.surface.700');
  text-align: center;
  font-size: 0.72rem;
}
.pdet__pend-li {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 0.65rem 0.85rem;
  border-radius: 6px;
  border: 1px dashed theme('colors.surface.300');
  background: #fafcfe;
  font-size: 0.9375rem;
}
.pdet__pend-li--hard {
  border-color: rgba(241, 70, 73, 0.45);
  background: rgba(241, 70, 73, 0.06);
  box-shadow: inset 3px 0 0 var(--apex-color-re);
}
.pdet__pend-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin: 1.5rem 0 0.75rem;
}
.pdet__pend-filters {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 0.85rem;
}
.pdet__pend-filters :deep(.p-select),
.pdet__pend-filters :deep(.p-dropdown) {
  min-width: 12rem;
}
.pdet__pend-table {
  font-size: 13px;
}
.pdet__prox-nombre {
  font-weight: 600;
  color: theme('colors.surface.800');
  display: block;
}
.pdet__prox-meta {
  font-size: 0.8125rem;
  color: theme('colors.surface.500');
  display: block;
  margin-top: 0.2rem;
}
.pdet__prox-dias {
  flex-shrink: 0;
  font-size: 0.8125rem;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.pdet__prox-dias--rojo {
  color: var(--apex-color-re);
}
.pdet__prox-dias--ambar {
  color: var(--apex-color-oy);
}
.pdet__empty {
  color: theme('colors.surface.500');
  font-size: 0.9375rem;
  margin: 0.5rem 0;
}
.pdet__sec {
  margin: 1rem 0 0.35rem;
  font-size: 13px;
  font-weight: 700;
  color: theme('colors.surface.800');
  text-transform: uppercase;
}
.pdet__hint-line {
  margin: 0 0 1rem;
  font-size: 0.9375rem;
  color: theme('colors.surface.700');
}
.pdet__missing {
  color: var(--apex-color-re);
  font-size: 14px;
}
.pdet__panel--docs .pdet__docs-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}
.pdet__docs-file-input {
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
.pdet__docs-warn {
  font-size: 0.875rem;
  color: #b45309;
  line-height: 1.45;
  margin: 0 0 0.75rem;
}
.pdet__docs-warn code {
  font-size: 0.8125rem;
}
.pdet__docs-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.pdet__docs-tree {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.pdet__docs-group,
.pdet__docs-subgroup {
  border: 1px solid theme('colors.surface.300');
  border-radius: 6px;
  background: #fff;
  padding: 0.65rem 0.75rem;
}
.pdet__docs-subgroup {
  margin: 0.55rem 0 0 1rem;
  background: #fafcfe;
}
.pdet__docs-subgroup--nested {
  margin-left: 1.5rem;
}
.pdet__docs-group summary,
.pdet__docs-subgroup summary {
  cursor: pointer;
  font-weight: 800;
  color: theme('colors.surface.800');
}
.pdet__docs-group .pdet__docs-list,
.pdet__docs-subgroup .pdet__docs-list {
  margin-top: 0.55rem;
}
.pdet__docs-li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.85rem 1rem;
  border-radius: 8px;
  border: 1px solid theme('colors.surface.300');
  background: #fff;
}
.pdet__docs-x {
  border: none;
  background: transparent;
  color: var(--apex-color-re);
  font-size: 1.15rem;
  font-weight: 800;
  cursor: pointer;
}
.pdet__docs-x:disabled {
  color: theme('colors.surface.400');
  cursor: not-allowed;
  opacity: 0.45;
}
.pdet__doc-modal {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.pdet__doc-modal-files {
  margin: 0;
  padding-left: 1rem;
  color: theme('colors.surface.700');
  font-size: 0.875rem;
}
.pdet__doc-modal-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.pdet__doc-modal-field label {
  font-size: 0.8125rem;
  font-weight: 800;
  color: theme('colors.surface.800');
}
.pdet__docs-li-main {
  min-width: 0;
  flex: 1;
}
.pdet__docs-name {
  display: block;
  font-weight: 600;
  color: theme('colors.surface.800');
  font-size: 0.9375rem;
  word-break: break-word;
}
.pdet__docs-meta {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.8125rem;
  color: theme('colors.surface.500');
}

@media (max-width: 768px) {
  .pdet__sticky {
    margin-inline: -0.25rem;
  }

  .pdet__head {
    align-items: stretch;
    flex-direction: column;
  }

  .pdet__head-meta {
    justify-content: flex-start;
  }

  .pdet__tabs {
    overflow-x: auto;
    padding-bottom: 0.15rem;
    scrollbar-width: thin;
  }

  .pdet__tab {
    flex: 1 0 auto;
    white-space: nowrap;
  }

  .pdet__pend-li,
  .pdet__prox-row {
    align-items: stretch;
    flex-direction: column;
  }

  .pdet__prox-dias {
    align-self: flex-start;
  }
}

@media (max-width: 560px) {
  .pdet__meta-chip,
  .pdet__status-pill {
    max-width: 100%;
  }

  .pdet__docs-li {
    align-items: stretch;
    flex-direction: column;
  }

  .pdet__docs-li :deep(.p-button) {
    width: 100%;
    justify-content: center;
  }
}

/* ── Skeleton screens ──────────────────────────────────────────── */
.pdet__skeleton-table {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.5rem 0;
}

.pdet__skeleton-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--apex-border-soft);
  background: #fff;
  animation: apex-fade-in 0.25s ease-out both;
}

.pdet__skeleton-cell { height: 0.875rem; }
.pdet__skeleton-cell--xs  { width: 4rem;  flex-shrink: 0; }
.pdet__skeleton-cell--sm  { width: 7rem;  flex-shrink: 0; }
.pdet__skeleton-cell--md  { width: 9rem;  flex-shrink: 0; }
.pdet__skeleton-cell--lg  { flex: 1; min-width: 0; }

.pdet__skeleton-indicators {
  animation: apex-fade-in 0.25s ease-out both;
}

.pdet__skeleton-kpi {
  display: flex;
  flex-direction: column;
  padding: 1rem 1.1rem;
  border-radius: 12px;
  border: 1px solid var(--apex-border-soft);
  background: #fff;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.035);
  animation: apex-fade-in 0.25s ease-out both;
}

.pdet__skeleton-docs {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.pdet__skeleton-doc-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-radius: 12px;
  border: 1px solid var(--apex-border-soft);
  background: #fff;
  animation: apex-fade-in 0.25s ease-out both;
}

.pdet__skeleton-doc-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.25rem;
}

/* ── Animación de progress bars ───────────────────────────────── */
.pdet__compare-bar {
  transform-origin: left center;
  animation: apex-bar-grow 1s cubic-bezier(0.4, 0, 0.2, 1) both;
  animation-delay: 0.25s;
}

/* ── Transiciones en tabs ─────────────────────────────────────── */
.pdet__tab {
  transition: color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

/* ── Stagger en KPI cards ─────────────────────────────────────── */
.pdet__kpi-row .pdet__kpi:nth-child(1) { animation: apex-fade-in 0.28s ease-out 0ms   both; }
.pdet__kpi-row .pdet__kpi:nth-child(2) { animation: apex-fade-in 0.28s ease-out 70ms  both; }
.pdet__kpi-row .pdet__kpi:nth-child(3) { animation: apex-fade-in 0.28s ease-out 140ms both; }
.pdet__kpi-dual           { animation: apex-fade-in 0.28s ease-out 180ms both; }

/* ── Próximos vencimientos hover ─────────────────────────────── */
.pdet__prox-group {
  transition: box-shadow 0.18s ease, border-color 0.18s ease;
}
.pdet__prox-group:hover {
  border-color: var(--apex-color-neutral-light);
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.07);
}

/* ISAC-like visual refinement */
.pdet {
  gap: 1rem;
}

.pdet__sticky,
.pdet__panel {
  border-color: var(--apex-border-soft);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.04);
}

.pdet__sticky {
  overflow: hidden;
  padding: 1rem 1.5rem 0;
}

.pdet__head {
  padding-top: 0;
}

.pdet__title {
  color: var(--apex-text-strong);
  font-weight: 800;
  letter-spacing: -0.01em;
  line-height: 1.2;
}

.pdet__crumb,
.pdet__meta-chip,
.pdet__kpi-lbl,
.pdet__kpi-sub,
.pdet__prox-meta,
.pdet__docs-meta {
  color: var(--apex-text-muted);
}

.pdet__tabs {
  gap: 0.25rem 1.5rem;
  padding: 0;
  border: none;
  border-bottom: 1px solid var(--apex-border-soft);
  border-radius: 0;
  background: transparent;
}

.pdet__tab {
  border-radius: 0;
  color: var(--apex-text-muted);
}

/* Tab activo: solo texto + subrayado (sin chip blanco), como el mockup */
.pdet__tab--active {
  background: transparent;
  color: var(--apex-text-strong);
  box-shadow: inset 0 -2px 0 0 var(--apex-brand-accent);
}

.pdet__kpi,
.pdet__kpi-dual,
.pdet__prox-group,
.pdet__docs-group,
.pdet__docs-subgroup,
.pdet__docs-li,
.pdet__pend-li {
  border-color: var(--apex-border-soft);
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.035);
}

.pdet__kpi-val,
.pdet__kpi-dual__val,
.pdet__prox-nombre,
.pdet__docs-name {
  color: var(--apex-text-strong);
}

.pdet__compare-track {
  background: var(--apex-border-soft);
}

.pdet__compare-bar--plan {
  background: var(--apex-color-g100);
}

.pdet__compare-bar--real {
  background: var(--apex-color-gh);
}

.pdet__prox-summary {
  background: var(--apex-surface-bg);
}

.pdet__prox-icon {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 10px;
  background: #eff6ff;
  color: var(--apex-color-g100);
}
.pdet__docs-flat {
  display: grid;
  gap: 0.85rem;
}
.pdet__docs-toolbar {
  display: grid;
  grid-template-columns: minmax(15rem, 1fr) minmax(11rem, 0.45fr) minmax(10rem, 0.35fr) auto;
  align-items: end;
  gap: 0.65rem;
}
.pdet__docs-count {
  align-self: center;
  white-space: nowrap;
  color: var(--apex-text-muted);
}
.pdet__doc-link {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  border: 0;
  background: transparent;
  color: var(--apex-brand-primary);
  font: inherit;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
}
.pdet__location-chip {
  display: inline-flex;
  max-width: 22rem;
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  background: var(--apex-surface-muted);
  color: var(--apex-text-muted);
  font-size: 0.75rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pdet__doc-actions {
  display: flex;
  gap: 0.25rem;
  justify-content: center;
}
.pdet__pend-table :deep(.pdet-row--highlight > td) {
  background: color-mix(in srgb, var(--apex-color-g100) 8%, transparent) !important;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--apex-color-g100) 30%, transparent);
  transition: background 0.25s ease, box-shadow 0.25s ease;
}
@media (max-width: 920px) {
  .pdet__docs-toolbar {
    grid-template-columns: 1fr;
  }
  .pdet__docs-table {
    overflow-x: auto;
  }
}
</style>
