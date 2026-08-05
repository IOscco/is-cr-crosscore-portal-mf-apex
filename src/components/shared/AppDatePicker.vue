<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

type CalendarDay = {
  date: string;
  day: number;
  currentMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  isDisabled: boolean;
};

const props = withDefaults(
  defineProps<{
    modelValue: string | null;
    label: string;
    required?: boolean;
    placeholder?: string;
    minDate?: string;
    maxDate?: string;
    disabled?: boolean;
    clearable?: boolean;
  }>(),
  {
    required: false,
    placeholder: 'Selecciona una fecha',
    minDate: '',
    maxDate: '',
    disabled: false,
    clearable: true,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
}>();

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];
const WEEKDAYS = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const inputId = useId();
const inputRef = ref<HTMLInputElement | null>(null);
const wrapperRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const opensUp = ref(false);
const touched = ref(false);
const pickerMode = ref<'days' | 'months' | 'years'>('days');
let dismissEventsBound = false;

const today = new Date();
const selectedParts = computed(() => parseIsoDate(props.modelValue));
const initialParts = selectedParts.value ?? {
  year: today.getFullYear(),
  month: today.getMonth(),
  day: today.getDate(),
};
const viewMonth = ref(initialParts.month);
const viewYear = ref(initialParts.year);

const yearOptions = computed(() => {
  const currentYear = today.getFullYear();
  return Array.from({ length: 21 }, (_, i) => currentYear - 10 + i);
});

const displayValue = computed(() => {
  const parsed = parseIsoDate(props.modelValue);
  if (!parsed) {
    return '';
  }
  return `${parsed.day} de ${MONTHS[parsed.month]} de ${parsed.year}`;
});

const showRequiredError = computed(() => touched.value && props.required && !props.modelValue);
const canClear = computed(() => props.clearable && Boolean(props.modelValue) && !props.disabled);

const calendarDays = computed<CalendarDay[]>(() => {
  const firstOfMonth = new Date(viewYear.value, viewMonth.value, 1);
  const mondayBasedIndex = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(viewYear.value, viewMonth.value, 1 - mondayBasedIndex);
  const todayIso = toIsoDate(today);

  return Array.from({ length: 42 }, (_, index) => {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + index);
    const iso = toIsoDate(cellDate);

    return {
      date: iso,
      day: cellDate.getDate(),
      currentMonth: cellDate.getMonth() === viewMonth.value,
      isToday: iso === todayIso,
      isSelected: iso === props.modelValue,
      isDisabled: isOutsideRange(iso),
    };
  });
});

watch(
  () => props.modelValue,
  (value) => {
    const parsed = parseIsoDate(value);
    if (!parsed) {
      return;
    }
    viewMonth.value = parsed.month;
    viewYear.value = parsed.year;
  },
);

watch(
  () => [props.minDate, props.maxDate, props.modelValue] as const,
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

function parseIsoDate(value: string | null | undefined): { year: number; month: number; day: number } | null {
  if (!value || !ISO_DATE.test(value)) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return { year, month: month - 1, day };
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isOutsideRange(iso: string): boolean {
  if (!ISO_DATE.test(iso)) {
    return true;
  }
  if (props.minDate && ISO_DATE.test(props.minDate) && iso < props.minDate) {
    return true;
  }
  if (props.maxDate && ISO_DATE.test(props.maxDate) && iso > props.maxDate) {
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
  const popoverHeight = 374;
  opensUp.value = window.innerHeight - rect.bottom < popoverHeight && rect.top > popoverHeight;
}

function openCalendar(): void {
  if (props.disabled) {
    return;
  }
  const parsed = selectedParts.value;
  if (parsed) {
    viewMonth.value = parsed.month;
    viewYear.value = parsed.year;
  }
  pickerMode.value = 'days';
  isOpen.value = true;
  updatePopoverDirection();
  bindDismissEvents();
  void nextTick(() => inputRef.value?.focus());
}

function closeCalendar(): void {
  isOpen.value = false;
  pickerMode.value = 'days';
  unbindDismissEvents();
}

function toggleCalendar(): void {
  if (isOpen.value) {
    closeCalendar();
    return;
  }
  openCalendar();
}

function selectDate(day: CalendarDay): void {
  if (day.isDisabled) {
    return;
  }
  touched.value = true;
  emit('update:modelValue', day.date);
  closeCalendar();
}

function selectToday(): void {
  const iso = toIsoDate(new Date());
  if (isOutsideRange(iso)) {
    return;
  }
  touched.value = true;
  emit('update:modelValue', iso);
  closeCalendar();
}

function clearValue(): void {
  if (!canClear.value) {
    return;
  }
  touched.value = true;
  emit('update:modelValue', null);
  closeCalendar();
}

function goToPreviousMonth(): void {
  if (viewMonth.value === 0) {
    viewMonth.value = 11;
    viewYear.value -= 1;
    return;
  }
  viewMonth.value -= 1;
}

function goToNextMonth(): void {
  if (viewMonth.value === 11) {
    viewMonth.value = 0;
    viewYear.value += 1;
    return;
  }
  viewMonth.value += 1;
}

function selectMonth(month: number): void {
  viewMonth.value = month;
  pickerMode.value = 'days';
}

function selectYear(year: number): void {
  viewYear.value = year;
  pickerMode.value = 'months';
}

function onFocusOut(event: FocusEvent): void {
  const nextTarget = event.relatedTarget as Node | null;
  if (nextTarget && wrapperRef.value?.contains(nextTarget)) {
    return;
  }
  touched.value = true;
}

function onDocumentPointerDown(event: MouseEvent): void {
  const target = event.target as Node | null;
  if (target && wrapperRef.value?.contains(target)) {
    return;
  }
  touched.value = true;
  closeCalendar();
}

function onDocumentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeCalendar();
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
    class="app-date-picker"
    :class="{
      'app-date-picker--open': isOpen,
      'app-date-picker--disabled': disabled,
      'app-date-picker--error': showRequiredError,
      'app-date-picker--up': opensUp,
    }"
    @focusout="onFocusOut"
  >
    <label v-if="label" :for="inputId" class="app-date-picker__label">
      {{ label }}<span v-if="required" class="app-date-picker__required"> *</span>
    </label>

    <div class="app-date-picker__control" role="button" tabindex="-1" @click="openCalendar">
      <input
        :id="inputId"
        ref="inputRef"
        class="app-date-picker__input"
        :value="displayValue"
        :placeholder="placeholder"
        :disabled="disabled"
        readonly
        type="text"
        @click.stop="toggleCalendar"
        @keydown.enter.prevent="toggleCalendar"
        @keydown.space.prevent="toggleCalendar"
      />
      <button
        v-if="canClear"
        type="button"
        class="app-date-picker__icon-btn"
        aria-label="Limpiar fecha"
        @click.stop="clearValue"
      >
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5.5 5.5 14.5 14.5M14.5 5.5 5.5 14.5" />
        </svg>
      </button>
      <span v-else class="app-date-picker__icon" aria-hidden="true">
        <svg viewBox="0 0 20 20">
          <path d="M6 2.5v3M14 2.5v3M3.5 8h13M5 4h10a1.5 1.5 0 0 1 1.5 1.5V15A1.5 1.5 0 0 1 15 16.5H5A1.5 1.5 0 0 1 3.5 15V5.5A1.5 1.5 0 0 1 5 4Z" />
        </svg>
      </span>
    </div>

    <p v-if="showRequiredError" class="app-date-picker__error">Este campo es requerido</p>

    <div v-if="isOpen" class="app-date-picker__popover" role="dialog" aria-modal="false">
      <div class="app-date-picker__header">
        <button type="button" class="app-date-picker__nav" aria-label="Mes anterior" @click="goToPreviousMonth">
          ‹
        </button>
        <div class="app-date-picker__title">
          <button type="button" class="app-date-picker__title-btn" @click="pickerMode = 'months'">
            {{ MONTHS[viewMonth] }}
          </button>
          <button type="button" class="app-date-picker__title-btn" @click="pickerMode = 'years'">
            {{ viewYear }}
          </button>
        </div>
        <button type="button" class="app-date-picker__nav" aria-label="Mes siguiente" @click="goToNextMonth">
          ›
        </button>
      </div>

      <div v-if="pickerMode === 'days'" class="app-date-picker__calendar">
        <span v-for="weekday in WEEKDAYS" :key="weekday" class="app-date-picker__weekday">{{ weekday }}</span>
        <button
          v-for="day in calendarDays"
          :key="day.date"
          type="button"
          class="app-date-picker__day"
          :class="{
            'app-date-picker__day--muted': !day.currentMonth,
            'app-date-picker__day--today': day.isToday,
            'app-date-picker__day--selected': day.isSelected,
          }"
          :disabled="day.isDisabled"
          @click="selectDate(day)"
        >
          {{ day.day }}
        </button>
      </div>

      <div v-else-if="pickerMode === 'months'" class="app-date-picker__month-grid">
        <button
          v-for="(month, index) in MONTHS"
          :key="month"
          type="button"
          class="app-date-picker__option"
          :class="{ 'app-date-picker__option--selected': index === viewMonth }"
          @click="selectMonth(index)"
        >
          {{ month }}
        </button>
      </div>

      <div v-else class="app-date-picker__year-grid">
        <button
          v-for="year in yearOptions"
          :key="year"
          type="button"
          class="app-date-picker__option"
          :class="{ 'app-date-picker__option--selected': year === viewYear }"
          @click="selectYear(year)"
        >
          {{ year }}
        </button>
      </div>

      <div class="app-date-picker__footer">
        <button type="button" class="app-date-picker__footer-btn app-date-picker__footer-btn--today" @click="selectToday">
          Hoy
        </button>
        <button
          v-if="canClear"
          type="button"
          class="app-date-picker__footer-btn app-date-picker__footer-btn--clear"
          @click="clearValue"
        >
          Limpiar
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app-date-picker {
  position: relative;
  width: 100%;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

.app-date-picker__label {
  display: block;
  margin: 0 0 0.35rem;
  color: #1f2937;
  font-size: 0.875rem;
  font-weight: 600;
}

.app-date-picker__required,
.app-date-picker__error {
  color: #f14649;
}

.app-date-picker__control {
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

.app-date-picker:not(.app-date-picker--disabled) .app-date-picker__control {
  cursor: pointer;
}

.app-date-picker--open .app-date-picker__control,
.app-date-picker__control:focus-within {
  border-color: #1361b9;
  box-shadow: 0 0 0 1px rgba(19, 97, 185, 0.08);
}

.app-date-picker--error .app-date-picker__control {
  border-color: #f14649;
}

.app-date-picker--disabled .app-date-picker__control {
  background: #f3f4f6;
  color: #9ca3af;
}

.app-date-picker__input {
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

.app-date-picker__input::placeholder {
  color: #9ca3af;
}

.app-date-picker__input:disabled {
  color: #9ca3af;
}

.app-date-picker__icon,
.app-date-picker__icon-btn {
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

.app-date-picker__icon-btn {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.app-date-picker__icon svg,
.app-date-picker__icon-btn svg {
  width: 1.1rem;
  height: 1.1rem;
  fill: none;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.7;
}

.app-date-picker__error {
  margin: 0.3rem 0 0;
  font-size: 0.78rem;
}

.app-date-picker__popover {
  position: absolute;
  left: 0;
  top: calc(100% + 6px);
  z-index: 1200;
  width: 280px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.app-date-picker--up .app-date-picker__popover {
  top: auto;
  bottom: calc(100% + 6px);
}

.app-date-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.app-date-picker__title {
  display: flex;
  gap: 0.25rem;
  align-items: center;
  color: #111827;
  font-size: 0.95rem;
  font-weight: 700;
  text-transform: capitalize;
}

.app-date-picker__title-btn,
.app-date-picker__nav,
.app-date-picker__footer-btn,
.app-date-picker__day,
.app-date-picker__option {
  border: 0;
  background: transparent;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
}

.app-date-picker__title-btn,
.app-date-picker__nav {
  color: #111827;
  cursor: pointer;
}

.app-date-picker__title-btn {
  padding: 0.15rem 0.2rem;
  border-radius: 4px;
  font: inherit;
  text-transform: capitalize;
}

.app-date-picker__title-btn:hover,
.app-date-picker__nav:hover {
  background: #eef7fd;
  color: #1361b9;
}

.app-date-picker__nav {
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  font-size: 1.5rem;
  line-height: 1;
}

.app-date-picker__calendar {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.25rem;
}

.app-date-picker__weekday {
  color: #6b7280;
  font-size: 0.75rem;
  font-weight: 700;
  text-align: center;
}

.app-date-picker__day {
  width: 2rem;
  height: 2rem;
  margin: 0 auto;
  border-radius: 999px;
  color: #111827;
  cursor: pointer;
  font-size: 0.82rem;
}

.app-date-picker__day--muted {
  color: #a3aab5;
}

.app-date-picker__day--today {
  border: 1px solid #1361b9;
  color: #1361b9;
}

.app-date-picker__day--selected,
.app-date-picker__day--selected:hover {
  background: #1361b9;
  color: #ffffff;
}

.app-date-picker__day:hover:not(:disabled):not(.app-date-picker__day--selected) {
  background: #eef7fd;
  color: #1361b9;
}

.app-date-picker__day:disabled {
  color: #d1d5db;
  cursor: not-allowed;
}

.app-date-picker__month-grid,
.app-date-picker__year-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.4rem;
}

.app-date-picker__option {
  min-height: 2.1rem;
  border-radius: 6px;
  color: #374151;
  cursor: pointer;
  font-size: 0.82rem;
  text-transform: capitalize;
}

.app-date-picker__option:hover {
  background: #eef7fd;
  color: #1361b9;
}

.app-date-picker__option--selected {
  background: #1361b9;
  color: #ffffff;
}

.app-date-picker__footer {
  display: flex;
  justify-content: space-between;
  margin-top: 0.9rem;
}

.app-date-picker__footer-btn {
  padding: 0.25rem 0;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.app-date-picker__footer-btn--today {
  color: #1361b9;
}

.app-date-picker__footer-btn--clear {
  color: #6b7280;
}
</style>
