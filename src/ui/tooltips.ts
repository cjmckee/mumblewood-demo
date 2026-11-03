/** Delegated help for chips. Kept outside scrolling cards so it cannot be clipped. */
export function installTooltips(root: HTMLElement) {
  const tip = document.createElement('div');
  tip.id = 'game-tooltip'; tip.className = 'game-tooltip'; tip.hidden = true;
  tip.setAttribute('role', 'tooltip'); root.append(tip);
  let active: HTMLElement | null = null;
  let closing: ReturnType<typeof setTimeout> | undefined;
  const trigger = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-help-name]') : null;
  const hide = () => {
    clearTimeout(closing);
    active?.removeAttribute('aria-describedby'); active = null; tip.hidden = true; tip.replaceChildren();
  };
  const position = () => {
    if (!active) return;
    const rect = active.getBoundingClientRect(), gap = 8, edge = 12;
    const box = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(edge, Math.min(rect.left + rect.width / 2 - box.width / 2, innerWidth - box.width - edge))}px`;
    const above = rect.top - box.height - gap;
    tip.style.top = `${Math.max(edge, Math.min(above >= edge ? above : rect.bottom + gap, innerHeight - box.height - edge))}px`;
  };
  const show = (el: HTMLElement) => {
    clearTimeout(closing);
    if (active !== el || tip.hidden) {
      hide(); active = el;
      for (const [tag, value] of [['small', el.dataset.helpKind], ['b', el.dataset.helpName], ['p', el.dataset.helpBody], ['footer', el.dataset.helpNote]]) {
        if (!value) continue;
        const node = document.createElement(tag!); node.textContent = value; tip.append(node);
      }
      el.setAttribute('aria-describedby', tip.id); tip.hidden = false;
    }
    position();
  };
  // Dismiss help if a live update removes or hides its trigger.
  const observer = new MutationObserver(() => { if (active && (!active.isConnected || !active.getClientRects().length || active.closest('[hidden], [inert]'))) hide(); });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'inert'] });
  root.addEventListener('pointerover', e => { if (e.pointerType === 'touch') return; const el = trigger(e.target); if (el) show(el); if (tip.contains(e.target as Node)) clearTimeout(closing); });
  root.addEventListener('pointerout', e => {
    if (e.pointerType === 'touch') return;
    const next = e.relatedTarget as Node | null;
    if (next && (active?.contains(next) || tip.contains(next))) return;
    closing = setTimeout(hide, 120);
  });
  root.addEventListener('focusin', e => { const el = trigger(e.target); if (el) show(el); else hide(); });
  root.addEventListener('focusout', e => { if (trigger(e.target)) hide(); });
  root.addEventListener('click', e => {
    const el = trigger(e.target);
    if (el) { e.preventDefault(); e.stopPropagation(); show(el); }
    else if (!tip.contains(e.target as Node)) hide();
  }, true);
  root.addEventListener('pointerdown', e => { if (!trigger(e.target) && !tip.contains(e.target as Node)) hide(); }, true);
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && active) { hide(); e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  window.addEventListener('resize', hide);
  root.addEventListener('scroll', hide, true);
}
