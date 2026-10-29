/** Preserve interaction state when live simulation values refresh a panel. */
export function replaceMarkup(root: HTMLElement, html: string) {
  const active = root.contains(document.activeElement) ? document.activeElement as HTMLElement : null;
  const action = active?.dataset.act, arg = active?.dataset.arg ?? '';
  const focusKey = active?.closest<HTMLElement>('details[data-key]')?.dataset.key;
  const expanded = new Set([...root.querySelectorAll<HTMLDetailsElement>('details[data-key][open]')].map(e => e.dataset.key));
  root.innerHTML = html;
  for (const el of root.querySelectorAll<HTMLDetailsElement>('details[data-key]')) el.open = expanded.has(el.dataset.key);
  const target = action ? [...root.querySelectorAll<HTMLElement>('[data-act]')].find(e => e.dataset.act === action && (e.dataset.arg ?? '') === arg)
    : focusKey ? [...root.querySelectorAll<HTMLElement>('details[data-key]')].find(e => e.dataset.key === focusKey)?.querySelector<HTMLElement>('summary') : null;
  target?.focus({ preventScroll: true });
}
