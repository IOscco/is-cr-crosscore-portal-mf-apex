<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { IsButton, IsInputText, IsDialog, useConfirm } from 'is-uikit-components-vue';
import BadgePill from '@/components/ui/BadgePill.vue';
import RichTextEditor from '@/components/shared/RichTextEditor.vue';
import { hasMeaningfulHtmlContent, plainTextFromHtml } from '@/lib/rich-text-utils';
import type { BadgePillVariant } from '@/types/badge-ui';
import type { SquadApi, SquadMiembroApi, SquadUsuarioApi } from '@/lib/squads-api';
import {
  fetchSquadsCards,
  fetchSquadsPapelera,
  createSquadApi,
  patchSquadApi,
  deleteSquadApi,
  restoreSquadPapelera,
  purgeSquadPapelera,
  searchSquadUsuarios,
} from '@/lib/squads-api';

const SQUAD_COLOR = '#1361B9';

const ROLE_GROUPS = [
  { value: 'it_business_support_lead', label: 'IT Business Support Lead', max: 1, short: 'BS Lead' },
  { value: 'tpo', label: 'TPO', max: 1, short: 'TPO' },
  { value: 'technical_lead', label: 'Technical Lead', max: 1, short: 'TL' },
  { value: 'business_owner', label: 'Business Owner', max: 1, short: 'BO' },
  { value: 'product_owner', label: 'Product Owner', max: 1, short: 'PO' },
  { value: 'desarrollador', label: 'Desarrollador', max: 3, short: 'Dev' },
  { value: 'qa', label: 'QA', max: 3, short: 'QA' },
  { value: 'arquitecto', label: 'Arquitecto', max: 3, short: 'Arq' },
  { value: 'agilista', label: 'Agilista', max: 1, short: 'Agilista' },
] as const;

type SquadMemberForm = { rol: string; usuarioLogin: string; usuarioNombre: string };
type SquadTipoEquipo = 'TRIBU_DESARROLLO' | 'SOPORTE_NEGOCIO';
type MemberSearchState = { active: boolean; query: string; loading: boolean; suggestions: SquadUsuarioApi[] };
type SquadViewMode = 'gestion' | 'equipo';
type OrgMember = SquadMiembroApi & { roleKey: string; roleLabel: string };
type SharedResource = { key: string; nombre: string; roles: string[]; squads: string[] };

const LEADERSHIP_ROLES = ['it_business_support_lead', 'tpo', 'technical_lead', 'business_owner', 'product_owner', 'agilista'];
const DEVELOPMENT_ROLES = ['desarrollador', 'qa', 'arquitecto'];
const ROLE_AVATAR_COLORS: Record<string, string> = {
  it_business_support_lead: '#C2410C',
  tpo: '#1361B9',
  technical_lead: '#55ACED',
  business_owner: '#1B3A8C',
  product_owner: '#2656A3',
  agilista: '#FF4298',
  desarrollador: '#374151',
  qa: '#FF4298',
  arquitecto: '#55ACED',
};

const confirm = useConfirm();
const tab = ref<'activos' | 'papelera'>('activos');
const viewMode = ref<SquadViewMode>('gestion');
const rows = ref<SquadApi[]>([]);
const loading = ref(false);
const err = ref<string | null>(null);
const dlg = ref(false);
const editId = ref<string | null>(null);
const nombre = ref('');
const descripcion = ref('');
const tipoEquipo = ref<SquadTipoEquipo>('TRIBU_DESARROLLO');
const miembros = ref<SquadMemberForm[]>([]);
const purgeId = ref<string | null>(null);
const search = ref('');
const memberSearch = reactive<Record<string, MemberSearchState>>(
  Object.fromEntries(
    ROLE_GROUPS.map((r) => [r.value, { active: false, query: '', loading: false, suggestions: [] }]),
  ) as Record<string, MemberSearchState>,
);

const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) {
    return rows.value;
  }
  return rows.value.filter((s) => s.nombre.toLowerCase().includes(q));
});

const visibleRoleGroups = computed(() =>
  ROLE_GROUPS.filter((role) => tipoEquipo.value === 'SOPORTE_NEGOCIO' || role.value !== 'it_business_support_lead'),
);

const canSave = computed(
  () => nombre.value.trim().length > 0 && miembros.value.some((m) => m.usuarioLogin.trim() && m.usuarioNombre.trim()),
);

const sharedResources = computed<SharedResource[]>(() => {
  const byLogin = new Map<string, { nombre: string; roles: Set<string>; squads: Set<string> }>();
  for (const squad of filteredRows.value) {
    if (squad.deletedAt || !squad.activo) {
      continue;
    }
    for (const member of squad.miembros ?? []) {
      const key = (member.usuarioLogin || member.usuarioNombre).trim().toLowerCase();
      if (!key) {
        continue;
      }
      const current = byLogin.get(key) ?? {
        nombre: member.usuarioNombre,
        roles: new Set<string>(),
        squads: new Set<string>(),
      };
      current.nombre = current.nombre || member.usuarioNombre;
      current.roles.add(roleLabel(member.rol));
      current.squads.add(squad.nombre);
      byLogin.set(key, current);
    }
  }
  return [...byLogin.entries()]
    .filter(([, item]) => item.squads.size > 1)
    .map(([key, item]) => ({
      key,
      nombre: item.nombre,
      roles: [...item.roles],
      squads: [...item.squads].sort((a, b) => a.localeCompare(b, 'es')),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
});

function setTab(t: 'activos' | 'papelera'): void {
  tab.value = t;
  if (t === 'papelera') {
    viewMode.value = 'gestion';
  }
  void load();
}

function roleLabel(role: string): string {
  return ROLE_GROUPS.find((r) => r.value === canonicalRole(role))?.label ?? role;
}

function squadColor(): string {
  return SQUAD_COLOR;
}

function canonicalRole(role: string): string {
  const r = role.trim().toLowerCase().replace(/\s+/g, '_');
  if (r === 'business_support_lead' || r === 'itbusinesssupportlead' || r === 'support_lead') {
    return 'it_business_support_lead';
  }
  if (r === 'tech_lead' || r === 'technicallead') {
    return 'technical_lead';
  }
  if (r === 'businessowner' || r === 'bo') {
    return 'business_owner';
  }
  if (r === 'productowner' || r === 'po') {
    return 'product_owner';
  }
  if (r === 'agilista' || r === 'agile_coach' || r === 'agilecoach') {
    return 'agilista';
  }
  if (r === 'dev' || r === 'desarrolladores') {
    return 'desarrollador';
  }
  return r;
}

function miembrosByRole(role: string): SquadMemberForm[] {
  return miembros.value.filter((m) => canonicalRole(m.rol) === role);
}

function roleCount(role: string): number {
  return miembrosByRole(role).length;
}

function canAddRole(role: string): boolean {
  const meta = ROLE_GROUPS.find((r) => r.value === role);
  return meta ? roleCount(role) < effectiveRoleMax(role, meta.max) : false;
}

function addButtonLabel(role: (typeof ROLE_GROUPS)[number]): string {
  const max = effectiveRoleMax(role.value, role.max);
  if (max === 1) {
    return `+ Agregar ${role.label}`;
  }
  return `+ Agregar ${role.label} (${roleCount(role.value)}/${max})`;
}

function effectiveRoleMax(role: string, defaultMax: number): number {
  if (tipoEquipo.value === 'SOPORTE_NEGOCIO' && role === 'desarrollador') {
    return 20;
  }
  return defaultMax;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return '?';
  }
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function hashColor(seed: string): string {
  const palette = ['#1361B9', '#FF4298', '#55ACED', '#00B555', '#F14649', '#F0AA00', '#7B61FF', '#FF6B35', '#00C9A7'];
  let hash = 0;
  for (const ch of seed) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return palette[hash % palette.length] ?? SQUAD_COLOR;
}

function avatarStyle(member: Pick<SquadMiembroApi, 'usuarioNombre' | 'rol'>): Record<string, string> {
  return { backgroundColor: hashColor(`${member.usuarioNombre}:${member.rol}`) };
}

function roleAvatarStyle(role: string): Record<string, string> {
  return { backgroundColor: ROLE_AVATAR_COLORS[canonicalRole(role)] ?? '#374151' };
}

function statusLabel(s: SquadApi): string {
  if (tab.value === 'papelera' || s.deletedAt) {
    return 'Papelera';
  }
  return s.activo ? 'Activo' : 'Inactivo';
}

function displayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) {
    return parts.join(' ');
  }
  return `${parts[0]} ${parts[1]?.charAt(0) ?? ''}.`;
}

function memberChipName(name: string): string {
  const formatted = displayName(name);
  return formatted.length > 20 ? `${formatted.slice(0, 19)}…` : formatted;
}

function cardDescription(desc: string | null | undefined): string {
  const text = plainTextFromHtml(desc);
  return text || '—';
}

function teamSummary(s: SquadApi): string {
  const members = s.miembros ?? [];
  const summary: string[] = [];
  for (const role of ROLE_GROUPS) {
    const group = members.filter((m) => canonicalRole(m.rol) === role.value);
    if (!group.length) {
      continue;
    }
    if (role.max === 1) {
      summary.push(`${role.short}: ${displayName(group[0]?.usuarioNombre ?? '')}`);
      continue;
    }
    if (group.length === 1) {
      summary.push(`${role.short}: ${displayName(group[0]?.usuarioNombre ?? '')}`);
    } else if (role.value === 'desarrollador') {
      summary.push(`${group.length} desarrolladores`);
    } else if (role.value === 'qa') {
      summary.push(`${group.length} QA`);
    } else {
      summary.push(`${group.length} arquitectos`);
    }
  }
  return summary.join(' · ') || 'Sin miembros';
}

function orgMembers(s: SquadApi, roleKeys: string[]): OrgMember[] {
  const allowed = new Set(roleKeys);
  return (s.miembros ?? [])
    .map((member) => {
      const roleKey = canonicalRole(member.rol);
      return { ...member, roleKey, roleLabel: roleLabel(roleKey) };
    })
    .filter((member) => allowed.has(member.roleKey))
    .sort((a, b) => roleKeys.indexOf(a.roleKey) - roleKeys.indexOf(b.roleKey) || a.usuarioNombre.localeCompare(b.usuarioNombre, 'es'));
}

function statusVariant(s: SquadApi): BadgePillVariant {
  if (tab.value === 'papelera' || s.deletedAt) {
    return 'red';
  }
  return s.activo ? 'teal' : 'gray';
}

function resetMemberSearch(): void {
  for (const role of ROLE_GROUPS) {
    const state = memberSearch[role.value];
    state.active = false;
    state.query = '';
    state.loading = false;
    state.suggestions = [];
  }
}

async function load(): Promise<void> {
  loading.value = true;
  err.value = null;
  try {
    rows.value = tab.value === 'activos' ? await fetchSquadsCards() : await fetchSquadsPapelera();
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Error al cargar squads';
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});

function openNuevo(): void {
  editId.value = null;
  nombre.value = '';
  descripcion.value = '';
  tipoEquipo.value = 'TRIBU_DESARROLLO';
  miembros.value = [];
  resetMemberSearch();
  dlg.value = true;
}

function openEdit(s: SquadApi): void {
  editId.value = s.id;
  nombre.value = s.nombre;
  descripcion.value = s.descripcion ?? '';
  tipoEquipo.value = s.tipoEquipo === 'SOPORTE_NEGOCIO' ? 'SOPORTE_NEGOCIO' : 'TRIBU_DESARROLLO';
  miembros.value =
    s.miembros?.map((m) => ({
      rol: canonicalRole(m.rol),
      usuarioLogin: m.usuarioLogin,
      usuarioNombre: m.usuarioNombre,
    })) ?? [];
  resetMemberSearch();
  dlg.value = true;
}

function activateMemberSearch(role: string): void {
  if (!canAddRole(role)) {
    return;
  }
  memberSearch[role].active = true;
  memberSearch[role].query = '';
  memberSearch[role].suggestions = [];
}

function removeMiembro(member: SquadMemberForm): void {
  const idx = miembros.value.indexOf(member);
  if (idx >= 0) {
    miembros.value.splice(idx, 1);
  }
}

function addMember(role: string, usuarioLogin: string, usuarioNombre: string): void {
  const login = usuarioLogin.trim();
  const name = usuarioNombre.trim();
  if (!name) {
    return;
  }
  if (!canAddRole(role)) {
    err.value = `El rol ${roleLabel(role)} alcanzó el máximo permitido.`;
    memberSearch[role].active = false;
    return;
  }
  const finalLogin = login || name.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9@.]+/g, '.');
  const duplicate = miembros.value.some((m) => m.rol === role && m.usuarioLogin.toLowerCase() === finalLogin.toLowerCase());
  if (!duplicate) {
    miembros.value.push({ rol: role, usuarioLogin: finalLogin, usuarioNombre: name });
  }
  memberSearch[role].active = false;
  memberSearch[role].query = '';
  memberSearch[role].suggestions = [];
}

function selectUsuario(role: string, user: SquadUsuarioApi): void {
  addMember(role, user.email, user.nombre);
}

function addManualMember(role: string): void {
  const raw = memberSearch[role].query.trim();
  if (!raw) {
    return;
  }
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = emailMatch?.[0] ?? '';
  const name = email ? raw.replace(email, '').replace(/[—-]/g, '').trim() || email : raw;
  addMember(role, email, name);
}

let usuarioSearchSeq = 0;
async function onMemberQuery(role: string): Promise<void> {
  const state = memberSearch[role];
  const q = state.query.trim();
  if (q.length < 2) {
    state.suggestions = [];
    return;
  }
  const seq = ++usuarioSearchSeq;
  state.loading = true;
  try {
    const results = await searchSquadUsuarios(q);
    if (seq === usuarioSearchSeq) {
      state.suggestions = results;
    }
  } catch {
    if (seq === usuarioSearchSeq) {
      state.suggestions = [];
    }
  } finally {
    if (seq === usuarioSearchSeq) {
      state.loading = false;
    }
  }
}

async function guardar(): Promise<void> {
  err.value = null;
  try {
    const payload = {
      nombre: nombre.value.trim(),
      descripcion: hasMeaningfulHtmlContent(descripcion.value) ? descripcion.value.trim() : null,
      tipoEquipo: tipoEquipo.value,
      miembros: miembros.value.filter((m) => m.usuarioLogin.trim() && m.usuarioNombre.trim()),
    };
    if (!payload.nombre) {
      err.value = 'Nombre obligatorio';
      return;
    }
    if (!payload.miembros.length) {
      err.value = 'Agrega al menos un miembro.';
      return;
    }
    if (editId.value) {
      await patchSquadApi(editId.value, payload);
    } else {
      await createSquadApi(payload);
    }
    dlg.value = false;
    await load();
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'No se pudo guardar';
  }
}

function eliminar(s: SquadApi): void {
  confirm.require({
    message: `¿Enviar el squad «${s.nombre}» a la papelera?`,
    header: 'Confirmar',
    icon: 'pi pi-trash',
    acceptLabel: 'Sí, eliminar',
    rejectLabel: 'Cancelar',
    accept: async () => {
      try {
        await deleteSquadApi(s.id);
        await load();
      } catch {
        err.value = 'No se pudo eliminar';
      }
    },
  });
}

async function restaurar(id: string): Promise<void> {
  try {
    await restoreSquadPapelera(id);
    await load();
  } catch {
    err.value = 'No se pudo restaurar';
  }
}

async function purgar(): Promise<void> {
  if (!purgeId.value) {
    return;
  }
  try {
    await purgeSquadPapelera(purgeId.value);
    purgeId.value = null;
    await load();
  } catch {
    err.value = 'No se pudo purgar';
  }
}

</script>

<template>
  <div class="sq">
    <div class="sq__head">
      <h2 class="sq__title">Squads</h2>
      <div class="sq__tabs">
        <button type="button" class="sq__tab" :class="{ 'sq__tab--on': tab === 'activos' }" @click="setTab('activos')">
          Activos
        </button>
        <button type="button" class="sq__tab" :class="{ 'sq__tab--on': tab === 'papelera' }" @click="setTab('papelera')">
          Papelera
        </button>
      </div>
      <div v-if="tab === 'activos'" class="sq__view-toggle" aria-label="Vista de squads">
        <button
          type="button"
          class="sq__view-btn"
          :class="{ 'sq__view-btn--on': viewMode === 'gestion' }"
          @click="viewMode = 'gestion'"
        >
          <i class="pi pi-th-large" aria-hidden="true" />
          Gestión
        </button>
        <button
          type="button"
          class="sq__view-btn"
          :class="{ 'sq__view-btn--on': viewMode === 'equipo' }"
          @click="viewMode = 'equipo'"
        >
          <i class="pi pi-users" aria-hidden="true" />
          Equipo
        </button>
      </div>
      <IsButton v-if="tab === 'activos'" severity="primary" label="Nuevo Squad" @click="openNuevo" />
    </div>
    <p class="sq__hint">Los límites por rol se validan en la interfaz y en el servidor.</p>
    <div class="sq__toolbar">
      <IsInputText v-model="search" placeholder="Buscar squad..." fluid class="sq__search" />
    </div>
    <p v-if="err" class="sq__err" role="alert">{{ err }}</p>
    <p v-if="loading" class="sq__muted">Cargando…</p>
    <div v-else-if="viewMode === 'gestion'" class="sq__grid">
      <article v-for="s in filteredRows" :key="s.id" class="sq__card" :style="{ '--squad-color': squadColor() }">
        <span class="sq__color-bar" aria-hidden="true" />
        <div v-if="tab === 'activos'" class="sq__icon-actions">
          <button type="button" class="sq__icon-action" aria-label="Editar squad" title="Editar" @click="openEdit(s)">
            <i class="pi pi-pencil" aria-hidden="true" />
          </button>
          <button type="button" class="sq__icon-action sq__icon-action--danger" aria-label="Eliminar squad" title="Eliminar" @click="eliminar(s)">
            <i class="pi pi-trash" aria-hidden="true" />
          </button>
        </div>
        <h3 class="sq__card-title">{{ s.nombre }}</h3>
        <p class="sq__card-desc">{{ cardDescription(s.descripcion) }}</p>
        <p class="sq__team-summary">{{ teamSummary(s) }}</p>
        <div class="sq__card-meta">
          <BadgePill :variant="statusVariant(s)">{{ statusLabel(s) }}</BadgePill>
        </div>
        <div v-if="tab === 'papelera'" class="sq__card-actions">
          <IsButton size="small" outlined label="Restaurar" @click="restaurar(s.id)" />
          <IsButton size="small" severity="danger" outlined label="Purgar" @click="purgeId = s.id" />
        </div>
      </article>
      <p v-if="filteredRows.length === 0" class="sq__muted sq__empty">No hay squads para mostrar.</p>
    </div>
    <div v-else class="sq__org">
      <article v-for="s in filteredRows" :key="s.id" class="sq-org-card">
        <header class="sq-org-card__head">
          <h3>{{ s.nombre }}</h3>
          <span>{{ s.miembros?.length ?? 0 }} miembros</span>
        </header>
        <div class="sq-org-card__body">
          <section v-if="orgMembers(s, LEADERSHIP_ROLES).length" class="sq-org-group">
            <h4>Liderazgo</h4>
            <div class="sq-org-members">
              <div v-for="member in orgMembers(s, LEADERSHIP_ROLES)" :key="member.id" class="sq-org-member">
                <span class="sq-org-avatar" :style="roleAvatarStyle(member.roleKey)">{{ initials(member.usuarioNombre) }}</span>
                <span class="sq-org-member__main">
                  <strong>{{ member.usuarioNombre }}</strong>
                  <small>{{ member.usuarioLogin }}</small>
                </span>
                <span class="sq-org-role">{{ member.roleLabel }}</span>
              </div>
            </div>
          </section>
          <section v-if="orgMembers(s, DEVELOPMENT_ROLES).length" class="sq-org-group">
            <h4>Desarrollo</h4>
            <div class="sq-org-members">
              <div v-for="member in orgMembers(s, DEVELOPMENT_ROLES)" :key="member.id" class="sq-org-member">
                <span class="sq-org-avatar" :style="roleAvatarStyle(member.roleKey)">{{ initials(member.usuarioNombre) }}</span>
                <span class="sq-org-member__main">
                  <strong>{{ member.usuarioNombre }}</strong>
                  <small>{{ member.usuarioLogin }}</small>
                </span>
                <span class="sq-org-role">{{ member.roleLabel }}</span>
              </div>
            </div>
          </section>
          <p v-if="!s.miembros?.length" class="sq__muted">Sin miembros asignados.</p>
        </div>
      </article>
      <p v-if="filteredRows.length === 0" class="sq__muted sq__empty">No hay squads para mostrar.</p>

      <section v-if="sharedResources.length" class="sq-shared">
        <h3 class="sq-shared__title">⚡ Recursos Compartidos</h3>
        <div class="sq-shared__chips">
          <span v-for="resource in sharedResources" :key="resource.key" class="sq-shared-chip">
            <span class="sq-shared-chip__name">{{ resource.nombre }}</span>
            <span class="sq-shared-chip__role">{{ resource.roles.join(' / ') }}</span>
            <span class="sq-shared-chip__squads">{{ resource.squads.join(' · ') }}</span>
          </span>
        </div>
      </section>
    </div>

    <IsDialog
      v-model:visible="dlg"
      :header="editId ? 'Editar Squad' : 'Nuevo Squad'"
      modal
      class="sq__dlg"
      :style="{ width: 'min(760px, 96vw)' }"
      :content-style="{ padding: '0' }"
    >
      <div class="sq__dlg-body">
        <label class="sq__field">
          <span class="sq__lbl">Nombre <span class="sq__req">*</span></span>
          <IsInputText v-model="nombre" fluid />
        </label>
        <div class="sq__field sq__field--wide">
          <span class="sq__lbl">Descripción</span>
          <RichTextEditor
            v-model="descripcion"
            placeholder="Contexto, propósito o alcance del squad."
            aria-label="Descripción del squad"
          />
        </div>
        <label class="sq__field sq__field--wide">
          <span class="sq__lbl">Tipo de equipo <span class="sq__req">*</span></span>
          <select v-model="tipoEquipo" class="sq__select">
            <option value="TRIBU_DESARROLLO">Tribu de desarrollo</option>
            <option value="SOPORTE_NEGOCIO">Soporte al Negocio</option>
          </select>
        </label>
        <div class="sq__members-title">
          <span class="sq__lbl">Miembros <span class="sq__req">*</span></span>
          <span class="sq__muted">Agrupados por rol</span>
        </div>
        <div class="sq__roles">
          <section v-for="role in visibleRoleGroups" :key="role.value" class="sq__role-section">
            <div class="sq__role-head">
              <span class="sq__role-label">{{ role.label }}</span>
              <button v-if="canAddRole(role.value)" type="button" class="sq__add-member" @click="activateMemberSearch(role.value)">
                {{ addButtonLabel(role) }}
              </button>
            </div>
            <div v-if="miembrosByRole(role.value).length" class="sq__member-chips">
              <span v-for="m in miembrosByRole(role.value)" :key="`${m.rol}:${m.usuarioLogin}`" class="sq__member-chip">
                <span class="sq__mini-avatar" :style="avatarStyle(m)">{{ initials(m.usuarioNombre) }}</span>
                <span class="sq__member-name" :title="m.usuarioNombre">{{ memberChipName(m.usuarioNombre) }}</span>
                <button type="button" aria-label="Quitar miembro" @click="removeMiembro(m)">×</button>
              </span>
            </div>
            <div v-if="memberSearch[role.value].active" class="sq__autocomplete">
              <input
                v-model="memberSearch[role.value].query"
                class="sq__autocomplete-input"
                type="text"
                placeholder="Buscar por nombre o email..."
                @input="onMemberQuery(role.value)"
                @keydown.enter.prevent="addManualMember(role.value)"
                @keydown.esc.prevent="memberSearch[role.value].active = false"
              />
              <div class="sq__suggestions" role="listbox">
                <button
                  v-for="u in memberSearch[role.value].suggestions"
                  :key="u.id"
                  type="button"
                  class="sq__suggestion"
                  role="option"
                  @click="selectUsuario(role.value, u)"
                >
                  <span class="sq__mini-avatar" :style="{ backgroundColor: hashColor(u.nombre) }">{{ initials(u.nombre) }}</span>
                  <span>
                    <strong>{{ u.nombre }}</strong>
                    <small>{{ u.email }}</small>
                  </span>
                </button>
                <span v-if="memberSearch[role.value].loading" class="sq__suggestion-info">Buscando...</span>
                <button
                  v-else-if="memberSearch[role.value].query.trim()"
                  type="button"
                  class="sq__suggestion sq__suggestion--manual"
                  @click="addManualMember(role.value)"
                >
                  Usar "{{ memberSearch[role.value].query.trim() }}" como ingreso manual
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
      <template #footer>
        <IsButton severity="secondary" outlined label="Cancelar" @click="dlg = false" />
        <IsButton severity="primary" label="Guardar" :disabled="!canSave" @click="guardar" />
      </template>
    </IsDialog>

    <div v-if="purgeId" class="sq__overlay" role="dialog" aria-modal="true">
      <div class="sq__overlay-card">
        <h3>¿Eliminar definitivamente?</h3>
        <p class="sq__muted">No se puede deshacer.</p>
        <div class="sq__overlay-actions">
          <IsButton outlined label="Cancelar" @click="purgeId = null" />
          <IsButton severity="danger" label="Purgar" @click="purgar" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sq {
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}
.sq__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}
.sq__title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
}
.sq__tabs {
  display: flex;
  gap: 0.35rem;
}
.sq__view-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem;
  border: 1px solid #cfdfea;
  border-radius: 8px;
  background: #fff;
}
.sq__view-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #5a6f82;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  padding: 0.35rem 0.7rem;
}
.sq__view-btn--on {
  background: #1361b9;
  color: #fff;
}
.sq__tab {
  border: 1px solid #cfdfea;
  background: #fff;
  border-radius: 6px;
  padding: 0.35rem 0.85rem;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: #5a6f82;
}
.sq__tab--on {
  border-color: #1361b9;
  color: #1a1a2e;
}
.sq__hint {
  font-size: 13px;
  color: theme('colors.surface.700');
  margin: 0 0 1rem;
  max-width: 44rem;
}
.sq__toolbar {
  display: flex;
  margin-bottom: 1rem;
}
.sq__search {
  max-width: 24rem;
}
.sq__err {
  color: #c41e24;
  font-size: 13px;
}
.sq__muted {
  font-size: 12px;
  color: theme('colors.surface.600');
  margin: 0.25rem 0;
}
.sq__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1rem;
}
.sq__org {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1rem;
}
.sq-org-card {
  overflow: hidden;
  border: 1px solid #cfdfea;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
}
.sq-org-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  background: #1361b9;
  color: #fff;
}
.sq-org-card__head h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
}
.sq-org-card__head span {
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  padding: 0.2rem 0.55rem;
  font-size: 12px;
  font-weight: 700;
}
.sq-org-card__body {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
}
.sq-org-group h4 {
  margin: 0 0 0.5rem;
  color: #1f2937;
  font-size: 13px;
  font-weight: 800;
}
.sq-org-members {
  display: grid;
  gap: 0.55rem;
}
.sq-org-member {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.55rem;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.5rem;
  background: #f8fafc;
}
.sq-org-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  color: #fff;
  font-size: 11px;
  font-weight: 800;
}
.sq-org-member__main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}
.sq-org-member__main strong,
.sq-org-member__main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sq-org-member__main strong {
  color: #111827;
  font-size: 13px;
}
.sq-org-member__main small {
  color: #64748b;
  font-size: 11px;
}
.sq-org-role {
  border-radius: 999px;
  background: #eaf2fb;
  color: #1361b9;
  padding: 0.15rem 0.45rem;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}
.sq-shared {
  grid-column: 1 / -1;
  border: 1px solid #c9e6f8;
  border-radius: 12px;
  background: #eef7fd;
  padding: 1rem;
}
.sq-shared__title {
  margin: 0 0 0.75rem;
  color: #0f3f68;
  font-size: 1rem;
  font-weight: 800;
}
.sq-shared__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}
.sq-shared-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 100%;
  border: 1px solid #b7dbf1;
  border-radius: 999px;
  background: #fff;
  padding: 0.35rem 0.55rem;
  color: #1f2937;
  font-size: 12px;
}
.sq-shared-chip__name {
  font-weight: 800;
}
.sq-shared-chip__role {
  color: #64748b;
  font-weight: 700;
}
.sq-shared-chip__squads {
  border-radius: 999px;
  background: #1361b9;
  color: #fff;
  padding: 0.12rem 0.45rem;
  font-weight: 800;
}
.sq__card {
  position: relative;
  overflow: hidden;
  border: 1px solid theme('colors.surface.200');
  border-radius: 10px;
  padding: 1rem 1rem 1rem 1.15rem;
  background: #fff;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}
.sq__card:hover {
  border-color: #b8c8d8;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}
.sq__color-bar {
  position: absolute;
  inset: 0 auto 0 0;
  width: 5px;
  background: var(--squad-color, #9ca3af);
}
.sq__icon-actions {
  position: absolute;
  top: 0.65rem;
  right: 0.65rem;
  display: inline-flex;
  gap: 0.35rem;
}
.sq__icon-action {
  border: 0;
  background: transparent;
  color: #1a1a2e;
  cursor: pointer;
  padding: 0.2rem;
  opacity: 0.82;
}
.sq__icon-action:hover {
  color: #1361b9;
  opacity: 1;
}
.sq__icon-action--danger:hover {
  color: #c41e24;
}
.sq__card-title {
  margin: 0 3.4rem 0.35rem 0;
  font-size: 1rem;
  font-weight: 700;
}
.sq__card-desc {
  margin: 0 0 0.5rem;
  font-size: 13px;
  color: theme('colors.surface.700');
  min-height: 2.5rem;
}
.sq__team-summary {
  margin: 0 0 0.65rem;
  color: #64748b;
  font-size: 12px;
  line-height: 1.4;
}
.sq__card-meta {
  display: flex;
  margin-bottom: 0.65rem;
}
.sq__card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.75rem;
}
.sq__dlg-body {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.85rem 1rem;
  padding: 1.25rem 1.5rem 1rem;
  background: linear-gradient(180deg, #f5f7fb 0%, #ffffff 36%, #ffffff 100%);
}
.sq__lbl {
  font-size: 13px;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.sq__req {
  color: #c0392b;
}
.sq__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.sq__field--wide,
.sq__members-title,
.sq__roles {
  grid-column: 1 / -1;
}
.sq__members-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.5rem;
}
.sq__roles {
  display: grid;
  gap: 0.7rem;
}
.sq__role-section {
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.75rem;
  background: #fff;
}
.sq__role-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.sq__role-label {
  font-size: 13px;
  font-weight: 800;
  color: #1f2937;
}
.sq__add-member {
  border: 0;
  background: transparent;
  color: #1361b9;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
}
.sq__member-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.65rem;
}
.sq__member-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  max-width: 100%;
  border: 1px solid #cfdfea;
  border-radius: 999px;
  padding: 0.2rem 0.45rem 0.2rem 0.25rem;
  background: #f8fafc;
  color: #1f2937;
  font-size: 12px;
  font-weight: 700;
}
.sq__member-chip small {
  color: #64748b;
  font-weight: 600;
}
.sq__member-name {
  display: inline-block;
  max-width: 20ch;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: bottom;
  white-space: nowrap;
}
.sq__member-chip button {
  border: 0;
  background: transparent;
  cursor: pointer;
  color: #64748b;
  font-size: 1rem;
  line-height: 1;
}
.sq__mini-avatar {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
}
.sq__autocomplete {
  position: relative;
  margin-top: 0.65rem;
}
.sq__autocomplete-input {
  width: 100%;
  min-height: 2.35rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid #cfdfea;
  border-radius: 6px;
  background: #fff;
  color: #1a1a2e;
  font: inherit;
}
.sq__select {
  min-height: 2.35rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid #cfdfea;
  border-radius: 6px;
  background: #fff;
  color: #1a1a2e;
  font: inherit;
}
.sq__suggestions {
  position: absolute;
  z-index: 5;
  top: calc(100% + 0.25rem);
  right: 0;
  left: 0;
  max-height: 14rem;
  overflow-y: auto;
  border: 1px solid #cfdfea;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.16);
}
.sq__suggestion {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  border: 0;
  border-bottom: 1px solid #edf2f7;
  background: #fff;
  padding: 0.55rem 0.65rem;
  text-align: left;
  cursor: pointer;
}
.sq__suggestion:hover {
  background: #f5f7fb;
}
.sq__suggestion small,
.sq__suggestion-info {
  display: block;
  color: #64748b;
  font-size: 12px;
}
.sq__suggestion-info {
  padding: 0.65rem;
}
.sq__suggestion--manual {
  color: #1361b9;
  font-weight: 700;
}
.sq__empty {
  grid-column: 1 / -1;
}
@media (max-width: 720px) {
  .sq__dlg-body {
    grid-template-columns: 1fr;
  }
  .sq__org {
    grid-template-columns: 1fr;
  }
  .sq__view-toggle {
    order: 3;
  }
}
@media (min-width: 721px) and (max-width: 1100px) {
  .sq__org {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.sq__warn-ul {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 13px;
}
.sq__warn {
  font-size: 13px;
}
.sq__overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
}
.sq__overlay-card {
  background: #fff;
  padding: 1.25rem;
  border-radius: 8px;
  max-width: 22rem;
}
.sq__overlay-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}
</style>
