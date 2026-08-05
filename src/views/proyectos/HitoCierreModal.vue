<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IsDialog, IsButton } from 'is-uikit-components-vue';
import { cerrarHitoApi } from '@/lib/actividades-api';
import { hasMeaningfulHtmlContent } from '@/lib/rich-text-utils';
import RichTextEditor from '@/components/shared/RichTextEditor.vue';

const props = defineProps<{
  visible: boolean;
  proyectoId: string;
  hitoId: string | null;
  hitoNombre: string;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
  saved: [];
}>();

const dialogVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
});

const fechaCierreReal = ref('');
const notasCierre = ref('');
const loading = ref(false);

watch(
  () => props.visible,
  (v) => {
    if (v) {
      fechaCierreReal.value = '';
      notasCierre.value = '';
    }
  },
);

const isoOk = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(fechaCierreReal.value.trim()));

async function onConfirmar(): Promise<void> {
  if (!props.hitoId || !isoOk.value) {
    return;
  }
  loading.value = true;
  try {
    await cerrarHitoApi(props.proyectoId, props.hitoId, {
      fechaCierreReal: fechaCierreReal.value.trim(),
      notasCierre: hasMeaningfulHtmlContent(notasCierre.value) ? notasCierre.value.trim() : null,
    });
    emit('saved');
    dialogVisible.value = false;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <IsDialog
    v-model:visible="dialogVisible"
    modal
    class="npd-dialog adm-dialog adm-det"
    :style="{ width: 'min(480px, 96vw)' }"
    :content-style="{ padding: '0' }"
    header="Cerrar hito"
  >
    <div class="adm-shell adm-fields">
      <p class="adm-hito-pct">Hito: {{ hitoNombre }}</p>
      <div class="adm-field">
        <AppDatePicker
          :model-value="fechaCierreReal"
          label="Fecha de cierre real"
          required
          @update:model-value="(v: string | null) => (fechaCierreReal = v ?? '')"
        />
      </div>
      <div class="adm-field">
        <label class="adm-label">Notas de cierre (opcional)</label>
        <RichTextEditor
          v-model="notasCierre"
          placeholder="Observaciones u comentarios del cierre"
          aria-label="Notas de cierre"
        />
      </div>
    </div>
    <template #footer>
      <div class="npd-footer">
        <IsButton severity="primary" outlined label="Cancelar" :disabled="loading" @click="dialogVisible = false" />
        <IsButton
          severity="primary"
          label="Confirmar cierre"
          :loading="loading"
          :disabled="!isoOk"
          @click="onConfirmar"
        />
      </div>
    </template>
  </IsDialog>
</template>

<style scoped>
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
.adm-label {
  font-size: 13px;
  font-weight: 700;
  color: theme('colors.surface.800');
}
.adm-req {
  color: #c0392b;
  margin-left: 2px;
}
.adm-hito-pct {
  margin: 0 0 0.75rem;
  font-size: 14px;
  font-weight: 600;
  color: theme('colors.surface.800');
}
.npd-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
}
</style>
