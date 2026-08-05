<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import {
  IsDialog,
  IsButton,
  IsInputText,
  IsSelect,
  IsTag,
  useConfirm,
  useToast,
} from 'is-uikit-components-vue';
import { estadoActividadToSeverity } from '@/lib/tag-ui';
import { hasMeaningfulHtmlContent } from '@/lib/rich-text-utils';
import RichTextEditor from '@/components/shared/RichTextEditor.vue';
import ActividadDocumentosField from './ActividadDocumentosField.vue';
import type { SelectOption } from '@/types/forms';
import type { IntegranteProyectoHu025 } from '@/types/poc-data';
import type {
  ActividadGrupoApi,
  ActividadItemApi,
  ActividadPayload,
  NuevaActividadModalPreset,
  TipoActividadApi,
} from '@/lib/actividades-api';

type TipoSeleccionable = 'hito' | 'actividad' | 'sub_actividad' | 'pendiente';

type TipoCard = {
  tipo: TipoSeleccionable;
  titulo: string;
  descripcion: string;
  nivel: 0 | 1 | 2 | 3;
  disabled: boolean;
  reason?: string;
};

const props = defineProps<{
  visible: boolean;
  proyectoNombre: string;
  hitoOptions: SelectOption[];
  grupos: ActividadGrupoApi[];
  integrantes: IntegranteProyectoHu025[];
  readOnly: boolean;
  initial: ActividadItemApi | null;
  saveLoading: boolean;
  /** Solo creación (`initial === null`). */
  nuevaActividadPreset?: NuevaActividadModalPreset | null;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  save: [ActividadPayload];
}>();

const confirm = useConfirm();
const toast = useToast();
const documentosField = ref<InstanceType<typeof ActividadDocumentosField> | null>(null);

const dialogVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
});

const form = ref({
  tipo: null as TipoSeleccionable | null,
  hitoId: '' as string,
  /** Para Pendiente: 'hito' | 'actividad' | null (sólo en modo creación). */
  pendienteAnclaje: null as 'hito' | 'actividad' | null,
  padreId: '' as string,
  nombre: '',
  descripcion: '',
  fechaInicioPlan: '',
  fechaFinPlan: '',
  responsableSelect: '' as string,
  responsableLibre: '',
  prioridad: null as string | null,
  estado: 'Abierto' as string,
  porcentajeAvanceReal: '' as string,
  dependencia: null as 'si' | 'no' | null,
  notas: '',
});

const attempted = ref(false);
const dirty = ref(false);
const estadoMenuOpen = ref(false);

const useLibreResponsable = computed(() => !props.integrantes?.length);

const lockTipoSubActividad = computed(() => Boolean(props.nuevaActividadPreset?.fixedSubActividad));
const lockTipoHito = computed(() => Boolean(props.nuevaActividadPreset?.fixedHito));
const lockTipoSelector = computed(() => Boolean(props.nuevaActividadPreset?.lockTipo));
const lockHito = computed(() => Boolean(props.nuevaActividadPreset?.lockHito));
const lockPadre = computed(() => Boolean(props.nuevaActividadPreset?.lockPadre));
const disableSubActividadCard = computed(() => Boolean(props.nuevaActividadPreset?.hideSubActividadTipo));
/** Cuando se abre desde un hito existente, no debe poder crear otro Hito desde el mismo flujo. */
const disableHitoCard = computed(() => Boolean(props.nuevaActividadPreset?.hideHitoTipo));
const childOnlyPreset = computed(() => Boolean(props.nuevaActividadPreset?.childOnly));

const sinHitos = computed(() => !props.hitoOptions.length);

/** ¿Existe alguna actividad raíz en algún hito del proyecto? Necesario para sub-actividad. */
const algunHitoConActividades = computed(() =>
  props.grupos.some((g) => (g.items ?? []).some((it) => it.tipo === 'actividad')),
);

/** ¿Existen actividades en el hito seleccionado actualmente? */
const hitoActualConActividades = computed(() => {
  const hid = form.value.hitoId.trim();
  if (!hid) {
    return algunHitoConActividades.value;
  }
  const g = props.grupos.find((x) => x.hitoId === hid);
  if (!g) {
    return false;
  }
  return (g.items ?? []).some((it) => it.tipo === 'actividad');
});

const cards = computed<TipoCard[]>(() => {
  const sin = sinHitos.value;
  const sinActsEnHito = !hitoActualConActividades.value;
  const sinActsGlobal = !algunHitoConActividades.value;
  const hitoDisabled = disableHitoCard.value;
  const subDisabled = sin || sinActsGlobal || sinActsEnHito || disableSubActividadCard.value;
  const items: TipoCard[] = [
    {
      tipo: 'hito',
      titulo: 'Hito',
      descripcion: 'Nivel 1 — agrupa actividades, sub-actividades y pendientes del hito.',
      nivel: 1,
      disabled: hitoDisabled,
      reason: hitoDisabled ? 'Ya estás dentro de un hito; usa Actividad / Sub-actividad / Pendiente.' : undefined,
    },
    {
      tipo: 'actividad',
      titulo: 'Actividad',
      descripcion: 'Nivel 2 — vive dentro de un hito y aporta al avance del hito.',
      nivel: 2,
      disabled: sin,
      reason: sin ? 'Crea primero un Hito.' : undefined,
    },
    {
      tipo: 'sub_actividad',
      titulo: 'Sub-actividad',
      descripcion: 'Nivel 3 — desglose operativo dentro de una actividad.',
      nivel: 3,
      disabled: subDisabled,
      reason: sin
        ? 'Crea primero un Hito.'
        : sinActsGlobal
        ? 'Crea primero una Actividad.'
        : sinActsEnHito
        ? 'El hito seleccionado no tiene actividades aún.'
        : disableSubActividadCard.value
        ? 'Para crear una sub-actividad, usa el botón «+» de una actividad existente.'
        : undefined,
    },
    {
      tipo: 'pendiente',
      titulo: 'Pendiente',
      descripcion: 'Suelto: puede colgar del hito o de una actividad. Marca si es bloqueante o no.',
      nivel: 0,
      disabled: sin,
      reason: sin ? 'Crea primero un Hito.' : undefined,
    },
  ];
  if (props.nuevaActividadPreset?.childOnly) {
    return items.filter((it) => it.tipo === 'sub_actividad' || it.tipo === 'pendiente');
  }
  if (props.nuevaActividadPreset?.hideHitoTipo) {
    return items.filter((it) => it.tipo !== 'hito');
  }
  return items;
});

const tipoBloqueado = computed(() => lockTipoSubActividad.value || lockTipoHito.value || lockTipoSelector.value);

const esHito = computed(() => form.value.tipo === 'hito');
const esSubActividad = computed(() => form.value.tipo === 'sub_actividad');
const esPendiente = computed(() => form.value.tipo === 'pendiente');

const muestraHitoAsociado = computed(
  () => form.value.tipo != null && form.value.tipo !== 'hito',
);

function shortActivityName(nombre: string): string {
  return nombre.length > 72 ? `${nombre.slice(0, 72)}...` : nombre;
}

const padreOptionsSubActividad = computed<SelectOption[]>(() => {
  const hid = form.value.hitoId.trim();
  if (!hid) {
    return [];
  }
  const g = props.grupos.find((x) => x.hitoId === hid);
  if (!g) {
    return [];
  }
  return (g.items ?? [])
    .filter((it) => it.tipo === 'actividad')
    .map((it) => ({
      value: it.id,
      label: shortActivityName(it.nombre),
    }));
});

const padreOptionsPendienteActividad = computed<SelectOption[]>(() => {
  const hid = form.value.hitoId.trim();
  if (!hid) {
    return [];
  }
  const g = props.grupos.find((x) => x.hitoId === hid);
  if (!g) {
    return [];
  }
  return (g.items ?? [])
    .filter((it) => it.tipo === 'actividad')
    .map((it) => ({
      value: it.id,
      label: shortActivityName(it.nombre),
    }));
});

const actividadPadreFijaLabel = computed(() => {
  const id = form.value.padreId.trim();
  if (!id) return 'Actividad padre';
  for (const g of props.grupos) {
    const act = (g.items ?? []).find((it) => it.id === id);
    if (act) return shortActivityName(act.nombre);
  }
  return 'Actividad padre';
});

const subActividadSinPadres = computed(
  () => esSubActividad.value && Boolean(form.value.hitoId.trim()) && padreOptionsSubActividad.value.length === 0,
);

const pendienteAsocActividadSinOpciones = computed(
  () =>
    esPendiente.value &&
    form.value.pendienteAnclaje === 'actividad' &&
    Boolean(form.value.hitoId.trim()) &&
    padreOptionsPendienteActividad.value.length === 0,
);

const muestraCamposHito = computed(() => esHito.value);

const muestraCamposActividad = computed(() => {
  if (!form.value.tipo || form.value.tipo === 'hito') {
    return false;
  }
  if (!form.value.hitoId.trim()) {
    return false;
  }
  if (esSubActividad.value && !form.value.padreId.trim()) {
    return false;
  }
  if (esPendiente.value) {
    if (!form.value.pendienteAnclaje) {
      return false;
    }
    if (form.value.pendienteAnclaje === 'actividad' && !form.value.padreId.trim()) {
      return false;
    }
  }
  return true;
});

const muestraDependencia = computed(() => esPendiente.value && Boolean(form.value.hitoId.trim()));
const permiteAvanceRealManual = computed(() => !esPendiente.value);
const muestraPrioridad = computed(() => !esPendiente.value);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const fechaFinAntesDeInicio = computed(() => {
  const ini = form.value.fechaInicioPlan.trim();
  const fin = form.value.fechaFinPlan.trim();
  if (!ISO_DATE.test(ini) || !ISO_DATE.test(fin)) {
    return false;
  }
  return fin < ini;
});

const fechaFinPadrePendiente = computed(() => {
  if (!esPendiente.value) {
    return '';
  }
  const g = props.grupos.find((x) => x.hitoId === form.value.hitoId.trim());
  if (!g) {
    return '';
  }
  if (form.value.pendienteAnclaje === 'actividad') {
    return String((g.items ?? []).find((x) => x.id === form.value.padreId.trim())?.fechaFinPlan ?? '').trim();
  }
  return String(g.hitoFechaFinPlan ?? g.fechaFinPlan ?? '').trim();
});

const fechaFinPendienteBloqueanteMayorPadre = computed(() => {
  if (!esPendiente.value || form.value.dependencia !== 'si') {
    return false;
  }
  const fin = form.value.fechaFinPlan.trim();
  const parentFin = fechaFinPadrePendiente.value;
  if (!ISO_DATE.test(fin) || !ISO_DATE.test(parentFin)) {
    return false;
  }
  return fin > parentFin;
});

function markDirty(): void {
  dirty.value = true;
}

function applyNuevaActividadPreset(): void {
  const pr = props.nuevaActividadPreset;
  if (!pr || props.initial) {
    return;
  }
  if (pr.fixedHito) {
    form.value.tipo = 'hito';
    return;
  }
  if (pr.fixedSubActividad && pr.presetHitoId && pr.presetPadreId) {
    form.value.tipo = 'sub_actividad';
    form.value.hitoId = pr.presetHitoId;
    form.value.padreId = pr.presetPadreId;
    return;
  }
  if (pr.childOnly && pr.presetHitoId && pr.presetPadreId) {
    form.value.hitoId = pr.presetHitoId;
    form.value.padreId = pr.presetPadreId;
    form.value.pendienteAnclaje = 'actividad';
    return;
  }
  if (pr.presetHitoId) {
    form.value.hitoId = pr.presetHitoId;
  }
  if (pr.presetTipo && pr.lockTipo) {
    form.value.tipo = pr.presetTipo as TipoSeleccionable;
    if (pr.presetTipo === 'pendiente') {
      form.value.pendienteAnclaje = pr.presetPadreId ? 'actividad' : 'hito';
      if (pr.presetPadreId) {
        form.value.padreId = pr.presetPadreId;
      }
    }
  }
}

function resetForm(): void {
  form.value = {
    tipo: null,
    hitoId: '',
    pendienteAnclaje: null,
    padreId: '',
    nombre: '',
    descripcion: '',
    fechaInicioPlan: '',
    fechaFinPlan: '',
    responsableSelect: '',
    responsableLibre: '',
    prioridad: null,
    estado: 'Abierto',
    porcentajeAvanceReal: '0',
    dependencia: null,
    notas: '',
  };
  attempted.value = false;
  dirty.value = false;
  applyNuevaActividadPreset();
}

function applyInitial(): void {
  const row = props.initial;
  if (!row) {
    resetForm();
    return;
  }
  const tipo = (row.tipo as TipoActividadApi) === 'hito' ? 'hito' : (row.tipo as TipoSeleccionable);
  form.value = {
    tipo,
    hitoId: row.hitoId,
    pendienteAnclaje: row.tipo === 'pendiente' ? (row.padreId ? 'actividad' : 'hito') : null,
    padreId: row.padreId ?? '',
    nombre: row.nombre,
    descripcion: row.descripcion ?? '',
    fechaInicioPlan: row.fechaInicioPlan,
    fechaFinPlan: row.fechaFinPlan,
    responsableSelect: useLibreResponsable.value ? '' : row.responsable,
    responsableLibre: useLibreResponsable.value ? row.responsable : '',
    prioridad: row.prioridad,
    estado: row.estado,
    porcentajeAvanceReal: row.porcentajeAvanceReal == null ? '0' : String(row.porcentajeAvanceReal),
    dependencia:
      row.tipo === 'pendiente' && row.esDependencia != null ? (row.esDependencia ? 'si' : 'no') : null,
    notas: row.notas ?? '',
  };
  attempted.value = false;
  dirty.value = false;
  applyNuevaActividadPreset();
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      applyInitial();
    }
  },
);

watch(
  () => props.initial,
  () => {
    if (props.visible) {
      applyInitial();
    }
  },
);

watch(
  () => form.value.tipo,
  (newT, oldT) => {
    if (oldT == null || tipoBloqueado.value) {
      return;
    }
    if (!lockHito.value) {
      form.value.hitoId = '';
    }
    if (!lockPadre.value) {
      form.value.padreId = '';
    }
    form.value.pendienteAnclaje = null;
    form.value.dependencia = null;
    form.value.fechaInicioPlan = '';
    form.value.fechaFinPlan = '';
    form.value.prioridad = null;
    form.value.nombre = '';
    form.value.descripcion = '';
    form.value.estado = 'Abierto';
    form.value.porcentajeAvanceReal = newT === 'pendiente' ? '' : '0';
    form.value.notas = '';
    const pr = props.nuevaActividadPreset;
    if (pr?.childOnly && pr.presetHitoId && pr.presetPadreId) {
      form.value.hitoId = pr.presetHitoId;
      form.value.padreId = pr.presetPadreId;
      form.value.pendienteAnclaje = newT === 'pendiente' ? 'actividad' : null;
    }
  },
);

watch(
  () => form.value.hitoId,
  () => {
    if (lockPadre.value) {
      return;
    }
    form.value.padreId = '';
    if (esPendiente.value && form.value.pendienteAnclaje === 'actividad') {
      form.value.pendienteAnclaje = null;
    }
  },
);

watch(
  () => form.value.pendienteAnclaje,
  (v) => {
    if (v === 'hito') {
      form.value.padreId = '';
    }
  },
);

watch(
  () => props.nuevaActividadPreset,
  () => {
    if (props.visible && !props.initial) {
      resetForm();
    }
  },
  { deep: true },
);

function isFormEmpty(): boolean {
  const f = form.value;
  if (
    f.tipo ||
    f.hitoId ||
    f.nombre.trim() ||
    hasMeaningfulHtmlContent(f.descripcion) ||
    f.fechaInicioPlan ||
    f.fechaFinPlan
  ) {
    return false;
  }
  if (f.responsableSelect.trim() || f.responsableLibre.trim()) {
    return false;
  }
  if (f.prioridad || f.padreId.trim() || hasMeaningfulHtmlContent(f.notas)) {
    return false;
  }
  if (f.estado !== 'Abierto') {
    return false;
  }
  if (permiteAvanceRealManual.value && f.porcentajeAvanceReal.trim()) {
    return false;
  }
  if (f.dependencia !== null) {
    return false;
  }
  return true;
}

function requestClose(): void {
  if (props.readOnly) {
    dialogVisible.value = false;
    return;
  }
  if (!dirty.value || isFormEmpty()) {
    dialogVisible.value = false;
    resetForm();
    return;
  }
  confirm.require({
    message:
      'Si sales ahora, se perderá la información que ingresaste en este formulario. ¿Deseas descartar los cambios?',
    header: 'Descartar cambios',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Sí, descartar',
    rejectLabel: 'No, seguir editando',
    defaultFocus: 'reject',
    rejectClass: 'p-button-secondary',
    accept: () => {
      resetForm();
      dialogVisible.value = false;
    },
  });
}

const MSG_NOMBRE = "Campo 'Nombre de la actividad' incompleto";
const MSG_HITO = 'Debes seleccionar un hito asociado';
const MSG_TIPO = 'Debes seleccionar el tipo de actividad';
const MSG_PADRE = 'Debes seleccionar la actividad padre';
const MSG_RESP = 'Debes indicar un responsable';
const MSG_FECHA_ORDEN = 'La fecha de fin no puede ser anterior a la fecha de inicio.';
const MSG_FECHA_INI = 'Debes indicar la fecha de inicio planificada';
const MSG_FECHA_FIN = 'Debes indicar la fecha de fin planificada';
const MSG_PRIO = 'Debes seleccionar la prioridad';
const MSG_DEP = 'Debes indicar si es pendiente bloqueante';
const MSG_PEND_ANCLAJE = 'Debes elegir si el pendiente cuelga del hito o de una actividad';
const MSG_AVANCE_REAL = '%Avance Real debe estar entre 0 y 100';
const MSG_PEND_FIN_PADRE = 'La fecha fin del pendiente bloqueante no puede superar la fecha fin de su hito o actividad padre.';

const prioridadOptions: SelectOption[] = [
  { value: 'Alta', label: 'Alta' },
  { value: 'Media', label: 'Media' },
  { value: 'Baja', label: 'Baja' },
];

const estadoOptions: SelectOption[] = [
  { value: 'Abierto', label: 'Abierto' },
  { value: 'En Progreso', label: 'En Progreso' },
  { value: 'Bloqueado', label: 'Bloqueado' },
  { value: 'Cerrado', label: 'Cerrado' },
  { value: 'Desestimado', label: 'Desestimado' },
];

function pickEstado(v: string): void {
  if (props.readOnly) return;
  if (form.value.estado !== v) {
    form.value.estado = v;
    markDirty();
  }
  estadoMenuOpen.value = false;
}

const avanceRealNumber = computed(() => {
  const raw = String(form.value.porcentajeAvanceReal ?? '').trim();
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
});

const avanceRealTone = computed(() => {
  const v = avanceRealNumber.value;
  if (v < 30) return 'danger';
  if (v < 70) return 'warn';
  return 'ok';
});

function setAvanceReal(v: unknown): void {
  const raw = String(v ?? '').trim();
  if (!raw) {
    form.value.porcentajeAvanceReal = '';
  } else {
    const n = Math.min(100, Math.max(0, Number(raw)));
    form.value.porcentajeAvanceReal = Number.isFinite(n) ? String(Math.round(n)) : '';
  }
  markDirty();
}

const responsableSelectOptions = computed<SelectOption[]>(() =>
  (props.integrantes ?? [])
    .filter((m) => m.rol.trim() && m.nombreApellido.trim())
    .map((m) => {
      const nombre = m.nombreApellido.trim();
      return { value: nombre, label: nombre };
    }),
);

function responsableValue(): string {
  if (useLibreResponsable.value) {
    return form.value.responsableLibre.trim();
  }
  return form.value.responsableSelect.trim();
}

function pickTipo(t: TipoSeleccionable, disabled: boolean): void {
  if (props.readOnly || tipoBloqueado.value || disabled) {
    return;
  }
  if (form.value.tipo !== t) {
    form.value.tipo = t;
    markDirty();
  }
}

function pickAnclajePendiente(v: 'hito' | 'actividad'): void {
  if (props.readOnly) {
    return;
  }
  if (form.value.pendienteAnclaje !== v) {
    form.value.pendienteAnclaje = v;
    markDirty();
  }
}

function pickDependencia(v: 'si' | 'no'): void {
  if (props.readOnly) {
    return;
  }
  if (form.value.dependencia !== v) {
    form.value.dependencia = v;
    markDirty();
  }
}

function buildPayload(): ActividadPayload {
  const f = form.value;
  const tipo = f.tipo as TipoSeleccionable;
  if (tipo === 'hito') {
    const desc = String(f.descripcion ?? '');
    return {
      tipo: 'hito',
      nombre: f.nombre.trim(),
      descripcion: hasMeaningfulHtmlContent(desc) ? desc.trim() : null,
      responsable: responsableValue(),
      fechaInicioPlan: f.fechaInicioPlan.trim(),
      fechaFinPlan: f.fechaFinPlan.trim(),
    };
  }
  const desc = String(f.descripcion ?? '');
  const notas = String(f.notas ?? '');
  const base: Extract<ActividadPayload, { tipo: Exclude<TipoActividadApi, 'hito'> }> = {
    tipo: tipo as Exclude<TipoActividadApi, 'hito'>,
    hitoId: f.hitoId.trim(),
    nombre: f.nombre.trim(),
    descripcion: hasMeaningfulHtmlContent(desc) ? desc.trim() : null,
    responsable: responsableValue(),
    fechaInicioPlan: f.fechaInicioPlan.trim(),
    fechaFinPlan: f.fechaFinPlan.trim(),
    prioridad: esPendiente.value ? '' : String(f.prioridad ?? '').trim(),
    estado: f.estado.trim() || 'Abierto',
    porcentajeAvanceReal: permiteAvanceRealManual.value ? Number(f.porcentajeAvanceReal || 0) : null,
    notas: hasMeaningfulHtmlContent(notas) ? notas.trim() : null,
  };
  if (tipo === 'sub_actividad') {
    base.padreId = f.padreId.trim();
  }
  if (tipo === 'pendiente') {
    base.esDependencia = f.dependencia === 'si';
    base.padreId = f.pendienteAnclaje === 'actividad' && f.padreId.trim() ? f.padreId.trim() : null;
  }
  base.documentosAdjuntos = documentosField.value?.getPendingFiles() ?? [];
  return base;
}

function collectValidationErrors(): string[] {
  const f = form.value;
  const errs: string[] = [];
  if (!f.tipo) {
    errs.push(MSG_TIPO);
    return errs;
  }
  if (f.tipo === 'hito') {
    if (!f.nombre.trim()) errs.push(MSG_NOMBRE);
    if (!responsableValue()) errs.push(MSG_RESP);
    if (!f.fechaInicioPlan.trim()) errs.push(MSG_FECHA_INI);
    if (!f.fechaFinPlan.trim()) errs.push(MSG_FECHA_FIN);
    if (fechaFinAntesDeInicio.value) errs.push(MSG_FECHA_ORDEN);
    return errs;
  }
  if (sinHitos.value) {
    errs.push('Crea primero un Hito antes de registrar otras actividades.');
    return errs;
  }
  if (subActividadSinPadres.value) {
    errs.push('El hito seleccionado no tiene actividades; no se puede crear una sub-actividad aquí.');
    return errs;
  }
  if (pendienteAsocActividadSinOpciones.value) {
    errs.push('El hito seleccionado no tiene actividades para anclar el pendiente. Cambia el anclaje a «A nivel del hito».');
    return errs;
  }
  if (!f.hitoId.trim()) errs.push(MSG_HITO);
  if (f.tipo === 'sub_actividad' && !f.padreId.trim()) errs.push(MSG_PADRE);
  if (f.tipo === 'pendiente') {
    if (!f.pendienteAnclaje) errs.push(MSG_PEND_ANCLAJE);
    if (f.pendienteAnclaje === 'actividad' && !f.padreId.trim()) errs.push(MSG_PADRE);
    if (f.dependencia === null) errs.push(MSG_DEP);
  }
  if (!f.nombre.trim()) errs.push(MSG_NOMBRE);
  if (!responsableValue()) errs.push(MSG_RESP);
  if (!f.fechaInicioPlan.trim()) errs.push(MSG_FECHA_INI);
  if (!f.fechaFinPlan.trim()) errs.push(MSG_FECHA_FIN);
  if (fechaFinAntesDeInicio.value) errs.push(MSG_FECHA_ORDEN);
  if (fechaFinPendienteBloqueanteMayorPadre.value) errs.push(MSG_PEND_FIN_PADRE);
  if (muestraPrioridad.value && !f.prioridad) errs.push(MSG_PRIO);
  if (permiteAvanceRealManual.value && f.porcentajeAvanceReal.trim()) {
    const n = Number(f.porcentajeAvanceReal);
    if (!Number.isFinite(n) || n < 0 || n > 100) errs.push(MSG_AVANCE_REAL);
  }
  return errs;
}

function onGuardar(): void {
  attempted.value = true;
  const errs = collectValidationErrors();
  if (errs.length > 0) {
    const detail = errs.length === 1 ? errs[0] : `${errs[0]} (faltan ${errs.length} campos)`;
    toast.add({
      severity: 'warn',
      summary: 'Faltan datos para guardar',
      detail,
      life: 4500,
    });
    return;
  }
  emit('save', buildPayload());
}

</script>

<template>
  <IsDialog
    v-model:visible="dialogVisible"
    modal
    :dismissable-mask="false"
    :close-on-escape="false"
    :closable="false"
    class="npd-dialog adm-dialog"
    :style="{ width: 'min(720px, 96vw)' }"
    :content-style="{ padding: '0' }"
  >
    <template #header>
      <div class="npd-header-row">
        <span id="adm-dialog-title" class="npd-header-title" role="heading" aria-level="2">
          {{ initial ? 'Editar actividad' : 'Nueva actividad' }}
        </span>
        <IsButton class="npd-close-x" text rounded aria-label="Cerrar" icon="pi pi-times" @click="requestClose" />
      </div>
    </template>

    <div class="adm-shell">
      <div class="adm-fields adm-fields--labels-left">
        <div class="adm-field">
          <label class="adm-field-label">Proyecto</label>
          <IsInputText :model-value="proyectoNombre" readonly disabled fluid />
        </div>

        <div v-if="!initial" class="adm-tipo-block">
          <span class="adm-label">
            Tipo de actividad
            <span class="adm-req">*</span>
          </span>
          <div class="adm-cards-grid" :class="{ 'adm-cards-grid--locked': tipoBloqueado }">
            <template v-for="card in cards" :key="card.tipo">
              <button
                type="button"
                class="adm-card"
                :class="[
                  `adm-card--lvl${card.nivel}`,
                  { 'adm-card--active': form.tipo === card.tipo, 'adm-card--disabled': card.disabled || readOnly },
                ]"
                :disabled="card.disabled || readOnly || tipoBloqueado"
                :aria-pressed="form.tipo === card.tipo"
                :title="card.reason ?? ''"
                @click="pickTipo(card.tipo, card.disabled)"
              >
                <span class="adm-card__nivel" v-if="card.nivel > 0">N{{ card.nivel }}</span>
                <span class="adm-card__nivel adm-card__nivel--floating" v-else>Suelto</span>
                <span class="adm-card__title">{{ card.titulo }}</span>
                <span class="adm-card__desc">{{ card.descripcion }}</span>
                <span v-if="card.disabled && card.reason" class="adm-card__reason">{{ card.reason }}</span>
              </button>
            </template>
          </div>
          <p v-if="attempted && !form.tipo" class="adm-field-err">{{ MSG_TIPO }}</p>
          <p class="adm-cards-help">
            La jerarquía Hito → Actividad → Sub-actividad se respeta al seleccionar. El Pendiente puede colgar del hito o de una actividad y marcarse como bloqueante.
          </p>
        </div>

        <template v-if="muestraHitoAsociado">
          <div class="adm-field">
            <label class="adm-field-label">Hito asociado <span class="adm-req">*</span></label>
            <IsSelect
              :model-value="form.hitoId"
              :placeholder="sinHitos ? 'Crea primero un Hito.' : 'Seleccione un hito'"
              :options="hitoOptions"
              option-label="label"
              option-value="value"
              fluid
              :disabled="readOnly || sinHitos || lockHito"
              :invalid="attempted && !form.hitoId.trim() && !sinHitos"
              @update:model-value="(v) => { form.hitoId = String(v); markDirty(); }"
            />
            <small v-if="attempted && !form.hitoId.trim() && !sinHitos" class="adm-field-err">{{ MSG_HITO }}</small>
            <small v-else-if="sinHitos" class="adm-field-hint">No hay hitos disponibles — selecciona primero el tipo Hito para crear uno.</small>
          </div>
        </template>

        <div v-if="esSubActividad && form.hitoId.trim() && !sinHitos" class="adm-field">
          <label class="adm-field-label">Actividad padre <span class="adm-req">*</span></label>
          <div v-if="lockPadre" class="adm-readonly-field">
            {{ actividadPadreFijaLabel }}
          </div>
          <IsSelect
            v-else
            :model-value="form.padreId"
            :placeholder="padreOptionsSubActividad.length ? 'Seleccione actividad del hito' : 'No hay actividades en este hito.'"
            :options="padreOptionsSubActividad"
            option-label="label"
            option-value="value"
            fluid
            :disabled="readOnly || !padreOptionsSubActividad.length || lockPadre"
            :invalid="attempted && !form.padreId.trim() && !!padreOptionsSubActividad.length"
            @update:model-value="(v) => { form.padreId = String(v); markDirty(); }"
          />
          <small v-if="attempted && !form.padreId.trim() && padreOptionsSubActividad.length" class="adm-field-err">{{ MSG_PADRE }}</small>
        </div>

        <div v-if="esPendiente && form.hitoId.trim() && !sinHitos && !childOnlyPreset" class="adm-anclaje-block">
          <span class="adm-label">¿Dónde se ancla el pendiente?<span class="adm-req">*</span></span>
          <div class="adm-toggle-cards">
            <button
              type="button"
              class="adm-toggle"
              :class="{ 'adm-toggle--active': form.pendienteAnclaje === 'hito' }"
              :disabled="readOnly"
              :aria-pressed="form.pendienteAnclaje === 'hito'"
              @click="pickAnclajePendiente('hito')"
            >
              <span class="adm-toggle__title">A nivel del hito</span>
              <span class="adm-toggle__desc">Aparece junto al hito (donde antes estaban las tareas de gestión).</span>
            </button>
            <button
              type="button"
              class="adm-toggle"
              :class="{ 'adm-toggle--active': form.pendienteAnclaje === 'actividad' }"
              :disabled="readOnly || padreOptionsPendienteActividad.length === 0"
              :aria-pressed="form.pendienteAnclaje === 'actividad'"
              :title="padreOptionsPendienteActividad.length === 0 ? 'No hay actividades en este hito.' : ''"
              @click="pickAnclajePendiente('actividad')"
            >
              <span class="adm-toggle__title">Dentro de una actividad</span>
              <span class="adm-toggle__desc">Se mostrará como hijo de la actividad con la etiqueta Pendiente.</span>
            </button>
          </div>
          <p v-if="attempted && !form.pendienteAnclaje" class="adm-field-err">{{ MSG_PEND_ANCLAJE }}</p>
        </div>

        <div v-if="esPendiente && form.pendienteAnclaje === 'actividad' && form.hitoId.trim() && !sinHitos" class="adm-field">
          <label class="adm-field-label">Actividad padre <span class="adm-req">*</span></label>
          <div v-if="lockPadre" class="adm-readonly-field">
            {{ actividadPadreFijaLabel }}
          </div>
          <IsSelect
            v-else
            :model-value="form.padreId"
            :placeholder="padreOptionsPendienteActividad.length ? 'Seleccione actividad del hito' : 'No hay actividades en este hito.'"
            :options="padreOptionsPendienteActividad"
            option-label="label"
            option-value="value"
            fluid
            :disabled="readOnly || !padreOptionsPendienteActividad.length"
            :invalid="attempted && !form.padreId.trim() && !!padreOptionsPendienteActividad.length"
            @update:model-value="(v) => { form.padreId = String(v); markDirty(); }"
          />
          <small v-if="attempted && !form.padreId.trim() && padreOptionsPendienteActividad.length" class="adm-field-err">{{ MSG_PADRE }}</small>
        </div>

        <template v-if="muestraCamposHito">
          <div class="adm-field">
            <label class="adm-field-label">Nombre del hito <span class="adm-req">*</span></label>
            <IsInputText
              v-model="form.nombre"
              placeholder="Nombre visible en el cronograma"
              fluid
              maxlength="150"
              :disabled="readOnly"
              :invalid="attempted && !form.nombre.trim()"
              @update:model-value="markDirty"
            />
            <small v-if="attempted && !form.nombre.trim()" class="adm-field-err">{{ MSG_NOMBRE }}</small>
          </div>
          <div class="adm-field">
            <label class="adm-field-label">Descripción</label>
            <RichTextEditor
              v-model="form.descripcion"
              placeholder="Opcional — contexto adicional"
              aria-label="Descripción del hito"
              :readonly="readOnly"
              @update:model-value="markDirty"
            />
          </div>
          <div class="adm-field">
            <AppDatePicker
              :model-value="form.fechaInicioPlan"
              label="Fecha de Inicio Planificada"
              required
              :disabled="readOnly"
              @update:model-value="(v: string | null) => { form.fechaInicioPlan = v ?? ''; markDirty(); }"
            />
            <small v-if="attempted && !form.fechaInicioPlan.trim()" class="adm-field-err">{{ MSG_FECHA_INI }}</small>
          </div>
          <div class="adm-field">
            <AppDatePicker
              :model-value="form.fechaFinPlan"
              label="Fecha de Fin Planificada"
              required
              :min-date="form.fechaInicioPlan"
              :disabled="readOnly"
              @update:model-value="(v: string | null) => { form.fechaFinPlan = v ?? ''; markDirty(); }"
            />
            <small v-if="attempted && !form.fechaFinPlan.trim()" class="adm-field-err">{{ MSG_FECHA_FIN }}</small>
          </div>
          <p v-if="attempted && fechaFinAntesDeInicio" class="adm-field-err">{{ MSG_FECHA_ORDEN }}</p>
          <div v-if="!useLibreResponsable" class="adm-field">
            <label class="adm-field-label">Responsable <span class="adm-req">*</span></label>
            <IsSelect
              :model-value="form.responsableSelect"
              placeholder="Seleccione integrante"
              :options="responsableSelectOptions"
              option-label="label"
              option-value="value"
              fluid
              :disabled="readOnly"
              :invalid="attempted && !form.responsableSelect.trim()"
              @update:model-value="(v) => { form.responsableSelect = String(v); markDirty(); }"
            />
            <small v-if="attempted && !form.responsableSelect.trim()" class="adm-field-err">{{ MSG_RESP }}</small>
          </div>
          <div v-else class="adm-field">
            <label class="adm-field-label">Responsable <span class="adm-req">*</span></label>
            <IsInputText
              v-model="form.responsableLibre"
              placeholder="Nombre del responsable"
              fluid
              :disabled="readOnly"
              :invalid="attempted && !form.responsableLibre.trim()"
              @update:model-value="markDirty"
            />
            <small v-if="attempted && !form.responsableLibre.trim()" class="adm-field-err">{{ MSG_RESP }}</small>
          </div>
        </template>

        <template v-if="muestraCamposActividad">
          <div class="adm-field">
            <label class="adm-field-label">{{ esPendiente ? 'Nombre del pendiente' : 'Nombre de la actividad' }} <span class="adm-req">*</span></label>
            <IsInputText
              v-model="form.nombre"
              placeholder="Identificador en tabla y detalle"
              fluid
              maxlength="120"
              :disabled="readOnly"
              :invalid="attempted && !form.nombre.trim()"
              @update:model-value="markDirty"
            />
            <small v-if="attempted && !form.nombre.trim()" class="adm-field-err">{{ MSG_NOMBRE }}</small>
          </div>
          <div class="adm-field">
            <label class="adm-field-label">Descripción</label>
            <RichTextEditor
              v-model="form.descripcion"
              placeholder="Opcional — no se muestra en la tabla"
              aria-label="Descripción de la actividad"
              :readonly="readOnly"
              @update:model-value="markDirty"
            />
          </div>

          <div v-if="!useLibreResponsable" class="adm-field">
            <label class="adm-field-label">Responsable <span class="adm-req">*</span></label>
            <IsSelect
              :model-value="form.responsableSelect"
              placeholder="Seleccione integrante"
              :options="responsableSelectOptions"
              option-label="label"
              option-value="value"
              fluid
              :disabled="readOnly"
              :invalid="attempted && !form.responsableSelect.trim()"
              @update:model-value="(v) => { form.responsableSelect = String(v); markDirty(); }"
            />
            <small v-if="attempted && !form.responsableSelect.trim()" class="adm-field-err">{{ MSG_RESP }}</small>
          </div>
          <div v-else class="adm-field">
            <label class="adm-field-label">Responsable <span class="adm-req">*</span></label>
            <IsInputText
              v-model="form.responsableLibre"
              placeholder="Nombre del responsable"
              fluid
              :disabled="readOnly"
              :invalid="attempted && !form.responsableLibre.trim()"
              @update:model-value="markDirty"
            />
            <small v-if="attempted && !form.responsableLibre.trim()" class="adm-field-err">{{ MSG_RESP }}</small>
          </div>

          <div class="adm-field">
            <AppDatePicker
              :model-value="form.fechaInicioPlan"
              label="Fecha de Inicio Planificada"
              required
              :disabled="readOnly"
              @update:model-value="(v: string | null) => { form.fechaInicioPlan = v ?? ''; markDirty(); }"
            />
            <small v-if="attempted && !form.fechaInicioPlan.trim()" class="adm-field-err">{{ MSG_FECHA_INI }}</small>
          </div>
          <div class="adm-field">
            <AppDatePicker
              :model-value="form.fechaFinPlan"
              label="Fecha de Fin Planificada"
              required
              :min-date="form.fechaInicioPlan"
              :disabled="readOnly"
              @update:model-value="(v: string | null) => { form.fechaFinPlan = v ?? ''; markDirty(); }"
            />
            <small v-if="attempted && !form.fechaFinPlan.trim()" class="adm-field-err">{{ MSG_FECHA_FIN }}</small>
          </div>
          <p v-if="attempted && fechaFinAntesDeInicio" class="adm-field-err">{{ MSG_FECHA_ORDEN }}</p>

          <div v-if="muestraPrioridad" class="adm-field">
            <label class="adm-field-label">Prioridad <span class="adm-req">*</span></label>
            <IsSelect
              :model-value="form.prioridad ?? ''"
              placeholder="Seleccione"
              :options="prioridadOptions"
              option-label="label"
              option-value="value"
              fluid
              :disabled="readOnly"
              :invalid="attempted && !form.prioridad"
              @update:model-value="(v) => { form.prioridad = String(v).trim() ? String(v) : null; markDirty(); }"
            />
            <small v-if="attempted && !form.prioridad" class="adm-field-err">{{ MSG_PRIO }}</small>
          </div>

          <div class="adm-field">
            <label class="adm-field-label">Estado</label>
            <div class="adm-state">
              <button
                type="button"
                class="adm-state__trigger"
                :disabled="readOnly"
                @click="estadoMenuOpen = !estadoMenuOpen"
              >
                <IsTag
                  rounded
                  class="adm-state__tag"
                  :severity="estadoActividadToSeverity(form.estado)"
                  :value="form.estado || 'Abierto'"
                />
                <i class="pi pi-chevron-down" aria-hidden="true" />
              </button>
              <div v-if="estadoMenuOpen && !readOnly" class="adm-state__menu">
                <button
                  v-for="op in estadoOptions"
                  :key="op.value"
                  type="button"
                  class="adm-state__option"
                  @click="pickEstado(String(op.value))"
                >
                  <IsTag
                    rounded
                    class="adm-state__tag"
                    :severity="estadoActividadToSeverity(String(op.value))"
                    :value="op.label"
                  />
                </button>
              </div>
            </div>
          </div>

          <p v-if="attempted && fechaFinPendienteBloqueanteMayorPadre" class="adm-field-err">
            {{ MSG_PEND_FIN_PADRE }}
          </p>

          <div v-if="permiteAvanceRealManual" class="adm-field">
            <label class="adm-field-label">%Avance Real</label>
            <div class="adm-avance">
              <IsInputText
                :model-value="form.porcentajeAvanceReal"
                placeholder="0 a 100"
                fluid
                type="number"
                inputmode="numeric"
                min="0"
                max="100"
                :disabled="readOnly"
                :invalid="attempted && form.porcentajeAvanceReal.trim() && (Number(form.porcentajeAvanceReal) < 0 || Number(form.porcentajeAvanceReal) > 100)"
                @update:model-value="setAvanceReal"
              />
              <div class="adm-avance__bar" :class="`adm-avance__bar--${avanceRealTone}`">
                <span :style="{ width: `${avanceRealNumber}%` }" />
              </div>
            </div>
            <small
              v-if="attempted && form.porcentajeAvanceReal.trim() && (Number(form.porcentajeAvanceReal) < 0 || Number(form.porcentajeAvanceReal) > 100)"
              class="adm-field-err"
            >
              {{ MSG_AVANCE_REAL }}
            </small>
          </div>

          <div v-if="muestraDependencia" class="adm-dep-block">
            <span class="adm-label">¿Es pendiente bloqueante?<span class="adm-req">*</span></span>
            <div class="adm-toggle-cards">
              <button
                type="button"
                class="adm-toggle adm-toggle--danger"
                :class="{ 'adm-toggle--active': form.dependencia === 'si' }"
                :disabled="readOnly"
                :aria-pressed="form.dependencia === 'si'"
                @click="pickDependencia('si')"
              >
                <span class="adm-toggle__title">Bloqueante</span>
                <span class="adm-toggle__desc">Cuenta para el avance del hito y bloquea su cierre si sigue abierto.</span>
              </button>
              <button
                type="button"
                class="adm-toggle"
                :class="{ 'adm-toggle--active': form.dependencia === 'no' }"
                :disabled="readOnly"
                :aria-pressed="form.dependencia === 'no'"
                @click="pickDependencia('no')"
              >
                <span class="adm-toggle__title">No bloqueante</span>
                <span class="adm-toggle__desc">Sólo informativo: no cuenta para el avance ni frena el cierre del hito.</span>
              </button>
            </div>
            <p v-if="attempted && form.dependencia === null" class="adm-field-err">{{ MSG_DEP }}</p>
          </div>

          <div class="adm-field">
            <label class="adm-field-label">Notas / Comentarios</label>
            <RichTextEditor
              v-model="form.notas"
              placeholder="Opcional"
              aria-label="Notas o comentarios"
              :readonly="readOnly"
              @update:model-value="markDirty"
            />
          </div>

          <ActividadDocumentosField ref="documentosField" :disabled="readOnly" />
        </template>
      </div>
    </div>

    <template #footer>
      <div class="npd-footer">
        <IsButton
          v-if="!readOnly"
          severity="primary"
          outlined
          label="Cancelar"
          @click="requestClose"
        />
        <IsButton
          v-if="readOnly"
          severity="primary"
          label="Cerrar"
          @click="requestClose"
        />
        <IsButton
          v-if="!readOnly"
          severity="primary"
          label="Guardar Actividad"
          :loading="saveLoading"
          @click="onGuardar"
        />
      </div>
    </template>
  </IsDialog>
</template>

<style scoped>
.adm-dialog :deep(.p-dialog-content) {
  max-height: min(72dvh, 640px);
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  background: #ffffff;
}
.adm-shell {
  padding: 0 1.25rem 1rem;
  background: #ffffff;
}
.adm-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.adm-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.adm-field-label,
.adm-label {
  font-size: 13px;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.adm-field-hint {
  font-size: 11px;
  color: theme('colors.surface.500');
}
.adm-req {
  color: #c0392b;
  margin-left: 0.25rem;
}
.adm-tipo-block {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.npd-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
}
.adm-cards-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.75rem 1rem;
  align-items: stretch;
  position: relative;
}
.adm-cards-grid--locked {
  opacity: 0.85;
}
.adm-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.85rem 0.95rem;
  border: 1.5px solid #d6dae0;
  border-radius: 12px;
  background: #ffffff;
  text-align: left;
  cursor: pointer;
  transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
  font: inherit;
  min-height: 96px;
}
.adm-card:hover:not(.adm-card--disabled) {
  border-color: #0a4ea0;
  box-shadow: 0 2px 6px rgba(10, 78, 160, 0.08);
}
.adm-card--active {
  border-color: #0a4ea0;
  background: rgba(10, 78, 160, 0.06);
  box-shadow: 0 2px 8px rgba(10, 78, 160, 0.16);
}
.adm-card--disabled {
  cursor: not-allowed;
  background: #f4f6f8;
  color: #98a0a8;
  border-style: dashed;
}
.adm-card--disabled .adm-card__title,
.adm-card--disabled .adm-card__desc {
  color: #98a0a8;
}
.adm-card__nivel {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #0a4ea0;
}
.adm-card__nivel--floating {
  color: #a85b00;
}
.adm-card--disabled .adm-card__nivel {
  color: #98a0a8;
}
.adm-card__title {
  font-size: 15px;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.adm-card__desc {
  font-size: 12px;
  line-height: 1.35;
  color: theme('colors.surface.700');
}
.adm-card__reason {
  font-size: 11px;
  font-style: italic;
  color: #98a0a8;
}
/* Hito en columna izquierda nivel 1, Actividad en columna derecha nivel 2,
   Sub-actividad en columna derecha nivel 3, Pendiente abajo izquierda. */
.adm-card--lvl1 {
  grid-column: 1;
  grid-row: 1;
}
.adm-card--lvl2 {
  grid-column: 2;
  grid-row: 1;
  margin-left: 1.25rem;
}
.adm-card--lvl3 {
  grid-column: 2;
  grid-row: 2;
  margin-left: 2.5rem;
}
.adm-card--lvl0 {
  grid-column: 1;
  grid-row: 2;
}
.adm-card--lvl2::before,
.adm-card--lvl3::before {
  content: '';
  position: absolute;
  left: -1.05rem;
  top: 50%;
  width: 0.95rem;
  height: 1.6rem;
  border-left: 2px solid #0a4ea0;
  border-bottom: 2px solid #0a4ea0;
  border-bottom-left-radius: 8px;
  transform: translateY(-90%);
  pointer-events: none;
}
.adm-card--lvl3::before {
  left: -1.05rem;
}
.adm-card--disabled.adm-card--lvl2::before,
.adm-card--disabled.adm-card--lvl3::before {
  border-color: #c8ccd2;
  border-style: dashed;
}
.adm-cards-help {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: theme('colors.surface.700');
}
.adm-anclaje-block,
.adm-dep-block {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.adm-toggle-cards {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.65rem;
}
.adm-state {
  position: relative;
  display: inline-flex;
  width: max-content;
}
.adm-state__tag.p-tag {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.03em;
}
.adm-state__trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: theme('colors.surface.500');
}
.adm-state__trigger:disabled {
  cursor: default;
  opacity: 0.75;
}
.adm-state__option {
  display: flex;
  justify-content: center;
  border: none;
  background: transparent;
  padding: 0.1rem;
  cursor: pointer;
  border-radius: 6px;
}
.adm-state__option:hover {
  background: var(--apex-surface-muted);
}
.adm-state__menu {
  position: absolute;
  z-index: 10;
  top: calc(100% + 0.35rem);
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 10rem;
  height: auto;
  max-height: none;
  overflow: visible;
  padding: 0.5rem;
  border: 1px solid var(--apex-border-soft);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12);
}
.adm-avance {
  display: grid;
  grid-template-columns: minmax(7rem, 8rem);
  gap: 0.5rem;
  align-items: center;
}
.adm-avance__bar {
  grid-column: 1 / -1;
  height: 0.45rem;
  border-radius: 999px;
  background: #eef2f6;
  overflow: hidden;
}
.adm-avance__bar span {
  display: block;
  height: 100%;
  border-radius: inherit;
}
.adm-avance__bar--danger span {
  background: var(--apex-color-re);
}
.adm-avance__bar--warn span {
  background: var(--apex-color-oy);
}
.adm-avance__bar--ok span {
  background: var(--apex-color-gh);
}
.adm-readonly-field {
  min-height: 2.5rem;
  display: flex;
  align-items: center;
  padding: 0.55rem 0.75rem;
  border: 1px solid #dbe2ea;
  border-radius: 8px;
  background: var(--apex-surface-bg);
  color: theme('colors.surface.800');
  font-size: 14px;
  font-weight: 700;
}
.adm-toggle {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.7rem 0.85rem;
  border: 1.5px solid #d6dae0;
  border-radius: 10px;
  background: #ffffff;
  cursor: pointer;
  text-align: left;
  font: inherit;
  transition: border-color 120ms ease, box-shadow 120ms ease;
  min-height: 70px;
}
.adm-toggle:hover:not(:disabled) {
  border-color: #0a4ea0;
}
.adm-toggle--active {
  border-color: #0a4ea0;
  background: rgba(10, 78, 160, 0.06);
  box-shadow: 0 2px 6px rgba(10, 78, 160, 0.12);
}
.adm-toggle--danger.adm-toggle--active {
  border-color: #c0392b;
  background: rgba(192, 57, 43, 0.08);
  box-shadow: 0 2px 6px rgba(192, 57, 43, 0.18);
}
.adm-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  background: #f4f6f8;
}
.adm-toggle__title {
  font-size: 13px;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.adm-toggle__desc {
  font-size: 12px;
  line-height: 1.35;
  color: theme('colors.surface.700');
}
.adm-field-err {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #c0392b;
}
@media (max-width: 600px) {
  .adm-cards-grid,
  .adm-toggle-cards {
    grid-template-columns: minmax(0, 1fr);
  }
  .adm-card--lvl2,
  .adm-card--lvl3 {
    grid-column: 1;
    margin-left: 1.25rem;
  }
  .adm-card--lvl1,
  .adm-card--lvl0 {
    grid-column: 1;
  }
  .adm-card--lvl2 {
    grid-row: 2;
  }
  .adm-card--lvl3 {
    grid-row: 3;
  }
  .adm-card--lvl0 {
    grid-row: 4;
  }
}
</style>
