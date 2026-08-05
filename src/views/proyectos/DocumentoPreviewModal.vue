<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IsButton, IsDialog } from 'is-uikit-components-vue';
import type { ProyectoDocumentoApi } from '@/lib/proyectos-api';

const props = defineProps<{
  visible: boolean;
  documento: ProyectoDocumentoApi | null;
  url: string;
}>();

const emit = defineEmits<{
  'update:visible': [boolean];
}>();

const loading = ref(false);
const error = ref('');
const textContent = ref('');
const htmlContent = ref('');
const objectUrl = ref('');

const open = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
});

const ext = computed(() => {
  const name = props.documento?.nombreArchivo ?? '';
  return name.includes('.') ? name.split('.').pop()?.toLowerCase() ?? '' : '';
});

const previewKind = computed<'pdf' | 'text' | 'image' | 'docx' | 'xlsx' | 'unsupported'>(() => {
  if (ext.value === 'pdf') return 'pdf';
  if (ext.value === 'txt') return 'text';
  if (['png', 'jpg', 'jpeg'].includes(ext.value)) return 'image';
  if (ext.value === 'docx') return 'docx';
  if (ext.value === 'xlsx') return 'xlsx';
  return 'unsupported';
});

function clearObjectUrl(): void {
  if (objectUrl.value) {
    URL.revokeObjectURL(objectUrl.value);
    objectUrl.value = '';
  }
}

async function loadPreview(): Promise<void> {
  clearObjectUrl();
  textContent.value = '';
  htmlContent.value = '';
  error.value = '';
  if (!props.visible || !props.documento || !props.url) {
    return;
  }
  if (previewKind.value === 'unsupported' || previewKind.value === 'pdf') {
    return;
  }
  loading.value = true;
  try {
    const res = await fetch(props.url);
    if (!res.ok) {
      throw new Error('No se pudo cargar el archivo.');
    }
    if (previewKind.value === 'text') {
      textContent.value = await res.text();
      return;
    }
    const blob = await res.blob();
    if (previewKind.value === 'image') {
      objectUrl.value = URL.createObjectURL(blob);
      return;
    }
    const buffer = await blob.arrayBuffer();
    if (previewKind.value === 'docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
      htmlContent.value = result.value;
      return;
    }
    if (previewKind.value === 'xlsx') {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buffer, { type: 'array' });
      const first = wb.SheetNames[0];
      htmlContent.value = first ? XLSX.utils.sheet_to_html(wb.Sheets[first]) : '<p>Libro vacío.</p>';
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'No se pudo cargar la vista previa.';
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.visible, props.url, props.documento?.id],
  () => void loadPreview(),
  { immediate: true },
);

function openDownload(): void {
  if (props.url) {
    window.open(props.url, '_blank', 'noopener,noreferrer');
  }
}
</script>

<template>
  <IsDialog v-model:visible="open" modal class="doc-prev" :style="{ width: '80vw', maxWidth: '1180px' }">
    <template #header>
      <div class="doc-prev__head">
        <strong>{{ documento?.nombreArchivo ?? 'Documento' }}</strong>
        <IsButton v-if="url" severity="primary" outlined size="small" label="Descargar" @click="openDownload" />
      </div>
    </template>

    <div class="doc-prev__body">
      <p v-if="loading" class="doc-prev__empty">Cargando vista previa...</p>
      <p v-else-if="error" class="doc-prev__empty">{{ error }}</p>
      <iframe v-else-if="previewKind === 'pdf'" class="doc-prev__frame" :src="url" title="Vista previa PDF" />
      <pre v-else-if="previewKind === 'text'" class="doc-prev__pre">{{ textContent }}</pre>
      <img v-else-if="previewKind === 'image'" class="doc-prev__img" :src="objectUrl" alt="" />
      <div v-else-if="previewKind === 'docx' || previewKind === 'xlsx'" class="doc-prev__html" v-html="htmlContent" />
      <div v-else class="doc-prev__empty">
        <p>Vista previa no disponible para este formato. Descarga el archivo para verlo.</p>
        <IsButton v-if="url" severity="primary" label="Descargar" @click="openDownload" />
      </div>
    </div>
  </IsDialog>
</template>

<style scoped>
.doc-prev__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
}
.doc-prev__body {
  min-height: 70vh;
  max-height: 78vh;
  overflow: auto;
}
.doc-prev__frame {
  width: 100%;
  min-height: 72vh;
  border: 0;
}
.doc-prev__pre {
  margin: 0;
  white-space: pre-wrap;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.875rem;
}
.doc-prev__img {
  display: block;
  max-width: 100%;
  max-height: 72vh;
  margin: 0 auto;
}
.doc-prev__html {
  color: theme('colors.surface.800');
  line-height: 1.5;
}
.doc-prev__html :deep(table) {
  border-collapse: collapse;
  width: 100%;
}
.doc-prev__html :deep(td),
.doc-prev__html :deep(th) {
  border: 1px solid #d1d5db;
  padding: 0.35rem 0.45rem;
}
.doc-prev__empty {
  color: theme('colors.surface.600');
  font-size: 0.95rem;
}
</style>
