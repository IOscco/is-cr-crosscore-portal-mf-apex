<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import {
  IsDialog,
  IsButton,
  IsInputText,
  useConfirm,
} from 'is-uikit-components-vue';
import type { HitoDetalleApi } from '@/lib/actividades-api';
import { fetchHitoDetalle, updateHitoApi } from '@/lib/actividades-api';
import { hasMeaningfulHtmlContent } from '@/lib/rich-text-utils';
import RichTextEditor from '@/components/shared/RichTextEditor.vue';

const props = defineProps<{
  visible: boolean;
  proyectoId: string;
  hitoId: string | null;
  canGestor: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  saved: [];
  'open-actividad': [string];
}>();

const confirm = useConfirm();
const loading = ref(false);
const saveLoading = ref(false);
const detail = ref<HitoDetalleApi | null>(null);
const draft = ref<Partial<HitoDetalleApi>>({});
const baseline = ref('');
const editingKey = ref<string | null>(null);

const dialogVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
});

const hitoCerrado = computed(() => {
  const e = String(draft.value.estado ?? detail.value?.estado ?? '')
    .trim()
    .toLowerCase();
  return e === 'cerrado' || e.includes('cerrad');
});

function formatDesfaseDias(d: number | null | undefined): string {
  if (d == null || Number.isNaN(d)) {
    return '—';
  }
  if (d === 0) {
    return '0 días';
  }
  if (d > 0) {
    return `+${d} días`;
  }
  return `${d} días`;
}

function snapshot(): string {
  const d = draft.value;
  return JSON.stringify({
    nombre: d.nombre,
    descripcion: hasMeaningfulHtmlContent(String(d.descripcion ?? '')) ? String(d.descripcion).trim() : null,
    responsable: d.responsable,
    fechaInicioPlan: d.fechaInicioPlan,
    fechaFinPlan: d.fechaFinPlan,
    estado: d.estado,
    fechaInicioReal: String(d.fechaInicioReal ?? '').trim() || null,
    fechaCierreReal: String(d.fechaCierreReal ?? '').trim() || null,
  });
}

const dirty = computed(() => detail.value != null && baseline.value !== snapshot());

const fechaFinInvalida = computed(() => {
  const ini = String(draft.value.fechaInicioPlan ?? '').trim();
  const fin = String(draft.value.fechaFinPlan ?? '').trim();
  if (!ini || !fin) {
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fin)) {
    return false;
  }
  return fin < ini;
});

const fechaRealesInvalida = computed(() => {
  const ri = String(draft.value.fechaInicioReal ?? '').trim();
  const rf = String(draft.value.fechaCierreReal ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ri) || !/^\d{4}-\d{2}-\d{2}$/.test(rf)) {
    return false;
  }
  return rf < ri;
});

const nombreInvalido = computed(() => !String(draft.value.nombre ?? '').trim());

async function loadDetail(): Promise<void> {
  if (!props.hitoId) {
    detail.value = null;
    draft.value = {};
    baseline.value = '';
    return;
  }
  loading.value = true;
  try {
    const d = await fetchHitoDetalle(props.proyectoId, props.hitoId);
    detail.value = d;
    draft.value = {
      ...d,
      descripcion: d.descripcion ?? '',
      fechaInicioPlan: d.fechaInicioPlan ?? '',
      fechaInicioReal: d.fechaInicioReal ?? '',
      fechaCierreReal: d.fechaCierreReal ?? '',
    };
    baseline.value = snapshot();
  } catch {
    detail.value = null;
    draft.value = {};
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.visible, props.hitoId] as const,
  ([v]) => {
    if (v && props.hitoId) {
      void loadDetail();
    } else {
      editingKey.value = null;
    }
  },
);

function requestClose(): void {
  if (!props.canGestor || !dirty.value) {
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

function onCancelarEdicion(): void {
  if (detail.value) {
    draft.value = { ...detail.value, descripcion: detail.value.descripcion ?? '' };
    baseline.value = snapshot();
  }
  editingKey.value = null;
}

async function onGuardar(): Promise<void> {
  if (!props.hitoId || !detail.value || nombreInvalido.value || fechaFinInvalida.value || fechaRealesInvalida.value) {
    return;
  }
  saveLoading.value = true;
  try {
    const d = draft.value;
    const descHtml = String(d.descripcion ?? '');
    const iniR = String(d.fechaInicioReal ?? '').trim();
    const finR = String(d.fechaCierreReal ?? '').trim();
    if (hitoCerrado.value) {
      await updateHitoApi(props.proyectoId, props.hitoId, {
        nombre: d.nombre,
        descripcion: hasMeaningfulHtmlContent(descHtml) ? descHtml.trim() : null,
        responsable: d.responsable?.trim() ? d.responsable.trim() : null,
        fechaInicioReal: iniR && /^\d{4}-\d{2}-\d{2}$/.test(iniR) ? iniR : null,
        fechaFinReal: finR && /^\d{4}-\d{2}-\d{2}$/.test(finR) ? finR : null,
      });
    } else {
      await updateHitoApi(props.proyectoId, props.hitoId, {
        nombre: d.nombre,
        descripcion: hasMeaningfulHtmlContent(descHtml) ? descHtml.trim() : null,
        responsable: d.responsable?.trim() ? d.responsable.trim() : null,
        fechaInicioPlan: d.fechaInicioPlan ?? null,
        fechaFinPlan: d.fechaFinPlan,
        ...(!hitoCerrado.value && d.estado ? { estado: d.estado } : {}),
        fechaInicioReal: iniR && /^\d{4}-\d{2}-\d{2}$/.test(iniR) ? iniR : null,
        fechaFinReal: finR && /^\d{4}-\d{2}-\d{2}$/.test(finR) ? finR : null,
      });
    }
    emit('saved');
    dialogVisible.value = false;
  } finally {
    saveLoading.value = false;
  }
}

function fieldLabel(key: string): string {
  const m: Record<string, string> = {
    nombre: 'Nombre',
    descripcion: 'Descripción',
    responsable: 'Responsable',
    fechaInicioPlan: 'Fecha de Inicio Planificada',
    fechaFinPlan: 'Fecha de Fin Planificada',
    estado: 'Estado',
    fechaInicioReal: 'Fecha de Inicio Real',
    fechaCierreReal: 'Fin Real',
    desfase: 'Desfase (cierre)',
    reprogramaciones: 'Reprogramaciones registradas',
  };
  return m[key] ?? key;
}
</script>

<template>
  <IsDialog
    v-model:visible="dialogVisible"
    modal
    :dismissable-mask="false"
    :close-on-escape="false"
    :closable="false"
    class="npd-dialog adm-dialog adm-det"
    :style="{ width: 'min(580px, 96vw)' }"
    :content-style="{ padding: '0' }"
  >
    <template #header>
      <div class="npd-header-row">
        <span class="npd-header-title" role="heading" aria-level="2">Detalle del hito</span>
        <IsButton class="npd-close-x" text rounded aria-label="Cerrar" icon="pi pi-times" @click="requestClose" />
      </div>
    </template>

    <div v-if="loading" class="adm-det__loading">Cargando…</div>
    <div v-else-if="!detail" class="adm-det__loading">No se pudo cargar el detalle.</div>
    <div v-else class="adm-shell adm-fields">
      <p class="adm-hito-pct">
        %Avance Plan: {{ detail.porcentajeAvancePlan ?? 0 }}% ·
        %Avance Real:
        <template v-if="detail.avanceRealCompleto">{{ detail.porcentajeAvanceReal ?? 0 }}%</template>
        <template v-else>Pend. asignar %avance real a alguna actividad</template>
      </p>

      <div class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('nombre') }}</div>
        <div class="adm-det__cell">
          <template v-if="editingKey === 'nombre' && canGestor">
            <IsInputText v-model="draft.nombre" maxlength="150" fluid />
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
            aria-label="Editar nombre"
            @click="editingKey = editingKey === 'nombre' ? null : 'nombre'"
          />
        </div>
      </div>
      <p v-if="nombreInvalido" class="adm-field-err">El nombre del hito es obligatorio.</p>

      <div class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('descripcion') }}</div>
        <div class="adm-det__cell">
          <template v-if="editingKey === 'descripcion' && canGestor">
            <RichTextEditor
              :model-value="String(draft.descripcion ?? '')"
              placeholder="Descripción del hito"
              aria-label="Descripción del hito"
              @update:model-value="(v) => { draft.descripcion = String(v ?? ''); }"
            />
          </template>
          <template v-else>
            <RichTextEditor
              :model-value="String(draft.descripcion ?? '')"
              readonly
              aria-label="Descripción del hito"
            />
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
            <IsInputText v-model="draft.responsable" fluid />
          </template>
          <template v-else>
            <span class="adm-det__text">{{ draft.responsable || '—' }}</span>
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
          <template v-if="editingKey === 'fechaInicioPlan' && canGestor && !hitoCerrado">
            <AppDatePicker
              :model-value="draft.fechaInicioPlan"
              :label="fieldLabel('fechaInicioPlan')"
              @update:model-value="(v: string | null) => (draft.fechaInicioPlan = v ?? '')"
            />
          </template>
          <template v-else>
            <span class="adm-det__text">{{ draft.fechaInicioPlan || '—' }}</span>
          </template>
          <IsButton
            v-if="canGestor && !hitoCerrado"
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
          <template v-if="editingKey === 'fechaFinPlan' && canGestor && !hitoCerrado">
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
            v-if="canGestor && !hitoCerrado"
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

      <div class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('estado') }}</div>
        <div class="adm-det__cell">
          <span class="adm-det__text">{{ draft.estado }}</span>
        </div>
      </div>

      <div class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('fechaInicioReal') }}</div>
        <div class="adm-det__cell">
          <template v-if="editingKey === 'fechaInicioReal' && canGestor">
            <AppDatePicker
              :model-value="draft.fechaInicioReal"
              :label="fieldLabel('fechaInicioReal')"
              @update:model-value="(v: string | null) => (draft.fechaInicioReal = v ?? '')"
            />
          </template>
          <template v-else>
            <span class="adm-det__text">{{ draft.fechaInicioReal || '—' }}</span>
          </template>
          <IsButton
            v-if="canGestor"
            class="adm-det__pencil"
            severity="secondary"
            text
            rounded
            size="small"
            icon="pi pi-pencil"
            aria-label="Editar inicio real"
            @click="editingKey = editingKey === 'fechaInicioReal' ? null : 'fechaInicioReal'"
          />
        </div>
      </div>

      <div class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('fechaCierreReal') }}</div>
        <div class="adm-det__cell">
          <template v-if="editingKey === 'fechaCierreReal' && canGestor">
            <AppDatePicker
              :model-value="draft.fechaCierreReal"
              :label="fieldLabel('fechaCierreReal')"
              :min-date="draft.fechaInicioReal"
              @update:model-value="(v: string | null) => (draft.fechaCierreReal = v ?? '')"
            />
          </template>
          <template v-else>
            <span class="adm-det__text">{{ draft.fechaCierreReal || '—' }}</span>
          </template>
          <IsButton
            v-if="canGestor"
            class="adm-det__pencil"
            severity="secondary"
            text
            rounded
            size="small"
            icon="pi pi-pencil"
            aria-label="Editar fin real"
            @click="editingKey = editingKey === 'fechaCierreReal' ? null : 'fechaCierreReal'"
          />
        </div>
      </div>
      <p v-if="fechaRealesInvalida" class="adm-field-err">La fecha de fin no puede ser anterior a la fecha de inicio.</p>

      <div v-if="hitoCerrado" class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('desfase') }}</div>
        <div class="adm-det__cell">
          <span class="adm-det__text">{{ formatDesfaseDias(draft.desfaseDias) }}</span>
        </div>
      </div>

      <div class="adm-det__row">
        <div class="adm-det__label">{{ fieldLabel('reprogramaciones') }}</div>
        <div class="adm-det__cell">
          <span class="adm-det__text">{{ detail.reprogramacionesCount ?? 0 }}</span>
        </div>
      </div>

      <h4 class="adm-hito-sub">Actividades asociadas</h4>
      <ul class="adm-hito-list">
        <li v-for="a in detail.actividades" :key="a.id">
          <button type="button" class="adm-hito-link" @click="emit('open-actividad', a.id)">
            <span class="adm-hito-link__n">{{ a.nombre }}</span>
            <span class="adm-hito-link__m">
              {{ a.tipoLabel }} · {{ a.estado }} · {{ a.fechaFinPlan }} · %Real:
              <template v-if="a.porcentajeAvanceReal == null">Pend.</template>
              <template v-else>{{ a.porcentajeAvanceReal }}%</template>
            </span>
          </button>
        </li>
      </ul>
    </div>

    <template #footer>
      <div class="npd-footer">
        <IsButton severity="primary" outlined :label="canGestor ? 'Cancelar' : 'Cerrar'" @click="requestClose" />
        <template v-if="canGestor">
          <IsButton v-if="dirty" severity="primary" outlined label="Revertir" @click="onCancelarEdicion" />
          <IsButton
            v-if="dirty"
            severity="primary"
            label="Guardar cambios"
            :loading="saveLoading"
            :disabled="nombreInvalido || fechaFinInvalida || fechaRealesInvalida"
            @click="onGuardar"
          />
        </template>
      </div>
    </template>
  </IsDialog>
</template>

<style scoped>
.adm-shell {
  padding: 1rem 1.25rem;
  background: #ffffff;
}
.adm-fields {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.npd-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.75rem 1rem;
}
.npd-header-title {
  font-size: 16px;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.npd-close-x.p-button {
  color: theme('colors.surface.500');
}
.npd-close-x.p-button:hover {
  color: theme('colors.surface.800');
}
.npd-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
}
.adm-det__loading {
  padding: 2rem 1.25rem;
  text-align: center;
  font-size: 14px;
  color: theme('colors.surface.700');
}
.adm-hito-pct {
  margin: 0 0 0.75rem;
  font-size: 13px;
  font-weight: 700;
  color: theme('colors.surface.800');
  text-align: center;
}
.adm-det__row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem 1rem;
  align-items: start;
  padding: 0.5rem 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}
.adm-det__label {
  font-size: 12px;
  font-weight: 700;
  color: theme('colors.surface.800');
  text-align: center;
  padding-top: 0.35rem;
}
.adm-det__cell {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  justify-content: flex-end;
  text-align: right;
  flex-wrap: wrap;
}
.adm-det__cell :deep(.app-date-picker) {
  flex: 1;
  min-width: 14rem;
  text-align: left;
}
.adm-det__cell :deep(.app-date-picker__label) {
  display: none;
}
.adm-det__text {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  color: theme('colors.surface.500');
  text-align: right;
  word-break: break-word;
}
.adm-det__pencil.p-button {
  flex-shrink: 0;
  color: theme('colors.surface.800');
}
.adm-det__pencil.p-button:hover {
  color: var(--apex-color-g100);
}
.adm-field-err {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #c0392b;
}
.adm-hito-sub {
  margin: 1.25rem 0 0.5rem;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: theme('colors.surface.700');
}
.adm-hito-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.adm-hito-link {
  width: 100%;
  text-align: left;
  border: 1px solid #e5e5e5;
  border-radius: 4px;
  padding: 0.5rem 0.65rem;
  background: #fafafa;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.adm-hito-link:hover {
  border-color: var(--apex-color-g100);
  background: rgba(19, 97, 185, 0.06);
}
.adm-hito-link__n {
  font-size: 14px;
  font-weight: 600;
  color: theme('colors.surface.800');
}
.adm-hito-link__m {
  font-size: 12px;
  color: theme('colors.surface.700');
}
</style>
