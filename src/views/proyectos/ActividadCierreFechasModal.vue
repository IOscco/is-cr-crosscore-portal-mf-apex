<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { IsDialog, IsButton } from 'is-uikit-components-vue';

export type CierreFila = { clave: string; etiqueta: string };

const props = defineProps<{
  visible: boolean;
  titulo: string;
  descripcion?: string;
  filas: CierreFila[];
  defaultFechas?: Record<string, string>;
  minFechas?: Record<string, string>;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  confirmar: [fechas: Record<string, string>];
}>();

const dialogVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
});

const fechas = reactive<Record<string, string>>({});

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

watch(
  () => [props.visible, props.filas] as const,
  ([v]) => {
    if (v) {
      const t = todayIso();
      for (const k of Object.keys(fechas)) {
        delete fechas[k];
      }
      for (const f of props.filas) {
        const suggested = String(props.defaultFechas?.[f.clave] ?? '').trim();
        fechas[f.clave] = /^\d{4}-\d{2}-\d{2}$/.test(suggested) ? suggested : t;
      }
    }
  },
);

const incompleto = computed(() =>
  props.filas.some((f) => !/^\d{4}-\d{2}-\d{2}$/.test(String(fechas[f.clave] ?? '').trim())),
);

const invalidoPorMinimo = computed(() =>
  props.filas.some((f) => {
    const actual = String(fechas[f.clave] ?? '').trim();
    const min = String(props.minFechas?.[f.clave] ?? '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(actual) && /^\d{4}-\d{2}-\d{2}$/.test(min) && actual < min;
  }),
);

function minFecha(f: CierreFila): string {
  return String(props.minFechas?.[f.clave] ?? '').trim();
}

function formatIsoEs(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function onConfirmar(): void {
  if (incompleto.value || invalidoPorMinimo.value) {
    return;
  }
  const out: Record<string, string> = {};
  for (const f of props.filas) {
    out[f.clave] = String(fechas[f.clave] ?? '').trim();
  }
  emit('confirmar', out);
  dialogVisible.value = false;
}
</script>

<template>
  <IsDialog
    v-model:visible="dialogVisible"
    modal
    position="center"
    class="npd-dialog adm-dialog adm-det acf-dialog"
    :style="{ width: 'min(520px, 96vw)' }"
    :content-style="{ padding: '0' }"
    :dismissable-mask="false"
    :closable="false"
    :base-z-index="1300"
    :block-scroll="true"
  >
    <template #header>
      <div class="npd-header-row">
        <span id="acf-dialog-title" class="npd-header-title" role="heading" aria-level="2">
          {{ titulo }}
        </span>
      </div>
    </template>

    <div class="adm-shell adm-fields">
      <p v-if="descripcion" class="acf-desc">{{ descripcion }}</p>
      <p class="acf-hint">Use el calendario del campo para seleccionar la fecha (zona America/Lima).</p>
      <div class="acf-fields">
        <div v-for="f in filas" :key="f.clave" class="acf-row">
          <AppDatePicker
            :model-value="fechas[f.clave]"
            :label="f.etiqueta"
            required
            :min-date="minFecha(f) || undefined"
            @update:model-value="(v: string | null) => (fechas[f.clave] = v ?? '')"
          />
          <small
            v-if="minFecha(f) && fechas[f.clave] && fechas[f.clave] < minFecha(f)"
            class="acf-error"
          >
            La fecha no puede ser anterior a la del cierre del último hijo ({{ formatIsoEs(minFecha(f)) }}).
          </small>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="npd-footer">
        <IsButton severity="primary" outlined label="Cancelar" @click="dialogVisible = false" />
        <IsButton severity="primary" label="Confirmar cierre" :disabled="incompleto || invalidoPorMinimo" @click="onConfirmar" />
      </div>
    </template>
  </IsDialog>
</template>

<style scoped>
.adm-dialog :deep(.p-dialog-content) {
  max-height: min(62dvh, 520px);
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
.acf-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
  color: theme('colors.surface.700');
}
.acf-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: theme('colors.surface.500');
}
.acf-fields {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.acf-row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.acf-label {
  font-size: 13px;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.acf-req {
  color: #c0392b;
  margin-left: 2px;
}
.acf-error {
  font-size: 12px;
  font-weight: 600;
  color: #c0392b;
}
.npd-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
}
</style>
