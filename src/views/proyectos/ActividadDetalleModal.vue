<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import {
  IsDialog,
  IsButton,
  IsInputText,
  IsSelect,
  IsRadioButton,
  IsTag,
  useConfirm,
  useToast,
} from 'is-uikit-components-vue';
import { estadoActividadToSeverity } from '@/lib/tag-ui';
import type { SelectOption } from '@/types/forms';
import type { IntegranteProyectoHu025 } from '@/types/poc-data';
import type { ActividadDetalleApi, ActividadGrupoApi, ActividadItemApi } from '@/lib/actividades-api';
import type { CerrarActividadConflict } from '@/lib/actividades-api';
import { fetchActividadDetalle, updateActividad, updateHitoApi } from '@/lib/actividades-api';
import { buildPayloadCierreActividad } from '@/lib/actividades-cierre-ui';
import { hasMeaningfulHtmlContent, plainTextFromHtml } from '@/lib/rich-text-utils';
import {
  estadoEsCerradoODestimado,
  mensajeBloqueoCerrarActividad,
  propagacionesPostCambio,
  sugerenciasPostCambio,
} from '@/composables/proyectos/useEstadoRules';
import RichTextEditor from '@/components/shared/RichTextEditor.vue';
import ActividadCierreFechasModal, { type CierreFila } from './ActividadCierreFechasModal.vue';
import ActividadDocumentosField from './ActividadDocumentosField.vue';

const props = defineProps<{
  visible: boolean;
  proyectoId: string;
  actividadId: string | null;
  hitoOptions: SelectOption[];
  grupos: ActividadGrupoApi[];
  integrantes: IntegranteProyectoHu025[];
  canGestor: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  saved: [];
}>();

const confirm = useConfirm();
const toast = useToast();
const documentosField = ref<InstanceType<typeof ActividadDocumentosField> | null>(null);

/** Normaliza fechas ISO con hora a `YYYY-MM-DD` para inputs y comparación de dirty. */
function toIsoDateInput(v: unknown): string {
  const s = String(v ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  return '';
}

const loading = ref(false);
const saveLoading = ref(false);
const detail = ref<ActividadDetalleApi | null>(null);
const draft = ref<Partial<ActividadDetalleApi>>({});
const baseline = ref('');
const editingKey = ref<string | null>(null);
const docsDirty = ref(false);
const estadoMenuOpen = ref(false);

type CierrePendienteDet = {
  titulo: string;
  descripcion?: string;
  filas: CierreFila[];
  ejecutar: (fechas: Record<string, string>) => Promise<void>;
};

const cierrePendienteDet = ref<CierrePendienteDet | null>(null);

const dialogVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
});

const useLibreResponsable = computed(() => !props.integrantes?.length);

const responsableSelectOptions = computed<SelectOption[]>(() =>
  (props.integrantes ?? [])
    .filter((m) => m.rol.trim() && m.nombreApellido.trim())
    .map((m) => {
      const nombre = m.nombreApellido.trim();
      return { value: nombre, label: nombre };
    }),
);

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
  draft.value.estado = v;
  estadoMenuOpen.value = false;
}

const avanceRealNumber = computed(() => {
  const raw = draft.value.porcentajeAvanceReal;
  const n = raw == null ? 0 : Number(raw);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
});

const avanceRealTone = computed(() => {
  const v = avanceRealNumber.value;
  if (v < 30) return 'danger';
  if (v < 70) return 'warn';
  return 'ok';
});

function setDraftAvanceReal(v: unknown): void {
  const raw = String(v ?? '').trim();
  if (!raw) {
    draft.value.porcentajeAvanceReal = 0;
    return;
  }
  const n = Math.min(100, Math.max(0, Number(raw)));
  draft.value.porcentajeAvanceReal = Number.isFinite(n) ? Math.round(n) : null;
}

function onDocumentosChanged(): void {
  docsDirty.value = Boolean(documentosField.value?.getPendingFiles().length);
}

const permiteAvanceRealManual = computed(() => {
  const tipo = String(draft.value.tipo ?? detail.value?.tipo ?? '').trim();
  if (!tipo || tipo === 'pendiente') {
    return false;
  }
  const subtareas = detail.value?.subtareas ?? [];
  const tieneHijosBloqueantes = subtareas.some((s) => {
    if (s.estado === 'Desestimado') {
      return false;
    }
    return s.tipo === 'sub_actividad' || (s.tipo === 'pendiente' && s.esDependencia === true);
  });
  return !tieneHijosBloqueantes;
});

const padreOptions = computed<SelectOption[]>(() => {
  const hid = String(draft.value.hitoId ?? '').trim();
  if (!hid) {
    return [];
  }
  if (draft.value.tipo !== 'sub_actividad' && draft.value.tipo !== 'pendiente') {
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
      label: it.nombre.length > 72 ? `${it.nombre.slice(0, 72)}...` : it.nombre,
    }));
});

const fechaFinInvalida = computed(() => {
  const ini = String(draft.value.fechaInicioPlan ?? '').trim();
  const fin = String(draft.value.fechaFinPlan ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) {
    return false;
  }
  return fin < ini;
});

const fechaFinPadrePendiente = computed(() => {
  if (draft.value.tipo !== 'pendiente') {
    return '';
  }
  const g = props.grupos.find((x) => x.hitoId === String(draft.value.hitoId ?? '').trim());
  if (!g) {
    return '';
  }
  const padreId = String(draft.value.padreId ?? '').trim();
  if (padreId) {
    return String((g.items ?? []).find((x) => x.id === padreId)?.fechaFinPlan ?? '').trim();
  }
  return String(g.hitoFechaFinPlan ?? g.fechaFinPlan ?? '').trim();
});

const fechaFinPendienteBloqueanteMayorPadre = computed(() => {
  if (draft.value.tipo !== 'pendiente' || draft.value.esDependencia !== true) {
    return false;
  }
  const fin = String(draft.value.fechaFinPlan ?? '').trim();
  const parentFin = fechaFinPadrePendiente.value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fin) || !/^\d{4}-\d{2}-\d{2}$/.test(parentFin)) {
    return false;
  }
  return fin > parentFin;
});

function snapshot(): string {
  const d = draft.value;
  const pid = d.padreId != null && String(d.padreId).trim() ? String(d.padreId).trim() : null;
  return JSON.stringify({
    hitoId: d.hitoId,
    padreId: pid,
    nombre: d.nombre,
    descripcion: hasMeaningfulHtmlContent(String(d.descripcion ?? '')) ? String(d.descripcion).trim() : null,
    responsable: d.responsable,
    fechaInicioPlan: toIsoDateInput(d.fechaInicioPlan),
    fechaFinPlan: toIsoDateInput(d.fechaFinPlan),
    prioridad: d.prioridad,
    estado: d.estado,
    porcentajeAvanceReal: d.porcentajeAvanceReal ?? null,
    esDependencia: d.esDependencia,
    notas: hasMeaningfulHtmlContent(String(d.notas ?? '')) ? String(d.notas).trim() : null,
  });
}

const dirty = computed(() => detail.value != null && baseline.value !== snapshot());
const modalDirty = computed(() => dirty.value || docsDirty.value);

function buildDraftFromDetalle(d: ActividadDetalleApi): void {
  detail.value = d;
  draft.value = {
    ...d,
    descripcion: d.descripcion ?? '',
    notas: d.notas ?? '',
    fechaInicioPlan: toIsoDateInput(d.fechaInicioPlan),
    fechaFinPlan: toIsoDateInput(d.fechaFinPlan),
  };
  baseline.value = snapshot();
  docsDirty.value = false;
  estadoMenuOpen.value = false;
}

function findDetalleFallback(actividadId: string): ActividadDetalleApi | null {
  for (const g of props.grupos) {
    for (const it of g.items ?? []) {
      if (it.id === actividadId) {
        return {
          ...it,
          subtareas: it.subtareas ?? [],
          hitoNombre: g.hitoNombre,
          padreNombre: null,
        };
      }
      for (const st of it.subtareas ?? []) {
        if (st.id === actividadId) {
          return {
            ...st,
            subtareas: st.subtareas ?? [],
            hitoNombre: g.hitoNombre,
            padreNombre: it.nombre,
          };
        }
      }
    }
    for (const p of g.pendientesNivelHito ?? []) {
      if (p.id === actividadId) {
        return {
          ...p,
          subtareas: p.subtareas ?? [],
          hitoNombre: g.hitoNombre,
          padreNombre: null,
        };
      }
    }
  }
  return null;
}

async function loadDetail(): Promise<void> {
  if (!props.actividadId) {
    detail.value = null;
    draft.value = {};
    baseline.value = '';
    return;
  }
  loading.value = true;
  try {
    const d = await fetchActividadDetalle(props.actividadId);
    buildDraftFromDetalle(d);
  } catch (e) {
    const fallback = findDetalleFallback(props.actividadId);
    if (fallback) {
      buildDraftFromDetalle(fallback);
      return;
    }
    detail.value = null;
    draft.value = {};
    const msg = e instanceof Error ? e.message : 'Error desconocido al cargar el detalle.';
    toast.add({
      severity: 'error',
      summary: 'No se pudo cargar la actividad',
      detail: msg,
      life: 6000,
    });
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.visible, props.actividadId] as const,
  ([v]) => {
    if (v) {
      void loadDetail();
    } else {
      editingKey.value = null;
    }
  },
);

function requestClose(): void {
  if (!props.canGestor || !modalDirty.value) {
    dialogVisible.value = false;
    return;
  }
  confirm.require({
    message:
      'Si sales ahora, se perderán los cambios sin guardar. ¿Deseas descartar los cambios?',
    header: 'Descartar cambios',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Sí, descartar',
    rejectLabel: 'No, seguir',
    defaultFocus: 'reject',
    rejectClass: 'p-button-secondary',
    accept: () => {
      dialogVisible.value = false;
    },
  });
}

function mensajeCierreConHijos(lista: { nombre: string; estado: string }[]): string {
  const lines = lista.map((s) => `• ${s.nombre} — ${s.estado}`).join('\n');
  return `¿Estás seguro que deseas cerrar esta actividad? Al confirmar, los siguientes elementos también se cerrarán automáticamente:\n\n${lines}`;
}

function hijosBloqueantesAbiertosDetalle(): ActividadItemApi[] {
  return (detail.value?.subtareas ?? []).filter((s) => {
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

function findParentItemInGrupos(padreId: string): ActividadItemApi | undefined {
  for (const g of props.grupos) {
    const x =
      (g.items ?? []).find((it) => it.id === padreId) ??
      (g.pendientesNivelHito ?? []).find((it) => it.id === padreId);
    if (x) {
      return x;
    }
  }
  return undefined;
}

function willClosePadreEditingHijoBloqueante(d: Partial<ActividadDetalleApi>): boolean {
  if (d.estado !== 'Cerrado' || !d.padreId || !props.actividadId) {
    return false;
  }
  if (d.tipo !== 'sub_actividad' && !(d.tipo === 'pendiente' && d.esDependencia === true)) {
    return false;
  }
  const parent = findParentItemInGrupos(String(d.padreId));
  if (!parent) {
    return false;
  }
  const bloqueantes = (parent.subtareas ?? []).filter((s) => {
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
  return bloqueantes.length === 1 && bloqueantes[0].id === props.actividadId;
}

type UpdateActividadResult =
  | { kind: 'ok' }
  | { kind: 'hijos_bloqueantes'; subtareas: CerrarActividadConflict['subtareas'] }
  | { kind: 'error'; detail?: string };

async function enviarUpdate(
  payload: Parameters<typeof updateActividad>[1],
): Promise<UpdateActividadResult> {
  try {
    const res = await updateActividad(props.actividadId!, payload);
    if (res && typeof res === 'object' && 'code' in res && (res as CerrarActividadConflict).code === 'SUBTAREAS_ABIERTAS') {
      return { kind: 'hijos_bloqueantes', subtareas: (res as CerrarActividadConflict).subtareas };
    }
    return { kind: 'ok' };
  } catch (e) {
    const detail = e instanceof Error ? e.message : undefined;
    return { kind: 'error', detail };
  }
}

const justBloqOpen = ref(false);
const justBloqText = ref('');
let justBloqResolve: ((v: string | null) => void) | null = null;

function openJustificacionModal(): Promise<string | null> {
  justBloqText.value = '';
  justBloqOpen.value = true;
  return new Promise((resolve) => {
    justBloqResolve = resolve;
  });
}

function onJustBloqConfirm(): void {
  const t = plainTextFromHtml(justBloqText.value).trim();
  if (!t) {
    toast.add({
      severity: 'warn',
      summary: 'Texto obligatorio',
      detail: 'Ingrese la justificación para pasar de bloqueante (Sí) a No.',
      life: 4000,
    });
    return;
  }
  const r = justBloqResolve;
  justBloqResolve = null;
  r?.(plainTextFromHtml(justBloqText.value).trim());
  justBloqOpen.value = false;
}

function onJustBloqCancel(): void {
  const r = justBloqResolve;
  justBloqResolve = null;
  r?.(null);
  justBloqOpen.value = false;
}

watch(justBloqOpen, (open, wasOpen) => {
  if (!open && wasOpen && justBloqResolve) {
    const r = justBloqResolve;
    justBloqResolve = null;
    r(null);
  }
});

function buildUpdatePayload(): Parameters<typeof updateActividad>[1] {
  const d = draft.value;
  const descHtml = String(d.descripcion ?? '');
  const notasHtml = String(d.notas ?? '');
  const payload: Parameters<typeof updateActividad>[1] = {
    hitoId: String(d.hitoId ?? ''),
    nombre: String(d.nombre ?? ''),
    descripcion: hasMeaningfulHtmlContent(descHtml) ? descHtml.trim() : null,
    responsable: String(d.responsable ?? ''),
    fechaInicioPlan: toIsoDateInput(d.fechaInicioPlan),
    fechaFinPlan: toIsoDateInput(d.fechaFinPlan),
    prioridad: d.tipo === 'pendiente' ? '' : String(d.prioridad ?? ''),
    estado: String(d.estado ?? ''),
    ...(permiteAvanceRealManual.value
      ? { porcentajeAvanceReal: d.porcentajeAvanceReal == null ? 0 : Number(d.porcentajeAvanceReal) }
      : {}),
    notas: hasMeaningfulHtmlContent(notasHtml) ? notasHtml.trim() : null,
  };
  if (d.tipo === 'sub_actividad') {
    payload.padreId = d.padreId ?? null;
  }
  if (d.tipo === 'pendiente') {
    payload.esDependencia = d.esDependencia ?? null;
    payload.padreId = d.padreId?.trim() ? d.padreId.trim() : null;
  }
  return payload;
}

async function onGuardarExito(): Promise<void> {
  const nuevoEstado = String(draft.value.estado ?? '').trim();
  if (detail.value && nuevoEstado && detail.value.estado !== nuevoEstado) {
    await aplicarPropagacionesPostCambioDetalle(detail.value, nuevoEstado);
    mostrarSugerenciasPostCambioDetalle(detail.value, nuevoEstado);
  }
  if (props.actividadId) {
    await documentosField.value?.uploadPending(props.actividadId);
  }
  docsDirty.value = false;
  toast.add({ severity: 'success', summary: 'Cambios guardados', life: 3000 });
  emit('saved');
  dialogVisible.value = false;
}

async function aplicarPropagacionesPostCambioDetalle(act: ActividadItemApi, nuevo: string): Promise<void> {
  for (const cambio of propagacionesPostCambio(props.grupos, act, nuevo)) {
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

function mostrarSugerenciasPostCambioDetalle(act: ActividadItemApi, nuevo: string): void {
  for (const detailMsg of sugerenciasPostCambio(props.grupos, act, nuevo)) {
    toast.add({
      severity: 'info',
      summary: 'Sugerencia de cierre',
      detail: detailMsg,
      life: 6000,
    });
  }
}

async function onGuardar(): Promise<void> {
  if (!props.actividadId) {
    toast.add({ severity: 'warn', summary: 'No se puede guardar', detail: 'Falta el identificador de la actividad.', life: 4000 });
    return;
  }
  if (!detail.value) {
    toast.add({ severity: 'warn', summary: 'No se puede guardar', detail: 'Aún no hay datos cargados.', life: 4000 });
    return;
  }
  if (fechaFinInvalida.value || fechaFinPendienteBloqueanteMayorPadre.value) {
    toast.add({
      severity: 'warn',
      summary: 'Fechas inválidas',
      detail: fechaFinPendienteBloqueanteMayorPadre.value
        ? 'La fecha fin del pendiente bloqueante no puede superar la fecha fin de su hito o actividad padre.'
        : 'La fecha de fin no puede ser anterior a la fecha de inicio.',
      life: 4000,
    });
    return;
  }
  if (
    permiteAvanceRealManual.value &&
    draft.value.porcentajeAvanceReal != null &&
    (!Number.isFinite(Number(draft.value.porcentajeAvanceReal)) ||
      Number(draft.value.porcentajeAvanceReal) < 0 ||
      Number(draft.value.porcentajeAvanceReal) > 100)
  ) {
    toast.add({
      severity: 'warn',
      summary: 'Avance inválido',
      detail: '%Avance Real debe estar entre 0 y 100.',
      life: 4000,
    });
    return;
  }
  saveLoading.value = true;
  try {
    const base = buildUpdatePayload();
    const cerrando = String(base.estado ?? '').trim() === 'Cerrado';
    const d = draft.value;

    if (cerrando) {
      const bloqueo = detail.value ? mensajeBloqueoCerrarActividad(detail.value) : null;
      if (bloqueo) {
        saveLoading.value = false;
        toast.add({
          severity: 'warn',
          summary: 'No se puede cerrar',
          detail: bloqueo,
          life: 5000,
        });
        return;
      }
    }

    const origDep = detail.value.esDependencia === true;
    const newDep = d.esDependencia === true;
    let justificacionCambioBloqueante: string | undefined;
    if (d.tipo === 'pendiente' && origDep && !newDep) {
      saveLoading.value = false;
      const j = await openJustificacionModal();
      saveLoading.value = true;
      if (j == null) {
        saveLoading.value = false;
        return;
      }
      justificacionCambioBloqueante = j.trim();
    }

    const depExtra = justificacionCambioBloqueante ? { justificacionCambioBloqueante } : {};

    if (!cerrando) {
      const first = await enviarUpdate({
        ...base,
        ...depExtra,
      });
      if (first.kind === 'ok') {
        await onGuardarExito();
        return;
      }
      if (first.kind === 'error') {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: first.detail ?? 'No se pudo guardar.',
          life: first.detail && first.detail.length > 120 ? 8000 : 4000,
        });
        return;
      }
      toast.add({
        severity: 'warn',
        summary: 'No se pudo completar',
        detail: 'Revise el estado de las subtareas asociadas.',
        life: 4000,
      });
      return;
    }

    if (willClosePadreEditingHijoBloqueante(d)) {
      saveLoading.value = false;
      const tipoEtiqueta = d.tipo === 'sub_actividad' ? 'sub-actividad' : 'pendiente bloqueante';
      cierrePendienteDet.value = {
        titulo: 'Fechas de cierre real',
        descripcion: `Al cerrar este ${tipoEtiqueta}, la actividad padre quedará cerrada (es el último elemento bloqueante abierto).`,
        filas: [
          { clave: 'principal', etiqueta: `Cierre real — ${tipoEtiqueta} «${String(d.nombre)}»` },
          { clave: 'padre', etiqueta: `Cierre real — padre «${String(d.padreNombre ?? 'Padre')}»` },
        ],
        ejecutar: async (fechas) => {
          saveLoading.value = true;
          try {
            const bp = buildPayloadCierreActividad(fechas);
            const r = await enviarUpdate({ ...base, ...depExtra, ...bp });
            if (r.kind === 'ok') {
              await onGuardarExito();
            } else if (r.kind === 'error') {
              toast.add({
                severity: 'error',
                summary: 'Error',
                detail: r.detail ?? 'No se pudo guardar.',
                life: r.detail && r.detail.length > 120 ? 8000 : 4000,
              });
            } else {
              toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar.', life: 4000 });
            }
          } catch {
            toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar.', life: 4000 });
          } finally {
            saveLoading.value = false;
          }
        },
      };
      return;
    }

    const abiDet = hijosBloqueantesAbiertosDetalle();
    if (abiDet.length > 0 && d.tipo !== 'sub_actividad') {
      const first = await enviarUpdate({ ...base, ...depExtra });
      if (first.kind === 'ok') {
        await onGuardarExito();
        return;
      }
      if (first.kind === 'error') {
        toast.add({
          severity: 'error',
          summary: 'Error',
          detail: first.detail ?? 'No se pudo guardar.',
          life: first.detail && first.detail.length > 120 ? 8000 : 4000,
        });
        return;
      }
      saveLoading.value = false;
      confirm.require({
        header: 'Cerrar actividad y elementos bloqueantes',
        message: mensajeCierreConHijos(first.subtareas),
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Sí, continuar',
        rejectLabel: 'Cancelar',
        defaultFocus: 'reject',
        rejectClass: 'p-button-secondary',
        accept: () => {
          cierrePendienteDet.value = {
            titulo: 'Fechas de cierre real',
            descripcion: 'Indique la fecha de cierre real de la actividad principal y de cada elemento bloqueante.',
            filas: [
              { clave: 'principal', etiqueta: `Cierre real — «${String(d.nombre)}»` },
              ...first.subtareas.map((s) => ({
                clave: s.id,
                etiqueta: `Cierre real — «${s.nombre}»`,
              })),
            ],
            ejecutar: async (fechas) => {
              saveLoading.value = true;
              try {
                const bp = buildPayloadCierreActividad(fechas);
                const second = await enviarUpdate({ ...base, ...depExtra, cerrarSubtareasIncluidas: true, ...bp });
                if (second.kind === 'ok') {
                  await onGuardarExito();
                } else if (second.kind === 'error') {
                  toast.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: second.detail ?? 'No se pudo guardar.',
                    life: second.detail && second.detail.length > 120 ? 8000 : 4000,
                  });
                } else {
                  toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar.', life: 4000 });
                }
              } catch {
                toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar.', life: 4000 });
              } finally {
                saveLoading.value = false;
              }
            },
          };
        },
      });
      return;
    }

    saveLoading.value = false;
    cierrePendienteDet.value = {
      titulo: 'Fecha de cierre real',
      descripcion: `Actividad: «${String(d.nombre)}».`,
      filas: [{ clave: 'principal', etiqueta: 'Fecha de cierre real' }],
      ejecutar: async (fechas) => {
        saveLoading.value = true;
        try {
          const bp = buildPayloadCierreActividad(fechas);
          const r = await enviarUpdate({ ...base, ...depExtra, ...bp });
          if (r.kind === 'ok') {
            await onGuardarExito();
          } else if (r.kind === 'hijos_bloqueantes') {
            toast.add({
              severity: 'warn',
              summary: 'Confirme cierre de elementos bloqueantes',
              detail: 'Use el flujo de confirmación para cerrar sub-actividades o pendientes bloqueantes abiertos.',
              life: 5000,
            });
          } else if (r.kind === 'error') {
            toast.add({
              severity: 'error',
              summary: 'Error',
              detail: r.detail ?? 'No se pudo guardar.',
              life: r.detail && r.detail.length > 120 ? 8000 : 4000,
            });
          } else {
            toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar.', life: 4000 });
          }
        } catch {
          toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar.', life: 4000 });
        } finally {
          saveLoading.value = false;
        }
      },
    };
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar.', life: 4000 });
  } finally {
    saveLoading.value = false;
  }
}

async function onCierreDetConfirm(fechas: Record<string, string>): Promise<void> {
  const p = cierrePendienteDet.value;
  cierrePendienteDet.value = null;
  if (p) {
    await p.ejecutar(fechas);
  }
}

function onCierreDetVisible(v: boolean): void {
  if (!v) {
    cierrePendienteDet.value = null;
  }
}

function onCancelarEdicion(): void {
  if (detail.value) {
    const x = detail.value;
    draft.value = {
      ...x,
      descripcion: x.descripcion ?? '',
      notas: x.notas ?? '',
      fechaInicioPlan: toIsoDateInput(x.fechaInicioPlan),
      fechaFinPlan: toIsoDateInput(x.fechaFinPlan),
    };
    baseline.value = snapshot();
  }
  docsDirty.value = false;
  estadoMenuOpen.value = false;
  editingKey.value = null;
}

function fieldLabel(key: string): string {
  const m: Record<string, string> = {
    tipo: 'Tipo',
    nombre: draft.value.tipo === 'pendiente' ? 'Nombre del pendiente' : 'Nombre',
    hitoId: 'Hito asociado',
    padreId: 'Actividad padre',
    descripcion: 'Descripción',
    responsable: 'Responsable',
    fechaInicioPlan: 'Fecha de Inicio Planificada',
    fechaFinPlan: 'Fecha Fin Plan.',
    prioridad: 'Prioridad',
    estado: 'Estado',
    porcentajeAvanceReal: '%Avance Real',
    esDependencia: '¿Es pendiente bloqueante?',
  };
  return m[key] ?? key;
}

function displayTipo(): string {
  return draft.value.tipoLabel ?? '';
}

function dependenciaUi(): 'si' | 'no' | null {
  if (draft.value.esDependencia === true) {
    return 'si';
  }
  if (draft.value.esDependencia === false) {
    return 'no';
  }
  return null;
}
</script>

<template>
  <IsDialog
    v-model:visible="dialogVisible"
    modal
    position="center"
    :dismissable-mask="false"
    :close-on-escape="false"
    :closable="false"
    class="npd-dialog adm-dialog adm-det"
    :style="{ width: 'min(560px, 96vw)' }"
    :content-style="{ padding: '0' }"
  >
    <template #header>
      <div class="npd-header-row adm-det__head">
        <div class="adm-det__head-copy">
          <span class="adm-det__eyebrow">Detalle de actividad</span>
          <span class="npd-header-title adm-det__head-title" role="heading" aria-level="2">
            {{ draft.nombre || 'Actividad' }}
          </span>
        </div>
        <IsTag
          rounded
          class="adm-state__tag"
          :severity="estadoActividadToSeverity(String(draft.estado ?? 'Abierto'))"
          :value="draft.estado || 'Abierto'"
        />
        <IsButton
          class="npd-close-x"
          text
          rounded
          aria-label="Cerrar"
          icon="pi pi-times"
          @click="requestClose"
        />
      </div>
    </template>

    <div v-if="loading" class="adm-det__loading">Cargando…</div>
    <div v-else-if="!detail" class="adm-det__loading">No se pudo cargar el detalle.</div>
    <div v-else class="adm-shell adm-fields adm-fields--labels-left">
      <div class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('tipo') }}</div>
        <div class="adm-det__value">{{ displayTipo() }}</div>
      </div>

      <div class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('nombre') }}</div>
        <div class="adm-det__cell">
          <template v-if="editingKey === 'nombre' && canGestor">
            <IsInputText v-model="draft.nombre" fluid />
          </template>
          <template v-else>
            <span class="adm-det__text">{{ draft.nombre }}</span>
          </template>
          <IsButton
            v-if="canGestor"
            class="adm-det__pencil"
            severity="secondary"
            text
            rounded
            size="small"
            icon="pi pi-pencil"
            :aria-label="`Editar ${fieldLabel('nombre')}`"
            @click="editingKey = editingKey === 'nombre' ? null : 'nombre'"
          />
        </div>
      </div>

      <div v-if="draft.tipo" class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('hitoId') }}</div>
        <div class="adm-det__cell">
          <template v-if="editingKey === 'hitoId' && canGestor">
            <IsSelect
              :model-value="draft.hitoId ?? ''"
              :options="hitoOptions"
              option-label="label"
              option-value="value"
              fluid
              placeholder="Hito"
              @update:model-value="(v) => { draft.hitoId = String(v); draft.padreId = null; }"
            />
          </template>
          <template v-else>
            <span class="adm-det__text">{{ draft.hitoNombre }}</span>
          </template>
          <IsButton
            v-if="canGestor"
            class="adm-det__pencil"
            severity="secondary"
            text
            rounded
            size="small"
            icon="pi pi-pencil"
            aria-label="Editar hito"
            @click="editingKey = editingKey === 'hitoId' ? null : 'hitoId'"
          />
        </div>
      </div>

      <div v-if="draft.tipo === 'sub_actividad' || (draft.tipo === 'pendiente' && draft.padreId)" class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('padreId') }}</div>
        <div class="adm-det__cell">
          <template v-if="editingKey === 'padreId' && canGestor">
            <IsSelect
              :model-value="draft.padreId ?? ''"
              :options="padreOptions"
              option-label="label"
              option-value="value"
              fluid
              placeholder="Padre"
              @update:model-value="(v) => { draft.padreId = String(v); }"
            />
          </template>
          <template v-else>
            <span class="adm-det__text">{{ draft.padreNombre ?? '—' }}</span>
          </template>
          <IsButton
            v-if="canGestor"
            class="adm-det__pencil"
            severity="secondary"
            text
            rounded
            size="small"
            icon="pi pi-pencil"
            aria-label="Editar padre"
            @click="editingKey = editingKey === 'padreId' ? null : 'padreId'"
          />
        </div>
      </div>

      <div class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('descripcion') }}</div>
        <div class="adm-det__cell">
          <template v-if="editingKey === 'descripcion' && canGestor">
            <RichTextEditor
              :model-value="String(draft.descripcion ?? '')"
              placeholder="Descripción de la actividad"
              aria-label="Descripción"
              @update:model-value="(v) => { draft.descripcion = String(v ?? ''); }"
            />
          </template>
          <template v-else>
            <RichTextEditor :model-value="String(draft.descripcion ?? '')" readonly aria-label="Descripción" />
          </template>
          <IsButton
            v-if="canGestor"
            class="adm-det__pencil"
            severity="secondary"
            text
            rounded
            size="small"
            icon="pi pi-pencil"
            aria-label="Editar descripción"
            @click="editingKey = editingKey === 'descripcion' ? null : 'descripcion'"
          />
        </div>
      </div>

      <div class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('responsable') }}</div>
        <div class="adm-det__cell">
          <template v-if="editingKey === 'responsable' && canGestor">
            <IsSelect
              v-if="!useLibreResponsable"
              :model-value="draft.responsable ?? ''"
              :options="responsableSelectOptions"
              option-label="label"
              option-value="value"
              fluid
              @update:model-value="(v) => { draft.responsable = String(v); }"
            />
            <IsInputText v-else v-model="draft.responsable" fluid />
          </template>
          <template v-else>
            <span class="adm-det__text">{{ draft.responsable }}</span>
          </template>
          <IsButton
            v-if="canGestor"
            class="adm-det__pencil"
            severity="secondary"
            text
            rounded
            size="small"
            icon="pi pi-pencil"
            aria-label="Editar responsable"
            @click="editingKey = editingKey === 'responsable' ? null : 'responsable'"
          />
        </div>
      </div>

      <div class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('fechaInicioPlan') }}</div>
        <div class="adm-det__cell">
          <template v-if="editingKey === 'fechaInicioPlan' && canGestor">
            <AppDatePicker
              :model-value="draft.fechaInicioPlan"
              :label="fieldLabel('fechaInicioPlan')"
              @update:model-value="(v: string | null) => (draft.fechaInicioPlan = v ?? '')"
            />
          </template>
          <template v-else>
            <span class="adm-det__text">{{ draft.fechaInicioPlan }}</span>
          </template>
          <IsButton
            v-if="canGestor"
            class="adm-det__pencil"
            severity="secondary"
            text
            rounded
            size="small"
            icon="pi pi-pencil"
            aria-label="Editar inicio"
            @click="editingKey = editingKey === 'fechaInicioPlan' ? null : 'fechaInicioPlan'"
          />
        </div>
      </div>

      <div class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('fechaFinPlan') }}</div>
        <div class="adm-det__cell">
          <template v-if="editingKey === 'fechaFinPlan' && canGestor">
            <AppDatePicker
              :model-value="draft.fechaFinPlan"
              :label="fieldLabel('fechaFinPlan')"
              :min-date="draft.fechaInicioPlan"
              @update:model-value="(v: string | null) => (draft.fechaFinPlan = v ?? '')"
            />
          </template>
          <template v-else>
            <span class="adm-det__text">{{ draft.fechaFinPlan }}</span>
          </template>
          <IsButton
            v-if="canGestor"
            class="adm-det__pencil"
            severity="secondary"
            text
            rounded
            size="small"
            icon="pi pi-pencil"
            aria-label="Editar fin"
            @click="editingKey = editingKey === 'fechaFinPlan' ? null : 'fechaFinPlan'"
          />
        </div>
      </div>
      <p v-if="fechaFinInvalida" class="adm-field-err">La fecha de fin no puede ser anterior a la fecha de inicio.</p>
      <p v-if="fechaFinPendienteBloqueanteMayorPadre" class="adm-field-err">
        La fecha fin del pendiente bloqueante no puede superar la fecha fin de su hito o actividad padre.
      </p>

      <div v-if="draft.tipo !== 'pendiente'" class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('prioridad') }}</div>
        <div class="adm-det__cell">
          <template v-if="editingKey === 'prioridad' && canGestor">
            <IsSelect
              :model-value="draft.prioridad ?? ''"
              :options="prioridadOptions"
              option-label="label"
              option-value="value"
              fluid
              @update:model-value="(v) => { draft.prioridad = String(v); }"
            />
          </template>
          <template v-else>
            <span class="adm-det__text">{{ draft.prioridad }}</span>
          </template>
          <IsButton
            v-if="canGestor"
            class="adm-det__pencil"
            severity="secondary"
            text
            rounded
            size="small"
            icon="pi pi-pencil"
            aria-label="Editar prioridad"
            @click="editingKey = editingKey === 'prioridad' ? null : 'prioridad'"
          />
        </div>
      </div>

      <div class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('estado') }}</div>
        <div class="adm-det__cell">
          <template v-if="editingKey === 'estado' && canGestor">
            <div class="adm-state">
              <button type="button" class="adm-state__trigger" @click="estadoMenuOpen = !estadoMenuOpen">
                <IsTag
                  rounded
                  class="adm-state__tag"
                  :severity="estadoActividadToSeverity(String(draft.estado ?? 'Abierto'))"
                  :value="draft.estado || 'Abierto'"
                />
                <i class="pi pi-chevron-down" aria-hidden="true" />
              </button>
              <div v-if="estadoMenuOpen" class="adm-state__menu">
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
          </template>
          <template v-else>
            <span class="adm-det__text">{{ draft.estado }}</span>
          </template>
          <IsButton
            v-if="canGestor"
            class="adm-det__pencil"
            severity="secondary"
            text
            rounded
            size="small"
            icon="pi pi-pencil"
            aria-label="Editar estado"
            @click="editingKey = editingKey === 'estado' ? null : 'estado'"
          />
        </div>
      </div>

      <div class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('porcentajeAvanceReal') }}</div>
        <div class="adm-det__cell">
          <template v-if="editingKey === 'porcentajeAvanceReal' && canGestor && permiteAvanceRealManual">
            <div class="adm-avance">
              <IsInputText
                :model-value="draft.porcentajeAvanceReal == null ? '' : String(draft.porcentajeAvanceReal)"
                placeholder="0 a 100"
                fluid
                type="number"
                inputmode="numeric"
                min="0"
                max="100"
                @update:model-value="setDraftAvanceReal"
              />
              <div class="adm-avance__bar" :class="`adm-avance__bar--${avanceRealTone}`">
                <span :style="{ width: `${avanceRealNumber}%` }" />
              </div>
            </div>
          </template>
          <template v-else>
            <span class="adm-det__text">
              <template v-if="!permiteAvanceRealManual && draft.tipo === 'actividad'">Calculado desde subactividades</template>
              <template v-else-if="!permiteAvanceRealManual && draft.tipo === 'pendiente'">No aplica</template>
              <template v-else-if="draft.porcentajeAvanceReal == null">Pendiente</template>
              <template v-else>{{ draft.porcentajeAvanceReal }}%</template>
            </span>
          </template>
          <IsButton
            v-if="canGestor && permiteAvanceRealManual"
            class="adm-det__pencil"
            severity="secondary"
            text
            rounded
            size="small"
            icon="pi pi-pencil"
            aria-label="Editar %Avance Real"
            @click="editingKey = editingKey === 'porcentajeAvanceReal' ? null : 'porcentajeAvanceReal'"
          />
        </div>
      </div>

      <div v-if="draft.tipo === 'pendiente'" class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('esDependencia') }}</div>
        <div class="adm-det__cell">
          <template v-if="editingKey === 'esDependencia' && canGestor">
            <div class="adm-radio-row">
              <label class="adm-radio">
                <IsRadioButton
                  name="adm-det-dep"
                  value="si"
                  :model-value="dependenciaUi() ?? ''"
                  @update:model-value="() => { draft.esDependencia = true; }"
                />
                <span>Sí</span>
              </label>
              <label class="adm-radio">
                <IsRadioButton
                  name="adm-det-dep"
                  value="no"
                  :model-value="dependenciaUi() ?? ''"
                  @update:model-value="() => { draft.esDependencia = false; }"
                />
                <span>No</span>
              </label>
            </div>
          </template>
          <template v-else>
            <span class="adm-det__text">{{ draft.esDependencia === true ? 'Sí' : draft.esDependencia === false ? 'No' : '—' }}</span>
          </template>
          <IsButton
            v-if="canGestor"
            class="adm-det__pencil"
            severity="secondary"
            text
            rounded
            size="small"
            icon="pi pi-pencil"
            aria-label="Editar dependencia"
            @click="editingKey = editingKey === 'esDependencia' ? null : 'esDependencia'"
          />
        </div>
      </div>

      <ActividadDocumentosField
        ref="documentosField"
        :actividad-id="props.actividadId"
        :disabled="!canGestor || saveLoading"
        @changed="onDocumentosChanged"
      />
    </div>

    <template #footer>
      <div class="npd-footer">
        <IsButton
          severity="primary"
          outlined
          :label="canGestor ? 'Cancelar' : 'Cerrar'"
          @click="requestClose"
        />
        <template v-if="canGestor">
          <IsButton
            v-if="modalDirty"
            severity="primary"
            outlined
            label="Revertir"
            @click="onCancelarEdicion"
          />
          <IsButton
            severity="primary"
            label="Guardar cambios"
            :disabled="!modalDirty"
            :loading="saveLoading"
            @click="onGuardar"
          />
        </template>
      </div>
    </template>
  </IsDialog>

  <IsDialog
    v-model:visible="justBloqOpen"
    modal
    header="Justificación — pendiente bloqueante"
    class="npd-dialog adm-dialog"
    :style="{ width: 'min(480px, 94vw)' }"
    :dismissable-mask="true"
  >
    <p class="adm-det__hint">
      Obligatorio al pasar de «Sí» a «No» en pendiente bloqueante (ej. deuda técnica, decisión del sponsor).
    </p>
    <div class="adm-field">
      <label class="adm-det__label">Justificación</label>
      <RichTextEditor
        v-model="justBloqText"
        placeholder="Explique el motivo del cambio"
        aria-label="Justificación"
      />
    </div>
    <template #footer>
      <div class="npd-footer">
        <IsButton severity="primary" outlined label="Cancelar" @click="onJustBloqCancel" />
        <IsButton severity="primary" label="Guardar con justificación" @click="onJustBloqConfirm" />
      </div>
    </template>
  </IsDialog>

  <ActividadCierreFechasModal
    :visible="cierrePendienteDet !== null"
    :titulo="cierrePendienteDet?.titulo ?? ''"
    :descripcion="cierrePendienteDet?.descripcion"
    :filas="cierrePendienteDet?.filas ?? []"
    @update:visible="onCierreDetVisible"
    @confirmar="onCierreDetConfirm"
  />
</template>

<style scoped>
.adm-shell {
  padding: 1rem 1.25rem 1rem;
  background: #ffffff;
}
.adm-det__head {
  align-items: center;
  gap: 0.75rem;
}
.adm-det__head-copy {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 0.15rem;
}
.adm-det__eyebrow {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: theme('colors.surface.500');
}
.adm-det__head-title {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.adm-fields {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.adm-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.adm-det__loading {
  padding: 2rem 1.25rem;
  text-align: center;
  font-size: 14px;
  color: theme('colors.surface.500');
}
.adm-det__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem 1rem;
  align-items: start;
  padding: 0.65rem 0.75rem;
  border: 1px solid rgba(219, 226, 234, 0.85);
  border-radius: 8px;
  background: #fbfcfe;
}
.adm-det__label {
  font-size: 12px;
  font-weight: 700;
  color: theme('colors.surface.800');
  text-align: left;
  padding-top: 0.35rem;
}
.adm-det__cell {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  justify-content: flex-start;
  text-align: left;
  flex-wrap: wrap;
}
.adm-det__cell :deep(.app-date-picker) {
  flex: 1;
  min-width: 14rem;
}
.adm-det__cell :deep(.app-date-picker__label) {
  display: none;
}
.adm-det__value,
.adm-det__text {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: theme('colors.surface.700');
  text-align: left;
  word-break: break-word;
}
.adm-det__pencil.p-button {
  flex-shrink: 0;
  color: theme('colors.surface.800');
}
.adm-det__pencil.p-button:hover {
  color: theme('colors.interseguro-info.500');
}
.adm-field-err {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #c0392b;
}
.adm-radio-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  justify-content: flex-start;
}
.adm-radio {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 14px;
  color: theme('colors.surface.800');
}
.adm-state {
  position: relative;
  display: inline-flex;
}
.adm-state__tag.p-tag {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.03em;
}
.adm-state__trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: theme('colors.surface.500');
}
.adm-state__option {
  display: flex;
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
  z-index: 12;
  top: calc(100% + 0.35rem);
  left: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
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
  flex: 1;
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
.npd-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
}
.adm-det__hint {
  margin: 0 0 1rem;
  font-size: 13px;
  color: theme('colors.surface.500');
  line-height: 1.45;
}
</style>
