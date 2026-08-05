import type { BadgePillVariant } from '@/types/badge-ui';
import { estatusGeneralToPillVariant } from '@/lib/estado-badge';

/** Severidades soportadas por IsTag (PrimeVue Tag). */
export type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

export interface TagStyle {
  severity: TagSeverity;
  /** Clase de tono corporativo para variantes sin severidad nativa en el kit. */
  toneClass?: string;
}

/**
 * Traduce las variantes históricas de BadgePill a IsTag del kit.
 * Las que no tienen severidad nativa (sky, purple, pink) reciben una clase
 * de tono corporativo definida en main.css (.is-tag--*).
 */
const VARIANT_TO_TAG: Record<BadgePillVariant, TagStyle> = {
  blue: { severity: 'info' },
  accepted: { severity: 'info' },
  sky: { severity: 'info', toneClass: 'is-tag--sky' },
  pink: { severity: 'secondary', toneClass: 'is-tag--pink' },
  purple: { severity: 'secondary', toneClass: 'is-tag--purple' },
  orange: { severity: 'warn' },
  red: { severity: 'danger' },
  teal: { severity: 'success' },
  gray: { severity: 'secondary' },
};

export function pillVariantToTag(variant: BadgePillVariant): TagStyle {
  return VARIANT_TO_TAG[variant] ?? { severity: 'secondary' };
}

/** Estatus de proyecto/iniciativa (texto libre) → estilo de IsTag. */
export function estatusGeneralToTag(raw: string): TagStyle {
  return pillVariantToTag(estatusGeneralToPillVariant(raw));
}

/** Estado de actividad/pendiente → severidad de IsTag. */
export function estadoActividadToSeverity(raw: string | null | undefined): TagSeverity {
  switch (String(raw ?? '').trim()) {
    case 'En Progreso':
      return 'warn';
    case 'Bloqueado':
      return 'danger';
    case 'Cerrado':
      return 'success';
    case 'Desestimado':
      return 'secondary';
    default:
      return 'info';
  }
}

/** Tono semáforo (verde/azul/ambar/rojo/gris) → severidad de IsTag. */
export function semaforoToSeverity(tone: string): TagSeverity {
  switch (tone) {
    case 'verde':
      return 'success';
    case 'azul':
      return 'info';
    case 'ambar':
      return 'warn';
    case 'rojo':
      return 'danger';
    default:
      return 'secondary';
  }
}
