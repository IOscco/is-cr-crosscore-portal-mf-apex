<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  IsDialog,
  IsDataTable,
  IsColumn,
  IsButton,
  IsInputText,
  IsSelect,
  IsCheckbox,
  useToast,
} from 'is-uikit-components-vue';
import type { SelectOption } from '@/types/forms';
import type { IntegranteProyectoHu025 } from '@/types/poc-data';
import type { ActividadGrupoApi } from '@/lib/actividades-api';
import { fetchActividadesDeProyecto } from '@/lib/actividades-api';
import { patchProyectoApi } from '@/lib/proyectos-api';
import { fetchItPmCatalogOptions } from '@/lib/proyecto-catalog-options';
import { fetchCatalogActive } from '@/lib/config-api';
import { hasMeaningfulHtmlContent } from '@/lib/rich-text-utils';
import RichTextEditor from '@/components/shared/RichTextEditor.vue';

type SquadAsignado = {
  id: string;
  nombre: string;
  miembros?: { id: string; rol: string; usuarioNombre: string }[];
};

interface MiembroEquipo {
  rol: string;
  nombre: string;
  esFijo: boolean;
}

const ROLES_FIJOS_EQUIPO = ['Sponsor', 'Líder / Business Owner', 'IT PM'] as const;
const FIXED_ROLE_SET = new Set<string>(ROLES_FIJOS_EQUIPO);

const props = defineProps<{
  proyectoId: string;
  canEdit: boolean;
  nombre: string;
  descripcion: string;
  responsableTl: string;
  esEvolution: boolean;
  fechaInicio: string;
  fechaFin: string;
  integrantes: IntegranteProyectoHu025[];
  squadAsignado?: SquadAsignado | null;
}>();

const emit = defineEmits<{
  saved: [];
}>();

const toast = useToast();

const editModeInformacion = ref(false);
const editModeEquipo = ref(false);
const saving = ref(false);
const itPmCatalogOptions = ref<SelectOption[]>([]);
const roleCatalogOptions = ref<SelectOption[]>([]);

const draftNombre = ref('');
const draftDesc = ref('');
const draftTl = ref('');
const draftIni = ref('');
const draftFin = ref('');
const draftEsEvolution = ref(false);
const equipoLocal = ref<MiembroEquipo[]>([]);

const baselineNombre = ref('');
const baselineDesc = ref('');
const baselineTl = ref('');
const baselineIni = ref('');
const baselineFin = ref('');
const baselineEsEvolution = ref(false);
const baselineMembers = ref<MiembroEquipo[]>([]);
const equipoErrors = ref<Record<number, { rol?: string; nombre?: string }>>({});

const removalOpen = ref(false);
const removalNombre = ref('');
const removalActs = ref<{ tipoLabel: string; nombre: string; estado: string; fechaFinPlan: string }[]>([]);
const removalTeamAfter = ref<IntegranteProyectoHu025[]>([]);
const reasignarA = ref('');
let removalResolve: ((v: string | null) => void) | null = null;

function miembroKey(m: IntegranteProyectoHu025): string {
  return `${String(m.rol).trim()}|${String(m.nombreApellido).trim()}`.toLowerCase();
}

function sameMiembro(a: IntegranteProyectoHu025, b: IntegranteProyectoHu025): boolean {
  return miembroKey(a) === miembroKey(b);
}

function miembroEquipoToIntegrante(m: MiembroEquipo): IntegranteProyectoHu025 {
  return {
    rol: String(m.rol ?? ''),
    nombreApellido: String(m.nombre ?? ''),
  };
}

function equipoToIntegrantes(xs: MiembroEquipo[]): IntegranteProyectoHu025[] {
  return xs.map(miembroEquipoToIntegrante);
}

function esRolFijo(rol: string): boolean {
  return FIXED_ROLE_SET.has(String(rol ?? '').trim());
}

function normalizarEquipoActual(integrantes: IntegranteProyectoHu025[]): MiembroEquipo[] {
  const usados = new Set<number>();
  const normalizados: MiembroEquipo[] = [];
  for (const rol of ROLES_FIJOS_EQUIPO) {
    const idx = integrantes.findIndex((m, i) => !usados.has(i) && String(m.rol ?? '').trim() === rol);
    if (idx >= 0) {
      usados.add(idx);
      normalizados.push({
        rol,
        nombre: String(integrantes[idx].nombreApellido ?? ''),
        esFijo: true,
      });
    } else {
      normalizados.push({ rol, nombre: '', esFijo: true });
    }
  }
  for (const [idx, m] of integrantes.entries()) {
    if (usados.has(idx) || esRolFijo(m.rol)) {
      continue;
    }
    normalizados.push({
      rol: String(m.rol ?? ''),
      nombre: String(m.nombreApellido ?? ''),
      esFijo: false,
    });
  }
  return normalizados;
}

function flattenActs(grupos: ActividadGrupoApi[]): {
  tipoLabel: string;
  nombre: string;
  estado: string;
  fechaFinPlan: string;
  responsable: string;
}[] {
  const out: {
    tipoLabel: string;
    nombre: string;
    estado: string;
    fechaFinPlan: string;
    responsable: string;
  }[] = [];
  for (const g of grupos) {
    for (const it of g.items) {
      out.push({
        tipoLabel: it.tipoLabel,
        nombre: it.nombre,
        estado: it.estado,
        fechaFinPlan: it.fechaFinPlan,
        responsable: it.responsable,
      });
      for (const st of it.subtareas ?? []) {
        out.push({
          tipoLabel: st.tipoLabel,
          nombre: st.nombre,
          estado: st.estado,
          fechaFinPlan: st.fechaFinPlan,
          responsable: st.responsable,
        });
      }
    }
    for (const tg of g.pendientesNivelHito ?? []) {
      out.push({
        tipoLabel: tg.tipoLabel,
        nombre: tg.nombre,
        estado: tg.estado,
        fechaFinPlan: tg.fechaFinPlan,
        responsable: tg.responsable,
      });
    }
  }
  return out;
}

function responsableLinea(m: IntegranteProyectoHu025): string {
  return `${String(m.rol).trim()}: ${String(m.nombreApellido).trim()}`;
}

function formatIsoEs(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso || '—';
  }
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  if (!p.length) {
    return '?';
  }
  if (p.length === 1) {
    return p[0].slice(0, 2).toUpperCase();
  }
  return `${p[0][0] ?? ''}${p[p.length - 1][0] ?? ''}`.toUpperCase();
}

function normalizeToken(value: string): string {
  return String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function esRolSquad(rol: string): boolean {
  const t = normalizeToken(rol).replace(/[\s_-]+/g, '');
  return [
    'technicallead',
    'techlead',
    'agilista',
    'agilecoach',
    'coachagile',
    'arquitecto',
    'desarrollador',
    'developer',
    'productowner',
    'qa',
    'tester',
    'tpo',
  ].includes(t);
}

const integrantesVisibles = computed(() => {
  return equipoToIntegrantes(equipoLocal.value).filter((x) => {
    if (!x.rol.trim() && !x.nombreApellido.trim()) {
      return false;
    }
    return !esRolSquad(x.rol);
  });
});
const squadMiembrosVisibles = computed(() => {
  const equipoNames = new Set(
    integrantesVisibles.value
      .map((m) => normalizeToken(m.nombreApellido))
      .filter(Boolean),
  );
  return (
    props.squadAsignado?.miembros?.filter((x) => {
      if (!x.usuarioNombre.trim() && !x.rol.trim()) {
        return false;
      }
      return !equipoNames.has(normalizeToken(x.usuarioNombre));
    }) ?? []
  );
});

const dirtyInformacion = computed(() => {
  if (!editModeInformacion.value) {
    return false;
  }
  if (draftDesc.value !== baselineDesc.value) {
    return true;
  }
  if (draftNombre.value !== baselineNombre.value) {
    return true;
  }
  if (draftTl.value !== baselineTl.value) {
    return true;
  }
  if (draftIni.value !== baselineIni.value) {
    return true;
  }
  if (draftEsEvolution.value !== baselineEsEvolution.value) {
    return true;
  }
  return false;
});

const dirtyEquipo = computed(() => {
  if (!editModeEquipo.value) {
    return false;
  }
  return membersSignature(equipoToIntegrantes(equipoLocal.value)) !== membersSignature(equipoToIntegrantes(baselineMembers.value));
});

function membersSignature(xs: IntegranteProyectoHu025[]): string {
  return [...xs]
    .map((m) => `${String(m.rol).trim()}\t${String(m.nombreApellido).trim()}`)
    .filter((s) => s !== '\t')
    .sort()
    .join('\n');
}

function snapshotInfoFromProps(): void {
  draftNombre.value = props.nombre ?? '';
  draftDesc.value = props.descripcion ?? '';
  draftTl.value = props.responsableTl === '—' ? '' : (props.responsableTl ?? '');
  draftIni.value = props.fechaInicio && /^\d{4}-\d{2}-\d{2}$/.test(props.fechaInicio) ? props.fechaInicio : '';
  draftFin.value = props.fechaFin && /^\d{4}-\d{2}-\d{2}$/.test(props.fechaFin) ? props.fechaFin : '';
  draftEsEvolution.value = Boolean(props.esEvolution);
}

function snapshotMembersFromProps(): void {
  equipoLocal.value = normalizarEquipoActual(props.integrantes ?? []);
  equipoErrors.value = {};
}

function cancelInformacion(): void {
  draftNombre.value = baselineNombre.value;
  draftDesc.value = baselineDesc.value;
  draftTl.value = baselineTl.value;
  draftIni.value = baselineIni.value;
  draftEsEvolution.value = baselineEsEvolution.value;
  editModeInformacion.value = false;
}

function cancelEquipo(): void {
  equipoLocal.value = baselineMembers.value.map((m) => ({ ...m }));
  equipoErrors.value = {};
  editModeEquipo.value = false;
}

function enterEditInformacion(): void {
  if (!props.canEdit) {
    return;
  }
  if (editModeEquipo.value) {
    cancelEquipo();
  }
  snapshotInfoFromProps();
  snapshotMembersFromProps();
  baselineNombre.value = draftNombre.value;
  baselineDesc.value = draftDesc.value;
  baselineTl.value = draftTl.value;
  baselineIni.value = draftIni.value;
  baselineFin.value = draftFin.value;
  baselineEsEvolution.value = draftEsEvolution.value;
  baselineMembers.value = equipoLocal.value.map((m) => ({ ...m }));
  editModeInformacion.value = true;
}

function enterEditEquipo(): void {
  if (!props.canEdit) {
    return;
  }
  if (editModeInformacion.value) {
    cancelInformacion();
  }
  snapshotMembersFromProps();
  snapshotInfoFromProps();
  baselineMembers.value = equipoLocal.value.map((m) => ({ ...m }));
  baselineNombre.value = draftNombre.value;
  baselineDesc.value = draftDesc.value;
  baselineTl.value = draftTl.value;
  baselineIni.value = draftIni.value;
  baselineFin.value = draftFin.value;
  baselineEsEvolution.value = draftEsEvolution.value;
  editModeEquipo.value = true;
}

watch(
  () =>
    [props.nombre, props.descripcion, props.responsableTl, props.esEvolution, props.fechaInicio, props.fechaFin, props.integrantes] as const,
  () => {
    if (!editModeInformacion.value) {
      snapshotInfoFromProps();
    }
    if (!editModeEquipo.value) {
      snapshotMembersFromProps();
    }
  },
  { deep: true, immediate: true },
);

async function loadItPmCatalogOptions(): Promise<void> {
  try {
    itPmCatalogOptions.value = await fetchItPmCatalogOptions();
  } catch {
    itPmCatalogOptions.value = [];
  }
}

async function loadRoleCatalogOptions(): Promise<void> {
  try {
    const roles = await fetchCatalogActive('ROL_EQUIPO');
    roleCatalogOptions.value = roles
      .filter((r) => r.activo && !esRolFijo(r.label))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'es'))
      .map((r) => ({ value: r.label, label: r.label }));
  } catch {
    roleCatalogOptions.value = [];
  }
}

onMounted(() => {
  void loadItPmCatalogOptions();
  void loadRoleCatalogOptions();
  if (!editModeInformacion.value) {
    snapshotInfoFromProps();
  }
  if (!editModeEquipo.value) {
    snapshotMembersFromProps();
  }
});

function addMiembro(): void {
  equipoLocal.value = [...equipoLocal.value, { rol: '', nombre: '', esFijo: false }];
}

function removeMiembro(idx: number): void {
  if (equipoLocal.value[idx]?.esFijo) {
    return;
  }
  equipoLocal.value = equipoLocal.value.filter((_, i) => i !== idx);
  equipoErrors.value = {};
}

function buildScalarBody(): {
  nombre: string;
  descripcion: string | null;
  responsable: string | null;
  fechaInicioPlan: string | null;
} {
  const nombre = draftNombre.value.trim();
  const descHtml = draftDesc.value;
  const t = draftTl.value.trim();
  const i = draftIni.value.trim();
  return {
    nombre,
    descripcion: hasMeaningfulHtmlContent(descHtml) ? descHtml.trim() : null,
    responsable: t ? t : null,
    fechaInicioPlan: /^\d{4}-\d{2}-\d{2}$/.test(i) ? i : null,
  };
}

function integrantesPayload(): { rol: string; nombreApellido: string }[] {
  return equipoLocal.value
    .map((m) => ({ rol: String(m.rol).trim(), nombreApellido: String(m.nombre).trim() }))
    .filter((m) => m.rol && m.nombreApellido);
}

function validarEquipo(): boolean {
  const errors: Record<number, { rol?: string; nombre?: string }> = {};
  for (const [idx, m] of equipoLocal.value.entries()) {
    const rol = String(m.rol ?? '').trim();
    const nombre = String(m.nombre ?? '').trim();
    if (m.esFijo) {
      if (!nombre) {
        errors[idx] = { ...errors[idx], nombre: 'Ingrese nombre y apellido.' };
      }
      continue;
    }
    if (!rol || !nombre) {
      if (!rol) {
        errors[idx] = { ...errors[idx], rol: 'Seleccione un rol.' };
      }
      if (!nombre) {
        errors[idx] = { ...errors[idx], nombre: 'Ingrese nombre y apellido.' };
      }
    }
  }
  equipoErrors.value = errors;
  return Object.keys(errors).length === 0;
}

const reasignarOptions = computed<SelectOption[]>(() =>
  removalTeamAfter.value
    .filter((m) => m.rol.trim() && m.nombreApellido.trim())
    .map((m) => ({ value: responsableLinea(m), label: responsableLinea(m) })),
);

function promptReasignacion(nombre: string, acts: typeof removalActs.value, teamAfter: IntegranteProyectoHu025[]): Promise<string | null> {
  removalNombre.value = nombre;
  removalActs.value = acts;
  removalTeamAfter.value = teamAfter.map((m) => ({ ...m }));
  reasignarA.value = '';
  removalOpen.value = true;
  return new Promise((resolve) => {
    removalResolve = resolve;
  });
}

function onRemovalCancel(): void {
  removalOpen.value = false;
  removalResolve?.(null);
  removalResolve = null;
}

function onRemovalConfirm(): void {
  const dest = reasignarA.value.trim();
  if (!dest) {
    return;
  }
  removalOpen.value = false;
  removalResolve?.(dest);
  removalResolve = null;
}

function removedMembers(baseline: IntegranteProyectoHu025[], draft: IntegranteProyectoHu025[]): IntegranteProyectoHu025[] {
  return baseline.filter((b) => !draft.some((d) => sameMiembro(d, b)));
}

async function guardarInformacion(): Promise<void> {
  if (!dirtyInformacion.value) {
    return;
  }
  if (!draftNombre.value.trim()) {
    toast.add({
      severity: 'warn',
      summary: 'Complete el nombre',
      detail: 'El nombre del proyecto es obligatorio.',
      life: 4000,
    });
    return;
  }
  saving.value = true;
  try {
    await patchProyectoApi(props.proyectoId, {
      ...buildScalarBody(),
      esEvolution: draftEsEvolution.value,
    });
    toast.add({ severity: 'success', summary: 'Cambios guardados', life: 3000 });
    editModeInformacion.value = false;
    emit('saved');
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'No se pudo guardar el proyecto.';
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail,
      life: detail.length > 120 ? 8000 : 4000,
    });
  } finally {
    saving.value = false;
  }
}

async function guardarEquipo(): Promise<void> {
  if (!dirtyEquipo.value) {
    return;
  }
  if (!validarEquipo()) {
    toast.add({
      severity: 'warn',
      summary: 'Complete el equipo',
      detail: 'Revise los roles y nombres requeridos antes de guardar.',
      life: 4000,
    });
    return;
  }
  saving.value = true;
  let huboReasignacion = false;
  try {
    const finalIntegrantes = integrantesPayload();
    const removed = removedMembers(equipoToIntegrantes(baselineMembers.value), finalIntegrantes);
    let teamWork = equipoToIntegrantes(baselineMembers.value);
    let actsFlat = flattenActs(await fetchActividadesDeProyecto(props.proyectoId, true));

    for (const r of removed) {
      const line = responsableLinea(r);
      teamWork = teamWork.filter((m) => responsableLinea(m) !== line);
      const actsFor = actsFlat.filter((a) => a.responsable === line);
      if (actsFor.length === 0) {
        continue;
      }
      const nombre = r.nombreApellido.trim() || line;
      saving.value = false;
      const dest = await promptReasignacion(
        nombre,
        actsFor.map((a) => ({
          tipoLabel: a.tipoLabel,
          nombre: a.nombre,
          estado: a.estado,
          fechaFinPlan: a.fechaFinPlan,
        })),
        teamWork,
      );
      saving.value = true;
      if (!dest) {
        toast.add({
          severity: 'info',
          summary: 'Sin cambios',
          detail: 'Se canceló la eliminación del integrante.',
          life: 4000,
        });
        return;
      }
      huboReasignacion = true;
      const intPayload = teamWork.map((m) => ({ rol: m.rol.trim(), nombreApellido: m.nombreApellido.trim() }));
      await patchProyectoApi(props.proyectoId, {
        integrantes: intPayload,
        eliminarResponsableYReasignar: { responsableLinea: line, reasignarA: dest },
      });
      actsFlat = actsFlat.map((a) => (a.responsable === line ? { ...a, responsable: dest } : a));
    }

    await patchProyectoApi(props.proyectoId, {
      integrantes: finalIntegrantes,
    });

    if (huboReasignacion) {
      toast.add({
        severity: 'success',
        summary: 'Integrante eliminado y actividades reasignadas con éxito',
        life: 4000,
      });
    } else {
      toast.add({ severity: 'success', summary: 'Cambios guardados', life: 3000 });
    }
    editModeEquipo.value = false;
    emit('saved');
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'No se pudo guardar el proyecto.';
    toast.add({
      severity: 'error',
      summary: 'Error',
      detail,
      life: detail.length > 120 ? 8000 : 4000,
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="pde-root">
    <!-- Bloque: Información del proyecto -->
    <section class="pde__block" aria-labelledby="pde-info-title">
      <div class="pde__title-row">
        <h3 id="pde-info-title" class="pde__title">Información del proyecto</h3>
        <div class="pde__title-actions">
          <template v-if="!editModeInformacion">
            <IsButton
              v-if="canEdit"
              class="pde__pencil"
              severity="secondary"
              text
              rounded
              size="small"
              icon="pi pi-pencil"
              aria-label="Editar información del proyecto"
              title="Editar"
              @click="enterEditInformacion"
            />
          </template>
          <template v-else>
            <IsButton severity="primary" outlined label="Cancelar" :disabled="saving" @click="cancelInformacion" />
            <IsButton
              severity="primary"
              label="Guardar"
              :loading="saving"
              :disabled="!dirtyInformacion"
              @click="guardarInformacion"
            />
          </template>
        </div>
      </div>

      <template v-if="!editModeInformacion">
        <dl class="pde__grid">
          <dt>Nombre del proyecto</dt>
          <dd>{{ draftNombre.trim() || '-' }}</dd>
          <dt>IT PM</dt>
          <dd>{{ draftTl.trim() || '—' }}</dd>
          <dt>¿Es Evolution?</dt>
          <dd>{{ draftEsEvolution ? 'Sí' : 'No' }}</dd>
          <dt>Descripción</dt>
          <dd class="pde__dd-rich">
            <div v-if="hasMeaningfulHtmlContent(draftDesc)" class="pde__rich-view" v-html="draftDesc" />
            <span v-else class="pde__muted">Sin descripción</span>
          </dd>
          <dt>Fecha inicio planificada</dt>
          <dd>{{ formatIsoEs(draftIni) }}</dd>
          <dt>Fecha fin planificada</dt>
          <dd>{{ formatIsoEs(draftFin) }}</dd>
        </dl>
      </template>

      <div v-else class="pde__edit">
        <div class="pde__fields">
          <div class="pde__field">
            <label class="pde__label">Nombre del proyecto</label>
            <IsInputText v-model="draftNombre" maxlength="500" fluid placeholder="Nombre del proyecto" />
          </div>
          <div class="pde__field">
            <label class="pde__label">IT PM</label>
            <IsSelect
              v-model="draftTl"
              placeholder="Seleccione IT PM"
              :options="itPmCatalogOptions"
              option-label="label"
              option-value="value"
              fluid
            />
          </div>
          <div class="pde__field pde__field--row-check">
            <IsCheckbox v-model="draftEsEvolution" binary input-id="pde-es-evolution" />
            <label for="pde-es-evolution" class="pde__checkbox-label">¿Es proyecto Evolution?</label>
          </div>
          <div class="pde__field">
            <label class="pde__label">Descripción</label>
            <RichTextEditor
              v-model="draftDesc"
              placeholder="Descripción del proyecto"
              aria-label="Descripción del proyecto"
            />
          </div>
          <div class="pde__field">
            <AppDatePicker
              :model-value="draftIni"
              label="Fecha inicio planificada"
              @update:model-value="(v: string | null) => (draftIni = v ?? '')"
            />
          </div>
          <div class="pde__field">
            <label class="pde__label">Fecha fin planificada</label>
            <div class="pde__readonly">{{ formatIsoEs(draftFin) }}</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Bloque: Equipo del proyecto -->
    <section class="pde__block" aria-labelledby="pde-equipo-title">
      <div class="pde__title-row">
        <h3 id="pde-equipo-title" class="pde__title">Equipo del proyecto</h3>
        <div class="pde__title-actions">
          <template v-if="!editModeEquipo">
            <IsButton
              v-if="canEdit"
              class="pde__pencil"
              severity="secondary"
              text
              rounded
              size="small"
              icon="pi pi-pencil"
              aria-label="Editar equipo del proyecto"
              title="Editar"
              @click="enterEditEquipo"
            />
          </template>
          <template v-else>
            <IsButton severity="primary" outlined label="Cancelar" :disabled="saving" @click="cancelEquipo" />
            <IsButton severity="primary" label="Guardar" :loading="saving" :disabled="!dirtyEquipo" @click="guardarEquipo" />
          </template>
        </div>
      </div>

      <template v-if="!editModeEquipo">
        <div class="pde__equipo-grid">
          <section class="pde__equipo-card" aria-labelledby="pde-equipo-proyecto-title">
            <h4 id="pde-equipo-proyecto-title" class="pde__subhead">Equipo del proyecto</h4>
            <ul v-if="integrantesVisibles.length" class="pde__equipo">
              <li v-for="(m, idx) in integrantesVisibles" :key="idx" class="pde__equipo-li">
                <span class="pde__avatar" aria-hidden="true">{{ iniciales(m.nombreApellido || m.rol) }}</span>
                <div>
                  <div class="pde__equipo-nombre">{{ m.nombreApellido || '—' }}</div>
                  <div class="pde__equipo-rol">{{ m.rol || '—' }}</div>
                </div>
              </li>
            </ul>
            <p v-else class="pde__equipo-empty">Sin integrantes registrados</p>
          </section>
          <section class="pde__equipo-card" aria-labelledby="pde-squad-title">
            <h4 id="pde-squad-title" class="pde__subhead">
              Squad asignado<template v-if="squadAsignado?.nombre">: {{ squadAsignado.nombre }}</template>
            </h4>
            <p v-if="!squadAsignado" class="pde__equipo-empty">Sin squad asignado</p>
            <template v-else>
              <ul v-if="squadMiembrosVisibles.length" class="pde__equipo">
                <li v-for="m in squadMiembrosVisibles" :key="m.id" class="pde__equipo-li">
                  <span class="pde__avatar" aria-hidden="true">{{ iniciales(m.usuarioNombre || m.rol) }}</span>
                  <div>
                    <div class="pde__equipo-nombre">{{ m.usuarioNombre || '—' }}</div>
                    <div class="pde__equipo-rol">{{ m.rol || '—' }}</div>
                  </div>
                </li>
              </ul>
              <p v-else class="pde__equipo-empty">Sin integrantes registrados</p>
            </template>
          </section>
        </div>
      </template>

      <div v-else class="pde__edit">
        <div v-for="(m, idx) in equipoLocal" :key="idx" class="pde__miembro">
          <div class="pde__field">
            <label class="pde__label">Rol</label>
            <IsInputText v-if="m.esFijo" v-model="m.rol" fluid disabled placeholder="Rol" />
            <IsSelect
              v-else
              v-model="m.rol"
              placeholder="Seleccione rol"
              :options="roleCatalogOptions"
              option-label="label"
              option-value="value"
              fluid
              :class="{ 'p-invalid': Boolean(equipoErrors[idx]?.rol) }"
            />
            <small v-if="equipoErrors[idx]?.rol" class="pde__error">{{ equipoErrors[idx]?.rol }}</small>
          </div>
          <div class="pde__field">
            <label class="pde__label">Nombre y apellido</label>
            <IsSelect
              v-if="m.rol === 'IT PM'"
              v-model="m.nombre"
              placeholder="Seleccione IT PM"
              :options="itPmCatalogOptions"
              option-label="label"
              option-value="value"
              fluid
              :class="{ 'p-invalid': Boolean(equipoErrors[idx]?.nombre) }"
            />
            <IsInputText
              v-else
              v-model="m.nombre"
              fluid
              placeholder="Nombre"
              :class="{ 'p-invalid': Boolean(equipoErrors[idx]?.nombre) }"
            />
            <small v-if="equipoErrors[idx]?.nombre" class="pde__error">{{ equipoErrors[idx]?.nombre }}</small>
          </div>
          <IsButton
            v-if="!m.esFijo"
            severity="primary"
            outlined
            size="small"
            label="Quitar"
            @click="removeMiembro(idx)"
          />
        </div>
        <IsButton severity="primary" outlined size="small" class="pde__add" label="+ Agregar miembro" @click="addMiembro" />
      </div>
    </section>

    <IsDialog
      v-model:visible="removalOpen"
      modal
      header="Confirmar eliminación"
      class="pde-dialog"
      :style="{ width: 'min(560px, 96vw)' }"
      :closable="false"
      :dismissable-mask="false"
    >
      <p class="pde-dialog__lead">
        ¿Estás seguro que deseas eliminar a <strong>{{ removalNombre }}</strong> del equipo?
      </p>
      <IsDataTable :value="removalActs" class="pde-dialog__table" striped-rows>
        <IsColumn field="tipoLabel" header="Tipo de actividad" />
        <IsColumn field="nombre" header="Nombre" />
        <IsColumn field="estado" header="Estado" />
        <IsColumn header="Fecha de Fin Planificada">
          <template #body="slotProps">
            {{ formatIsoEs(slotProps.data.fechaFinPlan) }}
          </template>
        </IsColumn>
      </IsDataTable>
      <div class="pde-dialog__reasig">
        <div class="pde__field">
          <label class="pde__label">Reasignar actividades a: <span class="pde__req">*</span></label>
          <IsSelect
            :model-value="reasignarA"
            placeholder="Seleccione integrante"
            :options="reasignarOptions"
            option-label="label"
            option-value="value"
            fluid
            @update:model-value="(v) => (reasignarA = String(v))"
          />
        </div>
      </div>
      <template #footer>
        <IsButton severity="primary" outlined label="Cancelar" @click="onRemovalCancel" />
        <IsButton severity="primary" label="Confirmar eliminación" :disabled="!reasignarA.trim()" @click="onRemovalConfirm" />
      </template>
    </IsDialog>
  </div>
</template>

<style scoped>
.pde-root {
  margin-top: 1.5rem;
}
.pde__block + .pde__block {
  margin-top: 1.5rem;
}
.pde__title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0 0 0.65rem;
  flex-wrap: wrap;
}
.pde__title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: theme('colors.surface.800');
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.pde__title-actions {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
.pde__pencil.p-button {
  color: theme('colors.surface.800');
}
.pde__pencil.p-button:hover {
  color: var(--apex-color-g100);
}
.pde__grid {
  display: grid;
  grid-template-columns: 11rem 1fr;
  gap: 0.65rem 1.25rem;
  margin: 0;
  padding: 1.25rem 1.35rem;
  font-size: 14px;
  border-radius: 8px;
  border: 1px solid var(--apex-border-brand);
  background: linear-gradient(180deg, #ffffff 0%, #fafcfe 100%);
  box-shadow: theme('boxShadow.sm');
}
.pde__grid dt {
  margin: 0;
  color: theme('colors.surface.800');
  font-weight: 700;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.pde__grid dd {
  margin: 0;
  color: theme('colors.surface.500');
}
.pde__dd-rich {
  margin: 0;
  min-width: 0;
}
.pde__rich-view {
  min-height: 2.25rem;
  line-height: 1.5;
  color: theme('colors.surface.700');
}
.pde__rich-view :deep(p) {
  margin: 0 0 0.55rem;
}
.pde__rich-view :deep(ul),
.pde__rich-view :deep(ol) {
  margin: 0.25rem 0 0.55rem;
  padding-left: 1.25rem;
}
.pde__muted {
  color: theme('colors.surface.400');
}
.pde__edit {
  padding: 1.25rem 1.35rem;
  border-radius: 8px;
  border: 1px solid var(--apex-border-brand);
  background: #fff;
}
.pde__fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.pde__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.pde__field--row-check {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}
.pde__checkbox-label {
  font-size: 13px;
  color: theme('colors.surface.800');
  cursor: pointer;
}
.pde__label {
  font-size: 13px;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.pde__readonly {
  min-height: 2.5rem;
  display: flex;
  align-items: center;
  padding: 0.55rem 0.75rem;
  border: 1px solid #dbe2ea;
  border-radius: 8px;
  background: var(--apex-surface-bg);
  color: theme('colors.surface.700');
  font-size: 14px;
  font-weight: 700;
}
.pde__req {
  color: #c0392b;
  margin-left: 2px;
}
.pde__error {
  color: var(--apex-color-re);
  font-size: 12px;
}
.pde__miembro {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0.75rem;
  align-items: end;
  margin-bottom: 0.75rem;
}
.pde__add {
  margin-bottom: 0.5rem;
}
.pde__equipo-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}
.pde__equipo-card {
  min-width: 0;
}
.pde__subhead {
  margin: 0 0 0.5rem;
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: theme('colors.surface.700');
}
.pde__equipo {
  list-style: none;
  margin: 0;
  padding: 0.85rem 1.1rem 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--apex-border-brand);
  background: linear-gradient(180deg, #ffffff 0%, #fafcfe 100%);
  box-shadow: theme('boxShadow.sm');
}
.pde__equipo-empty {
  margin: 0;
  padding: 1rem 1.35rem;
  font-size: 0.9375rem;
  color: theme('colors.surface.500');
  border-radius: 8px;
  border: 1px dashed theme('colors.surface.300');
  background: #fafcfe;
}
.pde__equipo-li {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.pde__avatar {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: linear-gradient(135deg, theme('colors.interseguro.700'), theme('colors.interseguro-info.500'));
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 800;
  flex-shrink: 0;
}
.pde__equipo-nombre {
  font-weight: 600;
  color: theme('colors.surface.800');
  font-size: 0.9375rem;
}
.pde__equipo-rol {
  font-size: 0.8125rem;
  color: theme('colors.surface.500');
}
.pde-dialog__lead {
  margin: 0 0 1rem;
  font-size: 14px;
  line-height: 1.45;
  color: theme('colors.surface.500');
}
.pde-dialog__table {
  margin-bottom: 1rem;
  font-size: 13px;
}
.pde-dialog__reasig {
  margin-top: 0.5rem;
}
@media (max-width: 560px) {
  .pde__miembro {
    grid-template-columns: 1fr;
  }
  .pde__equipo-grid {
    grid-template-columns: 1fr;
  }
}
</style>
