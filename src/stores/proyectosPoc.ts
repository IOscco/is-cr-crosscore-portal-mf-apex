import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { ProyectoPocRow } from '@/types/poc-data';

const STORAGE_KEY = 'itp-poc-proyectos-manuales-v2';

/**
 * Proyectos del módulo: solo registros manuales (HU-ITP-025), persistidos en localStorage.
 * No se precargan filas desde Excel / Program Board.
 */
export const useProyectosPocStore = defineStore('proyectosPoc', () => {
  const manualRows = ref<ProyectoPocRow[]>([]);
  let hydrated = false;

  function hydrate(): void {
    if (hydrated) {
      return;
    }
    hydrated = true;
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (!s) {
        return;
      }
      const parsed = JSON.parse(s) as unknown;
      if (Array.isArray(parsed)) {
        manualRows.value = parsed as ProyectoPocRow[];
      }
    } catch {
      /* PoC: ignorar JSON corrupto */
    }
  }

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(manualRows.value));
    } catch {
      /* PoC: quota o modo privado */
    }
  }

  /** Alias para vistas: únicamente filas manuales persistidas localmente. */
  const allRows = computed(() => manualRows.value);

  function addManual(row: ProyectoPocRow): void {
    manualRows.value = [row, ...manualRows.value];
    persist();
  }

  return { manualRows, allRows, hydrate, addManual };
});
