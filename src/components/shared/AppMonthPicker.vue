<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue: string | null;
    label?: string;
    placeholder?: string;
    minMonth?: string;
    maxMonth?: string;
    clearable?: boolean;
    disabled?: boolean;
  }>(),
  {
    label: '',
    placeholder: 'Selecciona un período',
    minMonth: '',
    maxMonth: '',
    clearable: true,
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
}>();

const MONTHS = [
  { short: 'ENE', long: 'Enero' },
  { short: 'FEB', long: 'Febrero' },
  { short: 'MAR', long: 'Marzo' },
  { short: 'ABR', long: 'Abril' },
  { short: 'MAY', long: 'Mayo' },
  { short: 'JUN', long: 'Junio' },
  { short: 'JUL', long: 'Julio' },
  { short: 'AGO', long: 'Agosto' },
  { short: 'SEP', long: 'Septiembre' },
  { short: 'OCT', long: 'Octubre' },
  { short: 'NOV', long: 'Noviembre' },
  { short: 'DIC', long: 'Diciembre' },
];
const ISO_MONTH = /^\d{4}-\d{2}$/;

const inputId = useId();
const inputRef = ref<HTMLInputElement | null>(null);
const wrapperRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const opensUp = ref(false);
const pickerMode = ref<'months' | 'years'>('months');
let dismissEventsBound = false;

const now = new Date();
const currentMonthIso = toIsoMonth(now.getFullYear(), now.getMonth());
const initialParts = parseIsoMonth(props.modelValue) ?? {
  year: now.getFullYear(),
  month: now.getMonth(),
};
const viewYear = ref(initialParts.year);

const displayValue = computed(() => {
  const parsed = parseIsoMonth(props.modelValue);
  if (!parsed) {
    return '';
  }
  return `${MONTHS[parsed.month].long} ${parsed.year}`;
});

const yearOptions = computed(() => Array.from({ length: 11 }, (_, i) => viewYear.value - 5 + i));
const canClear = computed(() => props.clearable && Boolean(props.modelValue) && !props.disabled);

watch(
  () => props.modelValue,
  (value) => {
    const parsed = parseIsoMonth(value);
    if (parsed) {
      viewYear.value = parsed.year;
    }
  },
);

watch(
  () => [props.minMonth, props.maxMonth, props.modelValue] as const,
  () => {
    if (props.modelValue && isOutsideRange(props.modelValue)) {
      emit('update:modelValue', null);
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  unbindDismissEvents();
});

function parseIsoMonth(value: string | null | undefined): { year: number; month: number } | null {
  if (!value || !ISO_MONTH.test(value)) {
    return null;
  }
  const [year, month] = value.split('-').map(Number);
  if (month < 1 || month > 12) {
    return null;
  }
  return { year, month: month - 1 };
}

function toIsoMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function isOutsideRange(iso: string): boolean {
  if (!ISO_MONTH.test(iso)) {
    return true;
  }
  if (props.minMonth && ISO_MONTH.test(props.minMonth) && iso < props.minMonth) {
    return true;
  }
  if (props.maxMonth && ISO_MONTH.test(props.maxMonth) && iso > props.maxMonth) {
    return true;
  }
  return false;
}

function updatePopoverDirection(): void {
  const rect = wrapperRef.value?.getBoundingClientRect();
  if (!rect) {
    opensUp.value = false;
    return;
  }
  const popoverHeight = 270;
  opensUp.value = window.innerHeight - rect.bottom < popoverHeight && rect.top > popoverHeight;
}

function openPicker(): void {
  if (props.disabled) {
    return;
  }
  const parsed = parseIsoMonth(props.modelValue);
  if (parsed) {
    viewYear.value = parsed.year;
  }
  pickerMode.value = 'months';
  isOpen.value = true;
  updatePopoverDirection();
  bindDismissEvents();
  void nextTick(() => inputRef.value?.focus());
}

function closePicker(): void {
  isOpen.value = false;
  pickerMode.value = 'months';
  unbindDismissEvents();
}

function togglePicker(): void {
  if (isOpen.value) {
    closePicker();
    return;
  }
  openPicker();
}

function selectMonth(month: number): void {
  const iso = toIsoMonth(viewYear.value, month);
  if (isOutsideRange(iso)) {
    return;
  }
  emit('update:modelValue', iso);
  closePicker();
}

function selectToday(): void {
  if (isOutsideRange(currentMonthIso)) {
    return;
  }
  emit('update:modelValue', currentMonthIso);
  closePicker();
}

function clearValue(): void {
  if (!canClear.value) {
    return;
  }
  emit('update:modelValue', null);
  closePicker();
}

function selectYear(year: number): void {
  viewYear.value = year;
  pickerMode.value = 'months';
}

function onDocumentPointerDown(event: MouseEvent): void {
  const target = event.target as Node | null;
  if (target && wrapperRef.value?.contains(target)) {
    return;
  }
  closePicker();
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closePicker();
    inputRef.value?.focus();
  }
}

function bindDismissEvents(): void {
  if (dismissEventsBound) {
    return;
  }
  document.addEventListener('mousedown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onDocumentKeydown, true);
  dismissEventsBound = true;
}

function unbindDismissEvents(): void {
  if (!dismissEventsBound) {
    return;
  }
  document.removeEventListener('mousedown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onDocumentKeydown, true);
  dismissEventsBound = false;
}
</script>

<template>
  <div
    ref="wrapperRef"
    class="app-month-picker"
    :class="{
      'app-month-picker--open': isOpen,
      'app-month-picker--disabled': disabled,
      'app-month-picker--up': opensUp,
    }"
  >
    <label v-if="label" :for="inputId" class="app-month-picker__label">{{ label }}</label>

    <div class="app-month-picker__control" role="button" tabindex="-1" @click="openPicker">
      <input
        :id="inputId"
        ref="inputRef"
        class="app-month-picker__input"
        :value="displayValue"
        :placeholder="placeholder"
        :disabled="disabled"
        readonly
        type="text"
        @click.stop="togglePicker"
        @keydown.enter.prevent="togglePicker"
        @keydown.space.prevent="togglePicker"
      />
      <button
        v-if="canClear"
        type="button"
        class="app-month-picker__icon-btn"
        aria-label="Limpiar período"
        @click.stop="clearValue"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5" />
        </svg>
      </button>
      <span v-else class="app-month-picker__icon" aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="M6 2.5v3M14 2.5v3M3.5 8h13M5 4h10a1.5 1.5 0 0 1 1.5 1.5V15A1.5 1.5 0 0 1 15 16.5H5A1.5 1.5 0 0 1 3.5 15V5.5A1.5 1.5 0 0 1 5 4Z" />
        </svg>
      </span>
    </div>

    <div v-if="isOpen" class="app-month-picker__popover" role="dialog" aria-modal="false">
      <div class="app-month-picker__header">
        <button type="button" class="app-month-picker__nav" aria-label="Año anterior" @click="viewYear -= 1">
          ‹
        </button>
        <button type="button" class="app-month-picker__year-btn" @click="pickerMode = 'years'">
          {{ viewYear }}
        </button>
        <button type="button" class="app-month-picker__nav" aria-label="Año siguiente" @click="viewYear += 1">
          ›
        </button>
      </div>

      <div v-if="pickerMode === 'months'" class="app-month-picker__month-grid">
        <button
          v-for="(month, index) in MONTHS"
          :key="month.short"
          type="button"
          class="app-month-picker__month"
          :class="{
            'app-month-picker__month--selected': modelValue === toIsoMonth(viewYear, index),
            'app-month-picker__month--current': currentMonthIso === toIsoMonth(viewYear, index),
          }"
          :disabled="isOutsideRange(toIsoMonth(viewYear, index))"
          @click="selectMonth(index)"
        >
          {{ month.short }}
        </button>
      </div>

      <div v-else class="app-month-picker__year-grid">
        <button
          v-for="year in yearOptions"
          :key="year"
          type="button"
          class="app-month-picker__year-option"
          :class="{ 'app-month-picker__year-option--selected': year === viewYear }"
          @click="selectYear(year)"
        >
          {{ year }}
        </button>
      </div>

      <div class="app-month-picker__footer">
        <button type="button" class="app-month-picker__footer-btn app-month-picker__footer-btn--today" @click="selectToday">
          Hoy
        </button>
        <button
          v-if="canClear"
          type="button"
          class="app-month-picker__footer-btn app-month-picker__footer-btn--clear"
          @click="clearValue"
        >
          Limpiar
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-month-picker {
  position: relative;
  width: 100%;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

.app-month-picker__label {
  display: block;
  margin: 0 0 0.35rem;
  color: #1f2937;
  font-size: 0.875rem;
  font-weight: 600;
}

.app-month-picker__control {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  height: 40px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #ffffff;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.app-month-picker:not(.app-month-picker--disabled) .app-month-picker__control {
  cursor: pointer;
}

.app-month-picker--open .app-month-picker__control,
.app-month-picker__control:focus-within {
  border-color: #1361b9;
  box-shadow: 0 0 0 1px rgba(19, 97, 185, 0.08);
}

.app-month-picker--disabled .app-month-picker__control {
  background: #f3f4f6;
  color: #9ca3af;
}

.app-month-picker__input {
  width: 100%;
  height: 100%;
  min-width: 0;
  padding: 0 2.45rem 0 0.75rem;
  border: 0;
  outline: none;
  background: transparent;
  color: #111827;
  font: inherit;
  font-size: 0.875rem;
  line-height: 40px;
  cursor: inherit;
}

.app-month-picker__input::placeholder {
  color: #9ca3af;
}

.app-month-picker__input:disabled {
  color: #9ca3af;
}

.app-month-picker__icon,
.app-month-picker__icon-btn {
  position: absolute;
  right: 0.65rem;
  top: 50%;
  display: inline-flex;
  width: 1.25rem;
  height: 1.25rem;
  align-items: center;
  justify-content: center;
  transform: translateY(-50%);
  color: #6b7280;
}

.app-month-picker__icon-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.app-month-picker__icon svg,
.app-month-picker__icon-btn svg {
  width: 1.1rem;
  height: 1.1rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.app-month-picker__popover {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  z-index: 1200;
  width: 240px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.app-month-picker--up .app-month-picker__popover {
  top: auto;
  bottom: calc(100% + 6px);
}

.app-month-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.85rem;
}

.app-month-picker__nav,
.app-month-picker__year-btn,
.app-month-picker__month,
.app-month-picker__year-option,
.app-month-picker__footer-btn {
  border: 0;
  background: transparent;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

.app-month-picker__nav,
.app-month-picker__year-btn {
  color: #111827;
  cursor: pointer;
}

.app-month-picker__nav {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  font-size: 1.5rem;
  line-height: 1;
}

.app-month-picker__year-btn {
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
  font-size: 0.95rem;
  font-weight: 700;
}

.app-month-picker__nav:hover,
.app-month-picker__year-btn:hover {
  background: #eef7fd;
  color: #1361b9;
}

.app-month-picker__month-grid,
.app-month-picker__year-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.45rem;
}

.app-month-picker__year-grid {
  grid-template-columns: repeat(3, 1fr);
}

.app-month-picker__month,
.app-month-picker__year-option {
  min-height: 2.2rem;
  border-radius: 6px;
  color: #374151;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 700;
}

.app-month-picker__year-option {
  font-weight: 600;
}

.app-month-picker__month--current {
  border: 1px solid #1361b9;
  color: #1361b9;
}

.app-month-picker__month--selected,
.app-month-picker__month--selected:hover,
.app-month-picker__year-option--selected,
.app-month-picker__year-option--selected:hover {
  background: #1361b9;
  color: #ffffff;
}

.app-month-picker__month:hover:not(:disabled):not(.app-month-picker__month--selected),
.app-month-picker__year-option:hover:not(.app-month-picker__year-option--selected) {
  background: #eef7fd;
  color: #1361b9;
}

.app-month-picker__month:disabled {
  color: #d1d5db;
  cursor: default;
}

.app-month-picker__footer {
  display: flex;
  justify-content: space-between;
  margin-top: 0.9rem;
}

.app-month-picker__footer-btn {
  padding: 0.25rem 0;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.app-month-picker__footer-btn--today {
  color: #1361b9;
}

.app-month-picker__footer-btn--clear {
  color: #6b7280;
}
</style>
