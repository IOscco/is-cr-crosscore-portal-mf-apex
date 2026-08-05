<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import ExcelJS from 'exceljs';
import {
  IsDataTable,
  IsColumn,
  IsInputText,
  IsIconField,
  IsInputIcon,
  IsButton,
  IsSelect,
  IsMultiSelect,
  IsDialog,
  useConfirm,
} from 'is-uikit-components-vue';
import BadgePill from '@/components/ui/BadgePill.vue';
import RichTextEditor from '@/components/shared/RichTextEditor.vue';
import type { ProgramBoardRow } from '@/types/poc-data';
import { estatusGeneralToPillVariant } from '@/lib/estado-badge';
import {
  cargaMasivaIniciativasApi,
  createIniciativaApi,
  deleteIniciativaApi,
  downloadIniciativasCargaTemplate,
  fetchAreaNegocioCatalog,
  fetchEstadosGeneral,
  fetchFasesActuales,
  fetchIniciativas,
  fetchIniciativasPeriodos,
  fetchPortafolioCatalog,
  fetchTipoIniciativaCatalog,
  updateIniciativaApi,
  type ColorCatalogApi,
  type IniciativaApiRow,
  type IniciativaInput,
  type NamedCatalogApi,
} from '@/lib/iniciativas-api';
import { fetchSquadsActive, type SquadApi } from '@/lib/squads-api';
import { usePortalAccess } from '@/modules/shared/composables/usePortalAccess';

const confirm = useConfirm();
const route = useRoute();
const router = useRouter();
const { canManageIniciativas, canAdminIniciativas } = usePortalAccess();

type IniciativaTableRow = ProgramBoardRow & {
  detailId: string;
  squadDisplay: string;
  squadColor: string;
  estatusValor: string;
  faseValor: string;
};

type ImportPreviewRow = {
  excelRow: number;
  data: IniciativaInput;
  errors: string[];
};

const rowsApi = ref<IniciativaApiRow[]>([]);
const squadsCatalog = ref<SquadApi[]>([]);
const periodos = ref<string[]>([]);
const catalogEstatus = ref<ColorCatalogApi[]>([]);
const catalogFases = ref<ColorCatalogApi[]>([]);
const tipoIniciativaCatalog = ref<NamedCatalogApi[]>([]);
const areaNegocioCatalog = ref<NamedCatalogApi[]>([]);
const portafolioCatalog = ref<NamedCatalogApi[]>([]);
const loading = ref(false);
const err = ref<string | null>(null);
const okMsg = ref<string | null>(null);
const globalFilter = ref('');
const selectedPeriodo = ref('');

const filterSquads = ref<string[]>([]);
const filterEstatus = ref('');
const filterHito = ref('');
const filterFechaDesde = ref('');
const filterFechaHasta = ref('');
const formOpen = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formStep = ref<1 | 2>(1);
const detailOpen = ref(false);
const detailId = ref<string | null>(null);
const editId = ref<string | null>(null);
const saving = ref(false);
const formErrors = reactive<Record<string, string>>({});
const origenResetNotice = ref(false);
const importOpen = ref(false);
const importFile = ref<File | null>(null);
const importRows = ref<ImportPreviewRow[]>([]);
const importFileName = ref('');
const importProcessing = ref(false);
const importSaving = ref(false);
const templateDownloading = ref(false);

const form = reactive<IniciativaInput>({
  periodo: '',
  squad: '',
  epicaIniciativa: '',
  estatus: '',
  faseActual: 'F0',
  descripcion: '',
  sistemaComponenteId: null,
  tipoIniciativaId: null,
  areaNegocioId: null,
  devEncargado: '',
  tlEncargado: '',
  liderIniciativa: '',
  sprintComprometido: '',
  sprintPaseProduccion: '',
  hito: '',
  hitoComprometido: '',
  origenIniciativa: '',
  origen: '',
  esCross: false,
  impactoSox: false,
  notas: '',
});

const defaultEstados: ColorCatalogApi[] = [
  { valor: '1', label: 'No programada', colorHex: '#F5F5F5', textoOscuro: true },
  { valor: '2', label: 'Por iniciar', colorHex: '#FFF2CC', textoOscuro: true },
  { valor: '3', label: 'En progreso', colorHex: '#CFE2FF', textoOscuro: true },
  { valor: '4', label: 'Bloqueado', colorHex: '#FFCCCC', textoOscuro: true },
  { valor: '5', label: 'Cerrado', colorHex: '#D9EAD3', textoOscuro: true },
  { valor: '6', label: 'Despriorizado', colorHex: '#E2CFFF', textoOscuro: true },
  { valor: '7', label: 'Desestimado', colorHex: '#E0E0E0', textoOscuro: true },
];

const defaultFases: ColorCatalogApi[] = [
  { valor: 'F0', label: 'F0 - Backlog', colorHex: '#F5F5F5', textoOscuro: true },
  { valor: 'F1', label: 'F1 - Relevamiento y análisis', colorHex: '#CFE2FF', textoOscuro: true },
  { valor: 'F2', label: 'F2 - Diseño funcional y técnico', colorHex: '#9FC5E8', textoOscuro: true },
  { valor: 'F3', label: 'F3 - Desarrollo', colorHex: '#1F4E79', textoOscuro: false },
  { valor: 'F4', label: 'F4 - Pruebas Técnicas/QA', colorHex: '#FCE5CD', textoOscuro: true },
  { valor: 'F5', label: 'F5 - Pruebas Usuario (UAT)', colorHex: '#FFF2CC', textoOscuro: true },
  { valor: 'F6', label: 'F6 - Pendiente PaP', colorHex: '#D9D2E9', textoOscuro: true },
  { valor: 'F7', label: 'F7 - En producción', colorHex: '#FADADD', textoOscuro: true },
  { valor: 'F8', label: 'F8 - Cierre', colorHex: '#D9EAD3', textoOscuro: true },
];

const SQUAD_COLOR = '#1361B9';

function activePeriodo(): string {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `Q${quarter}-${now.getFullYear()}`;
}

function isPeriodo(value: string): boolean {
  return /^Q[1-4]-\d{4}$/.test(value.trim());
}

function periodoOrder(value: string): number {
  const m = /^Q([1-4])-(\d{4})$/.exec(value);
  return m ? Number(m[2]) * 10 + Number(m[1]) : 0;
}

const periodoActivo = activePeriodo();
const isHistoricalPeriodo = computed(() => periodoOrder(selectedPeriodo.value) < periodoOrder(periodoActivo));
const isReadonlyHistorical = computed(() => isHistoricalPeriodo.value && !canAdminIniciativas.value);
const canEditCurrentView = computed(() => canManageIniciativas.value && !isReadonlyHistorical.value);

const periodoOptions = computed(() => {
  const set = new Set(periodos.value.filter(isPeriodo));
  if (isPeriodo(periodoActivo)) {
    set.add(periodoActivo);
  }
  return [...set]
    .sort((a, b) => periodoOrder(b) - periodoOrder(a))
    .map((p) => ({
      label: periodoOrder(p) < periodoOrder(periodoActivo) ? `${p} · histórico` : p,
      value: p,
    }));
});

const estadoByValor = computed(() => new Map(catalogEstatus.value.map((x) => [x.valor, x])));
const faseByValor = computed(() => new Map(catalogFases.value.map((x) => [x.valor, x])));

const estadoOptions = computed(() => catalogEstatus.value.map((x) => ({ label: x.label, value: x.valor })));
const faseOptions = computed(() => catalogFases.value.map((x) => ({ label: x.label, value: x.valor })));
const tipoIniciativaOptions = computed(() => tipoIniciativaCatalog.value.map((x) => ({ label: x.nombre, value: x.id })));
const areaNegocioOptions = computed(() => areaNegocioCatalog.value.map((x) => ({ label: x.nombre, value: x.id })));
const portafolioOptions = computed(() => portafolioCatalog.value.map((x) => ({ label: x.nombre, value: x.id })));

const selectedSquad = computed(() => squadsCatalog.value.find((s) => s.nombre === form.squad) ?? null);

const devOptions = computed(() =>
  (selectedSquad.value?.miembros ?? [])
    .filter((m) => m.rol === 'desarrollador')
    .map((m) => ({ label: m.usuarioNombre, value: m.usuarioNombre })),
);

const tlOptions = computed(() =>
  (selectedSquad.value?.miembros ?? [])
    .filter((m) => m.rol === 'technical_lead' || m.rol === 'tech_lead')
    .map((m) => ({ label: m.usuarioNombre, value: m.usuarioNombre })),
);

const sprintOptions = ['Sprint 1', 'Sprint 2', 'Sprint 3', 'Sprint 4', 'Sprint 5', 'Sprint 6', 'No aplica'].map((x) => ({
  label: x,
  value: x,
}));

const hitoOptions = ['Producción', 'UAT', 'No aplica'].map((x) => ({ label: x, value: x }));
const importPreviewRows = computed(() => importRows.value);
const importValidRows = computed(() => importRows.value.filter((row) => row.errors.length === 0));
const importInvalidRows = computed(() => importRows.value.filter((row) => row.errors.length > 0));
const importValidCount = computed(() => importValidRows.value.length);
const importInvalidCount = computed(() => importInvalidRows.value.length);
const hasFormSprintComprometido = computed(() => Boolean(String(form.sprintComprometido ?? '').trim()));
const hasFormHitoComprometido = computed(() => Boolean(String(form.hitoComprometido ?? '').trim()));
const isSprintComprometidoRequired = computed(() => hasFormHitoComprometido.value);
const isHitoComprometidoRequired = computed(() => hasFormSprintComprometido.value);
const isSprintComprometidoMissing = computed(() => isSprintComprometidoRequired.value && !hasFormSprintComprometido.value);
const isHitoComprometidoMissing = computed(() => isHitoComprometidoRequired.value && !hasFormHitoComprometido.value);

function catalogLabel(list: ColorCatalogApi[], value: string): string {
  return list.find((x) => x.valor === value)?.label ?? value;
}

function chipStyle(item: ColorCatalogApi | undefined): Record<string, string> {
  if (!item) {
    return {};
  }
  return {
    backgroundColor: item.colorHex,
    color: item.textoOscuro ? '#1a1a2e' : '#ffffff',
    borderColor: item.colorHex,
  };
}

function normalizeSquadColor(raw: string | null | undefined): string {
  void raw;
  return SQUAD_COLOR;
}

function squadColorByName(name: string): string {
  const squad = squadsCatalog.value.find((s) => s.nombre === name);
  const rowSquad = rowsApi.value.find((r) => (r.squadNombre || r.squad?.nombre) === name)?.squad;
  return normalizeSquadColor(squad?.color ?? rowSquad?.color);
}

function squadChipStyle(color: string): Record<string, string> {
  const hex = normalizeSquadColor(color);
  return {
    backgroundColor: hex,
    borderColor: hex,
    color: '#ffffff',
  };
}

function previousQuarter(periodo: string): string {
  const m = /^Q([1-4])-(\d{4})$/.exec(periodo);
  if (!m) {
    return periodo;
  }
  const q = Number(m[1]);
  const y = Number(m[2]);
  return q === 1 ? `Q4-${y - 1}` : `Q${q - 1}-${y}`;
}

const origenOptions = computed(() => {
  const p = isPeriodo(form.periodo) ? form.periodo : periodoActivo;
  return [
    `PI Planning ${p}`,
    `Arrastre ${previousQuarter(p)}`,
    `Nueva solicitud ${p}`,
  ].map((x) => ({ label: x, value: x }));
});

const formHeaderSubtitle = computed(() =>
  formStep.value === 1
    ? 'Paso 1 de 2 — Información obligatoria'
    : 'Paso 2 de 2 — Información opcional',
);

const formTitle = computed(() => (formMode.value === 'create' ? 'Nueva Iniciativa' : 'Editar Iniciativa'));

const detailApi = computed(() => rowsApi.value.find((r) => r.id === detailId.value) ?? null);

function normalizeOrigenIniciativa(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) {
    return '';
  }
  const t = s.toLowerCase();
  if (t === 'pi' || t === 'planning increment') {
    return 'PI';
  }
  if (t === 'posterior') {
    return 'Posterior';
  }
  if (t.includes('nueva') && t.includes('solicitud')) {
    return 'Nueva solicitud';
  }
  return s;
}

function toTableRow(r: IniciativaApiRow): IniciativaTableRow {
  const p = r.payload as Record<string, unknown>;
  const squadNombre = (r.squadNombre ?? r.squad?.nombre ?? '').trim() || String(p.squad ?? '').trim();
  const estatusValor = String(r.estatus ?? p.estatusGeneral ?? '');
  const faseValor = String(r.faseActual ?? p.faseActual ?? '');
  return {
    detailId: r.id,
    squadDisplay: squadNombre || '—',
    squadColor: normalizeSquadColor(r.squad?.color ?? squadColorByName(squadNombre)),
    squad: squadNombre,
    epica: String(r.epicaIniciativa ?? p.epica ?? ''),
    estatusValor,
    faseValor,
    estatusGeneral: catalogLabel(catalogEstatus.value, estatusValor),
    faseActual: catalogLabel(catalogFases.value, faseValor),
    fechaPap: String(p.fechaPap ?? ''),
    ticketGti: String(p.ticketGti ?? ''),
    tl: String(p.tl ?? ''),
    dev: String(p.dev ?? ''),
    priorizacion: String(p.priorizacion ?? ''),
    hitoQ2: String(r.hitoComprometido ?? r.hito ?? p.hito ?? p.hitoQ2 ?? ''),
    sprintCompromiso: String(r.sprintComprometido ?? p.sprintCompromiso ?? ''),
    sprintPaseProduccion: String(
      r.sprintPaseProduccion ?? p.sprintPaseProduccion ?? p.sprintPaseProd ?? p.sprintPaseAProduccion ?? '',
    ),
    sistema: String(r.sistemaComponente?.nombre ?? p.sistema ?? ''),
    tipoIniciativa: String(r.tipoIniciativa?.nombre ?? p.tipoIniciativa ?? ''),
    origenIniciativa: normalizeOrigenIniciativa(r.origenIniciativa ?? p.origenIniciativa ?? p.origenDeLaIniciativa),
    fechaComprometida: String(p.fechaComprometida ?? p.fechaCompromiso ?? ''),
  };
}

const rowsWithKey = computed(() => rowsApi.value.map((r) => toTableRow(r)));

function parseFilterDate(s: string): Date | null {
  const t = s.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return null;
  }
  const d = new Date(`${t}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfDayMs(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function endOfDayMs(d: Date): number {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

function rowFechaComprometidaMs(r: IniciativaTableRow): number | null {
  const raw = (r.fechaComprometida ?? '').trim();
  if (!raw) {
    return null;
  }
  const d = parseFilterDate(raw.length >= 10 ? raw.slice(0, 10) : raw);
  return d ? d.getTime() : null;
}

const squadOptionsMulti = computed(() => {
  const fromRows = new Set<string>();
  for (const r of rowsWithKey.value) {
    const s = r.squadDisplay.trim();
    if (s && s !== '—') {
      fromRows.add(s);
    }
  }
  for (const s of squadsCatalog.value) {
    const n = (s.nombre ?? '').trim();
    if (n) {
      fromRows.add(n);
    }
  }
  return [...fromRows]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((label) => ({ label, value: label, color: squadColorByName(label) }));
});

const estatusFilterOptions = computed(() => {
  const set = new Set<string>();
  for (const r of rowsWithKey.value) {
    const e = r.estatusGeneral.trim();
    if (e) {
      set.add(e);
    }
  }
  const opts = [...set].sort((a, b) => a.localeCompare(b, 'es')).map((label) => ({ label, value: label }));
  return [{ label: 'Todos', value: '' }, ...opts];
});

const hitoFilterOptions = computed(() => {
  const set = new Set<string>();
  for (const r of rowsWithKey.value) {
    const h = r.hitoQ2.trim();
    if (h) {
      set.add(h);
    }
  }
  const opts = [...set].sort((a, b) => a.localeCompare(b, 'es')).map((label) => ({ label, value: label }));
  return [{ label: 'Todos', value: '' }, ...opts];
});

const filteredRows = computed(() => {
  let list = rowsWithKey.value;

  if (filterSquads.value.length > 0) {
    const set = new Set(filterSquads.value);
    list = list.filter((r) => set.has(r.squadDisplay));
  }
  if (filterEstatus.value) {
    list = list.filter((r) => r.estatusGeneral === filterEstatus.value);
  }
  if (filterHito.value) {
    list = list.filter((r) => r.hitoQ2 === filterHito.value);
  }

  const desde = filterFechaDesde.value ? parseFilterDate(filterFechaDesde.value) : null;
  const hasta = filterFechaHasta.value ? parseFilterDate(filterFechaHasta.value) : null;
  if (desde || hasta) {
    list = list.filter((r) => {
      const ts = rowFechaComprometidaMs(r);
      if (ts === null) {
        return false;
      }
      if (desde && ts < startOfDayMs(desde)) {
        return false;
      }
      if (hasta && ts > endOfDayMs(hasta)) {
        return false;
      }
      return true;
    });
  }

  const q = globalFilter.value.trim().toLowerCase();
  if (!q) {
    return list;
  }
  return list.filter((r) => {
    const hay = [
      r.squadDisplay,
      r.epica,
      r.ticketGti,
      r.estatusGeneral,
      r.faseActual,
      r.sprintCompromiso,
      r.sprintPaseProduccion,
      r.hitoQ2,
      r.origenIniciativa,
      r.fechaComprometida,
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
});

const activeFilterCount = computed(() => {
  let count = 0;
  if (filterSquads.value.length > 0) count += 1;
  if (filterEstatus.value) count += 1;
  if (filterHito.value) count += 1;
  if (filterFechaDesde.value || filterFechaHasta.value) count += 1;
  if (globalFilter.value.trim()) count += 1;
  return count;
});

const boardStats = computed(() => {
  const total = rowsWithKey.value.length;
  const visibles = filteredRows.value.length;
  const bloqueadas = rowsWithKey.value.filter((row) => row.estatusGeneral.toLowerCase().includes('bloque')).length;
  const enProgreso = rowsWithKey.value.filter((row) => row.estatusGeneral.toLowerCase().includes('progreso')).length;

  return [
    { label: 'Iniciativas', value: total },
    { label: 'En vista', value: visibles },
    { label: 'Bloqueadas', value: bloqueadas },
    { label: 'En progreso', value: enProgreso },
  ];
});

async function loadPeriodos(): Promise<void> {
  const apiPeriodos = await fetchIniciativasPeriodos().catch((): string[] => []);
  const set = new Set(apiPeriodos.filter(isPeriodo));
  set.add(periodoActivo);
  periodos.value = [...set].sort((a, b) => periodoOrder(b) - periodoOrder(a));
}

function resolveInitialPeriodo(): string {
  const fromUrl = String(route.query.periodo ?? '');
  if (isPeriodo(fromUrl)) {
    return fromUrl;
  }
  if (periodos.value.includes(periodoActivo)) {
    return periodoActivo;
  }
  return periodos.value[0] ?? periodoActivo;
}

async function load(): Promise<void> {
  if (!selectedPeriodo.value) {
    selectedPeriodo.value = resolveInitialPeriodo();
  }
  loading.value = true;
  err.value = null;
  okMsg.value = null;
  try {
    const [ini, sq] = await Promise.all([
      fetchIniciativas(selectedPeriodo.value),
      fetchSquadsActive().catch((): SquadApi[] => []),
    ]);
    rowsApi.value = ini;
    squadsCatalog.value = sq;
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Error al cargar iniciativas';
    rowsApi.value = [];
  } finally {
    loading.value = false;
  }
}

function syncPeriodoQuery(periodo: string): void {
  if (route.query.periodo === periodo) {
    return;
  }
  void router.replace({ query: { ...route.query, periodo } });
}

function onPeriodoChange(value: unknown): void {
  const next = String(value ?? '');
  if (!isPeriodo(next) || next === selectedPeriodo.value) {
    return;
  }
  selectedPeriodo.value = next;
  syncPeriodoQuery(next);
  void load();
}

function eliminar(row: { detailId: string; epica: string }): void {
  if (!canEditCurrentView.value) {
    return;
  }
  confirm.require({
    message: `¿Enviar la iniciativa «${row.epica || 'sin título'}» a la papelera?`,
    header: 'Confirmar',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Sí, eliminar',
    rejectLabel: 'Cancelar',
    accept: async () => {
      try {
        await deleteIniciativaApi(row.detailId);
        await load();
      } catch {
        err.value = 'No se pudo eliminar.';
      }
    },
  });
}

function displayOrigen(o: string | undefined): string {
  const s = (o ?? '').trim();
  return s || '—';
}

function displayValue(value: unknown): string {
  const s = String(value ?? '').trim();
  return s || '—';
}

function boolLabel(value: unknown): string {
  return Boolean(value) ? 'Sí' : 'No';
}

function catalogName(value: NamedCatalogApi | null | undefined): string {
  return value?.nombre?.trim() || '—';
}

function detailSectionFields(api: IniciativaApiRow): {
  title: string;
  fields: { label: string; value: string }[];
}[] {
  return [
    {
      title: 'Información general',
      fields: [
        { label: 'Periodo', value: displayValue(api.periodo) },
        { label: 'Squad', value: displayValue(api.squadNombre || api.squad?.nombre) },
        { label: 'Épica / Iniciativa', value: displayValue(api.epicaIniciativa) },
        { label: 'Estado General', value: catalogLabel(catalogEstatus.value, api.estatus) || '—' },
        { label: 'Fase Actual', value: catalogLabel(catalogFases.value, api.faseActual) || '—' },
      ],
    },
    {
      title: 'Planificación',
      fields: [
        { label: 'Sprint Comprometido', value: displayValue(api.sprintComprometido) },
        { label: 'Hito Comprometido', value: displayValue(api.hitoComprometido ?? api.hito) },
        { label: 'Origen', value: displayValue(api.origen ?? api.origenIniciativa) },
        { label: '¿Es Cross?', value: boolLabel(api.esCross) },
      ],
    },
    {
      title: 'Equipo',
      fields: [
        { label: 'Dev Encargado', value: displayValue(api.devEncargado) },
        { label: 'TL Encargado', value: displayValue(api.tlEncargado) },
        { label: 'Líder Iniciativa', value: displayValue(api.liderIniciativa) },
      ],
    },
    {
      title: 'Contexto',
      fields: [
        { label: 'Sistema / Componente Impactado', value: catalogName(api.sistemaComponente) },
        { label: 'Tipo de Iniciativa', value: catalogName(api.tipoIniciativa) },
        { label: 'Área del Negocio', value: catalogName(api.areaNegocio) },
      ],
    },
    {
      title: 'Información adicional',
      fields: [
        { label: '¿Impacto en Controles SOX?', value: boolLabel(api.impactoSox) },
        { label: 'Notas', value: displayValue(api.notas) },
      ],
    },
  ];
}

function resetForm(periodo = selectedPeriodo.value): void {
  form.periodo = periodo || periodoActivo;
  form.squad = '';
  form.epicaIniciativa = '';
  form.estatus = '';
  form.faseActual = 'F0';
  form.descripcion = '';
  form.sistemaComponenteId = null;
  form.tipoIniciativaId = null;
  form.areaNegocioId = null;
  form.devEncargado = '';
  form.tlEncargado = '';
  form.liderIniciativa = '';
  form.sprintComprometido = '';
  form.sprintPaseProduccion = '';
  form.hito = '';
  form.hitoComprometido = '';
  form.origenIniciativa = '';
  form.origen = '';
  form.esCross = false;
  form.impactoSox = false;
  form.notas = '';
  origenResetNotice.value = false;
  Object.keys(formErrors).forEach((k) => delete formErrors[k]);
}

function openNuevo(): void {
  if (!canEditCurrentView.value || isHistoricalPeriodo.value) {
    return;
  }
  formMode.value = 'create';
  formStep.value = 1;
  editId.value = null;
  resetForm(periodoActivo);
  formOpen.value = true;
}

function openEdit(row: IniciativaTableRow): void {
  if (!canEditCurrentView.value) {
    return;
  }
  const api = rowsApi.value.find((r) => r.id === row.detailId);
  if (!api) {
    return;
  }
  formMode.value = 'edit';
  formStep.value = 1;
  editId.value = api.id;
  form.periodo = api.periodo || selectedPeriodo.value;
  form.squad = api.squadNombre || row.squadDisplay;
  form.epicaIniciativa = api.epicaIniciativa || row.epica;
  form.estatus = api.estatus || row.estatusValor || '';
  form.faseActual = api.faseActual || row.faseValor || 'F0';
  form.descripcion = api.descripcion ?? '';
  form.sistemaComponenteId = api.sistemaComponenteId ?? null;
  form.tipoIniciativaId = api.tipoIniciativaId ?? null;
  form.areaNegocioId = api.areaNegocioId ?? null;
  form.devEncargado = api.devEncargado ?? '';
  form.tlEncargado = api.tlEncargado ?? '';
  form.liderIniciativa = api.liderIniciativa ?? '';
  form.sprintComprometido = api.sprintComprometido ?? row.sprintCompromiso ?? '';
  form.sprintPaseProduccion = api.sprintPaseProduccion ?? row.sprintPaseProduccion ?? '';
  form.hito = api.hitoComprometido ?? api.hito ?? row.hitoQ2 ?? '';
  form.hitoComprometido = api.hitoComprometido ?? api.hito ?? row.hitoQ2 ?? '';
  form.origenIniciativa = api.origenIniciativa ?? row.origenIniciativa ?? '';
  form.origen = api.origen ?? api.origenIniciativa ?? row.origenIniciativa ?? '';
  form.esCross = Boolean(api.esCross);
  form.impactoSox = Boolean(api.impactoSox);
  form.notas = api.notas ?? '';
  origenResetNotice.value = false;
  Object.keys(formErrors).forEach((k) => delete formErrors[k]);
  formOpen.value = true;
}

function openDetail(row: IniciativaTableRow): void {
  detailId.value = row.detailId;
  detailOpen.value = true;
}

function openEditFromDetail(): void {
  const row = rowsWithKey.value.find((r) => r.detailId === detailId.value);
  if (!row) {
    return;
  }
  detailOpen.value = false;
  openEdit(row);
}

function closeForm(): void {
  if (saving.value) {
    return;
  }
  formOpen.value = false;
}

function validateStep1(): boolean {
  Object.keys(formErrors).forEach((k) => delete formErrors[k]);
  if (!isPeriodo(form.periodo)) {
    formErrors.periodo = 'Usa el formato Q2-2026.';
  }
  if (!form.squad.trim()) {
    formErrors.squad = 'Selecciona un squad.';
  }
  if (!form.epicaIniciativa.trim()) {
    formErrors.epicaIniciativa = 'Ingresa la épica o iniciativa.';
  }
  if (!form.estatus.trim()) {
    formErrors.estatus = 'Selecciona el estado general.';
  }
  if (!form.faseActual.trim()) {
    formErrors.faseActual = 'Selecciona la fase actual.';
  }
  return Object.keys(formErrors).length === 0;
}

function validateSprintHitoComprometido(): boolean {
  delete formErrors.sprintComprometido;
  delete formErrors.hitoComprometido;
  if (isSprintComprometidoMissing.value) {
    formErrors.sprintComprometido = 'Debes seleccionar un Sprint Comprometido';
  }
  if (isHitoComprometidoMissing.value) {
    formErrors.hitoComprometido = 'Debes seleccionar un Hito Comprometido';
  }
  return !formErrors.sprintComprometido && !formErrors.hitoComprometido;
}

function goStep2(): void {
  if (validateStep1()) {
    formStep.value = 2;
  }
}

function validateForm(): string | null {
  const isStep1Valid = validateStep1();
  const isSprintHitoValid = validateSprintHitoComprometido();
  if (!isStep1Valid) {
    return 'Completa los campos obligatorios del Paso 1.';
  }
  return isSprintHitoValid ? null : 'Completa Sprint e Hito Comprometido juntos.';
}

async function persistForm(): Promise<void> {
  const validation = validateForm();
  if (validation) {
    err.value = validation;
    return;
  }
  saving.value = true;
  err.value = null;
  okMsg.value = null;
  try {
    const payload: IniciativaInput = {
      ...form,
      origenIniciativa: form.origen ?? form.origenIniciativa,
      hito: form.hitoComprometido ?? form.hito,
    };
    const saved =
      formMode.value === 'edit' && editId.value
        ? await updateIniciativaApi(editId.value, payload)
        : await createIniciativaApi(payload);
    if (saved.periodo === selectedPeriodo.value) {
      const idx = rowsApi.value.findIndex((r) => r.id === saved.id);
      if (idx >= 0) {
        rowsApi.value.splice(idx, 1, saved);
      } else {
        rowsApi.value.unshift(saved);
      }
    } else if (formMode.value === 'edit') {
      rowsApi.value = rowsApi.value.filter((r) => r.id !== saved.id);
    }
    if (!periodos.value.includes(saved.periodo)) {
      periodos.value = [...periodos.value, saved.periodo].sort((a, b) => periodoOrder(b) - periodoOrder(a));
    }
    formOpen.value = false;
    okMsg.value = 'Iniciativa guardada correctamente.';
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'No se pudo guardar la iniciativa.';
  } finally {
    saving.value = false;
  }
}

function guardarForm(): void {
  const validation = validateForm();
  if (validation) {
    err.value = validation;
    return;
  }
  if (formMode.value === 'create' && form.periodo !== selectedPeriodo.value) {
    confirm.require({
      message: `Esta iniciativa se guardará en ${form.periodo}. ¿Confirmas?`,
      header: 'Confirmar periodo',
      acceptLabel: 'Sí, guardar',
      rejectLabel: 'Cancelar',
      accept: () => {
        void persistForm();
      },
    });
    return;
  }
  if (formMode.value === 'edit' && isHistoricalPeriodo.value) {
    confirm.require({
      message: `Estás editando una iniciativa del periodo histórico ${selectedPeriodo.value}. ¿Confirmas el cambio?`,
      header: 'Confirmar edición histórica',
      acceptLabel: 'Sí, editar',
      rejectLabel: 'Cancelar',
      accept: () => {
        void persistForm();
      },
    });
    return;
  }
  void persistForm();
}

function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function readCellText(sheet: ExcelJS.Worksheet, rowNumber: number, columnNumber: number): string {
  return sheet.getRow(rowNumber).getCell(columnNumber).text.trim();
}

function estadoImportLabel(item: ColorCatalogApi): string {
  return `${item.valor}. ${item.label}`;
}

function estadoImportDisplay(value: string): string {
  const item = catalogEstatus.value.find((x) => x.valor === value);
  return item ? estadoImportLabel(item) : value || '—';
}

function normalizeEstadoImport(raw: string): string {
  const value = raw.trim();
  if (!value) {
    return '';
  }
  const numeric = /^([1-7])(?:\D|$)/.exec(value);
  if (numeric) {
    return numeric[1];
  }
  const normalized = normalizeForMatch(value);
  return (
    catalogEstatus.value.find(
      (item) => normalizeForMatch(item.valor) === normalized || normalizeForMatch(item.label) === normalized,
    )?.valor ?? ''
  );
}

function normalizeFaseImport(raw: string): string {
  const value = raw.trim();
  if (!value) {
    return '';
  }
  const code = /^(F[0-8])(?:\D|$)/i.exec(value);
  if (code) {
    return code[1].toUpperCase();
  }
  const normalized = normalizeForMatch(value);
  return catalogFases.value.find((item) => normalizeForMatch(item.label) === normalized)?.valor ?? '';
}

function resolveCatalogId(list: NamedCatalogApi[], raw: string, field: string, errors: string[]): string | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  const normalized = normalizeForMatch(value);
  const match = list.find((item) => normalizeForMatch(item.nombre) === normalized);
  if (!match) {
    errors.push(`${field} inválido`);
    return null;
  }
  return match.id;
}

function parseYesNo(raw: string, field: string, errors: string[]): boolean | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }
  const normalized = normalizeForMatch(value);
  if (normalized === 'si') {
    return true;
  }
  if (normalized === 'no') {
    return false;
  }
  errors.push(`${field} inválido`);
  return null;
}

function validateRequiredImport(row: IniciativaInput, errors: string[]): void {
  if (!row.periodo.trim()) errors.push('Periodo obligatorio');
  else if (!isPeriodo(row.periodo)) errors.push('Periodo inválido');
  else if (!periodos.value.includes(row.periodo)) errors.push('Periodo fuera del catálogo activo');
  if (!row.squad.trim()) errors.push('Squad obligatorio');
  else if (!squadOptionsMulti.value.some((item) => item.value === row.squad)) errors.push('Squad fuera del catálogo activo');
  if (!row.epicaIniciativa.trim()) errors.push('Épica / Iniciativa obligatoria');
  if (!row.estatus.trim()) errors.push('Estado General obligatorio o inválido');
  if (!row.faseActual.trim()) errors.push('Fase Actual obligatoria o inválida');
}

function validateSprintHitoImport(row: IniciativaInput, errors: string[]): void {
  const hasSprint = Boolean(String(row.sprintComprometido ?? '').trim());
  const hasHito = Boolean(String(row.hitoComprometido ?? row.hito ?? '').trim());
  if (hasSprint !== hasHito) {
    errors.push('Sprint e Hito Comprometido deben completarse juntos');
  }
}

function parseImportPreviewRow(sheet: ExcelJS.Worksheet, rowNumber: number): ImportPreviewRow | null {
  const cells = Array.from({ length: 18 }, (_, index) => readCellText(sheet, rowNumber, index + 1));
  if (cells.every((value) => !value)) {
    return null;
  }
  const errors: string[] = [];
  const data: IniciativaInput = {
    periodo: cells[0],
    squad: cells[1],
    epicaIniciativa: cells[2],
    estatus: normalizeEstadoImport(cells[3]),
    faseActual: normalizeFaseImport(cells[4]),
    descripcion: cells[5] || null,
    sistemaComponenteId: resolveCatalogId(portafolioCatalog.value, cells[6], 'Sistema / Componente', errors),
    tipoIniciativaId: resolveCatalogId(tipoIniciativaCatalog.value, cells[7], 'Tipo de Iniciativa', errors),
    areaNegocioId: resolveCatalogId(areaNegocioCatalog.value, cells[8], 'Área del Negocio', errors),
    devEncargado: cells[9] || null,
    tlEncargado: cells[10] || null,
    liderIniciativa: cells[11] || null,
    sprintComprometido: cells[12] || null,
    hito: cells[13] || null,
    hitoComprometido: cells[13] || null,
    origenIniciativa: cells[14] || null,
    origen: cells[14] || null,
    esCross: parseYesNo(cells[15], '¿Es Cross?', errors),
    impactoSox: parseYesNo(cells[16], '¿Impacto en Controles SOX?', errors),
    notas: cells[17] || null,
  };
  validateRequiredImport(data, errors);
  validateSprintHitoImport(data, errors);
  return { excelRow: rowNumber, data, errors };
}

function onImportFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  importFile.value = file ?? null;
  importRows.value = [];
  importFileName.value = file?.name ?? '';
}

function openImport(): void {
  if (!canAdminIniciativas.value) {
    return;
  }
  importRows.value = [];
  importFile.value = null;
  importFileName.value = '';
  importOpen.value = true;
}

async function descargarPlantilla(): Promise<void> {
  templateDownloading.value = true;
  err.value = null;
  try {
    const blob = await downloadIniciativasCargaTemplate();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla-carga-masiva-iniciativas.xlsx';
    link.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'No se pudo descargar la plantilla.';
  } finally {
    templateDownloading.value = false;
  }
}

async function procesarImport(): Promise<void> {
  if (!importFile.value) {
    err.value = 'Selecciona un archivo para procesar.';
    return;
  }
  importProcessing.value = true;
  err.value = null;
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await importFile.value.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      importRows.value = [];
      err.value = 'El archivo no contiene hojas.';
      return;
    }
    const parsed: ImportPreviewRow[] = [];
    for (let rowNumber = 4; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = parseImportPreviewRow(sheet, rowNumber);
      if (row) {
        parsed.push(row);
      }
    }
    importRows.value = parsed;
    if (parsed.length === 0) {
      err.value = 'No se encontraron filas de datos desde la fila 4.';
    }
  } catch {
    importRows.value = [];
    err.value = 'No se pudo leer el archivo. Verifica que sea un .xlsx válido.';
  } finally {
    importProcessing.value = false;
  }
}

async function confirmarImport(): Promise<void> {
  err.value = null;
  okMsg.value = null;
  const validRows = importValidRows.value.map((row) => row.data);
  if (validRows.length === 0) {
    err.value = 'No hay filas válidas para importar.';
    return;
  }
  importSaving.value = true;
  try {
    const result = await cargaMasivaIniciativasApi(validRows);
    await loadPeriodos();
    await load();
    importOpen.value = false;
    okMsg.value = `${result.imported} iniciativas importadas · ${importInvalidCount.value + result.omitted} omitidas`;
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'No se pudo importar el archivo.';
  } finally {
    importSaving.value = false;
  }
}

watch(
  () => route.query.periodo,
  (value) => {
    const next = String(value ?? '');
    if (isPeriodo(next) && next !== selectedPeriodo.value) {
      selectedPeriodo.value = next;
      void load();
    }
  },
);

watch(
  () => form.periodo,
  (next, prev) => {
    if (!formOpen.value || next === prev) {
      return;
    }
    if (form.origen || form.origenIniciativa) {
      form.origen = '';
      form.origenIniciativa = '';
      origenResetNotice.value = true;
    }
  },
);

watch(
  () => form.squad,
  () => {
    form.devEncargado = '';
    form.tlEncargado = '';
  },
  { flush: 'sync' },
);

watch(
  () => [form.sprintComprometido, form.hitoComprometido],
  () => {
    if (formErrors.sprintComprometido || formErrors.hitoComprometido) {
      validateSprintHitoComprometido();
    }
  },
);

onMounted(async () => {
  const [estados, fases, tipos, areas, portafolio] = await Promise.all([
    fetchEstadosGeneral().catch((): ColorCatalogApi[] => defaultEstados),
    fetchFasesActuales().catch((): ColorCatalogApi[] => defaultFases),
    fetchTipoIniciativaCatalog().catch((): NamedCatalogApi[] => []),
    fetchAreaNegocioCatalog().catch((): NamedCatalogApi[] => []),
    fetchPortafolioCatalog().catch((): NamedCatalogApi[] => []),
  ]);
  catalogEstatus.value = estados.length ? estados : defaultEstados;
  catalogFases.value = fases.length ? fases : defaultFases;
  tipoIniciativaCatalog.value = tipos;
  areaNegocioCatalog.value = areas;
  portafolioCatalog.value = portafolio;
  await loadPeriodos();
  selectedPeriodo.value = resolveInitialPeriodo();
  syncPeriodoQuery(selectedPeriodo.value);
  await load();
});
</script>

<template>
  <div class="ini">
    <header class="ini__hero">
      <div class="ini__hero-main">
        <div>
          <span class="ini__eyebrow">Program Board</span>
          <h2 class="ini__title">Iniciativas</h2>
          <p class="ini__hint">Seguimiento por periodo con filtros operativos, consulta historica y gestion de papelera.</p>
        </div>
        <div v-if="canManageIniciativas" class="ini__head-actions">
          <IsButton
            v-if="canEditCurrentView && !isHistoricalPeriodo"
            size="small"
            icon="pi pi-plus"
            label="Nueva iniciativa"
            @click="openNuevo"
          />
          <IsButton
            v-if="canAdminIniciativas"
            size="small"
            outlined
            icon="pi pi-upload"
            label="Carga masiva"
            @click="openImport"
          />
          <RouterLink v-if="canManageIniciativas" v-slot="{ href, navigate }" custom :to="{ name: 'iniciativas-papelera' }">
            <a
              class="ini__papelera"
              :href="href"
              @click.prevent="navigate()"
            >
              <i class="pi pi-trash" aria-hidden="true" />
              <span>Papelera</span>
            </a>
          </RouterLink>
        </div>
      </div>
      <div class="ini__summary" aria-label="Resumen de iniciativas">
        <div v-for="stat in boardStats" :key="stat.label" class="ini__stat">
          <span class="ini__stat-label">{{ stat.label }}</span>
          <strong class="ini__stat-value">{{ stat.value }}</strong>
        </div>
      </div>
    </header>

    <section class="ini__control-panel" aria-label="Controles de iniciativas">
      <div class="ini__control-head">
        <section class="ini__period">
      <div class="ini__filter ini__filter--period">
        <label class="ini__lbl" for="ini-periodo">Periodo</label>
        <IsSelect
          input-id="ini-periodo"
          :model-value="selectedPeriodo"
          :options="periodoOptions"
          option-label="label"
          option-value="value"
          fluid
          @update:model-value="onPeriodoChange"
        />
      </div>
      <span v-if="isHistoricalPeriodo" class="ini__historic">
        Periodo histórico: la vista es de consulta{{ canAdminIniciativas ? ', con edición administrativa.' : '.' }}
      </span>
      <span v-else class="ini__active">Periodo activo</span>
    </section>
        <span class="ini__filter-count">{{ activeFilterCount }} filtros activos</span>
      </div>

    <p v-if="err" class="ini__err" role="alert">{{ err }}</p>
    <p v-if="okMsg" class="ini__ok" role="status">{{ okMsg }}</p>

    <section class="ini__filters" aria-label="Filtros de iniciativas">
      <div class="ini__filter">
        <label class="ini__lbl" for="ini-filter-squad">Squad</label>
        <IsMultiSelect
          id="ini-filter-squad"
          v-model="filterSquads"
          :options="squadOptionsMulti"
          option-label="label"
          option-value="value"
          placeholder="Todos"
          display="chip"
          filter
          fluid
          class="ini__multiselect"
        />
      </div>
      <div class="ini__filter">
        <label class="ini__lbl" for="ini-filter-estatus">Estatus</label>
        <IsSelect
          input-id="ini-filter-estatus"
          :model-value="filterEstatus"
          placeholder="Todos"
          :options="estatusFilterOptions"
          option-label="label"
          option-value="value"
          fluid
          @update:model-value="(v) => (filterEstatus = String(v ?? ''))"
        />
      </div>
      <div class="ini__filter">
        <label class="ini__lbl" for="ini-filter-hito">Hito</label>
        <IsSelect
          input-id="ini-filter-hito"
          :model-value="filterHito"
          placeholder="Todos"
          :options="hitoFilterOptions"
          option-label="label"
          option-value="value"
          fluid
          @update:model-value="(v) => (filterHito = String(v ?? ''))"
        />
      </div>
      <div class="ini__filter ini__filter--dates">
        <span class="ini__lbl">Fecha comprometida</span>
        <div class="ini__date-row">
          <div>
            <AppDatePicker
              class="ini__date"
              :model-value="filterFechaDesde"
              label="Desde"
              @update:model-value="(v: string | null) => (filterFechaDesde = v ?? '')"
            />
          </div>
          <span class="ini__date-sep" aria-hidden="true">-</span>
          <div>
            <AppDatePicker
              class="ini__date"
              :model-value="filterFechaHasta"
              label="Hasta"
              :min-date="filterFechaDesde"
              @update:model-value="(v: string | null) => (filterFechaHasta = v ?? '')"
            />
          </div>
        </div>
      </div>
    </section>
    </section>

    <div class="ini__toolbar">
      <div class="ini__search-wrap">
        <IsIconField icon-position="left" class="w-full">
          <IsInputIcon class="pi pi-search" />
          <IsInputText v-model="globalFilter" placeholder="Buscar por iniciativa, squad, hito o sprint" fluid />
        </IsIconField>
      </div>
      <span class="ini__count">{{ filteredRows.length }} de {{ rowsWithKey.length }} iniciativas</span>
    </div>

    <p v-if="loading" class="ini__muted">Cargando…</p>

    <div v-else class="ini__table-scroll">
      <IsDataTable
        :value="filteredRows"
        data-key="detailId"
        striped-rows
        paginator
        :rows="15"
        :rows-per-page-options="[15, 30, 60]"
        sort-mode="multiple"
        removable-sort
        class="ini__table"
        :pt="{ root: { class: 'p-datatable-sm' } }"
      >
        <IsColumn field="squadDisplay" header="Squad" sortable style="min-width: 9rem">
          <template #body="{ data }">
            <span
              v-if="(data as IniciativaTableRow).squadDisplay !== '—'"
              class="ini__chip ini__chip--squad"
              :style="squadChipStyle((data as IniciativaTableRow).squadColor)"
            >
              {{ (data as IniciativaTableRow).squadDisplay }}
            </span>
            <span v-else class="ini__em">—</span>
          </template>
        </IsColumn>
        <IsColumn field="epica" header="Épica / Iniciativa" sortable style="min-width: 18rem">
          <template #body="{ data }">
            <span class="ini__initiative-name">{{ (data as IniciativaTableRow).epica || '—' }}</span>
          </template>
        </IsColumn>
        <IsColumn field="estatusGeneral" header="Estatus" sortable style="min-width: 10rem">
          <template #body="{ data }">
            <span v-if="!String(data.estatusGeneral ?? '').trim()" class="ini__em">—</span>
            <BadgePill
              v-else
              :variant="estatusGeneralToPillVariant(data.estatusGeneral)"
              :title="data.estatusGeneral"
              :style="chipStyle(estadoByValor.get(data.estatusValor))"
            >
              {{ data.estatusGeneral }}
            </BadgePill>
          </template>
        </IsColumn>
        <IsColumn field="faseActual" header="Fase actual" sortable style="min-width: 11rem">
          <template #body="{ data }">
            <span class="ini__chip" :style="chipStyle(faseByValor.get(data.faseValor))">{{ data.faseActual }}</span>
          </template>
        </IsColumn>
        <IsColumn field="sprintCompromiso" header="Sprint comprometido" sortable style="min-width: 11rem">
          <template #body="{ data }">
            <span class="ini__text-cell">{{ (data as IniciativaTableRow).sprintCompromiso || '—' }}</span>
          </template>
        </IsColumn>
        <IsColumn field="hitoQ2" header="Hito" sortable style="min-width: 10rem">
          <template #body="{ data }">
            <span class="ini__text-cell">{{ (data as IniciativaTableRow).hitoQ2 || '—' }}</span>
          </template>
        </IsColumn>
        <IsColumn field="origenIniciativa" header="Origen de la iniciativa" sortable style="min-width: 11rem">
          <template #body="{ data }">
            {{ displayOrigen((data as IniciativaTableRow).origenIniciativa) }}
          </template>
        </IsColumn>
        <IsColumn field="accion" header="Acción" style="width: 8rem">
          <template #body="{ data }">
            <span class="ini__actions">
              <button
                type="button"
                class="ini__icon-action"
                aria-label="Ver detalle de iniciativa"
                title="Ver detalle"
                @click="openDetail(data as IniciativaTableRow)"
              >
                <i class="pi pi-eye" aria-hidden="true" />
              </button>
              <button
                v-if="canEditCurrentView"
                type="button"
                class="ini__icon-action"
                aria-label="Editar iniciativa"
                title="Editar"
                @click="openEdit(data as IniciativaTableRow)"
              >
                <i class="pi pi-pencil" aria-hidden="true" />
              </button>
              <button
                v-if="canEditCurrentView"
                type="button"
                class="ini__icon-action ini__icon-action--danger"
                aria-label="Eliminar iniciativa"
                title="Eliminar"
                @click="eliminar(data as IniciativaTableRow)"
              >
                <i class="pi pi-trash" aria-hidden="true" />
              </button>
            </span>
          </template>
        </IsColumn>
      </IsDataTable>
    </div>

    <IsDialog
      v-model:visible="formOpen"
      modal
      :dismissable-mask="false"
      :close-on-escape="false"
      :closable="false"
      class="ini__dlg"
      :style="{ width: 'min(760px, 96vw)' }"
      :content-style="{ padding: '0' }"
    >
      <template #header>
        <div class="ini-form-head">
          <div class="ini-form-head__row">
            <span class="ini-form-head__title" role="heading" aria-level="2">{{ formTitle }}</span>
            <button type="button" class="ini-form-head__close" aria-label="Cerrar" @click="closeForm">×</button>
          </div>
          <p class="ini-form-head__progress" role="status">{{ formHeaderSubtitle }}</p>
          <div class="ini-form-head__bar" aria-hidden="true">
            <div class="ini-form-head__bar-fill" :style="{ width: formStep === 1 ? '50%' : '100%' }" />
          </div>
        </div>
      </template>

      <div class="ini-form-shell">
        <div v-if="formStep === 1" class="ini__form">
        <label class="ini__field">
          <span class="ini__label">Periodo <span class="ini__req">*</span></span>
          <IsSelect
            v-model="form.periodo"
            :options="periodoOptions"
            option-label="label"
            option-value="value"
            fluid
            :disabled="saving"
          />
          <small v-if="formErrors.periodo" class="ini__field-err">{{ formErrors.periodo }}</small>
        </label>
        <label class="ini__field">
          <span class="ini__label">Squad <span class="ini__req">*</span></span>
          <IsSelect
            v-model="form.squad"
            :options="squadOptionsMulti"
            option-label="label"
            option-value="value"
            filter
            fluid
            :disabled="saving || isReadonlyHistorical"
          >
            <template #value="{ value, placeholder }">
              <span v-if="value" class="ini__chip ini__chip--squad" :style="squadChipStyle(squadColorByName(String(value)))">
                {{ value }}
              </span>
              <span v-else>{{ placeholder }}</span>
            </template>
            <template #option="{ option }">
              <span class="ini__select-squad-option">
                <span class="ini__squad-dot" :style="{ backgroundColor: option.color }" aria-hidden="true" />
                <span>{{ option.label }}</span>
              </span>
            </template>
          </IsSelect>
          <small v-if="formErrors.squad" class="ini__field-err">{{ formErrors.squad }}</small>
        </label>
        <label class="ini__field ini__form-wide">
          <span class="ini__label">Épica / Iniciativa <span class="ini__req">*</span></span>
          <IsInputText v-model="form.epicaIniciativa" fluid :disabled="saving || isReadonlyHistorical" />
          <small v-if="formErrors.epicaIniciativa" class="ini__field-err">{{ formErrors.epicaIniciativa }}</small>
        </label>
        <label class="ini__field">
          <span class="ini__label">Estado General <span class="ini__req">*</span></span>
          <IsSelect
            v-model="form.estatus"
            :options="estadoOptions"
            option-label="label"
            option-value="value"
            placeholder="Selecciona un estado"
            fluid
            :disabled="saving || isReadonlyHistorical"
          />
          <small v-if="formErrors.estatus" class="ini__field-err">{{ formErrors.estatus }}</small>
        </label>
        <label class="ini__field">
          <span class="ini__label">Fase Actual <span class="ini__req">*</span></span>
          <IsSelect
            v-model="form.faseActual"
            :options="faseOptions"
            option-label="label"
            option-value="value"
            fluid
            :disabled="saving || isReadonlyHistorical"
          />
          <small v-if="formErrors.faseActual" class="ini__field-err">{{ formErrors.faseActual }}</small>
        </label>
      </div>

      <div v-else class="ini__form">
        <div class="ini__field ini__form-wide">
          <span class="ini__label">Descripción</span>
          <RichTextEditor
            :model-value="form.descripcion ?? ''"
            placeholder="Contexto de la iniciativa, alcance u objetivos."
            aria-label="Descripción de la iniciativa"
            :disabled="saving || isReadonlyHistorical"
            @update:model-value="(value) => (form.descripcion = value)"
          />
        </div>
        <label class="ini__field">
          <span class="ini__label">Sistema / Componente Impactado</span>
          <IsSelect v-model="form.sistemaComponenteId" :options="portafolioOptions" option-label="label" option-value="value" filter fluid show-clear :disabled="saving || isReadonlyHistorical" />
        </label>
        <label class="ini__field">
          <span class="ini__label">Tipo de Iniciativa</span>
          <IsSelect v-model="form.tipoIniciativaId" :options="tipoIniciativaOptions" option-label="label" option-value="value" filter fluid show-clear :disabled="saving || isReadonlyHistorical" />
        </label>
        <label class="ini__field">
          <span class="ini__label">Área del Negocio</span>
          <IsSelect v-model="form.areaNegocioId" :options="areaNegocioOptions" option-label="label" option-value="value" filter fluid show-clear :disabled="saving || isReadonlyHistorical" />
        </label>
        <label class="ini__field">
          <span class="ini__label">Dev Encargado</span>
          <IsSelect v-model="form.devEncargado" :options="devOptions" option-label="label" option-value="value" editable fluid show-clear :disabled="saving || isReadonlyHistorical" />
        </label>
        <label class="ini__field">
          <span class="ini__label">TL Encargado</span>
          <IsSelect v-model="form.tlEncargado" :options="tlOptions" option-label="label" option-value="value" editable fluid show-clear :disabled="saving || isReadonlyHistorical" />
        </label>
        <label class="ini__field">
          <span class="ini__label">Líder Iniciativa</span>
          <IsInputText v-model="form.liderIniciativa" fluid :disabled="saving || isReadonlyHistorical" />
        </label>
        <label class="ini__field">
          <span class="ini__label">
            Sprint Comprometido <span v-if="isSprintComprometidoRequired" class="ini__req">*</span>
          </span>
          <IsSelect
            v-model="form.sprintComprometido"
            :options="sprintOptions"
            option-label="label"
            option-value="value"
            fluid
            show-clear
            :class="{ 'ini__control--required': isSprintComprometidoMissing }"
            :disabled="saving || isReadonlyHistorical"
          />
          <small v-if="formErrors.sprintComprometido" class="ini__field-err">
            {{ formErrors.sprintComprometido }}
          </small>
        </label>
        <label class="ini__field">
          <span class="ini__label">
            Hito Comprometido <span v-if="isHitoComprometidoRequired" class="ini__req">*</span>
          </span>
          <IsSelect
            v-model="form.hitoComprometido"
            :options="hitoOptions"
            option-label="label"
            option-value="value"
            fluid
            show-clear
            :class="{ 'ini__control--required': isHitoComprometidoMissing }"
            :disabled="saving || isReadonlyHistorical"
          />
          <small v-if="formErrors.hitoComprometido" class="ini__field-err">
            {{ formErrors.hitoComprometido }}
          </small>
        </label>
        <label class="ini__field">
          <span class="ini__label">Origen</span>
          <IsSelect v-model="form.origen" :options="origenOptions" option-label="label" option-value="value" fluid show-clear :disabled="saving || isReadonlyHistorical" />
          <small v-if="origenResetNotice" class="ini__notice">Origen se reinició por cambio de periodo.</small>
        </label>
        <label class="ini__toggle">
          <input v-model="form.esCross" type="checkbox" :disabled="saving || isReadonlyHistorical" />
          <span>¿Es Cross?</span>
        </label>
        <label class="ini__toggle">
          <input v-model="form.impactoSox" type="checkbox" :disabled="saving || isReadonlyHistorical" />
          <span>¿Impacto en Controles SOX?</span>
        </label>
        <label class="ini__field ini__form-wide">
          <span class="ini__label">Notas</span>
          <textarea v-model="form.notas" class="ini__textarea" :disabled="saving || isReadonlyHistorical" />
        </label>
      </div>
      </div>
      <template #footer>
        <div class="ini-form-footer">
          <IsButton severity="primary" outlined label="Cancelar" :disabled="saving" @click="closeForm" />
          <template v-if="formStep === 1">
            <IsButton severity="primary" label="Siguiente" :disabled="saving || isReadonlyHistorical" @click="goStep2" />
          </template>
          <template v-else>
            <IsButton severity="primary" outlined label="Atrás" :disabled="saving" @click="formStep = 1" />
            <IsButton
              severity="primary"
              icon="pi pi-check"
              label="Guardar Iniciativa"
              :loading="saving"
              :disabled="saving || isReadonlyHistorical"
              @click="guardarForm"
            />
          </template>
        </div>
      </template>
    </IsDialog>

    <IsDialog
      v-model:visible="detailOpen"
      modal
      header="Detalle de iniciativa"
      class="ini__detail-dialog"
      :style="{ width: 'min(980px, 96vw)' }"
    >
      <template v-if="detailApi">
        <header class="ini-detail__head">
          <div>
            <p class="ini-detail__eyebrow">Iniciativa</p>
            <h3 class="ini-detail__title">{{ displayValue(detailApi.epicaIniciativa) }}</h3>
          </div>
          <div class="ini-detail__badges">
            <BadgePill
              v-if="detailApi.estatus"
              :variant="estatusGeneralToPillVariant(catalogLabel(catalogEstatus, detailApi.estatus))"
              :style="chipStyle(estadoByValor.get(detailApi.estatus))"
            >
              {{ catalogLabel(catalogEstatus, detailApi.estatus) }}
            </BadgePill>
            <span class="ini__chip" :style="chipStyle(faseByValor.get(detailApi.faseActual))">
              {{ catalogLabel(catalogFases, detailApi.faseActual) }}
            </span>
          </div>
        </header>

        <div class="ini-detail__sections">
          <section v-for="section in detailSectionFields(detailApi)" :key="section.title" class="ini-detail__section">
            <h4 class="ini-detail__section-title">{{ section.title }}</h4>
            <dl class="ini-detail__grid">
              <template v-for="field in section.fields" :key="field.label">
                <dt>{{ field.label }}</dt>
                <dd>
                  <span
                    v-if="field.label === 'Squad' && field.value !== '—'"
                    class="ini__chip ini__chip--squad"
                    :style="squadChipStyle(squadColorByName(field.value))"
                  >
                    {{ field.value }}
                  </span>
                  <template v-else>{{ field.value }}</template>
                </dd>
              </template>
            </dl>
          </section>

          <section class="ini-detail__section ini-detail__section--wide">
            <h4 class="ini-detail__section-title">Descripción</h4>
            <RichTextEditor
              :model-value="detailApi.descripcion || '<p>—</p>'"
              readonly
              aria-label="Descripción de la iniciativa"
            />
          </section>
        </div>
      </template>
      <p v-else class="ini__muted">No se encontró la iniciativa seleccionada.</p>

      <template #footer>
        <div class="ini-form-footer">
          <IsButton severity="primary" outlined label="Cerrar" @click="detailOpen = false" />
          <IsButton
            v-if="detailApi && canEditCurrentView"
            severity="primary"
            icon="pi pi-pencil"
            label="Editar"
            @click="openEditFromDetail"
          />
        </div>
      </template>
    </IsDialog>

    <IsDialog
      v-model:visible="importOpen"
      header="Carga masiva de iniciativas"
      modal
      class="ini__dlg ini__dlg--import"
      :style="{ width: 'min(1040px, 96vw)' }"
    >
      <div class="ini__import">
        <section class="ini__import-help">
          <div>
            <h3>Plantilla oficial</h3>
            <p>
              Descarga la plantilla, completa desde la fila 4 y conserva los encabezados. Los campos en amarillo son
              obligatorios y los desplegables usan valores activos de la base de datos.
            </p>
          </div>
          <IsButton
            outlined
            icon="pi pi-download"
            label="Descargar plantilla"
            :loading="templateDownloading"
            @click="descargarPlantilla"
          />
        </section>

        <label class="ini__field ini__form-wide">
          <span class="ini__label">Archivo completado</span>
          <input class="ini__input" type="file" accept=".xlsx" @change="onImportFile" />
        </label>

        <div class="ini__import-actions">
          <p v-if="importFileName" class="ini__muted">{{ importFileName }}</p>
          <IsButton
            label="Procesar"
            icon="pi pi-file-import"
            :loading="importProcessing"
            :disabled="!importFile || importProcessing"
            @click="procesarImport"
          />
        </div>

        <section v-if="importPreviewRows.length" class="ini__preview">
          <div class="ini__preview-head">
            <strong>{{ importValidCount }} filas válidas · {{ importInvalidCount }} con errores</strong>
            <span>Se importarán solo las filas válidas al confirmar.</span>
          </div>
          <div class="ini__preview-scroll">
            <table class="ini__preview-table">
              <thead>
                <tr>
                  <th>Fila</th>
                  <th>Periodo</th>
                  <th>Squad</th>
                  <th>Épica / Iniciativa</th>
                  <th>Estado</th>
                  <th>Fase</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in importPreviewRows"
                  :key="row.excelRow"
                  :class="row.errors.length ? 'ini__preview-row--error' : 'ini__preview-row--ok'"
                >
                  <td>{{ row.excelRow }}</td>
                  <td>{{ row.data.periodo || '—' }}</td>
                  <td>{{ row.data.squad || '—' }}</td>
                  <td>{{ row.data.epicaIniciativa || '—' }}</td>
                  <td>{{ estadoImportDisplay(row.data.estatus) }}</td>
                  <td>{{ row.data.faseActual ? catalogLabel(catalogFases, row.data.faseActual) : '—' }}</td>
                  <td>{{ row.errors.length ? row.errors.join(', ') : 'Lista para importar' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <template #footer>
        <IsButton text label="Cancelar" :disabled="importSaving" @click="importOpen = false" />
        <IsButton
          label="Importar solo las válidas"
          :loading="importSaving"
          :disabled="importValidCount === 0 || importSaving"
          @click="confirmarImport"
        />
      </template>
    </IsDialog>
  </div>
</template>

<style scoped>
.ini {
  min-height: 360px;
  background: #d9e5f3;
  border-radius: 8px;
  padding: 1rem 1.25rem 1.5rem;
}
.ini__head-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.4rem;
}
.ini__head-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.ini__papelera {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 13px;
  font-weight: 700;
  color: #5a6f82;
  text-decoration: none;
  padding: 0.4rem 0.65rem;
  border-radius: 6px;
  border: 1px solid #cfdfea;
  background: #fff;
}
.ini__papelera:hover {
  color: #1361b9;
  border-color: #1361b9;
}
.ini__papelera--disabled,
.ini__papelera--disabled:hover {
  color: theme('colors.surface.400');
  border-color: theme('colors.surface.300');
  cursor: not-allowed;
  opacity: 0.55;
}
.ini__head {
  margin-bottom: 1rem;
}
.ini__title {
  margin: 0;
  font-family: Omnes, system-ui, sans-serif;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #1a1a2e;
}
.ini__hint {
  margin: 0;
  font-size: 13px;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #5a6f82;
  line-height: 1.55;
  max-width: 52rem;
}
.ini__err {
  color: #c41e24;
  font-size: 13px;
  margin: 0 0 1rem;
}
.ini__ok {
  color: #166534;
  font-size: 13px;
  margin: 0 0 1rem;
}
.ini__period {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 0.85rem 1rem;
  background: #fff;
  border: 1px solid #cfdfea;
  border-radius: 8px;
}
.ini__historic,
.ini__active {
  display: inline-flex;
  align-items: center;
  min-height: 2.35rem;
  font-size: 13px;
  font-weight: 700;
}
.ini__historic {
  color: #92400e;
}
.ini__active {
  color: #166534;
}
.ini__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.25rem;
  align-items: flex-end;
  margin-bottom: 1rem;
  padding: 1rem;
  background: #fff;
  border-radius: 8px;
  border: 1px solid #cfdfea;
}
.ini__filter {
  flex: 1 1 12rem;
  min-width: 10rem;
  max-width: 22rem;
}
.ini__filter--dates {
  max-width: 26rem;
}
.ini__lbl {
  display: block;
  font-size: 12px;
  font-weight: 700;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #5a6f82;
  margin-bottom: 0.35rem;
}
.ini__date-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.ini__date {
  min-width: 10.5rem;
}
.ini__date :deep(.app-date-picker__label) {
  font-size: 13px;
  margin-bottom: 0.25rem;
}
.ini__date :deep(.app-date-picker__control) {
  height: 36px;
}
.ini__date-sep {
  color: #94a3b8;
  font-weight: 600;
}
.ini__sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
.ini__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1rem;
  margin-bottom: 1rem;
}
.ini__search-wrap {
  flex: 1 1 16rem;
  min-width: 260px;
  max-width: 28rem;
}
.ini__count {
  font-size: 13px;
  font-weight: 600;
  color: #5a6f82;
}
.ini__muted {
  font-size: 13px;
  color: #5a6f82;
}
.ini__table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 8px;
  border: 1px solid #cfdfea;
  background: #fff;
}
.ini__table {
  font-size: 13px;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  min-width: 72rem;
}
.ini__em {
  color: #5a6f82;
  font-size: 13px;
}
.ini__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
}
.ini__icon-action {
  border: none;
  background: transparent;
  color: #1a1a2e;
  font-size: 1rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.2rem;
  opacity: 0.85;
}
.ini__icon-action:hover {
  opacity: 1;
  color: #1361b9;
}
.ini__icon-action--danger:hover {
  color: #c41e24;
}
.ini__icon-action:disabled,
.ini__icon-action:disabled:hover {
  cursor: not-allowed;
  opacity: 0.45;
  color: #1a1a2e;
}
.ini__multiselect {
  width: 100%;
}
.ini__dlg {
  width: min(760px, 96vw);
}
.ini__dlg--import {
  width: min(1040px, 96vw);
}
.ini-form-head {
  width: 100%;
  padding-right: 0.25rem;
}
.ini-form-head__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.ini-form-head__title {
  margin: 0;
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: 0.02em;
  color: inherit;
}
.ini-form-head__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
  opacity: 0.92;
}
.ini-form-head__close:hover {
  background: rgba(255, 255, 255, 0.12);
  opacity: 1;
}
.ini-form-head__progress {
  margin: 0.35rem 0 0.5rem;
  font-size: 12px;
  font-weight: 600;
  color: #000000;
  letter-spacing: 0.02em;
}
.ini-form-head__bar {
  height: 4px;
  border-radius: 4px;
  background: rgba(19, 97, 185, 0.12);
  overflow: hidden;
}
.ini-form-head__bar-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, #1361b9, #f0aa00);
  transition: width 0.25s ease;
}
.ini-form-shell {
  padding: 1.25rem 1.5rem 1rem;
  background: linear-gradient(180deg, #f5f7fb 0%, #ffffff 36%, #ffffff 100%);
}
.ini-form-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem 1.5rem;
  background: #f8fafc;
  border-top: 1px solid #e2e8f0;
}
.ini__form,
.ini__import {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem 1rem;
  font-size: 13px;
}
.ini__form label,
.ini__form .ini__field,
.ini__import label,
.ini__import .ini__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.ini__form-wide {
  grid-column: 1 / -1;
}
.ini__field {
  font-size: 13px;
}
.ini__form :deep(.p-select),
.ini__form :deep(.p-dropdown) {
  width: 100%;
  min-height: 2.35rem;
  font-size: 13px;
}
.ini__form :deep(.p-select-label),
.ini__form :deep(.p-dropdown-label) {
  display: flex;
  align-items: center;
  min-height: 2.35rem;
  padding: 0.45rem 0.55rem;
  font-size: 13px;
}
.ini__form :deep(.p-select-dropdown),
.ini__form :deep(.p-dropdown-trigger) {
  min-height: 2.35rem;
}
.ini__form :deep(.ini__control--required.p-select),
.ini__form :deep(.ini__control--required.p-dropdown),
.ini__form :deep(.ini__control--required .p-select),
.ini__form :deep(.ini__control--required .p-dropdown) {
  border-color: #fca5a5;
  box-shadow: 0 0 0 1px rgba(252, 165, 165, 0.45);
}
.ini__label {
  font-size: 13px;
  font-weight: 700;
  color: #1f2937;
}
.ini__req {
  color: #c0392b;
  margin-left: 2px;
}
.ini__input {
  width: 100%;
  min-height: 2.35rem;
  padding: 0.45rem 0.55rem;
  border: 1px solid #cfdfea;
  border-radius: 6px;
  background: #fff;
  color: #1a1a2e;
}
.ini__textarea {
  min-height: 5.5rem;
  resize: vertical;
  padding: 0.55rem;
  border: 1px solid #cfdfea;
  border-radius: 6px;
  font: inherit;
}
.ini__field-err {
  font-size: 12px;
  color: #c41e24;
  font-weight: 600;
}
.ini__notice {
  color: #92400e;
  font-weight: 600;
}
.ini__chip {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 1.6rem;
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  font-size: 12px;
  font-weight: 700;
}
.ini__chip--squad {
  color: #fff;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ini__select-squad-option {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.ini__squad-dot {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 999px;
}
.ini__toggle {
  flex-direction: row !important;
  align-items: center;
  justify-content: flex-start;
  min-height: 2.35rem;
  font-size: 13px;
  font-weight: 700;
  color: #1f2937;
}
.ini__toggle input {
  width: 1rem;
  height: 1rem;
}
.ini__import-errors {
  grid-column: 1 / -1;
  padding: 0.75rem;
  border-radius: 6px;
  background: #fff7ed;
  color: #92400e;
}
.ini__import-errors ul {
  margin: 0.4rem 0 0;
  padding-left: 1.2rem;
}
.ini__import-help {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid #cfdfea;
  border-radius: 8px;
  background: #eef7fd;
}
.ini__import-help h3 {
  margin: 0 0 0.25rem;
  font-size: 0.95rem;
  color: #1f2937;
}
.ini__import-help p {
  margin: 0;
  max-width: 40rem;
  color: #5a6f82;
  line-height: 1.45;
}
.ini__import-actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.ini__preview {
  grid-column: 1 / -1;
  border: 1px solid #cfdfea;
  border-radius: 8px;
  overflow: hidden;
  background: #fff;
}
.ini__preview-head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 0.9rem;
  background: #f8fafc;
  color: #1f2937;
}
.ini__preview-head span {
  color: #5a6f82;
}
.ini__preview-scroll {
  max-height: 320px;
  overflow: auto;
}
.ini__preview-table {
  width: 100%;
  min-width: 760px;
  border-collapse: collapse;
  font-size: 12px;
}
.ini__preview-table th,
.ini__preview-table td {
  padding: 0.55rem 0.65rem;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
  vertical-align: top;
}
.ini__preview-table th {
  position: sticky;
  top: 0;
  background: #ffffff;
  color: #374151;
  font-weight: 700;
  z-index: 1;
}
.ini__preview-row--ok {
  background: #f0fdf4;
}
.ini__preview-row--error {
  background: #fef2f2;
  color: #991b1b;
}
.ini-detail__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}
.ini-detail__eyebrow {
  margin: 0 0 0.25rem;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #5a6f82;
}
.ini-detail__title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: #1a1a2e;
}
.ini-detail__badges {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.5rem;
}
.ini-detail__sections {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
.ini-detail__section {
  padding: 1rem;
  border: 1px solid #cfdfea;
  border-radius: 8px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}
.ini-detail__section--wide {
  grid-column: 1 / -1;
}
.ini-detail__section-title {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #1a1a2e;
}
.ini-detail__grid {
  display: grid;
  grid-template-columns: minmax(9rem, 0.8fr) 1fr;
  gap: 0.55rem 1rem;
  margin: 0;
  font-size: 13px;
}
.ini-detail__grid dt {
  font-weight: 700;
  color: #1f2937;
}
.ini-detail__grid dd {
  margin: 0;
  color: #5a6f82;
}

.ini {
  min-height: 360px;
  padding: 1.25rem;
  border-radius: 8px;
  background:
    linear-gradient(180deg, #eef5fb 0%, #f7fafc 48%, #ffffff 100%);
  color: #172033;
}

.ini__hero {
  padding: 1.2rem;
  margin-bottom: 1rem;
  border: 1px solid #d6e3ef;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 12px 28px rgba(15, 42, 71, 0.08);
}

.ini__hero-main {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.ini__eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.35rem;
  color: #1361b9;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ini__title {
  font-size: 1.65rem;
  letter-spacing: 0;
}

.ini__hint {
  max-width: 46rem;
  color: #526579;
}

.ini__head-actions {
  gap: 0.6rem;
  padding-top: 0.05rem;
}

.ini__papelera {
  min-height: 2.25rem;
  color: #40546a;
  border-color: #cbd8e6;
  background: #f8fbff;
}

.ini__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}

.ini__stat {
  display: flex;
  min-height: 4.25rem;
  flex-direction: column;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.8rem 0.9rem;
  border: 1px solid #dbe6f1;
  border-radius: 8px;
  background: linear-gradient(180deg, #f8fbff 0%, #ffffff 100%);
}

.ini__stat-label {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.ini__stat-value {
  color: #102a43;
  font-size: 1.35rem;
  line-height: 1;
}

.ini__control-panel {
  margin-bottom: 1rem;
  padding: 1rem;
  border: 1px solid #d6e3ef;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 8px 18px rgba(15, 42, 71, 0.05);
}

.ini__control-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.75rem;
  padding-bottom: 0.85rem;
  margin-bottom: 0.85rem;
  border-bottom: 1px solid #e6edf5;
}

.ini__period,
.ini__filters {
  padding: 0;
  margin: 0;
  border: 0;
  background: transparent;
}

.ini__period {
  align-items: flex-end;
}

.ini__filter--period {
  min-width: 14rem;
  max-width: 18rem;
}

.ini__active,
.ini__historic,
.ini__filter-count {
  min-height: 2rem;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  font-size: 12px;
}

.ini__active {
  color: #0f6b3d;
  background: #e8f7ef;
}

.ini__historic {
  color: #8a4b0f;
  background: #fff3dd;
}

.ini__filter-count {
  display: inline-flex;
  align-items: center;
  color: #40546a;
  background: #f2f6fa;
  font-weight: 800;
}

.ini__filters {
  display: grid;
  grid-template-columns: minmax(16rem, 1.15fr) minmax(12rem, 0.85fr) minmax(12rem, 0.85fr) minmax(20rem, 1.25fr);
  gap: 0.85rem;
  align-items: end;
}

.ini__filter {
  max-width: none;
}

.ini__lbl {
  margin-bottom: 0.4rem;
  color: #34495e;
  font-size: 12px;
  letter-spacing: 0;
}

.ini__date-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: end;
}

.ini__date {
  min-width: 0;
}

.ini__toolbar {
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.8rem 0.9rem;
  margin-bottom: 0;
  border: 1px solid #d6e3ef;
  border-bottom: 0;
  border-radius: 8px 8px 0 0;
  background: #ffffff;
}

.ini__search-wrap {
  max-width: 34rem;
}

.ini__count {
  color: #40546a;
  font-weight: 800;
}

.ini__table-scroll {
  border-color: #d6e3ef;
  border-radius: 0 0 8px 8px;
  box-shadow: 0 12px 28px rgba(15, 42, 71, 0.07);
}

.ini__table {
  min-width: 78rem;
}

.ini__table :deep(.p-datatable-table) {
  border-collapse: separate;
  border-spacing: 0;
}

.ini__table :deep(.p-datatable-thead > tr > th) {
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 0.75rem 0.8rem;
  border-bottom: 1px solid #d9e4ef;
  background: #f8fbff;
  color: #23364d;
  font-size: 12px;
  font-weight: 800;
}

.ini__table :deep(.p-datatable-tbody > tr > td) {
  padding: 0.75rem 0.8rem;
  border-bottom: 1px solid #e6edf5;
  color: #172033;
}

.ini__table :deep(.p-datatable-tbody > tr:hover > td) {
  background: #f6faff;
}

.ini__table :deep(.p-datatable-tbody > tr > td:nth-child(2)),
.ini__table :deep(.p-datatable-thead > tr > th:nth-child(2)) {
  text-align: left;
}

.ini__table :deep(.p-datatable-thead > tr > th:nth-child(2) .p-column-header-content),
.ini__table :deep(.p-datatable-thead > tr > th:nth-child(2) .p-datatable-column-header-content) {
  justify-content: flex-start;
}

.ini__initiative-name {
  display: block;
  max-width: 32rem;
  color: #111827;
  font-weight: 650;
  line-height: 1.35;
  text-align: left;
}

.ini__text-cell {
  color: #23364d;
  font-weight: 600;
}

.ini__chip {
  min-height: 1.7rem;
  padding: 0.2rem 0.65rem;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ini__chip--squad {
  max-width: 13rem;
  text-transform: none;
  letter-spacing: 0;
}

.ini__actions {
  gap: 0.35rem;
}

.ini__icon-action {
  display: inline-flex;
  width: 2rem;
  height: 2rem;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: #4b5f73;
}

.ini__icon-action:hover {
  border-color: #cfe0f2;
  background: #eef6ff;
}

.ini__icon-action--danger:hover {
  border-color: #f4c7c7;
  background: #fff1f1;
}

@media (max-width: 1180px) {
  .ini__filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 860px) {
  .ini__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .ini {
    padding: 0.85rem;
  }
  .ini__hero,
  .ini__control-panel {
    padding: 0.9rem;
  }
  .ini__hero-main,
  .ini__toolbar {
    align-items: stretch;
  }
  .ini__head-actions,
  .ini__toolbar {
    flex-direction: column;
  }
  .ini__summary,
  .ini__filters {
    grid-template-columns: 1fr;
  }
  .ini__date-row {
    grid-template-columns: 1fr;
  }
  .ini__date-sep {
    display: none;
  }
  .ini__form,
  .ini__import {
    grid-template-columns: 1fr;
  }
  .ini-detail__sections {
    grid-template-columns: 1fr;
  }
  .ini-detail__grid {
    grid-template-columns: 1fr;
  }
}
</style>
