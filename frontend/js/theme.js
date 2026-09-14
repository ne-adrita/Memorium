/* ============================================================
   MEMORIUM — Theme Family System (Step 11A)
   6 families × 4 themes = 24 themes.
   Centralized via themeConfig.js. Applies via CSS variables
   and data-theme. Persists to localStorage + Journal DB.
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'memorium_theme';
  const LEGACY_KEY = 'memorium-theme';
  const JOURNAL_THEME_CACHE = 'memorium_journal_theme_'; // + journalId

  function cfg() {
    return window.MemoriumThemeConfig;
  }

  function getDefaultTheme() {
    const c = cfg();
    return c ? c.DEFAULT_THEME : 'classic-leather';
  }

  function normalizeId(raw) {
    const c = cfg();
    if (!c) return raw || 'classic-leather';
    return c.resolveThemeId(raw);
  }

  function isValidTheme(id) {
    const c = cfg();
    return c ? !!c.THEMES[id] : false;
  }

  function getThemeData(id) {
    const c = cfg();
    if (!c) return null;
    return c.THEMES[id] || c.THEMES[c.DEFAULT_THEME];
  }

  // ---- Persistence ----
  function getSavedTheme() {
    try {
      // Prefer new key, fall back to legacy
      let v = localStorage.getItem(STORAGE_KEY);
      if (!v) v = localStorage.getItem(LEGACY_KEY);
      if (!v) return null;
      // If invalid, try resolve (handles legacy 4 themes)
      const resolved = normalizeId(v);
      // Check if original was invalid and resolved to default — treat as invalid if not in config and not legacy
      const c = cfg();
      if (c && !c.THEMES[v] && !c.LEGACY_MAP[v]) {
        // Check if v is one of new themes? normalize will map unknown to default; detect unknown
        if (!c.ALL_THEME_IDS.includes(v)) return null;
      }
      return c && c.isValidTheme(resolved) ? resolved : c && c.THEMES[resolved] ? resolved : null;
    } catch (_) {
      return null;
    }
  }

  function saveTheme(themeId) {
    try {
      localStorage.setItem(STORAGE_KEY, themeId);
      // Remove legacy key to avoid competing keys (spec says don't create multiple competing keys)
      try {
        localStorage.removeItem(LEGACY_KEY);
      } catch (_) {}
    } catch (_) {}
  }

  function getJournalCachedTheme(journalId) {
    if (!journalId) return null;
    try {
      return localStorage.getItem(JOURNAL_THEME_CACHE + journalId);
    } catch (_) {
      return null;
    }
  }
  function setJournalCachedTheme(journalId, themeId) {
    if (!journalId) return;
    try {
      localStorage.setItem(JOURNAL_THEME_CACHE + journalId, themeId);
    } catch (_) {}
  }

  // ---- Apply via CSS variables ----
  function applyCSSVariables(themeId) {
    const data = getThemeData(themeId);
    if (!data) return;
    const col = data.colors;
    const root = document.documentElement;

    // Core diary variables — used throughout diary via var(--theme-*)
    root.style.setProperty('--theme-cover', col.cover);
    root.style.setProperty('--theme-cover-edge', col.coverEdge);
    root.style.setProperty('--theme-cover-inner', col.coverInner);
    root.style.setProperty('--theme-paper', col.paper);
    root.style.setProperty('--theme-paper-secondary', col.paperSecondary);
    root.style.setProperty('--theme-paper-edge', col.paperEdge);
    root.style.setProperty('--theme-text', col.text);
    root.style.setProperty('--theme-text-muted', col.textMuted);
    root.style.setProperty('--theme-text-light', col.textLight);
    root.style.setProperty('--theme-accent', col.accent);
    root.style.setProperty('--theme-accent-light', col.accentLight);
    root.style.setProperty('--theme-border', col.border);
    root.style.setProperty('--theme-shadow', col.shadow);
    root.style.setProperty('--theme-ribbon', col.ribbon);
    root.style.setProperty('--theme-bookmark', col.bookmark);
    root.style.setProperty('--theme-button-bg', col.buttonBg);
    root.style.setProperty('--theme-button-text', col.buttonText);

    // Also set page-specific vars for themes.css to use as fallback
    root.style.setProperty('--page-bg', col.paper);
    root.style.setProperty('--page-text', col.text);
    root.style.setProperty('--page-accent', col.accent);
    root.style.setProperty('--page-border', col.border);
  }

  function applyThemeAttributes(themeId) {
    const resolved = normalizeId(themeId);
    document.body.setAttribute('data-theme', resolved);
    document.documentElement.setAttribute('data-theme', resolved);
    // Family attribute for broader selectors
    const data = getThemeData(resolved);
    if (data) document.body.setAttribute('data-theme-family', data.family);

    // Notebook container
    const notebook = document.querySelector('.notebook');
    if (notebook) {
      notebook.setAttribute('data-theme', resolved);
      if (data) notebook.setAttribute('data-theme-family', data.family);
    }
    // Individual pages
    document.querySelectorAll('.notebook-page, .page').forEach(el => {
      el.setAttribute('data-theme', resolved);
      if (data) el.setAttribute('data-theme-family', data.family);
      // also keep class for legacy
      el.className = el.className.replace(/\btheme-[\w-]+\b/g, '').trim();
      el.classList.add('theme-' + resolved);
    });
  }

  // Main apply — instant, no API wait
  function applyTheme(themeId, opts) {
    opts = opts || {};
    const c = cfg();
    if (!c) return;
    let resolved = normalizeId(themeId);
    if (!c.isValidTheme(resolved)) resolved = c.DEFAULT_THEME;

    applyCSSVariables(resolved);
    applyThemeAttributes(resolved);
    if (opts.persist !== false) saveTheme(resolved);
    highlightSelection(resolved);
    // Sync with notebook state if available
    if (
      window.MemoriumNotebook &&
      typeof window.MemoriumNotebook.applyThemeToCurrent === 'function' &&
      opts.syncNotebook !== false
    ) {
      // Only call if not already handling to avoid loop — we set flag
      if (!applyTheme._inNotebookSync) {
        applyTheme._inNotebookSync = true;
        try {
          window.MemoriumNotebook.applyThemeToCurrent(resolved);
        } catch (_) {}
        applyTheme._inNotebookSync = false;
      }
    }
    // Journal DB persistence — if authed and journal exists, update journal themeId
    if (opts.persistJournal !== false) persistJournalTheme(resolved);

    document.dispatchEvent(
      new CustomEvent('memorium:themechange', {
        detail: { theme: resolved, themeId: resolved, family: getThemeData(resolved).family },
      })
    );

    // Update selector preview if open
    updatePreview(resolved);
    return resolved;
  }

  async function persistJournalTheme(themeId) {
    try {
      const journalId = getCurrentJournalId();
      if (!journalId) return;
      if (!window.MemoriumAPI || !window.MemoriumAPI.isAuthed()) return;
      // Check journal still owned
      setJournalCachedTheme(journalId, themeId);
      // Debounce? do immediate but catch errors
      await window.MemoriumAPI.updateJournal(journalId, { themeId: themeId });
    } catch (_) {
      // silently fail — localStorage remains source for now
    }
  }

  function getCurrentJournalId() {
    try {
      const qs = new URLSearchParams(window.location.search).get('journalId');
      if (qs) return qs;
      return localStorage.getItem('memorium-current-journal');
    } catch (_) {
      return null;
    }
  }

  async function restoreJournalTheme() {
    const journalId = getCurrentJournalId();
    if (!journalId) return null;
    if (!window.MemoriumAPI || !window.MemoriumAPI.isAuthed()) {
      // Check cached journal theme
      const cached = getJournalCachedTheme(journalId);
      if (cached && isValidTheme(cached)) return cached;
      return null;
    }
    try {
      const res = await window.MemoriumAPI.getJournal(journalId);
      const j = res.data || res;
      if (j && j.themeId && isValidTheme(j.themeId)) {
        setJournalCachedTheme(journalId, j.themeId);
        return j.themeId;
      }
      // Check for legacy cover color? not needed
      return null;
    } catch (_) {
      const cached = getJournalCachedTheme(journalId);
      if (cached && isValidTheme(cached)) return cached;
      return null;
    }
  }

  // ---- UI: Family Selector ----
  let selectedFamily = null;
  let activeThemeId = null;

  function highlightSelection(themeId) {
    activeThemeId = themeId;
    const data = getThemeData(themeId);
    if (data) selectedFamily = data.family;
    // Update dots / family buttons
    document.querySelectorAll('.theme-dot').forEach(d => {
      const on = d.dataset.theme === themeId;
      d.classList.toggle('active', on);
      d.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.querySelectorAll('.family-btn').forEach(b => {
      const on = b.dataset.family === selectedFamily;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    document.querySelectorAll('.theme-card').forEach(c => {
      const on = c.dataset.theme === themeId;
      c.classList.toggle('selected', on);
      c.setAttribute('aria-pressed', on ? 'true' : 'false');
      const check = c.querySelector('.theme-card-check');
      if (check) check.style.opacity = on ? '1' : '0';
      const label = c.querySelector('.theme-card-selected-label');
      if (label) label.style.display = on ? 'inline' : 'none';
    });
    updatePreview(themeId);
  }

  function updatePreview(themeId) {
    const preview = document.getElementById('theme-preview');
    if (!preview) return;
    const data = getThemeData(themeId);
    if (!data) return;
    const col = data.colors;
    const cover = preview.querySelector('.theme-preview-cover');
    const paper = preview.querySelector('.theme-preview-paper');
    const accent = preview.querySelector('.theme-preview-accent');
    const textLine1 = preview.querySelector('.theme-preview-text-line--1');
    const textLine2 = preview.querySelector('.theme-preview-text-line--2');
    const ribbon = preview.querySelector('.theme-preview-ribbon');
    if (cover)
      cover.style.background =
        'linear-gradient(135deg, ' + col.cover + ' 0%, ' + col.coverEdge + ' 100%)';
    if (paper) paper.style.background = col.paper;
    if (paper) paper.style.borderColor = col.border;
    if (accent) accent.style.background = col.accent;
    if (textLine1) textLine1.style.background = col.text;
    if (textLine2) textLine2.style.background = col.textMuted;
    if (ribbon) ribbon.style.background = col.ribbon;
    const nameEl = preview.querySelector('.theme-preview-name');
    const familyEl = preview.querySelector('.theme-preview-family');
    if (nameEl) nameEl.textContent = data.name;
    if (familyEl) familyEl.textContent = data.family.charAt(0).toUpperCase() + data.family.slice(1);
    if (familyEl) familyEl.style.color = col.accent;
    const applyBtn = preview.querySelector('.theme-preview-apply');
    if (applyBtn) {
      applyBtn.style.background = col.buttonBg;
      applyBtn.style.color = col.buttonText;
      applyBtn.style.borderColor = col.coverEdge;
    }
  }

  function buildThemeSelector() {
    const c = cfg();
    if (!c) return null;
    if (document.getElementById('theme-family-system'))
      return document.getElementById('theme-family-system');

    const notebook = document.querySelector('.notebook');
    if (!notebook) return null;

    const wrapper = document.createElement('div');
    wrapper.id = 'theme-family-system';
    wrapper.className = 'theme-family-system';
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Diary theme selector');

    // Determine active
    const saved = getSavedTheme() || getDefaultTheme();
    const resolvedSaved = normalizeId(saved);
    const activeData = getThemeData(resolvedSaved);
    selectedFamily = activeData ? activeData.family : c.FAMILIES[4].id; // brown default
    activeThemeId = resolvedSaved;

    wrapper.innerHTML = `
      <div class="theme-system-header">
        <span class="theme-system-paper-icon" aria-hidden="true">📖</span>
        <div>
          <h3 class="theme-system-title">Theme</h3>
          <p class="theme-system-subtitle">Choose your diary color</p>
        </div>
        <button type="button" class="theme-system-close" aria-label="Collapse themes" title="Collapse">—</button>
      </div>

      <div class="theme-families" role="toolbar" aria-label="Theme families"></div>

      <div class="theme-cards-grid" role="group" aria-label="Themes in family"></div>

      <div id="theme-preview" class="theme-preview" aria-live="polite">
        <div class="theme-preview-mini">
          <div class="theme-preview-cover">
            <div class="theme-preview-ribbon" aria-hidden="true"></div>
            <div class="theme-preview-spine" aria-hidden="true"></div>
          </div>
          <div class="theme-preview-paper">
            <div class="theme-preview-text-line theme-preview-text-line--1"></div>
            <div class="theme-preview-text-line theme-preview-text-line--2"></div>
            <div class="theme-preview-text-line theme-preview-text-line--3"></div>
            <div class="theme-preview-accent" aria-hidden="true"></div>
          </div>
        </div>
        <div class="theme-preview-info">
          <span class="theme-preview-family"></span>
          <span class="theme-preview-name"></span>
          <span class="theme-preview-desc" style="font-size:.72rem;color:var(--theme-text-muted,#6E6259);display:block;margin-top:2px"></span>
        </div>
        <button type="button" class="theme-preview-apply" aria-label="Apply selected theme">Apply Theme</button>
      </div>
    `;

    // Populate families
    const familiesEl = wrapper.querySelector('.theme-families');
    c.FAMILIES.forEach(fam => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'family-btn';
      btn.dataset.family = fam.id;
      btn.setAttribute('aria-label', fam.name + ' family');
      btn.setAttribute('aria-pressed', fam.id === selectedFamily ? 'true' : 'false');
      if (fam.id === selectedFamily) btn.classList.add('active');
      btn.innerHTML = `
        <span class="family-swatch" style="background:${fam.swatch}; ${fam.id === selectedFamily ? 'box-shadow:0 0 0 3px rgba(201,162,39,0.3), inset 0 1px 2px rgba(0,0,0,0.12);' : ''}"></span>
        <span class="family-name">${fam.name}</span>
      `;
      btn.addEventListener('click', () => {
        selectedFamily = fam.id;
        // Update active state
        wrapper.querySelectorAll('.family-btn').forEach(b => {
          const on = b.dataset.family === selectedFamily;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        renderThemeCards(wrapper, selectedFamily);
        // Auto preview first theme in family if none active in family, else keep active
        const familyThemes = c.getFamilyThemes(selectedFamily);
        const activeInFamily = familyThemes.find(t => t.id === activeThemeId);
        const toPreview = activeInFamily ? activeInFamily.id : familyThemes[0].id;
        updatePreview(toPreview);
        // Highlight preview but not yet apply — spec says preview before applying. We update preview only.
        // But also update card selection highlight to show which is previewing
        wrapper.querySelectorAll('.theme-card').forEach(card => {
          const isPreview = card.dataset.theme === toPreview;
          card.classList.toggle('previewing', isPreview);
        });
      });
      familiesEl.appendChild(btn);
    });

    // Render initial cards
    renderThemeCards(wrapper, selectedFamily);

    // Preview apply button
    const applyBtn = wrapper.querySelector('.theme-preview-apply');
    applyBtn.addEventListener('click', () => {
      const previewName = wrapper.querySelector('.theme-preview-name').textContent;
      // Find previewed theme id (from name)
      const previewId =
        Object.values(c.THEMES).find(t => t.name === previewName)?.id || activeThemeId;
      applyTheme(previewId);
    });

    // Collapse toggle
    const closeBtn = wrapper.querySelector('.theme-system-close');
    let collapsed = false;
    closeBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      wrapper.classList.toggle('collapsed', collapsed);
      closeBtn.textContent = collapsed ? '+' : '—';
      closeBtn.setAttribute('aria-label', collapsed ? 'Expand themes' : 'Collapse themes');
    });

    // Keyboard: focus trap not needed, but ensure buttons are accessible

    // Insert before notebook
    const parent = notebook.parentNode;
    parent.insertBefore(wrapper, notebook);

    // Also keep legacy theme bar for backwards compat — hide it
    const legacyBar = document.querySelector('.theme-bar');
    if (legacyBar && legacyBar.id !== 'theme-family-system') legacyBar.style.display = 'none';

    updatePreview(activeThemeId);
    return wrapper;
  }

  function renderThemeCards(wrapper, familyId) {
    const c = cfg();
    const grid = wrapper.querySelector('.theme-cards-grid');
    grid.innerHTML = '';
    const themes = c.getFamilyThemes(familyId);
    themes.forEach(t => {
      const col = t.colors;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'theme-card';
      card.dataset.theme = t.id;
      card.setAttribute('aria-label', t.name + ', ' + familyId + ' family');
      card.setAttribute('aria-pressed', t.id === activeThemeId ? 'true' : 'false');
      if (t.id === activeThemeId) card.classList.add('selected');
      card.innerHTML = `
        <span class="theme-card-preview" aria-hidden="true" style="background:${col.paper};border-color:${col.border}">
          <span class="theme-card-cover" style="background: linear-gradient(135deg, ${col.cover} 0%, ${col.coverEdge} 100%)"></span>
          <span class="theme-card-paper-lines">
            <span style="background:${col.text};opacity:.9"></span>
            <span style="background:${col.textMuted};opacity:.6"></span>
            <span style="background:${col.border};opacity:.8"></span>
          </span>
          <span class="theme-card-accent" style="background:${col.accent}"></span>
          <span class="theme-card-ribbon" style="background:${col.ribbon}"></span>
          <span class="theme-card-check" aria-hidden="true" style="opacity:${t.id === activeThemeId ? '1' : '0'}">✓</span>
        </span>
        <span class="theme-card-name">${t.name}</span>
        <span class="theme-card-selected-label" style="display:${t.id === activeThemeId ? 'inline' : 'none'}">✓ Selected</span>
      `;
      card.addEventListener('click', () => {
        // Preview immediately on card click — but apply instantly per spec "instant"
        // Spec says preview before applying — we support both: click applies instantly, hover previews
        applyTheme(t.id);
      });
      card.addEventListener('mouseenter', () => {
        // Hover preview without applying — show preview pane
        updatePreview(t.id);
        wrapper.querySelectorAll('.theme-card').forEach(c2 => c2.classList.remove('previewing'));
        card.classList.add('previewing');
        const descEl = wrapper.querySelector('.theme-preview-desc');
        if (descEl) descEl.textContent = t.description;
      });
      card.addEventListener('focus', () => {
        updatePreview(t.id);
      });
      grid.appendChild(card);
    });
    // Update desc
    const activeTheme = themes.find(t => t.id === activeThemeId);
    const descEl = wrapper.querySelector('.theme-preview-desc');
    if (descEl && activeTheme) descEl.textContent = activeTheme.description;
  }

  // Ensure old theme bar logic still works for callers using THEMES alias
  function ensureThemeBar() {
    // New system replaces old bar, but create new if not present
    if (!document.getElementById('theme-family-system') && document.querySelector('.notebook')) {
      buildThemeSelector();
    }
  }

  async function init() {
    const c = cfg();
    if (!c) return;

    // Try journal theme first (DB source of truth), then localStorage, then default
    let chosen = null;
    const journalTheme = await restoreJournalTheme();
    if (journalTheme) {
      chosen = journalTheme;
      // Migrate local storage to match journal theme
      saveTheme(chosen);
    } else {
      const saved = getSavedTheme();
      chosen = saved ? normalizeId(saved) : getDefaultTheme();
      // If saved was legacy, migrate value
      if (saved && saved !== chosen) saveTheme(chosen);
      if (!isValidTheme(chosen)) chosen = getDefaultTheme();
    }

    // Apply before building UI so no flash
    applyCSSVariables(chosen);
    applyThemeAttributes(chosen);
    activeThemeId = chosen;
    const data = getThemeData(chosen);
    if (data) selectedFamily = data.family;

    buildThemeSelector();
    highlightSelection(chosen);
    document.dispatchEvent(
      new CustomEvent('memorium:themechange', {
        detail: { theme: chosen, themeId: chosen, family: data ? data.family : null },
      })
    );

    // If notebook state exists, ensure its pages reflect theme
    if (window.MemoriumNotebook && window.MemoriumNotebook.getState) {
      try {
        const s = window.MemoriumNotebook.getState();
        if (s && s.pages) {
          // For local mode, update all pages' theme to chosen? No — keep per-page but default new pages to chosen
          // We don't overwrite existing decorations; page themes stay as-is for backward compat
        }
      } catch (_) {}
    }

    // Listen for journal navigation changes
    window.addEventListener('memorium:journalchange', async () => {
      const jt = await restoreJournalTheme();
      if (jt) applyTheme(jt);
    });
  }

  // Expose global
  const THEMES_LEGACY = {
    parchment: { label: 'Parchment' },
    vintage: { label: 'Vintage' },
    aged: { label: 'Aged' },
    handwritten: { label: 'Handwritten' },
  };

  window.MemoriumTheme = {
    THEMES: THEMES_LEGACY, // keep legacy shape for compatibility
    DEFAULT_THEME: getDefaultTheme(),
    getSavedTheme,
    applyTheme,
    resolveThemeId: normalizeId,
    isValidTheme,
    getThemeData,
    ensureThemeBar,
    buildThemeSelector,
    getCurrentFamily: () => selectedFamily,
    getActiveTheme: () => activeThemeId,
    ALL_THEME_IDS: cfg() ? cfg().ALL_THEME_IDS : [],
  };

  // Compat: also expose applyThemeToCurrent delegation target
  document.addEventListener('DOMContentLoaded', () => {
    // Delay to let themeConfig load if script order mixed
    setTimeout(init, 0);
  });

  // Handle theme change from notebook
  document.addEventListener('memorium:themechange-notebook', e => {
    if (e.detail && e.detail.theme) highlightSelection(e.detail.theme);
  });
})();
