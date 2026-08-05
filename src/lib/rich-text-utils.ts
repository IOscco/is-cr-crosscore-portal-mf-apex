/**
 * Utilidades para campos HTML enriquecido (Tiptap / RichTextEditor).
 * Validaciones «requerido» deben usar texto plano, no el HTML crudo.
 */
export function plainTextFromHtml(html: string | null | undefined): string {
  const raw = String(html ?? '');
  if (!raw.trim()) {
    return '';
  }
  if (typeof document === 'undefined') {
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  try {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    return (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim();
  } catch {
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

export function hasMeaningfulHtmlContent(html: string | null | undefined): boolean {
  return plainTextFromHtml(html).length > 0;
}
