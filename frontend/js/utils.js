/* Memorium — Shared UI helpers (vintage paper/leather feel) */
(function () {
  function ensureToastContainer() {
    let c = document.getElementById('memorium-toast-container');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'memorium-toast-container';
    c.setAttribute('aria-live', 'polite');
    c.setAttribute('aria-atomic', 'true');
    c.style.cssText =
      'position:fixed;top:calc(var(--navbar-height,90px) + 12px);right:16px;z-index:1100;display:flex;flex-direction:column;gap:10px;pointer-events:none;max-width:min(92vw,360px)';
    document.body.appendChild(c);
    return c;
  }

  function showToast(message, type) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.setAttribute('role', 'status');
    const isError = type === 'error';
    toast.style.cssText =
      'pointer-events:auto;padding:12px 16px;border-radius:12px;font-family:var(--heading-font);font-size:0.92rem;line-height:1.4;' +
      'background:var(--paper);color:var(--text-dark);border:1px solid var(--border);' +
      'box-shadow:0 10px 30px rgba(0,0,0,.12);position:relative;overflow:hidden;';
    // subtle torn paper edge via pseudo accent
    toast.style.borderLeft = '4px solid ' + (isError ? 'var(--danger)' : 'var(--accent-gold)');
    toast.textContent = message;
    container.appendChild(toast);
    // animate in (respect reduced motion via CSS variable)
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-6px)';
    toast.style.transition = 'opacity .25s ease, transform .25s ease';
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    });
    const hide = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-6px)';
      setTimeout(() => toast.remove(), 260);
    };
    setTimeout(hide, type === 'error' ? 4200 : 2800);
    return toast;
  }

  function showLoading(target, text) {
    if (!target) target = document.body;
    let overlay = target.querySelector(':scope > .memorium-loading');
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'memorium-loading';
    overlay.setAttribute('aria-busy', 'true');
    overlay.style.cssText =
      'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;' +
      'background:rgba(248,241,231,.78);backdrop-filter:blur(2px);z-index:5;border-radius:inherit;';
    overlay.innerHTML =
      '<div style="display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px 18px;background:var(--paper);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow-sm)">' +
      '<div class="memorium-spinner" style="width:28px;height:28px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;animation:memorium-spin .9s linear infinite"></div>' +
      '<span style="font-family:var(--heading-font);font-size:.9rem;color:var(--text-muted)">' +
      (text || 'Loading…') +
      '</span></div>';
    const prevPos = getComputedStyle(target).position;
    if (prevPos === 'static') target.style.position = 'relative';
    target.appendChild(overlay);
    if (!document.getElementById('memorium-spin-style')) {
      const s = document.createElement('style');
      s.id = 'memorium-spin-style';
      s.textContent = '@keyframes memorium-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }
    return overlay;
  }

  function hideLoading(target) {
    if (!target) target = document.body;
    const el = target.querySelector(':scope > .memorium-loading');
    if (el) el.remove();
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  window.MemoriumUtils = { showToast, showLoading, hideLoading, debounce };
})();
