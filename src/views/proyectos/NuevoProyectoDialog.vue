<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  IsDialog,
  IsButton,
  IsInputText,
  IsSelect,
  IsCheckbox,
  useConfirm,
  useToast,
} from 'is-uikit-components-vue';
import type { SelectOption } from '@/types/forms';
import { createProyecto, type CreateProyectoPayload } from '@/lib/proyectos-api';
import { fetchCatalogActive } from '@/lib/config-api';
import { fetchItPmCatalogOptions } from '@/lib/proyecto-catalog-options';
import { fetchSquadsActive, type SquadApi } from '@/lib/squads-api';
import { hasMeaningfulHtmlContent } from '@/lib/rich-text-utils';
import RichTextEditor from '@/components/shared/RichTextEditor.vue';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ 'update:visible': [boolean]; created: [{ id: string }] }>();
const confirm = useConfirm();
const toast = useToast();

const dialogVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
});

/** HU-ITP-025 — solo tres roles obligatorios pre-desplegados en Step 2. */
const ROLES_OBLIGATORIOS = [
  'Sponsor',
  'Líder / Business Owner',
  'IT PM',
] as const;

const ROLES_OPCIONALES_HU = [
  'TPO (Technical Product Owner)',
  'Tech Lead',
  'Arquitecto',
  'Agile Coach',
  'Desarrollador',
  'QA',
  'Data',
  'Usuario',
  'Proveedor',
] as const;

const MSG_NOMBRE = "Campo 'Nombre del Proyecto' incompleto";
const MSG_TIPO = 'Seleccione un tipo de iniciativa.';
const MSG_SQUAD = 'Seleccione un squad para el proyecto.';
const MSG_ROL_UNICO = 'Este rol solo admite un integrante.';
const TOOLTIP_STEP1 = 'Completa los campos requeridos para continuar';
const NO_APLICA_SQUAD = '__NO_APLICA__';

const tipoOptions = ref<SelectOption[]>([]);
const rolesMultiOptions = ref<SelectOption[]>([]);
/** HU-005 / RN-15 — IT PM desde catálogo activo; si falla la API, queda vacío y se usa texto libre. */
const itPmCatalogOptions = ref<SelectOption[]>([]);
const squads = ref<SquadApi[]>([]);
const catalogError = ref<string | null>(null);

const squadOptions = computed<SelectOption[]>(() => [
  ...squads.value
    .filter((s) => s.activo && !s.deletedAt)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((s) => ({ value: s.id, label: s.nombre })),
  { value: NO_APLICA_SQUAD, label: 'No aplica' },
]);

const optionalRolSelectOptions = computed<SelectOption[]>(() => {
  const want = new Set(ROLES_OPCIONALES_HU.map((x) => x.toLowerCase()));
  const fromCat = rolesMultiOptions.value.filter((o) => want.has(String(o.label ?? '').toLowerCase()));
  if (fromCat.length >= ROLES_OPCIONALES_HU.length - 2) {
    return fromCat;
  }
  return ROLES_OPCIONALES_HU.map((label) => ({ value: label, label }));
});

async function loadCatalogos(): Promise<void> {
  catalogError.value = null;
  try {
    const [tipos, roles, responsablesOptions, activeSquads] = await Promise.all([
      fetchCatalogActive('TIPO_INICIATIVA'),
      fetchCatalogActive('ROL_EQUIPO'),
      fetchItPmCatalogOptions(),
      fetchSquadsActive(),
    ]);
    tipoOptions.value = tipos.map((x) => ({ value: x.label, label: x.label }));
    rolesMultiOptions.value = roles
      .filter((r) => r.cardinalidad === 'multiple')
      .map((x) => ({ value: x.label, label: x.label }));
    itPmCatalogOptions.value = responsablesOptions;
    squads.value = activeSquads;
  } catch {
    catalogError.value = 'No se pudieron cargar los catálogos. Verifique sesión y API.';
    tipoOptions.value = [
      { value: 'Mejora', label: 'Mejora' },
      { value: 'Normativo / Regulatorio', label: 'Normativo / Regulatorio' },
      { value: 'Nuevo Sistema', label: 'Nuevo Sistema' },
      { value: 'Mantenimiento', label: 'Mantenimiento' },
      { value: 'Otro', label: 'Otro' },
    ];
    rolesMultiOptions.value = ROLES_OPCIONALES_HU.map((label) => ({ value: label, label }));
    itPmCatalogOptions.value = [];
    squads.value = [];
  }
}

type FijoRow = { rol: string; integrante: string; fromSquad?: boolean };
type ExtraRow = { id: string; rol: string; nombre: string; fromSquad?: boolean; squadName?: string };

const form = ref({
  nombre: '',
  tipo: '' as string,
  descripcion: '',
  fechaInicioPlan: '',
  esEvolution: false,
  squadId: '',
  fijos: [] as FijoRow[],
  extras: [] as ExtraRow[],
});

const currentStep = ref<1 | 2>(1);
const attemptedStep1 = ref(false);
const attemptedStep2 = ref(false);
const rolUnicoError = ref<string | null>(null);
const extraAddAttempted = ref(false);
const pendingSquadId = ref<string | null>(null);

function mkId(): string {
  return `i-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function resetForm(): void {
  form.value = {
    nombre: '',
    tipo: '',
    descripcion: '',
    fechaInicioPlan: '',
    esEvolution: false,
    squadId: '',
    fijos: ROLES_OBLIGATORIOS.map((rol) => ({ rol, integrante: '' })),
    extras: [],
  };
  currentStep.value = 1;
  attemptedStep1.value = false;
  attemptedStep2.value = false;
  rolUnicoError.value = null;
  extraAddAttempted.value = false;
  pendingSquadId.value = null;
}

watch(
  () => props.visible,
  (v) => {
    if (v) {
      void loadCatalogos();
      resetForm();
    }
  },
);

const step1Complete = computed(() => form.value.nombre.trim().length > 0 && form.value.tipo.trim().length > 0);

const step2Complete = computed(() =>
  form.value.squadId.trim().length > 0 && form.value.fijos.every((row) => row.integrante.trim().length > 0),
);

const headerSubtitle = computed(() =>
  currentStep.value === 1
    ? 'Paso 1 de 2 — Información general'
    : 'Paso 2 de 2 — Equipo del proyecto',
);

function isFormEmpty(): boolean {
  const f = form.value;
  if (f.nombre.trim() || f.tipo.trim() || hasMeaningfulHtmlContent(f.descripcion)) {
    return false;
  }
  if (f.fechaInicioPlan.trim()) {
    return false;
  }
  if (f.esEvolution) {
    return false;
  }
  if (f.squadId.trim()) {
    return false;
  }
  if (f.fijos.some((x) => x.integrante.trim())) {
    return false;
  }
  if (f.extras.length) {
    return false;
  }
  return true;
}

function closeImmediate(): void {
  emit('update:visible', false);
}

function requestClose(): void {
  if (isFormEmpty()) {
    closeImmediate();
    return;
  }
  confirm.require({
    message: '¿Deseas descartar los cambios realizados?',
    header: 'Descartar cambios',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Sí, descartar',
    rejectLabel: 'No, continuar editando',
    defaultFocus: 'reject',
    rejectClass: 'p-button-secondary',
    accept: () => {
      resetForm();
      closeImmediate();
    },
  });
}

function countRolEnEquipo(rolLabel: string): number {
  let n = 0;
  for (const row of form.value.fijos) {
    if (row.rol === rolLabel && row.integrante.trim()) {
      n += 1;
    }
  }
  for (const ex of form.value.extras) {
    if (ex.rol === rolLabel && ex.nombre.trim()) {
      n += 1;
    }
  }
  return n;
}

function validarRolesUnicos(): boolean {
  rolUnicoError.value = null;
  for (const rol of ROLES_OBLIGATORIOS) {
    if (countRolEnEquipo(rol) > 1) {
      rolUnicoError.value = MSG_ROL_UNICO;
      return false;
    }
  }
  return true;
}

function selectedSquad(): SquadApi | null {
  if (!form.value.squadId || form.value.squadId === NO_APLICA_SQUAD) {
    return null;
  }
  return squads.value.find((s) => s.id === form.value.squadId) ?? null;
}

function selectedSquadName(): string | null {
  const name = selectedSquad()?.nombre.replace(/^Squad:\s*/i, '').trim();
  return name || null;
}

function normalizeSquadRole(role: string): string {
  return role.trim().toLowerCase().replace(/\s*\/\s*/g, '/').replace(/\s+/g, '_');
}

function fixedRoleFromSquadRole(role: string): (typeof ROLES_OBLIGATORIOS)[number] | null {
  const normalized = normalizeSquadRole(role);
  if (normalized === 'sponsor') {
    return 'Sponsor';
  }
  if (
    normalized === 'lider/business_owner' ||
    normalized === 'líder/business_owner' ||
    normalized === 'business_owner' ||
    normalized === 'businessowner' ||
    normalized === 'bo'
  ) {
    return 'Líder / Business Owner';
  }
  if (normalized === 'it_pm' || normalized === 'itpm' || normalized === 'project_manager') {
    return 'IT PM';
  }
  return null;
}

function displaySquadRole(role: string): string {
  const normalized = normalizeSquadRole(role);
  const labels: Record<string, string> = {
    tpo: 'TPO',
    technical_lead: 'Tech Lead',
    tech_lead: 'Tech Lead',
    business_owner: 'Business Owner',
    product_owner: 'Product Owner',
    desarrollador: 'Desarrollador',
    qa: 'QA',
    arquitecto: 'Arquitecto',
    agilista: 'Agile Coach',
  };
  return labels[normalized] ?? role;
}

function teamHasData(): boolean {
  return form.value.fijos.some((x) => x.integrante.trim()) || form.value.extras.length > 0;
}

function clearTeam(): void {
  form.value.fijos = ROLES_OBLIGATORIOS.map((rol) => ({ rol, integrante: '' }));
  form.value.extras = [];
  extraAddAttempted.value = false;
  rolUnicoError.value = null;
}

function applySquadTeam(squad: SquadApi | null): void {
  clearTeam();
  if (!squad) {
    return;
  }
  const consumed = new Set<string>();
  for (const member of squad.miembros ?? []) {
    const fixedRole = fixedRoleFromSquadRole(member.rol);
    if (!fixedRole) {
      continue;
    }
    const row = form.value.fijos.find((x) => x.rol === fixedRole);
    if (row && !row.integrante.trim()) {
      row.integrante = member.usuarioNombre;
      row.fromSquad = true;
      consumed.add(member.id);
    }
  }
  for (const member of squad.miembros ?? []) {
    if (consumed.has(member.id)) {
      continue;
    }
    form.value.extras.push({
      id: mkId(),
      rol: displaySquadRole(member.rol),
      nombre: member.usuarioNombre,
      fromSquad: true,
      squadName: squad.nombre,
    });
  }
}

function squadHasNoMembers(squadId = form.value.squadId): boolean {
  if (!squadId || squadId === NO_APLICA_SQUAD || pendingSquadId.value) {
    return false;
  }
  const squad = squads.value.find((s) => s.id === squadId);
  return Boolean(squad && (squad.miembros?.length ?? 0) === 0);
}

function onSquadChange(value: unknown): void {
  const next = String(value ?? '');
  if (next === form.value.squadId) {
    return;
  }
  if (teamHasData()) {
    pendingSquadId.value = next;
    return;
  }
  form.value.squadId = next;
  applySquadTeam(next === NO_APLICA_SQUAD ? null : selectedSquad());
}

function confirmSquadReplace(): void {
  if (pendingSquadId.value == null) {
    return;
  }
  const next = pendingSquadId.value;
  form.value.squadId = next;
  pendingSquadId.value = null;
  const squad = next === NO_APLICA_SQUAD ? null : squads.value.find((s) => s.id === next) ?? null;
  applySquadTeam(squad);
}

function keepCurrentTeamWithSquad(): void {
  if (pendingSquadId.value == null) {
    return;
  }
  form.value.squadId = pendingSquadId.value;
  pendingSquadId.value = null;
}

function isSquadExtra(it: ExtraRow): boolean {
  return it.fromSquad === true;
}

function removeSquadExtra(id: string): void {
  const idx = form.value.extras.findIndex((x) => x.id === id);
  if (idx >= 0) {
    form.value.extras.splice(idx, 1);
  }
}

function itPmFromEquipo(): string {
  const row = form.value.fijos.find((r) => r.rol === 'IT PM');
  return row?.integrante.trim() ?? '';
}

function buildIntegrantesPayload(): { rol: string; nombreApellido: string }[] {
  const out: { rol: string; nombreApellido: string }[] = [];
  for (const row of form.value.fijos) {
    const name = row.integrante.trim();
    if (name) {
      out.push({ rol: row.rol, nombreApellido: name });
    }
  }
  for (const ex of form.value.extras) {
    const rol = ex.rol.trim();
    const name = ex.nombre.trim();
    if (rol && name) {
      out.push({ rol, nombreApellido: name });
    }
  }
  return out;
}

function equipoPayload(): CreateProyectoPayload['equipo'] {
  const sponsor = form.value.fijos.find((r) => r.rol === 'Sponsor')?.integrante.trim() ?? '';
  const liderBO = form.value.fijos.find((r) => r.rol === 'Líder / Business Owner')?.integrante.trim() ?? '';
  const itPmId = itPmFromEquipo();
  return {
    sponsor,
    liderBO,
    itPmId,
    integrantes: form.value.extras
      .map((ex) => ({ nombre: ex.nombre.trim(), fromSquad: ex.fromSquad === true }))
      .filter((ex) => ex.nombre),
  };
}

function buildApiPayload(): CreateProyectoPayload {
  const f = form.value;
  const ini = f.fechaInicioPlan.trim();
  return {
    nombre: f.nombre.trim(),
    tipo: f.tipo.trim(),
    descripcion: hasMeaningfulHtmlContent(f.descripcion) ? f.descripcion.trim() : null,
    responsable: itPmFromEquipo() || null,
    fechaInicioPlan: /^\d{4}-\d{2}-\d{2}$/.test(ini) ? ini : null,
    fechaFinPlan: null,
    cbProveedor: false,
    cbNoAplica: f.squadId === NO_APLICA_SQUAD,
    cbSquad: Boolean(f.squadId && f.squadId !== NO_APLICA_SQUAD),
    nombreSquad: f.squadId === NO_APLICA_SQUAD ? null : selectedSquadName(),
    squadId: f.squadId === NO_APLICA_SQUAD ? null : f.squadId || null,
    squadName: f.squadId === NO_APLICA_SQUAD ? null : selectedSquadName(),
    nombreProveedor: null,
    faseActual: 'Registro manual',
    integrantes: buildIntegrantesPayload(),
    equipo: equipoPayload(),
    hitos: [],
    esEvolution: f.esEvolution,
  };
}

const saving = ref(false);

function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const focusable = el.querySelector?.(
      'input, select, textarea, button, [contenteditable="true"]',
    ) as HTMLElement | null;
    (focusable ?? el).focus?.();
  }
}

async function onSiguiente(): Promise<void> {
  attemptedStep1.value = true;
  if (!step1Complete.value) {
    await nextTick();
    if (!form.value.nombre.trim()) {
      scrollToId('npd-step1-nombre');
    } else {
      scrollToId('npd-step1-tipo');
    }
    return;
  }
  attemptedStep1.value = false;
  currentStep.value = 2;
}

function onAtras(): void {
  currentStep.value = 1;
}

function onAddExtra(): void {
  const rows = form.value.extras;
  const editableRows = rows.filter((row) => !row.fromSquad);
  if (editableRows.length > 0) {
    const last = editableRows[editableRows.length - 1];
    if (last && (!last.rol.trim() || !last.nombre.trim())) {
      extraAddAttempted.value = true;
      return;
    }
  }
  extraAddAttempted.value = false;
  rows.push({ id: mkId(), rol: '', nombre: '' });
}

function removeExtra(index: number): void {
  form.value.extras.splice(index, 1);
  extraAddAttempted.value = false;
}

function extraRolErr(idx: number): boolean {
  if (!extraAddAttempted.value) {
    return false;
  }
  if (form.value.extras[idx]?.fromSquad) {
    return false;
  }
  const last = form.value.extras.map((row, rowIdx) => (row.fromSquad ? -1 : rowIdx)).filter((rowIdx) => rowIdx >= 0).pop();
  if (idx !== last) {
    return false;
  }
  return !form.value.extras[idx]?.rol?.trim();
}

function extraNombreErr(idx: number): boolean {
  if (!extraAddAttempted.value) {
    return false;
  }
  if (form.value.extras[idx]?.fromSquad) {
    return false;
  }
  const last = form.value.extras.map((row, rowIdx) => (row.fromSquad ? -1 : rowIdx)).filter((rowIdx) => rowIdx >= 0).pop();
  if (idx !== last) {
    return false;
  }
  return !form.value.extras[idx]?.nombre?.trim();
}

const saveDisabledReason = computed(() => {
  if (!form.value.squadId.trim()) {
    return MSG_SQUAD;
  }
  if (!step2Complete.value) {
    const missing = form.value.fijos.find((r) => !r.integrante.trim());
    if (missing) {
      return `Complete el rol: ${missing.rol}`;
    }
    return 'Complete los roles obligatorios del equipo';
  }
  return null;
});

async function onGuardar(): Promise<void> {
  if (saving.value) {
    return;
  }
  attemptedStep2.value = true;
  rolUnicoError.value = null;
  if (!step2Complete.value || !validarRolesUnicos()) {
    await nextTick();
    const miss = form.value.fijos.find((r) => !r.integrante.trim());
    scrollToId(!form.value.squadId.trim() ? 'npd-squad-field' : miss ? `npd-fijo-${miss.rol.replace(/\s+/g, '-')}` : 'npd-equipo-title');
    return;
  }
  saving.value = true;
  try {
    const payload = buildApiPayload();
    const { id } = await createProyecto(payload);
    toast.add({
      severity: 'success',
      summary: 'Éxito',
      detail: 'Proyecto guardado con éxito',
      life: 3000,
    });
    emit('created', { id });
    resetForm();
    closeImmediate();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'No se pudo guardar el proyecto.';
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail: msg,
      life: 5000,
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <IsDialog
    v-model:visible="dialogVisible"
    modal
    :dismissable-mask="false"
    :close-on-escape="false"
    :closable="false"
    class="npd-dialog"
    :style="{ width: 'min(640px, 96vw)' }"
    :content-style="{ padding: '0' }"
  >
    <template #header>
      <div class="npd-header-block">
        <div class="npd-header-row">
          <span id="npd-dialog-title" class="npd-header-title" role="heading" aria-level="2">Nuevo Proyecto</span>
          <IsButton class="npd-close-x" text rounded aria-label="Cerrar" icon="pi pi-times" @click="requestClose" />
        </div>
        <p class="npd-progress" role="status">{{ headerSubtitle }}</p>
        <div class="npd-progress-bar" aria-hidden="true">
          <div class="npd-progress-bar__fill" :style="{ width: currentStep === 1 ? '50%' : '100%' }" />
        </div>
      </div>
    </template>

    <div class="npd-shell">
      <p v-if="catalogError" class="npd-catalog-warn" role="status">{{ catalogError }}</p>

      <!-- Step 1 -->
      <div v-show="currentStep === 1" class="npd-fields">
        <div id="npd-step1-nombre" class="npd-field">
          <label class="npd-label">Nombre del Proyecto <span class="npd-req">*</span></label>
          <IsInputText
            v-model="form.nombre"
            placeholder="Ingrese el nombre del proyecto"
            fluid
            :invalid="attemptedStep1 && !form.nombre.trim()"
          />
          <small v-if="attemptedStep1 && !form.nombre.trim()" class="npd-err">{{ MSG_NOMBRE }}</small>
        </div>

        <div id="npd-step1-tipo" class="npd-field">
          <label class="npd-label">Tipo de Iniciativa <span class="npd-req">*</span></label>
          <IsSelect
            :model-value="form.tipo"
            placeholder="Seleccione"
            :options="tipoOptions"
            option-label="label"
            option-value="value"
            fluid
            :invalid="attemptedStep1 && !form.tipo.trim()"
            @update:model-value="(v) => (form.tipo = String(v ?? '').trim())"
          />
          <small v-if="attemptedStep1 && !form.tipo.trim()" class="npd-err">{{ MSG_TIPO }}</small>
        </div>

        <div class="npd-field">
          <AppDatePicker
            :model-value="form.fechaInicioPlan"
            label="Fecha inicio planificada"
            @update:model-value="(v: string | null) => (form.fechaInicioPlan = v ?? '')"
          />
        </div>
        <div class="npd-field">
          <label class="npd-label">Descripción</label>
          <RichTextEditor
            v-model="form.descripcion"
            placeholder="Contexto del proyecto, alcance u objetivos."
            aria-label="Descripción del proyecto"
          />
        </div>

        <div class="npd-checkbox-row">
          <IsCheckbox v-model="form.esEvolution" binary input-id="npd-es-evolution" />
          <label for="npd-es-evolution" class="npd-checkbox-label">¿Es proyecto Evolution?</label>
        </div>
      </div>

      <!-- Step 2 -->
      <div v-show="currentStep === 2" class="npd-fields">
        <section class="npd-section npd-section--squad" aria-labelledby="npd-squad-title">
          <h3 id="npd-squad-title" class="npd-section__title">Squad del Proyecto</h3>
          <div id="npd-squad-field" class="npd-field">
            <label class="npd-label">Squad del proyecto <span class="npd-req">*</span></label>
            <IsSelect
              :model-value="form.squadId"
              placeholder="Seleccione un squad"
              :options="squadOptions"
              option-label="label"
              option-value="value"
              fluid
              :invalid="attemptedStep2 && !form.squadId.trim()"
              @update:model-value="onSquadChange"
            />
            <small v-if="attemptedStep2 && !form.squadId.trim()" class="npd-err">{{ MSG_SQUAD }}</small>
            <small v-if="squadHasNoMembers()" class="npd-squad-warn" role="status">
              <i class="pi pi-exclamation-triangle" aria-hidden="true" />
              Este squad aún no tiene integrantes configurados. Puedes completar el equipo manualmente.
            </small>
          </div>
          <div v-if="pendingSquadId" class="npd-squad-confirm" role="alert">
            <p>¿Reemplazar el equipo actual con los miembros del nuevo squad?</p>
            <div class="npd-squad-confirm__actions">
              <IsButton size="small" severity="primary" label="Sí, reemplazar" @click="confirmSquadReplace" />
              <IsButton size="small" outlined severity="secondary" label="Mantener equipo actual" @click="keepCurrentTeamWithSquad" />
            </div>
          </div>
        </section>
        <section class="npd-section" aria-labelledby="npd-equipo-title">
          <h3 id="npd-equipo-title" class="npd-section__title">Equipo del Proyecto</h3>
          <p class="npd-poc-hint">
            Roles obligatorios: Sponsor, Líder / BO e IT PM. Si el mantenedor tiene responsables activos (HU-ITP-005),
            el IT PM se elige del catálogo; el resto del equipo puede ser texto libre hasta integrar el directorio
            (HU-ITP-006).
          </p>
          <p v-if="rolUnicoError" class="npd-inline-err" role="alert">{{ rolUnicoError }}</p>
          <div class="npd-fijos">
            <div
              v-for="(row, idx) in form.fijos"
              :id="`npd-fijo-${row.rol.replace(/\s+/g, '-')}`"
              :key="row.rol"
              class="npd-fijo-row npd-field"
              :class="{ 'npd-field--auto': row.fromSquad && row.integrante.trim() }"
            >
              <label class="npd-label">
                {{ row.rol }} <span class="npd-req">*</span>
                <i
                  v-if="row.fromSquad && row.integrante.trim()"
                  class="pi pi-sync npd-auto-icon"
                  title="Auto-llenado desde squad"
                  aria-label="Auto-llenado desde squad"
                />
              </label>
              <IsSelect
                v-if="row.rol === 'IT PM' && itPmCatalogOptions.length > 0"
                v-model="form.fijos[idx].integrante"
                placeholder="Seleccione IT PM"
                :options="itPmCatalogOptions"
                option-label="label"
                option-value="value"
                fluid
                :invalid="attemptedStep2 && !form.fijos[idx].integrante.trim()"
              />
              <IsInputText
                v-else
                v-model="form.fijos[idx].integrante"
                placeholder="Nombre y apellido (texto libre)"
                fluid
                :invalid="attemptedStep2 && !form.fijos[idx].integrante.trim()"
              />
              <small v-if="attemptedStep2 && !form.fijos[idx].integrante.trim()" class="npd-err">
                Indique quién cubre el rol «{{ row.rol }}».
              </small>
            </div>
          </div>

          <div class="npd-integrantes">
            <template v-for="(it, idx) in form.extras" :key="it.id">
              <div v-if="isSquadExtra(it)" class="npd-squad-chip-row">
                <span
                  class="npd-squad-chip"
                  :title="`Integrante desde squad ${it.squadName ?? selectedSquadName() ?? ''}`"
                >
                  <i class="pi pi-sync" aria-hidden="true" />
                  <span class="npd-squad-chip__name">{{ it.nombre }}</span>
                  <span class="npd-squad-chip__role">{{ it.rol }}</span>
                  <button type="button" aria-label="Eliminar integrante desde squad" @click="removeSquadExtra(it.id)">×</button>
                </span>
              </div>
              <div v-else class="npd-int-row">
                <div class="npd-field">
                  <label class="npd-label">Rol</label>
                  <IsSelect
                    :model-value="it.rol || ''"
                    placeholder="Rol"
                    :options="optionalRolSelectOptions"
                    option-label="label"
                    option-value="value"
                    fluid
                    :invalid="extraRolErr(idx)"
                    @update:model-value="(v) => (it.rol = String(v ?? ''))"
                  />
                  <small v-if="extraRolErr(idx)" class="npd-err">Seleccione un rol para agregar el integrante.</small>
                </div>
                <div class="npd-field">
                  <label class="npd-label">{{ it.rol === 'Proveedor' ? 'Nombre y empresa (proveedor)' : 'Nombre del integrante' }}</label>
                  <IsInputText
                    v-model="it.nombre"
                    :placeholder="
                      it.rol === 'Proveedor'
                        ? 'Ej.: Jaime Sánchez - Deloitte'
                        : 'Nombre y apellido (texto libre)'
                    "
                    fluid
                    :invalid="extraNombreErr(idx)"
                  />
                  <small v-if="extraNombreErr(idx)" class="npd-err">Ingrese el nombre del integrante.</small>
                </div>
                <IsButton
                  type="button"
                  text
                  severity="secondary"
                  size="small"
                  icon="pi pi-trash"
                  class="npd-trash"
                  :aria-label="'Eliminar integrante ' + (idx + 1)"
                  @click="removeExtra(idx)"
                />
              </div>
            </template>
          </div>
          <IsButton
            type="button"
            severity="primary"
            outlined
            size="small"
            label="+ Agregar integrante"
            class="npd-add-int"
            @click="onAddExtra"
          />
        </section>
      </div>
    </div>

    <template #footer>
      <div class="npd-footer">
        <IsButton severity="primary" outlined label="Cancelar" @click="requestClose" />
        <template v-if="currentStep === 1">
          <span class="npd-tip-wrap" :title="!step1Complete ? TOOLTIP_STEP1 : undefined">
            <IsButton severity="primary" label="Siguiente" @click="onSiguiente" />
          </span>
        </template>
        <template v-else>
          <IsButton severity="primary" outlined label="Atrás" @click="onAtras" />
          <span class="npd-tip-wrap" :title="saveDisabledReason ?? undefined">
            <IsButton
              severity="primary"
              icon="pi pi-check"
              label="Guardar Proyecto"
              :loading="saving"
              :disabled="saving"
              @click="onGuardar"
            />
          </span>
        </template>
      </div>
    </template>
  </IsDialog>
</template>

<style scoped>
.npd-header-block {
  width: 100%;
  padding-right: 0.25rem;
}
.npd-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
}
.npd-header-title {
  margin: 0;
  font-family: theme('fontFamily.sans');
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: 0.02em;
  color: inherit;
}
.npd-progress {
  margin: 0.35rem 0 0.5rem;
  font-size: 12px;
  font-weight: 600;
  color: #000000;
  letter-spacing: 0.02em;
}
.npd-progress-bar {
  height: 4px;
  border-radius: 4px;
  background: rgba(19, 97, 185, 0.12);
  overflow: hidden;
}
.npd-progress-bar__fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, var(--apex-color-g100), var(--apex-color-oy));
  transition: width 0.25s ease;
}
.npd-close-x.p-button {
  color: inherit;
  opacity: 0.92;
}
.npd-close-x.p-button:hover {
  opacity: 1;
}

.npd-shell {
  padding: 1.25rem 1.5rem 1rem;
  background: linear-gradient(180deg, #f5f7fb 0%, #ffffff 36%, #ffffff 100%);
}
.npd-catalog-warn {
  margin: 0 0 0.75rem;
  font-size: 13px;
  color: #b45309;
}
.npd-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.npd-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.npd-label {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 13px;
  font-weight: 700;
  color: theme('colors.surface.800');
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}
.npd-req {
  color: #c0392b;
  margin-left: 2px;
}
.npd-err {
  font-size: 12px;
  color: #c0392b;
}
.npd-checkbox-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.npd-checkbox-label {
  font-size: 13px;
  color: theme('colors.surface.800');
  cursor: pointer;
}
.npd-inline-err {
  margin: 0 0 0.5rem;
  font-size: 13px;
  font-weight: 600;
  color: #c41e24;
}
.npd-poc-hint {
  margin: 0 0 0.75rem;
  font-size: 12px;
  color: theme('colors.surface.700');
  line-height: 1.45;
  max-width: 36rem;
}

.npd-section {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
}
.npd-section--squad {
  margin-top: 0;
  padding: 0 0 0.75rem;
  border-bottom: 1px solid theme('colors.surface.200');
}
.npd-section__title {
  margin: 0 0 0.75rem;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: theme('colors.surface.800');
  font-family: Omnes, theme('fontFamily.sans');
}
.npd-field--auto :deep(.p-inputtext),
.npd-field--auto :deep(.p-select),
.npd-field--auto :deep(.p-dropdown) {
  background: #eef7fd;
}
.npd-auto-icon {
  color: var(--apex-color-g100);
  font-size: 0.75rem;
}
.npd-squad-warn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--apex-color-oy);
  font-size: 12px;
  font-weight: 700;
}
.npd-squad-confirm {
  margin-top: 0.75rem;
  border: 1px solid #b7dbf1;
  border-radius: 8px;
  background: #eef7fd;
  padding: 0.75rem;
}
.npd-squad-confirm p {
  margin: 0 0 0.6rem;
  color: var(--apex-text-strong);
  font-size: 13px;
  font-weight: 700;
}
.npd-squad-confirm__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.npd-fijos {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.npd-integrantes {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}
.npd-int-row {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0.75rem;
  align-items: end;
}
@media (max-width: 560px) {
  .npd-int-row {
    grid-template-columns: 1fr;
  }
  .npd-trash {
    justify-self: end;
  }
}
.npd-trash {
  margin-bottom: 2px;
}
.npd-squad-chip-row {
  display: flex;
  align-items: center;
}
.npd-squad-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 100%;
  border: 1px solid var(--apex-color-lb100);
  border-radius: 999px;
  background: var(--apex-color-lb100);
  color: #ffffff;
  padding: 0.25rem 0.55rem;
  font-size: 12px;
  font-weight: 800;
}
.npd-squad-chip__name {
  overflow: hidden;
  max-width: 18rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.npd-squad-chip__role {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  padding: 0.1rem 0.4rem;
  font-size: 11px;
}
.npd-squad-chip button {
  border: 0;
  background: transparent;
  color: #ffffff;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}
.npd-add-int {
  align-self: flex-start;
}

.npd-footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
  width: 100%;
  padding: 0.75rem 1.5rem;
  background: theme('colors.surface.50');
  border-top: 1px solid theme('colors.surface.200');
  flex-shrink: 0;
}
.npd-tip-wrap {
  display: inline-flex;
}
</style>
