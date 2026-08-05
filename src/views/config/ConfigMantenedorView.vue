<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { IsButton, IsInputText, IsSelect } from 'is-uikit-components-vue';
import type { SelectOption } from '@/types/forms';
import { usePortalAccess } from '@/modules/shared/composables/usePortalAccess';
import {
  fetchCatalogAdmin,
  patchCatalogItem,
  createCatalogItem,
  createNamedConfig,
  createPeriodoConfig,
  fetchNamedConfig,
  fetchPeriodosAdmin,
  labelToSnakeCode,
  patchNamedConfig,
  patchPeriodoConfig,
  type ConfigCatalogCategory,
  type CatalogItemDto,
  type NamedConfigDto,
  type PeriodoConfigDto,
} from '@/lib/config-api';

type ModuleTab = 'iniciativas' | 'proyectos';
type IniciativaSubTab = 'periodos' | 'portafolio';

const moduleTab = ref<ModuleTab>('iniciativas');
const iniciativaSubTab = ref<IniciativaSubTab>('periodos');
const { canSeeConfigMantenedorIniciativas, canSeeConfigMantenedorProyectos } = usePortalAccess();

const tabsProyectos: { id: ConfigCatalogCategory; label: string }[] = [
  { id: 'ESTADO_PROYECTO', label: 'Estados de proyecto' },
  { id: 'ROL_EQUIPO', label: 'Roles del equipo' },
  { id: 'RESPONSABLE', label: 'Responsables / IT PM' },
];

const tabsIniciativas: { id: IniciativaSubTab; label: string }[] = [
  { id: 'periodos', label: 'Periodos' },
  { id: 'portafolio', label: 'Portafolio de Aplicaciones' },
];

watch(moduleTab, () => {
  if (moduleTab.value === 'proyectos') {
    tab.value = tabsProyectos[0]?.id ?? 'ESTADO_PROYECTO';
  }
  void load();
});

watch(
  [canSeeConfigMantenedorIniciativas, canSeeConfigMantenedorProyectos],
  () => {
    if (moduleTab.value === 'iniciativas' && !canSeeConfigMantenedorIniciativas.value && canSeeConfigMantenedorProyectos.value) {
      moduleTab.value = 'proyectos';
    }
    if (moduleTab.value === 'proyectos' && !canSeeConfigMantenedorProyectos.value && canSeeConfigMantenedorIniciativas.value) {
      moduleTab.value = 'iniciativas';
    }
  },
  { immediate: true },
);

const tab = ref<ConfigCatalogCategory>('ESTADO_PROYECTO');
const rows = ref<CatalogItemDto[]>([]);
const periodRows = ref<PeriodoConfigDto[]>([]);
const namedRows = ref<NamedConfigDto[]>([]);
const loading = ref(false);
const err = ref<string | null>(null);
const newLabel = ref('');
const newCode = ref('');
const lastAutoCode = ref('');
const newPeriodo = ref('');
const newNombre = ref('');

watch(newLabel, (v) => {
  const t = v.trim();
  const next = t ? labelToSnakeCode(t) : '';
  if (!newCode.value.trim() || newCode.value === lastAutoCode.value) {
    newCode.value = next;
  }
  lastAutoCode.value = next;
});

async function load(): Promise<void> {
  loading.value = true;
  err.value = null;
  try {
    if (moduleTab.value === 'iniciativas' && iniciativaSubTab.value === 'periodos') {
      periodRows.value = await fetchPeriodosAdmin();
    } else if (moduleTab.value === 'iniciativas' && iniciativaSubTab.value === 'portafolio') {
      namedRows.value = await fetchNamedConfig('portafolio');
    } else {
      rows.value = await fetchCatalogAdmin(tab.value);
    }
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'Error al cargar catálogo';
    rows.value = [];
    namedRows.value = [];
    periodRows.value = [];
  } finally {
    loading.value = false;
  }
}

watch(tab, () => {
  void load();
});

watch(iniciativaSubTab, () => {
  void load();
});

void load();

async function toggleActivo(it: CatalogItemDto): Promise<void> {
  try {
    const u = await patchCatalogItem(it.id, { activo: !it.activo });
    const i = rows.value.findIndex((x) => x.id === it.id);
    if (i >= 0) {
      rows.value[i] = u;
    }
  } catch {
    err.value = 'No se pudo actualizar el ítem';
  }
}

async function agregar(): Promise<void> {
  const label = newLabel.value.trim();
  if (!label) {
    return;
  }
  try {
    await createCatalogItem({
      category: tab.value,
      label,
      code: newCode.value.trim() || undefined,
      cardinalidad: tab.value === 'ROL_EQUIPO' ? 'multiple' : null,
    });
    newLabel.value = '';
    newCode.value = '';
    lastAutoCode.value = '';
    await load();
  } catch {
    err.value = 'No se pudo crear el ítem';
  }
}

async function agregarPeriodo(): Promise<void> {
  const periodo = newPeriodo.value.trim().toUpperCase();
  if (!/^Q[1-4]-\d{4}$/.test(periodo)) {
    err.value = 'El periodo debe tener formato Q[1-4]-YYYY';
    return;
  }
  try {
    await createPeriodoConfig(periodo);
    newPeriodo.value = '';
    await load();
  } catch (e) {
    err.value = e instanceof Error ? e.message : `El periodo ${periodo} ya existe`;
  }
}

async function togglePeriodo(it: PeriodoConfigDto): Promise<void> {
  try {
    const u = await patchPeriodoConfig(it.id, { activo: !it.activo });
    const i = periodRows.value.findIndex((x) => x.id === it.id);
    if (i >= 0) periodRows.value[i] = u;
  } catch {
    err.value = 'No se pudo actualizar el periodo';
  }
}

async function agregarNombre(): Promise<void> {
  const nombre = newNombre.value.trim();
  if (!nombre) return;
  try {
    await createNamedConfig('portafolio', nombre);
    newNombre.value = '';
    await load();
  } catch (e) {
    err.value = e instanceof Error ? e.message : 'No se pudo crear el valor';
  }
}

async function toggleNombre(it: NamedConfigDto): Promise<void> {
  try {
    const u = await patchNamedConfig('portafolio', it.id, { activo: !it.activo });
    const i = namedRows.value.findIndex((x) => x.id === it.id);
    if (i >= 0) namedRows.value[i] = u;
  } catch {
    err.value = 'No se pudo actualizar el valor';
  }
}

async function editarNombre(it: NamedConfigDto): Promise<void> {
  const nombre = window.prompt('Nuevo nombre', it.nombre)?.trim();
  if (!nombre || nombre === it.nombre) return;
  try {
    const u = await patchNamedConfig('portafolio', it.id, { nombre });
    const i = namedRows.value.findIndex((x) => x.id === it.id);
    if (i >= 0) namedRows.value[i] = u;
  } catch {
    err.value = 'No se pudo editar el nombre';
  }
}

const puedeAgregar = computed(() => moduleTab.value === 'proyectos' && tab.value !== 'ESTADO_PROYECTO');

const cardinalidadSelectOptions: SelectOption[] = [
  { value: 'single', label: 'Único' },
  { value: 'multiple', label: 'Múltiple' },
];

async function setCardinalidad(it: CatalogItemDto, raw: unknown): Promise<void> {
  if (tab.value !== 'ROL_EQUIPO') {
    return;
  }
  const v = raw === 'single' || raw === 'multiple' ? raw : null;
  const cur = it.cardinalidad ?? null;
  if (cur === v) {
    return;
  }
  try {
    const u = await patchCatalogItem(it.id, { cardinalidad: v });
    const i = rows.value.findIndex((x) => x.id === it.id);
    if (i >= 0) {
      rows.value[i] = u;
    }
  } catch {
    err.value = 'No se pudo actualizar la cardinalidad';
  }
}
</script>

<template>
  <div class="mant">
    <h1 class="mant__h">Mantenedor de configuración</h1>
    <p class="mant__sub">
      Catálogos por módulo (Iniciativas / Proyectos). Los estados de proyecto son solo lectura; el código de nuevas
      etiquetas se propone en snake_case y puede editarse antes de guardar.
    </p>

    <div class="mant__tabs mant__tabs--major">
      <button
        v-if="canSeeConfigMantenedorIniciativas"
        type="button"
        class="mant__tab"
        :class="{ 'mant__tab--on': moduleTab === 'iniciativas' }"
        @click="moduleTab = 'iniciativas'"
      >
        Iniciativas
      </button>
      <button
        v-if="canSeeConfigMantenedorProyectos"
        type="button"
        class="mant__tab"
        :class="{ 'mant__tab--on': moduleTab === 'proyectos' }"
        @click="moduleTab = 'proyectos'"
      >
        Proyectos
      </button>
    </div>

    <div v-if="moduleTab === 'proyectos'" class="mant__tabs">
      <button
        v-for="t in tabsProyectos"
        :key="t.id"
        type="button"
        class="mant__tab"
        :class="{ 'mant__tab--on': tab === t.id }"
        @click="tab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <div v-if="moduleTab === 'iniciativas'" class="mant__tabs">
      <button
        v-for="t in tabsIniciativas"
        :key="t.id"
        type="button"
        class="mant__tab"
        :class="{ 'mant__tab--on': iniciativaSubTab === t.id }"
        @click="iniciativaSubTab = t.id"
      >
        {{ t.label }}
      </button>
    </div>

    <p v-if="err" class="mant__err" role="alert">{{ err }}</p>
    <p v-if="loading" class="mant__hint">Cargando…</p>

    <div v-if="moduleTab === 'iniciativas' && iniciativaSubTab === 'periodos'" class="mant__add">
      <div class="mant__field">
        <label class="mant__label">Nuevo periodo</label>
        <IsInputText v-model="newPeriodo" placeholder="Q2-2026" fluid />
      </div>
      <IsButton severity="primary" label="Agregar" :disabled="!newPeriodo.trim()" @click="agregarPeriodo" />
    </div>

    <div v-if="moduleTab === 'iniciativas' && iniciativaSubTab === 'portafolio'" class="mant__add">
      <div class="mant__field">
        <label class="mant__label">Nuevo valor</label>
        <IsInputText v-model="newNombre" placeholder="Nombre visible en el desplegable" fluid />
      </div>
      <IsButton severity="primary" label="Agregar" :disabled="!newNombre.trim()" @click="agregarNombre" />
    </div>

    <div v-if="puedeAgregar" class="mant__add">
      <div class="mant__field">
        <label class="mant__label">Nueva etiqueta</label>
        <IsInputText v-model="newLabel" placeholder="Texto visible en el desplegable" fluid />
      </div>
      <div class="mant__field">
        <label class="mant__label">Código (snake_case)</label>
        <IsInputText v-model="newCode" placeholder="se_genera_automaticamente" fluid />
      </div>
      <IsButton severity="primary" label="Agregar" :disabled="!newLabel.trim()" @click="agregar" />
    </div>

    <table v-if="!loading && moduleTab === 'iniciativas' && iniciativaSubTab === 'periodos'" class="mant__table">
      <thead>
        <tr>
          <th>Periodo</th>
          <th>Activo</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="it in periodRows" :key="it.id">
          <td>{{ it.periodo }}</td>
          <td>
            <IsButton
              size="small"
              severity="primary"
              outlined
              :label="it.activo ? 'Desactivar' : 'Activar'"
              @click="togglePeriodo(it)"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <table v-if="!loading && moduleTab === 'iniciativas' && iniciativaSubTab === 'portafolio'" class="mant__table">
      <thead>
        <tr>
          <th>Nombre</th>
          <th>Activo</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="it in namedRows" :key="it.id">
          <td>{{ it.nombre }}</td>
          <td>{{ it.activo ? 'Sí' : 'No' }}</td>
          <td class="mant__actions">
            <IsButton size="small" severity="primary" outlined label="Editar" @click="editarNombre(it)" />
            <IsButton
              size="small"
              severity="primary"
              outlined
              :label="it.activo ? 'Desactivar' : 'Activar'"
              @click="toggleNombre(it)"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <table v-if="!loading && moduleTab === 'proyectos'" class="mant__table">
      <thead>
        <tr>
          <th>Etiqueta</th>
          <th>Código</th>
          <th v-if="tab === 'ROL_EQUIPO'">Cardinalidad</th>
          <th>Activo</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="it in rows" :key="it.id">
          <td>{{ it.label }}</td>
          <td>
            <code>{{ it.code }}</code>
          </td>
          <td v-if="tab === 'ROL_EQUIPO'" class="mant__card-cell">
            <IsSelect
              :model-value="
                it.cardinalidad === 'single' || it.cardinalidad === 'multiple' ? it.cardinalidad : 'multiple'
              "
              :options="cardinalidadSelectOptions"
              option-label="label"
              option-value="value"
              placeholder="Cardinalidad"
              fluid
              @update:model-value="setCardinalidad(it, $event)"
            />
          </td>
          <td>
            <IsButton
              size="small"
              severity="primary"
              outlined
              :label="it.activo ? 'Desactivar' : 'Activar'"
              @click="toggleActivo(it)"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.mant__h {
  margin: 0 0 0.35rem;
  font-size: 1.25rem;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.mant__sub {
  margin: 0 0 1.25rem;
  font-size: 14px;
  color: theme('colors.surface.700');
  max-width: 48rem;
  line-height: 1.5;
}
.mant__tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.mant__tabs--major {
  margin-bottom: 0.65rem;
}
.mant__tab {
  border: 1px solid theme('colors.surface.200');
  background: #fff;
  border-radius: 6px;
  padding: 0.45rem 1rem;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: theme('colors.surface.500');
}
.mant__tab--on {
  border-color: #1361b9;
  color: theme('colors.surface.800');
  box-shadow: 0 0 0 1px rgba(0, 107, 240, 0.2);
}
.mant__err {
  color: #c41e24;
  font-size: 13px;
  margin: 0 0 1rem;
}
.mant__hint {
  font-size: 13px;
  color: theme('colors.surface.700');
}
.mant__add {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  align-items: flex-end;
  margin-bottom: 1.25rem;
  max-width: 48rem;
}
.mant__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1 1 14rem;
}
.mant__label {
  font-size: 13px;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.mant__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.mant__table th,
.mant__table td {
  border: 1px solid theme('colors.surface.200');
  padding: 0.5rem 0.75rem;
  text-align: left;
}
.mant__table th {
  background: theme('colors.surface.50');
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.mant__card-cell {
  min-width: 11rem;
  vertical-align: middle;
}
.mant__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

@media (max-width: 768px) {
  .mant__add {
    align-items: stretch;
    flex-direction: column;
  }

  .mant__field {
    width: 100%;
    min-width: 0;
  }

  .mant__tabs {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
  }

  .mant__tab {
    width: 100%;
  }
}
</style>
