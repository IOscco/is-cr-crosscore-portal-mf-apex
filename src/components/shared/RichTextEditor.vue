<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch } from 'vue';
import { Editor, type EditorOptions } from '@tiptap/core';
import { EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Heading from '@tiptap/extension-heading';
import { BulletList, ListItem, ListKeymap, OrderedList } from '@tiptap/extension-list';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { plainTextFromHtml } from '@/lib/rich-text-utils';

const props = withDefaults(
  defineProps<{
    modelValue: string;
    placeholder?: string;
    readonly?: boolean;
    disabled?: boolean;
    maxLength?: number;
    /** Texto accesible del control (si no hay <label> externo con `for`). */
    ariaLabel?: string;
  }>(),
  {
    placeholder: '',
    readonly: false,
    disabled: false,
    ariaLabel: '',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const inputId = useId();
const editor = shallowRef<Editor | null>(null);
const lastEmittedHtml = ref('');
/** Fuerza reactividad de la toolbar (estados activos al mover el cursor). */
const uiTick = ref(0);

const linkPopoverOpen = ref(false);
const linkUrlInput = ref('');
/** Al abrir el popover, había un enlace en la selección (muestra «Desvincular»). */
const linkPopoverOnLink = ref(false);
const linkUrlFieldRef = ref<HTMLInputElement | null>(null);
const linkPopoverRef = ref<HTMLElement | null>(null);
const linkToolbarWrapRef = ref<HTMLElement | null>(null);
/** Rango de selección al abrir el popover de enlace (para reaplicar al confirmar). */
const savedLinkSelFrom = ref(-1);
const savedLinkSelTo = ref(-1);
let linkPopoverDismissBound = false;

const LINK_POPOVER_HIGHLIGHT_COLOR = '#BBCFEE';

function normalizeLinkHref(raw: string): string {
  const s = raw.trim();
  if (!s) {
    return s;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
    return s;
  }
  return `https://${s}`;
}

function unbindLinkPopoverDismiss(): void {
  if (!linkPopoverDismissBound) {
    return;
  }
  document.removeEventListener('mousedown', onDocumentPointerDownForLinkPopover, true);
  document.removeEventListener('keydown', onDocumentKeydownForLinkPopover, true);
  linkPopoverDismissBound = false;
}

function onDocumentPointerDownForLinkPopover(e: MouseEvent): void {
  if (!linkPopoverOpen.value) {
    return;
  }
  const t = e.target as Node | null;
  if (!t) {
    return;
  }
  if (linkPopoverRef.value?.contains(t) || linkToolbarWrapRef.value?.contains(t)) {
    return;
  }
  closeLinkPopover();
}

function onDocumentKeydownForLinkPopover(e: KeyboardEvent): void {
  if (!linkPopoverOpen.value) {
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    closeLinkPopover();
  }
}

function bindLinkPopoverDismiss(): void {
  if (linkPopoverDismissBound) {
    return;
  }
  document.addEventListener('mousedown', onDocumentPointerDownForLinkPopover, true);
  document.addEventListener('keydown', onDocumentKeydownForLinkPopover, true);
  linkPopoverDismissBound = true;
}

function removeLinkPopoverTempHighlight(): void {
  const ed = editor.value;
  const from = savedLinkSelFrom.value;
  const to = savedLinkSelTo.value;
  if (!ed || from < 0 || to < 0 || from >= to) {
    return;
  }
  ed.chain().setTextSelection({ from, to }).unsetHighlight().run();
}

function closeLinkPopover(skipHighlightRemoval = false): void {
  if (!skipHighlightRemoval) {
    removeLinkPopoverTempHighlight();
  }
  linkPopoverOpen.value = false;
  linkPopoverOnLink.value = false;
  linkUrlInput.value = '';
  savedLinkSelFrom.value = -1;
  savedLinkSelTo.value = -1;
  unbindLinkPopoverDismiss();
}

async function openLinkPopover(): Promise<void> {
  const ed = editor.value;
  if (!ed || props.disabled || props.readonly) {
    return;
  }
  const { from, to } = ed.state.selection;
  savedLinkSelFrom.value = from;
  savedLinkSelTo.value = to;
  linkPopoverOnLink.value = ed.isActive('link');
  const href = ed.getAttributes('link').href;
  linkUrlInput.value = typeof href === 'string' ? href : '';
  if (from < to) {
    ed.chain().setTextSelection({ from, to }).setHighlight({ color: LINK_POPOVER_HIGHLIGHT_COLOR }).run();
  }
  linkPopoverOpen.value = true;
  await nextTick();
  bindLinkPopoverDismiss();
  window.setTimeout(() => {
    linkUrlFieldRef.value?.focus();
    linkUrlFieldRef.value?.select();
  }, 50);
}

function toggleLinkPopover(): void {
  if (linkPopoverOpen.value) {
    closeLinkPopover();
    return;
  }
  openLinkPopover();
}

function applyLinkFromPopover(): void {
  const ed = editor.value;
  if (!ed || props.disabled || props.readonly) {
    closeLinkPopover();
    return;
  }
  const t = linkUrlInput.value.trim();
  if (!t) {
    closeLinkPopover();
    return;
  }
  const from = savedLinkSelFrom.value;
  const to = savedLinkSelTo.value;
  if (from < 0 || to < 0) {
    closeLinkPopover();
    return;
  }
  const href = normalizeLinkHref(t);
  const rel = 'noopener noreferrer';

  if (from === to) {
    if (linkPopoverOnLink.value) {
      ed.chain()
        .focus()
        .setTextSelection({ from, to })
        .extendMarkRange('link')
        .unsetHighlight()
        .setLink({ href, target: '_blank' })
        .run();
    } else {
      ed.chain()
        .focus()
        .setTextSelection({ from, to })
        .unsetHighlight()
        .insertContent({
          type: 'text',
          text: href,
          marks: [
            {
              type: 'link',
              attrs: {
                href,
                target: '_blank',
                rel,
              },
            },
          ],
        })
        .run();
    }
  } else {
    ed.chain().focus().setTextSelection({ from, to }).unsetHighlight().setLink({ href, target: '_blank' }).run();
  }
  closeLinkPopover(true);
}

function unlinkFromPopover(): void {
  const ed = editor.value;
  if (!ed || props.disabled || props.readonly) {
    closeLinkPopover();
    return;
  }
  const from = savedLinkSelFrom.value;
  const to = savedLinkSelTo.value;
  if (from < 0 || to < 0) {
    closeLinkPopover();
    return;
  }
  ed.chain().focus().setTextSelection({ from, to }).unsetHighlight().extendMarkRange('link').unsetLink().run();
  closeLinkPopover(true);
}

function normalizeHtml(html: string | undefined): string {
  const h = String(html ?? '').trim();
  return h || '<p></p>';
}

const linkPopoverHasTextRange = computed(
  () => savedLinkSelFrom.value >= 0 && savedLinkSelFrom.value < savedLinkSelTo.value,
);
const linkPopoverIsCollapsed = computed(
  () => savedLinkSelFrom.value >= 0 && savedLinkSelFrom.value === savedLinkSelTo.value,
);

function buildExtensions(): EditorOptions['extensions'] {
  return [
    StarterKit.configure({
      /** Evita duplicar nodos/marks ya registrados fuera del kit (v3 incluye Link y Underline). */
      heading: false,
      link: false,
      underline: false,
      /** Listas explícitas (misma versión que StarterKit) para evitar duplicados y asegurar el esquema. */
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
    }),
    Heading.configure({ levels: [1, 2, 3] }),
    BulletList,
    ListItem,
    ListKeymap,
    OrderedList,
    Underline,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({
      types: ['heading', 'paragraph'],
    }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: {
        class: 'rte-link',
        rel: 'noopener noreferrer',
        target: '_blank',
      },
    }),
    Placeholder.configure({
      placeholder: props.placeholder || 'Escriba aquí…',
    }),
  ];
}

function createEditor(): void {
  if (props.readonly || editor.value) {
    return;
  }
  const initial = normalizeHtml(props.modelValue);
  lastEmittedHtml.value = initial;
  editor.value = new Editor({
    extensions: buildExtensions(),
    content: initial,
    editable: !props.disabled,
    editorProps: {
      attributes: {
        id: inputId,
        class: 'rte__prosemirror rich-text-editor-content',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': props.ariaLabel || props.placeholder || 'Editor de texto enriquecido',
        spellcheck: 'true',
      },
    },
    onSelectionUpdate: () => {
      uiTick.value += 1;
    },
    onTransaction: () => {
      uiTick.value += 1;
    },
    onUpdate: ({ editor: ed }) => {
      let html = ed.getHTML();
      if (props.maxLength != null && props.maxLength > 0) {
        const plain = plainTextFromHtml(html);
        if (plain.length > props.maxLength) {
          ed.commands.setContent(lastEmittedHtml.value, { emitUpdate: false });
          return;
        }
      }
      lastEmittedHtml.value = html;
      emit('update:modelValue', html);
      uiTick.value += 1;
    },
  });
}

function destroyEditor(): void {
  closeLinkPopover();
  editor.value?.destroy();
  editor.value = null;
}

function syncFromModel(external: string): void {
  const ed = editor.value;
  if (!ed || props.readonly) {
    return;
  }
  const next = normalizeHtml(external);
  if (next === ed.getHTML()) {
    return;
  }
  ed.commands.setContent(next, { emitUpdate: false });
  lastEmittedHtml.value = next;
}

watch(
  () => props.modelValue,
  (v) => {
    syncFromModel(v);
  },
);

watch(
  () => props.readonly,
  async (ro) => {
    if (ro) {
      destroyEditor();
    } else {
      await nextTick();
      createEditor();
      syncFromModel(props.modelValue);
    }
  },
);

watch(
  () => props.disabled,
  (d) => {
    if (d) {
      closeLinkPopover();
    }
    editor.value?.setEditable(!d);
  },
);

onMounted(() => {
  if (!props.readonly) {
    createEditor();
  }
});

onBeforeUnmount(() => {
  destroyEditor();
});

function run(cmd: () => boolean): void {
  if (!editor.value || props.disabled || props.readonly) {
    return;
  }
  cmd();
}

/** Evita que la toolbar robe el foco y anule la selección de ProseMirror antes del click. */
function preventToolbarFocusSteal(e: MouseEvent): void {
  const el = e.target as HTMLElement | null;
  if (el?.closest('button')) {
    e.preventDefault();
  }
}

function toggleBold(): void {
  run(() => editor.value!.chain().focus().toggleBold().run());
}
function toggleItalic(): void {
  run(() => editor.value!.chain().focus().toggleItalic().run());
}
function toggleUnderline(): void {
  run(() => editor.value!.chain().focus().toggleUnderline().run());
}
function toggleBulletList(): void {
  run(() => editor.value!.chain().focus().toggleBulletList().run());
}
function toggleOrderedList(): void {
  run(() => editor.value!.chain().focus().toggleOrderedList().run());
}
function setHeading(level: 1 | 2 | 3): void {
  run(() => editor.value!.chain().focus().toggleHeading({ level }).run());
}
function setParagraph(): void {
  run(() => editor.value!.chain().focus().setParagraph().run());
}
function setAlign(a: 'left' | 'center' | 'right'): void {
  run(() => editor.value!.chain().focus().setTextAlign(a).run());
}
function clearFormatting(): void {
  const ed = editor.value;
  if (!ed || props.disabled || props.readonly) {
    return;
  }
  ed.chain().focus().unsetAllMarks().clearNodes().run();
}

const isActive = (name: string, attrs?: Record<string, unknown>): boolean => {
  void uiTick.value;
  const ed = editor.value;
  if (!ed) {
    return false;
  }
  if (attrs) {
    return ed.isActive(name as never, attrs as never);
  }
  return ed.isActive(name as never);
};

const isTextAlign = (align: 'left' | 'center' | 'right'): boolean => {
  void uiTick.value;
  const ed = editor.value;
  if (!ed) {
    return false;
  }
  return ed.isActive({ textAlign: align });
};

const isParagraphActive = computed(() => {
  void uiTick.value;
  const ed = editor.value;
  if (!ed) {
    return false;
  }
  return ed.isActive('paragraph') && !ed.isActive('heading');
});

const readonlyHtml = computed(() => String(props.modelValue ?? ''));
</script>

<template>
  <div
    class="rte"
    :class="{
      'rte--readonly': readonly,
      'rte--disabled': disabled && !readonly,
    }"
  >
    <template v-if="readonly">
      <div
        class="rte__readonly rte-rich-body"
        tabindex="0"
        role="region"
        :aria-label="ariaLabel || placeholder || 'Contenido de texto enriquecido'"
        v-html="readonlyHtml"
      />
    </template>
    <template v-else>
      <div
        v-if="editor"
        class="rte__toolbar"
        role="toolbar"
        aria-label="Formato de texto"
        @mousedown.capture="preventToolbarFocusSteal"
      >
        <button
          type="button"
          class="rte__btn"
          title="Negrita"
          :disabled="disabled"
          :class="{ 'rte__btn--on': isActive('bold') }"
          @click.prevent="toggleBold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          class="rte__btn"
          title="Cursiva"
          :disabled="disabled"
          :class="{ 'rte__btn--on': isActive('italic') }"
          @click.prevent="toggleItalic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          class="rte__btn"
          title="Subrayado"
          :disabled="disabled"
          :class="{ 'rte__btn--on': isActive('underline') }"
          @click.prevent="toggleUnderline"
        >
          <span class="rte__u">U</span>
        </button>
        <span class="rte__sep" aria-hidden="true" />
        <button
          type="button"
          class="rte__btn"
          title="Lista con viñetas"
          :disabled="disabled"
          :class="{ 'rte__btn--on': isActive('bulletList') }"
          @click.prevent="toggleBulletList"
        >
          <i class="pi pi-list" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="rte__btn"
          title="Lista numerada"
          :disabled="disabled"
          :class="{ 'rte__btn--on': isActive('orderedList') }"
          @click.prevent="toggleOrderedList"
        >
          <span class="rte__icon-num" aria-hidden="true">1.</span>
        </button>
        <span class="rte__sep" aria-hidden="true" />
        <button
          type="button"
          class="rte__btn rte__btn--sm"
          title="Título 1"
          :disabled="disabled"
          :class="{ 'rte__btn--on': isActive('heading', { level: 1 }) }"
          @click.prevent="setHeading(1)"
        >
          H1
        </button>
        <button
          type="button"
          class="rte__btn rte__btn--sm"
          title="Título 2"
          :disabled="disabled"
          :class="{ 'rte__btn--on': isActive('heading', { level: 2 }) }"
          @click.prevent="setHeading(2)"
        >
          H2
        </button>
        <button
          type="button"
          class="rte__btn rte__btn--sm"
          title="Título 3"
          :disabled="disabled"
          :class="{ 'rte__btn--on': isActive('heading', { level: 3 }) }"
          @click.prevent="setHeading(3)"
        >
          H3
        </button>
        <button
          type="button"
          class="rte__btn rte__btn--sm"
          title="Párrafo"
          :disabled="disabled"
          :class="{ 'rte__btn--on': isParagraphActive }"
          @click.prevent="setParagraph"
        >
          P
        </button>
        <span class="rte__sep" aria-hidden="true" />
        <button
          type="button"
          class="rte__btn"
          title="Alinear izquierda"
          :disabled="disabled"
          :class="{ 'rte__btn--on': isTextAlign('left') }"
          @click.prevent="setAlign('left')"
        >
          <i class="pi pi-align-left" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="rte__btn"
          title="Centrar"
          :disabled="disabled"
          :class="{ 'rte__btn--on': isTextAlign('center') }"
          @click.prevent="setAlign('center')"
        >
          <i class="pi pi-align-center" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="rte__btn"
          title="Alinear derecha"
          :disabled="disabled"
          :class="{ 'rte__btn--on': isTextAlign('right') }"
          @click.prevent="setAlign('right')"
        >
          <i class="pi pi-align-right" aria-hidden="true" />
        </button>
        <span class="rte__sep" aria-hidden="true" />
        <div ref="linkToolbarWrapRef" class="rte__link-wrap">
          <button
            type="button"
            class="rte__btn"
            title="Enlace"
            :disabled="disabled"
            :class="{ 'rte__btn--on': isActive('link') }"
            @click.prevent="toggleLinkPopover"
          >
            <i class="pi pi-link" aria-hidden="true" />
          </button>
          <div
            v-if="linkPopoverOpen"
            ref="linkPopoverRef"
            class="rte__link-popover"
            role="dialog"
            aria-label="Insertar o editar enlace"
            @mousedown.stop
          >
            <input
              ref="linkUrlFieldRef"
              v-model="linkUrlInput"
              type="url"
              class="rte__link-popover-input"
              placeholder="Pegar enlace..."
              autocomplete="url"
              autofocus
              @keydown.enter.prevent="applyLinkFromPopover"
            />
            <p v-if="linkPopoverHasTextRange" class="rte__link-popover-hint">
              El enlace se aplicará al texto seleccionado.
            </p>
            <p v-else-if="linkPopoverIsCollapsed && linkPopoverOnLink" class="rte__link-popover-hint">
              Actualizará la URL del enlace en la posición del cursor.
            </p>
            <p v-else-if="linkPopoverIsCollapsed" class="rte__link-popover-hint">
              Sin texto seleccionado: se insertará la URL como enlace en la posición del cursor.
            </p>
            <div class="rte__link-popover-actions">
              <button
                v-if="linkPopoverOnLink"
                type="button"
                class="rte__link-popover-btn rte__link-popover-btn--unlink"
                @click.prevent="unlinkFromPopover"
              >
                Desvincular
              </button>
              <button
                type="button"
                class="rte__link-popover-btn"
                title="Cancelar"
                aria-label="Cancelar"
                @click.prevent="closeLinkPopover()"
              >
                <i class="pi pi-times" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="rte__link-popover-btn rte__link-popover-btn--apply"
                title="Aplicar"
                aria-label="Aplicar"
                @click.prevent="applyLinkFromPopover"
              >
                <i class="pi pi-check" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
        <button type="button" class="rte__btn" title="Limpiar formato" :disabled="disabled" @click.prevent="clearFormatting">
          <i class="pi pi-filter-slash" aria-hidden="true" />
        </button>
      </div>
      <div class="rte__editor-wrap">
        <editor-content v-if="editor" :editor="(editor as never)" class="rte__editor" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.rte {
  width: 100%;
  border: 1px solid #cfdfea;
  border-radius: 8px;
  background: #ffffff;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}
.rte:not(.rte--readonly):focus-within {
  border-color: #1361b9;
  box-shadow: 0 0 0 1px rgba(19, 97, 185, 0.25);
}
.rte--disabled {
  opacity: 0.72;
  pointer-events: none;
}
.rte__toolbar {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.2rem;
  padding: 0.35rem 0.45rem;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  border-radius: 8px 8px 0 0;
}
.rte__link-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}
.rte__link-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  width: 280px;
  padding: 0.55rem 0.6rem;
  box-sizing: border-box;
  background: #ffffff;
  border-radius: 6px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(148, 163, 184, 0.35);
}
.rte__link-popover-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  padding: 0.45rem 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.875rem;
  color: #1e293b;
  outline: none;
}
.rte__link-popover-input:focus {
  border-color: #1361b9;
  box-shadow: 0 0 0 1px rgba(19, 97, 185, 0.2);
}
.rte__link-popover-hint {
  margin: 0.35rem 0 0;
  font-size: 0.75rem;
  line-height: 1.35;
  color: #64748b;
}
.rte__link-popover-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.5rem;
}
.rte__link-popover-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.45rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #475569;
  font-size: 0.8125rem;
  cursor: pointer;
}
.rte__link-popover-btn:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}
.rte__link-popover-btn--unlink {
  margin-right: auto;
  min-width: unset;
  border-color: transparent;
  background: transparent;
  color: #1361b9;
  text-decoration: underline;
  text-underline-offset: 2px;
  padding-left: 0;
  padding-right: 0.35rem;
}
.rte__link-popover-btn--unlink:hover {
  background: transparent;
  border-color: transparent;
  color: #0d529c;
}
.rte__link-popover-btn--apply {
  background: #1361b9;
  border-color: #1361b9;
  color: #ffffff;
}
.rte__link-popover-btn--apply:hover {
  background: #0d529c;
  border-color: #0d529c;
  color: #ffffff;
}
.rte__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2rem;
  height: 2rem;
  padding: 0 0.35rem;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #334155;
  font-size: 0.8125rem;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease,
    border-color 0.12s ease;
}
.rte__btn:hover:not(:disabled) {
  background: #e2e8f0;
  color: #1361b9;
}
.rte__btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.rte__btn--on {
  background: #1361b9;
  border-color: #1361b9;
  color: #ffffff;
}
.rte__btn--on:hover:not(:disabled) {
  background: #0d529c;
  border-color: #0d529c;
  color: #ffffff;
}
.rte__btn--on :where(i, .pi) {
  color: #ffffff;
}
.rte__btn--sm {
  min-width: 1.75rem;
  font-size: 0.75rem;
  font-weight: 700;
}
.rte__u {
  text-decoration: underline;
}
.rte__icon-num {
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
}
.rte__sep {
  width: 1px;
  height: 1.25rem;
  margin: 0 0.15rem;
  background: #cbd5e1;
  flex-shrink: 0;
}
.rte__editor-wrap {
  min-height: 120px;
}
.rte__editor :deep(.rte__prosemirror) {
  min-height: 120px;
  padding: 0.65rem 0.75rem;
  outline: none;
  font-family: 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: #1e293b;
}
.rte__editor :deep(.rte__prosemirror p.is-editor-empty:first-child::before) {
  color: #94a3b8;
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
.rte__readonly {
  min-height: 120px;
  padding: 0.65rem 0.75rem;
  font-family: 'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif;
  font-size: 0.9375rem;
  line-height: 1.5;
  color: #334155;
  border-radius: 0 0 8px 8px;
}
.rte--readonly {
  border-radius: 8px;
}
</style>

<style>
/* Contenido HTML (edición y solo lectura): listas, encabezados, enlaces */
.rte-rich-body :where(p) {
  margin: 0 0 0.5rem;
}
.rte-rich-body :where(p:last-child) {
  margin-bottom: 0;
}
.rte-rich-body :where(ul, ol) {
  margin: 0.35rem 0 0.5rem;
  padding-left: 1.35rem;
}
.rte-rich-body :where(h1, h2, h3) {
  margin: 0.5rem 0 0.35rem;
  font-weight: 700;
  line-height: 1.25;
  color: #0f172a;
}
.rte-rich-body :where(h1) {
  font-size: 1.35rem;
}
.rte-rich-body :where(h2) {
  font-size: 1.2rem;
}
.rte-rich-body :where(h3) {
  font-size: 1.05rem;
}
.rte-rich-body .rte-link,
.rte__editor .rte-link {
  color: #1361b9;
  text-decoration: underline;
}
.rte__editor .ProseMirror a {
  color: #1361b9;
  text-decoration: underline;
  cursor: pointer;
}
.rte__editor .ProseMirror *::selection {
  background: #bbcfee;
}
.rte__editor .ProseMirror:not(.ProseMirror-focused) ::selection {
  background: #bbcfee;
}
.rte__editor .ProseMirror [style*='text-align: center'] {
  text-align: center;
}
.rte__editor .ProseMirror [style*='text-align: right'] {
  text-align: right;
}
.rte__editor .ProseMirror [style*='text-align: left'] {
  text-align: left;
}
/* Misma jerarquía visual que en solo lectura: el editor no usa la clase rte-rich-body */
.rte__editor .rte__prosemirror :where(h1, h2, h3) {
  margin: 0.5rem 0 0.35rem;
  font-weight: 700;
  line-height: 1.25;
  color: #0f172a;
}
.rte__editor .rte__prosemirror :where(h1) {
  font-size: 1.35rem;
}
.rte__editor .rte__prosemirror :where(h2) {
  font-size: 1.2rem;
}
.rte__editor .rte__prosemirror :where(h3) {
  font-size: 1.05rem;
}
.rte__editor .rte__prosemirror :where(ul, ol) {
  margin: 0.35rem 0 0.5rem;
  padding-left: 1.35rem;
  list-style-position: outside;
}
.rte__editor .rte__prosemirror :where(ul) {
  list-style-type: disc;
}
.rte__editor .rte__prosemirror :where(ol) {
  list-style-type: decimal;
}
.rte__editor .rte__prosemirror :where(li) {
  display: list-item;
}
</style>
