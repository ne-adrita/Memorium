/* ============================================================
   MEMORIUM — Pen System State Manager (Step 11B)
   Selection + configuration for future writing engine.
   No canvas/drawing here — only selection & persistence.
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_PEN = 'memorium_selected_pen';
  const STORAGE_SIZE = 'memorium_pen_size';
  const STORAGE_STYLE = 'memorium_pen_style';
  const STORAGE_OPACITY = 'memorium_pen_opacity';
  const STORAGE_OPEN = 'memorium_pen_tray_open';

  function cfg() {
    return window.MemoriumPenConfig;
  }

  function getDefaultPenId() {
    const c = cfg();
    return c ? c.DEFAULT_PEN : 'classic-black-ink';
  }

  // Current overrides (user can change size/style/opacity per session)
  let currentPenId = null;
  let currentSize = null;
  let currentStyle = null;
  let currentOpacity = null;

  function normalizePenId(raw) {
    const c = cfg();
    if (!c) return raw || getDefaultPenId();
    if (c.isValidPen(raw)) return raw;
    return getDefaultPenId();
  }

  function loadPersisted() {
    try {
      const savedPen = localStorage.getItem(STORAGE_PEN);
      const savedSize = localStorage.getItem(STORAGE_SIZE);
      const savedStyle = localStorage.getItem(STORAGE_STYLE);
      const savedOp = localStorage.getItem(STORAGE_OPACITY);
      const c = cfg();
      if (savedPen && c && c.isValidPen(savedPen)) currentPenId = savedPen;
      else if (savedPen) currentPenId = normalizePenId(savedPen);
      else currentPenId = getDefaultPenId();

      if (savedSize && c && c.isValidSize(savedSize)) currentSize = savedSize;
      if (savedStyle && c && c.isValidStyle(savedStyle)) currentStyle = savedStyle;
      if (savedOp !== null && !isNaN(parseFloat(savedOp))) {
        const v = parseFloat(savedOp);
        if (v >= 0.15 && v <= 1) currentOpacity = v;
      }
    } catch (_) {
      currentPenId = getDefaultPenId();
    }
    if (!currentPenId) currentPenId = getDefaultPenId();
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_PEN, currentPenId);
      if (currentSize) localStorage.setItem(STORAGE_SIZE, currentSize);
      else localStorage.removeItem(STORAGE_SIZE);
      if (currentStyle) localStorage.setItem(STORAGE_STYLE, currentStyle);
      else localStorage.removeItem(STORAGE_STYLE);
      if (currentOpacity !== null) localStorage.setItem(STORAGE_OPACITY, String(currentOpacity));
      else localStorage.removeItem(STORAGE_OPACITY);
    } catch (_) {}
  }

  function getPen(id) {
    const c = cfg();
    if (!c) return null;
    return c.PENS[id] || null;
  }

  function getAllPens() {
    const c = cfg();
    return c ? c.getAllPens() : [];
  }

  function getSelectedPenId() {
    if (!currentPenId) loadPersisted();
    return currentPenId;
  }

  function getSelectedPen() {
    const c = cfg();
    if (!c) return null;
    if (!currentPenId) loadPersisted();
    const base = c.getPen(currentPenId);
    // Merge overrides
    const merged = Object.assign({}, base);
    if (currentSize) merged.size = currentSize;
    if (currentStyle) merged.style = currentStyle;
    if (currentOpacity !== null) merged.opacity = currentOpacity;
    // Add derived size px
    if (c.SIZE_MAP[merged.size]) merged.sizePx = c.SIZE_MAP[merged.size].px;
    else merged.sizePx = c.SIZE_MAP.medium.px;
    return merged;
  }

  function selectPen(id) {
    const c = cfg();
    if (!c) return null;
    const resolved = c.isValidPen(id) ? id : c.DEFAULT_PEN;
    currentPenId = resolved;
    // When user selects pen, keep existing size/style unless pen has its own default that should reset?
    // Spec says size is global selectable, so keep currentSize if set, otherwise use pen's default.
    // We do not auto-reset size on pen change.
    persist();
    updateUISelection(resolved);
    document.dispatchEvent(
      new CustomEvent('memorium:penchange', { detail: { penId: resolved, pen: getSelectedPen() } })
    );
    return getSelectedPen();
  }

  function setSize(size) {
    const c = cfg();
    if (!c || !c.isValidSize(size)) return false;
    currentSize = size;
    persist();
    document.dispatchEvent(
      new CustomEvent('memorium:penchange', {
        detail: { penId: currentPenId, pen: getSelectedPen(), changed: 'size' },
      })
    );
    updateSizeUI(size);
    syncPenToWritingArea();
    return true;
  }

  function getSize() {
    if (!currentPenId) loadPersisted();
    const pen = getSelectedPen();
    return pen ? pen.size : 'medium';
  }

  function setStyle(style) {
    const c = cfg();
    if (!c || !c.isValidStyle(style)) return false;
    currentStyle = style;
    persist();
    document.dispatchEvent(
      new CustomEvent('memorium:penchange', {
        detail: { penId: currentPenId, pen: getSelectedPen(), changed: 'style' },
      })
    );
    return true;
  }

  function getStyle() {
    if (!currentPenId) loadPersisted();
    const pen = getSelectedPen();
    return pen ? pen.style : 'elegant';
  }

  function setOpacity(v) {
    const num = parseFloat(v);
    if (isNaN(num) || num < 0.15 || num > 1) return false;
    currentOpacity = Math.round(num * 100) / 100;
    persist();
    document.dispatchEvent(
      new CustomEvent('memorium:penchange', {
        detail: { penId: currentPenId, pen: getSelectedPen(), changed: 'opacity' },
      })
    );
    return true;
  }

  function getOpacity() {
    if (!currentPenId) loadPersisted();
    const pen = getSelectedPen();
    return pen ? pen.opacity : 1;
  }

  function isValidPen(id) {
    const c = cfg();
    return c ? c.isValidPen(id) : false;
  }

  // ---- UI helpers ----
  function updateUISelection(penId) {
    document.querySelectorAll('.pen-item').forEach(btn => {
      const on = btn.dataset.pen === penId;
      btn.classList.toggle('selected', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      const check = btn.querySelector('.pen-item-check');
      if (check) check.style.opacity = on ? '1' : '0';
      const label = btn.querySelector('.pen-item-selected-label');
      if (label) label.style.display = on ? 'inline' : 'none';
    });
    updateDetailsPanel(penId);
  }

  function updateSizeUI(size) {
    document.querySelectorAll('.pen-size-btn').forEach(b => {
      const on = b.dataset.size === size;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const pen = getSelectedPen();
    if (pen) {
      const previewStroke = document.querySelector('.pen-preview-stroke');
      if (previewStroke) {
        const map = cfg() ? cfg().SIZE_MAP[size] : null;
        const w = map ? map.stroke : 1.8;
        previewStroke.style.height = w + 'px';
        previewStroke.style.opacity = String(pen.opacity);
        previewStroke.style.background = pen.color;
      }
    }
  }

  function updateDetailsPanel(penId) {
    const c = cfg();
    if (!c) return;
    const pen = c.getPen(penId);
    if (!pen) return;
    const merged = getSelectedPen();
    const nameEl = document.querySelector('.pen-details-name');
    const typeEl = document.querySelector('.pen-details-type');
    const colorEl = document.querySelector('.pen-details-color');
    const styleEl = document.querySelector('.pen-details-style');
    const sizeEl = document.querySelector('.pen-details-size');
    const descEl = document.querySelector('.pen-details-desc');
    const swatchEl = document.querySelector('.pen-details-swatch');
    if (nameEl) nameEl.textContent = pen.name;
    if (typeEl)
      typeEl.textContent =
        pen.type.charAt(0).toUpperCase() +
        pen.type.slice(1) +
        (pen.type === 'pencil' ? '' : ' Pen');
    if (colorEl) {
      colorEl.textContent = pen.color;
      colorEl.style.color = pen.color;
    }
    if (styleEl) styleEl.textContent = merged.style.charAt(0).toUpperCase() + merged.style.slice(1);
    if (sizeEl) sizeEl.textContent = merged.size.charAt(0).toUpperCase() + merged.size.slice(1);
    if (descEl) descEl.textContent = pen.description;
    if (swatchEl) {
      swatchEl.style.background = pen.color;
      swatchEl.style.opacity = String(pen.opacity);
    }
    const opacityInput = document.querySelector('.pen-opacity-range');
    if (opacityInput) {
      opacityInput.value = String(merged.opacity);
      const valEl = document.querySelector('.pen-opacity-value');
      if (valEl) valEl.textContent = Math.round(merged.opacity * 100) + '%';
    }
    updateSizeUI(merged.size);
  }

  function syncPenToWritingArea() {
    // For Step 11B we do NOT replace contenteditable yet.
    // But we can set a data attribute so future engine can read it, and apply subtle color hint to caret area.
    const pen = getSelectedPen();
    if (!pen) return;
    const area = document.querySelector('.page-writing-area');
    if (area) {
      area.setAttribute('data-pen', pen.id);
      area.setAttribute('data-pen-color', pen.color);
      area.setAttribute('data-pen-size', pen.size);
      area.setAttribute('data-pen-type', pen.type);
      // Do not change actual text color yet — just set CSS variable for future
      document.documentElement.style.setProperty('--pen-color', pen.color);
      document.documentElement.style.setProperty('--pen-opacity', String(pen.opacity));
    }
  }

  function buildPenHolder() {
    const c = cfg();
    if (!c) return null;
    if (document.getElementById('pen-holder-system'))
      return document.getElementById('pen-holder-system');

    const notebook = document.querySelector('.notebook');
    if (!notebook) return null;

    const wrapper = document.createElement('div');
    wrapper.id = 'pen-holder-system';
    wrapper.className = 'pen-holder-system';
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Pen holder');

    // Determine active
    if (!currentPenId) loadPersisted();
    const activePen = c.getPen(currentPenId);

    wrapper.innerHTML = `
      <div class="pen-system-header">
        <span class="pen-system-icon" aria-hidden="true">✒</span>
        <div>
          <h3 class="pen-system-title">My Pens</h3>
          <p class="pen-system-subtitle">Choose your instrument</p>
        </div>
        <button type="button" class="pen-system-close" aria-label="Collapse pen holder" title="Collapse">—</button>
      </div>

      <div class="pen-tray" role="toolbar" aria-label="Pen collection"></div>

      <div class="pen-details-panel" aria-live="polite">
        <div class="pen-details-main">
          <div class="pen-details-row">
            <span class="pen-details-swatch" aria-hidden="true"></span>
            <span class="pen-details-name"></span>
          </div>
          <div class="pen-details-meta">
            <span class="pen-details-type"></span>
            <span class="pen-details-dot" aria-hidden="true">•</span>
            <span class="pen-details-color"></span>
          </div>
          <p class="pen-details-desc"></p>
          <div class="pen-details-attrs">
            <span>Style: <strong class="pen-details-style"></strong></span>
            <span>Size: <strong class="pen-details-size"></strong></span>
          </div>
        </div>

        <div class="pen-controls">
          <div class="pen-size-group" role="group" aria-label="Pen size">
            <button type="button" class="pen-size-btn" data-size="fine" aria-pressed="false">Fine</button>
            <button type="button" class="pen-size-btn" data-size="medium" aria-pressed="false">Medium</button>
            <button type="button" class="pen-size-btn" data-size="bold" aria-pressed="false">Bold</button>
          </div>

          <div class="pen-opacity-group">
            <label class="pen-opacity-label">
              <span>Opacity</span>
              <input type="range" class="pen-opacity-range" min="0.20" max="1" step="0.05" aria-label="Pen opacity">
              <span class="pen-opacity-value">100%</span>
            </label>
          </div>
        </div>

        <div class="pen-preview-mini" aria-hidden="true">
          <span class="pen-preview-label">Preview</span>
          <span class="pen-preview-stroke"></span>
        </div>
      </div>
    `;

    const tray = wrapper.querySelector('.pen-tray');
    c.getAllPens().forEach(pen => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pen-item pen-item--' + pen.type;
      btn.dataset.pen = pen.id;
      btn.setAttribute('aria-label', pen.name + ', ' + pen.type + ' pen, ink ' + pen.color);
      btn.setAttribute('aria-pressed', pen.id === currentPenId ? 'true' : 'false');
      if (pen.id === currentPenId) btn.classList.add('selected');

      // Visual pen body per type
      const isHighlighter = pen.type === 'highlighter';
      const isPencil = pen.type === 'pencil';
      const isGel = pen.type === 'gel';

      // Build pen visual using CSS shapes - body + tip + clip
      let visual = '';
      if (isPencil) {
        visual = `
          <span class="pen-visual pen-visual--pencil" aria-hidden="true">
            <span class="pen-pencil-body" style="background: linear-gradient(180deg, #F4E6C8 0%, #E8D9A8 50%, #D6C08A 100%); border-color: #C9B07A"></span>
            <span class="pen-pencil-wood" style="background: #E8D9A8"></span>
            <span class="pen-pencil-tip" style="background: ${pen.color}; opacity: ${pen.opacity}"></span>
            <span class="pen-pencil-lead" style="background: #3A3A3E"></span>
          </span>
        `;
      } else if (isHighlighter) {
        visual = `
          <span class="pen-visual pen-visual--highlighter" aria-hidden="true">
            <span class="pen-highlighter-body" style="background: ${pen.color}; opacity: ${pen.opacity}; border-color: ${pen.color}"></span>
            <span class="pen-highlighter-cap" style="background: #FFFEFB; border-color: ${pen.color}"></span>
            <span class="pen-highlighter-tip" style="background: ${pen.color}"></span>
            <span class="pen-highlighter-stripe" style="background: rgba(0,0,0,0.08)"></span>
          </span>
        `;
      } else {
        // fountain / gel
        const bodyGradient =
          pen.type === 'fountain'
            ? `linear-gradient(180deg, #2B2B2E 0%, #1A1A1E 45%, #3A3A3E 100%)`
            : `linear-gradient(180deg, #4A4A4E 0%, #2A2A2E 50%, #3E3E42 100%)`;
        const gripColor = pen.type === 'fountain' ? '#3A3A3E' : '#5A5A5E';
        visual = `
          <span class="pen-visual pen-visual--${pen.type}" aria-hidden="true">
            <span class="pen-body" style="background: ${bodyGradient}"></span>
            <span class="pen-clip" aria-hidden="true"></span>
            <span class="pen-grip" style="background: ${gripColor}; border-color: ${pen.color}"></span>
            <span class="pen-nib" style="background: linear-gradient(135deg, #E8E0C8 0%, #C9B896 55%, #A8926A 100%); border-color: #8B7355"></span>
            <span class="pen-ink-window" style="background: ${pen.color}; opacity: ${pen.opacity}"></span>
          </span>
        `;
      }

      btn.innerHTML = `
        ${visual}
        <span class="pen-item-name">${pen.name}</span>
        <span class="pen-item-type">${pen.type.charAt(0).toUpperCase() + pen.type.slice(1)}</span>
        <span class="pen-item-check" aria-hidden="true" style="opacity:${pen.id === currentPenId ? '1' : '0'}">✓</span>
        <span class="pen-item-selected-label" style="display:${pen.id === currentPenId ? 'inline' : 'none'}">✓ Selected</span>
      `;
      btn.addEventListener('click', () => {
        selectPen(pen.id);
      });
      btn.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectPen(pen.id);
        }
      });
      tray.appendChild(btn);
    });

    // Size buttons
    wrapper.querySelectorAll('.pen-size-btn').forEach(b => {
      b.addEventListener('click', () => {
        setSize(b.dataset.size);
      });
    });

    // Opacity range
    const opRange = wrapper.querySelector('.pen-opacity-range');
    if (opRange) {
      opRange.addEventListener('input', () => {
        setOpacity(opRange.value);
        const valEl = wrapper.querySelector('.pen-opacity-value');
        if (valEl) valEl.textContent = Math.round(parseFloat(opRange.value) * 100) + '%';
        // live update preview
        const pen = getSelectedPen();
        const stroke = wrapper.querySelector('.pen-preview-stroke');
        if (stroke && pen) {
          stroke.style.opacity = String(pen.opacity);
          stroke.style.background = pen.color;
        }
      });
    }

    // Collapse toggle
    const closeBtn = wrapper.querySelector('.pen-system-close');
    let collapsed = false;
    try {
      const savedOpen = localStorage.getItem(STORAGE_OPEN);
      if (savedOpen === 'false') collapsed = true;
    } catch (_) {}
    if (collapsed) {
      wrapper.classList.add('collapsed');
      closeBtn.textContent = '+';
      closeBtn.setAttribute('aria-label', 'Expand pen holder');
    }
    closeBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      wrapper.classList.toggle('collapsed', collapsed);
      closeBtn.textContent = collapsed ? '+' : '—';
      closeBtn.setAttribute('aria-label', collapsed ? 'Expand pen holder' : 'Collapse pen holder');
      try {
        localStorage.setItem(STORAGE_OPEN, collapsed ? 'false' : 'true');
      } catch (_) {}
    });

    // Insert after theme system if exists, else before notebook
    const themeSystem = document.getElementById('theme-family-system');
    if (themeSystem && themeSystem.parentNode) {
      themeSystem.parentNode.insertBefore(wrapper, themeSystem.nextSibling);
    } else {
      const parent = notebook.parentNode;
      parent.insertBefore(wrapper, notebook.nextSibling);
      // move notebook nav etc? keep order: notebook then pen
    }

    updateDetailsPanel(currentPenId);
    syncPenToWritingArea();
    return wrapper;
  }

  function init() {
    loadPersisted();
    // Wait for themeConfig availability
    if (!cfg()) {
      setTimeout(init, 100);
      return;
    }
    // Defer building until DOM ready and notebook exists
    const tryBuild = () => {
      if (!document.querySelector('.notebook')) {
        setTimeout(tryBuild, 300);
        return;
      }
      buildPenHolder();
      // Ensure selection reflects persisted
      const pen = getSelectedPen();
      if (pen) {
        document.dispatchEvent(
          new CustomEvent('memorium:penchange', { detail: { penId: pen.id, pen } })
        );
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryBuild);
    } else {
      tryBuild();
    }
  }

  // Expose
  window.MemoriumPen = {
    getPen,
    getAllPens,
    getSelectedPen,
    getSelectedPenId,
    selectPen,
    setSize,
    getSize,
    setStyle,
    getStyle,
    setOpacity,
    getOpacity,
    isValidPen,
    buildPenHolder,
    syncPenToWritingArea,
  };

  // Compat aliases for spec
  window.MemoriumPen.getPen = getPen;
  window.MemoriumPen.getAllPens = getAllPens;

  // Auto-init
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);

  // Keep pen tray theme-reactive - re-sync on theme change (border/shadow uses CSS vars)
  document.addEventListener('memorium:themechange', () => {
    const holder = document.getElementById('pen-holder-system');
    if (holder) {
      // CSS vars will auto update, no JS needed
    }
  });
})();
