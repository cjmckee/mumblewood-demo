export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

/** Preserve interaction state when live simulation values refresh a panel. */
export function replaceMarkup(root: HTMLElement, html: string, preserveDetails = true) {
  const active = root.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
  const draft = active instanceof HTMLInputElement ? active.value : null;
  const action = active?.dataset.act, arg = active?.dataset.arg ?? '';
  const helpName = active?.dataset.helpName;
  const helpIndex = helpName ? [...root.querySelectorAll<HTMLElement>('[data-help-name]')].filter(e => e.dataset.helpName === helpName).indexOf(active!) : -1;
  const focusKey = active?.closest<HTMLElement>('details[data-key]')?.dataset.key;
  const expanded = new Map(preserveDetails ? [...root.querySelectorAll<HTMLDetailsElement>('details[data-key]')].map(e => [e.dataset.key, e.open]) : []);
  root.innerHTML = html;
  for (const el of root.querySelectorAll<HTMLDetailsElement>('details[data-key]')) if (expanded.has(el.dataset.key)) el.open = expanded.get(el.dataset.key)!;
  const target = action ? [...root.querySelectorAll<HTMLElement>('[data-act]')].find(e => e.dataset.act === action && (e.dataset.arg ?? '') === arg)
    : helpName ? [...root.querySelectorAll<HTMLElement>('[data-help-name]')].filter(e => e.dataset.helpName === helpName)[helpIndex]
    : focusKey ? [...root.querySelectorAll<HTMLElement>('details[data-key]')].find(e => e.dataset.key === focusKey)?.querySelector<HTMLElement>('summary') : null;
  if (draft != null && target instanceof HTMLInputElement) target.value = draft;
  target?.focus({ preventScroll: true });
}
