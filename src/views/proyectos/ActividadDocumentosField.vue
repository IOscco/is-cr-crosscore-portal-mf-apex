<script setup lang="ts">
import { ref, watch } from 'vue';
import { IsButton, useToast } from 'is-uikit-components-vue';
import type { ProyectoDocumentoApi } from '@/lib/proyectos-api';
import {
  deleteActividadDocumento,
  fetchActividadDocumentoDescargaUrl,
  fetchActividadDocumentos,
  uploadActividadDocumento,
} from '@/lib/proyectos-api';
import DocumentoPreviewModal from './DocumentoPreviewModal.vue';

const props = defineProps<{
  actividadId?: string | null;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  changed: [];
}>();

const toast = useToast();
const fileInput = ref<HTMLInputElement | null>(null);
const pendingFiles = ref<File[]>([]);
const docs = ref<ProyectoDocumentoApi[]>([]);
const loading = ref(false);
const previewOpen = ref(false);
const previewDoc = ref<ProyectoDocumentoApi | null>(null);
const previewUrl = ref('');

function iconFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'pi pi-file-pdf';
  if (['png', 'jpg', 'jpeg'].includes(ext)) return 'pi pi-image';
  if (['xlsx', 'xls'].includes(ext)) return 'pi pi-table';
  if (['doc', 'docx'].includes(ext)) return 'pi pi-file-word';
  if (['ppt', 'pptx'].includes(ext)) return 'pi pi-file';
  return 'pi pi-paperclip';
}

async function load(): Promise<void> {
  if (!props.actividadId) {
    docs.value = [];
    return;
  }
  loading.value = true;
  try {
    const r = await fetchActividadDocumentos(props.actividadId);
    docs.value = r.data ?? [];
  } catch {
    docs.value = [];
  } finally {
    loading.value = false;
  }
}

watch(() => props.actividadId, () => void load(), { immediate: true });

function pickFiles(): void {
  fileInput.value?.click();
}

function onFiles(ev: Event): void {
  const input = ev.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = '';
  pendingFiles.value = [...pendingFiles.value, ...files];
  if (files.length) {
    emit('changed');
  }
}

function removePending(idx: number): void {
  pendingFiles.value = pendingFiles.value.filter((_, i) => i !== idx);
  emit('changed');
}

async function removeSaved(doc: ProyectoDocumentoApi): Promise<void> {
  if (!props.actividadId) return;
  await deleteActividadDocumento(props.actividadId, doc.id);
  docs.value = docs.value.filter((d) => d.id !== doc.id);
  emit('changed');
}

async function uploadPending(actividadId: string): Promise<void> {
  if (!pendingFiles.value.length) return;
  for (const file of pendingFiles.value) {
    await uploadActividadDocumento(actividadId, file);
  }
  pendingFiles.value = [];
  await load();
  emit('changed');
}

async function openPreview(doc: ProyectoDocumentoApi): Promise<void> {
  if (!props.actividadId) return;
  try {
    previewUrl.value = await fetchActividadDocumentoDescargaUrl(props.actividadId, doc.id);
    previewDoc.value = doc;
    previewOpen.value = true;
  } catch (err) {
    toast.add({ severity: 'error', summary: 'Error', detail: err instanceof Error ? err.message : 'No se pudo abrir.', life: 4000 });
  }
}

async function downloadDoc(doc: ProyectoDocumentoApi): Promise<void> {
  if (!props.actividadId) return;
  const url = await fetchActividadDocumentoDescargaUrl(props.actividadId, doc.id);
  window.open(url, '_blank', 'noopener,noreferrer');
}

function getPendingFiles(): File[] {
  return [...pendingFiles.value];
}

defineExpose({ uploadPending, getPendingFiles });
</script>

<template>
  <section class="adocs">
    <div class="adocs__head">
      <h4>Documentos adjuntos</h4>
      <IsButton
        severity="primary"
        outlined
        size="small"
        label="+ Adjuntar archivo"
        :disabled="disabled"
        @click="pickFiles"
      />
      <input
        ref="fileInput"
        type="file"
        multiple
        class="adocs__file"
        accept=".pdf,.docx,.xlsx,.pptx,.txt,.png,.jpg,.jpeg"
        @change="onFiles"
      />
    </div>
    <p v-if="loading" class="adocs__empty">Cargando documentos...</p>
    <ul v-if="docs.length || pendingFiles.length" class="adocs__list">
      <li v-for="doc in docs" :key="doc.id" class="adocs__item">
        <i :class="iconFor(doc.nombreArchivo)" aria-hidden="true" />
        <span class="adocs__name">{{ doc.nombreArchivo }}</span>
        <IsButton text size="small" icon="pi pi-eye" label="Vista previa" @click="openPreview(doc)" />
        <IsButton text size="small" icon="pi pi-download" label="Descargar" @click="downloadDoc(doc)" />
        <IsButton
          severity="danger"
          text
          rounded
          size="small"
          icon="pi pi-times"
          :disabled="disabled"
          aria-label="Eliminar"
          @click="removeSaved(doc)"
        />
      </li>
      <li v-for="(file, idx) in pendingFiles" :key="`${file.name}-${idx}`" class="adocs__item adocs__item--pending">
        <i :class="iconFor(file.name)" aria-hidden="true" />
        <span class="adocs__name">{{ file.name }}</span>
        <span class="adocs__pending">Pendiente de guardar</span>
        <IsButton
          severity="danger"
          text
          rounded
          size="small"
          icon="pi pi-times"
          :disabled="disabled"
          aria-label="Eliminar"
          @click="removePending(idx)"
        />
      </li>
    </ul>
    <p v-else class="adocs__empty">Sin documentos adjuntos.</p>
    <DocumentoPreviewModal v-model:visible="previewOpen" :documento="previewDoc" :url="previewUrl" />
  </section>
</template>

<style scoped>
.adocs {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--apex-border-table);
}
.adocs__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}
.adocs__head h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 800;
  color: theme('colors.surface.800');
}
.adocs__file {
  display: none;
}
.adocs__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.adocs__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--apex-border-table);
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
}
.adocs__item--pending {
  background: #fafcfe;
}
.adocs__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.adocs__pending,
.adocs__empty {
  color: theme('colors.surface.500');
  font-size: 12px;
}
</style>
