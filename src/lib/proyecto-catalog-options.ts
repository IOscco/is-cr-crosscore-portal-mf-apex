import type { SelectOption } from '@/types/forms';
import { fetchCatalogActive } from '@/lib/config-api';

export async function fetchItPmCatalogOptions(): Promise<SelectOption[]> {
  const responsables = await fetchCatalogActive('RESPONSABLE');
  return [...responsables]
    .filter((r) => r.activo)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((x) => ({ value: x.label, label: x.label }));
}
