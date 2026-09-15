/* ============================================================
   MEMORIUM — Notebook Interactivity (STEP 4)
   Plain JS — No frameworks, no external deps.
   Features: page turning, editing, theming, ambience-ready,
   decorations, localStorage persistence, page creation.
   ============================================================ */
(function () {
  'use strict';

  // ============================================================
  // STATE & CONFIGURATION
  // ============================================================
  const STORAGE_KEY = 'memorium-state-v2';
  const LEGACY_PREFIX = 'memorium-page-';

  const MOODS = [
    { id: 'happy', label: 'Happy', icon: '😊' },
    { id: 'calm', label: 'Calm', icon: '😌' },
    { id: 'sad', label: 'Sad', icon: '😢' },
    { id: 'angry', label: 'Angry', icon: '😡' },
    { id: 'loved', label: 'Loved', icon: '❤️' },
    { id: 'tired', label: 'Tired', icon: '😴' },
  ];
  const WEATHERS = [
    { id: 'sunny', label: 'Sunny', icon: '☀️' },
    { id: 'rainy', label: 'Rainy', icon: '🌧' },
    { id: 'cloudy', label: 'Cloudy', icon: '☁️' },
    { id: 'night', label: 'Night', icon: '🌙' },
  ];
  const DEFAULT_PAGES = [
    {
      id: 12,
      title: 'Friday, February 14, 2026',
      theme: 'classic-leather',
      paper: 'plain',
      date: null,
      mood: null,
      weather: null,
      location: '',
      content: null,
      decorations: [],
    },
    {
      id: 13,
      title: 'Friday, February 14, 2026',
      theme: 'classic-leather',
      paper: 'plain',
      date: null,
      mood: null,
      weather: null,
      location: '',
      content: null,
      decorations: [],
    },
  ];

  // Decorations catalog
  const STICKER_SET = ['🌸', '🍂', '⭐', '✨', '🌿', '🍁', '💌', '🕊️'];
  let state = {
    currentPageIndex: 0,
    pages: JSON.parse(JSON.stringify(DEFAULT_PAGES)),
    nextId: 14,
  };

  // View mode: 'single' (1 page) or 'spread' (2 pages) — beside searchbar
  const VIEW_STORAGE_KEY = 'memorium_view_mode';
  let viewMode = (function () {
    try {
      const v = localStorage.getItem(VIEW_STORAGE_KEY);
      if (v === 'single' || v === 'spread') return v;
    } catch (_) {}
    return 'spread';
  })();
  function isSingleView() {
    return viewMode === 'single';
  }
  function getViewMode() {
    return viewMode;
  }
  function setViewMode(mode) {
    if (mode !== 'single' && mode !== 'spread') return false;
    viewMode = mode;
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, viewMode);
    } catch (_) {}
    if (notebookEl) {
      notebookEl.classList.toggle('view-single', isSingleView());
      notebookEl.classList.toggle('view-spread', !isSingleView());
      notebookEl.dataset.view = viewMode;
    }
    updateViewToggleUI();
    renderCurrentPage();
    updateNavButtons();
    document.dispatchEvent(new CustomEvent('memorium:viewchange', { detail: { view: viewMode } }));
    return true;
  }
  function updateViewToggleUI() {
    document.querySelectorAll('.view-btn').forEach(btn => {
      const on = btn.dataset.view === viewMode;
      btn.setAttribute('aria-pressed', String(on));
      btn.style.background = on ? '#FFFEFB' : 'transparent';
      btn.style.borderColor = on ? 'rgba(201,162,39,0.32)' : 'transparent';
      btn.style.boxShadow = on
        ? '0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)'
        : 'none';
      btn.style.color = on ? '#2F241F' : '#6E6259';
    });
  }

  // Elements
  let notebookEl = null;
  let leftPageEl = null;
  let rightPageEl = null;
  const writingAreas = {}; // id -> element
  let navPrev = null;
  let navNext = null;
  let decorationBar = null;

  // ============================================================
  // PERSISTENCE — clean structure ready for API replacement
  // ============================================================
  function normalizeTheme(t) {
    if (window.MemoriumThemeConfig && window.MemoriumThemeConfig.resolveThemeId) {
      return window.MemoriumThemeConfig.resolveThemeId(t);
    }
    return t || 'classic-leather';
  }
  function normalizePaper(p) {
    if (window.MemoriumPaperConfig && window.MemoriumPaperConfig.normalizePaper) {
      return window.MemoriumPaperConfig.normalizePaper(p);
    }
    const allowed = ['plain', 'ruled', 'dotted', 'grid', 'vintage', 'handmade', 'torn'];
    if (!p) return 'plain';
    return allowed.includes(p) ? p : 'plain';
  }
  function normalizeMood(m) {
    if (m == null || m === '') return null;
    const id = String(m).trim().toLowerCase();
    return MOODS.some(x => x.id === id) ? id : null;
  }
  function normalizeWeather(w) {
    if (w == null || w === '') return null;
    const id = String(w).trim().toLowerCase();
    return WEATHERS.some(x => x.id === id) ? id : null;
  }
  function normalizeLocation(loc) {
    if (loc == null) return '';
    return String(loc)
      .replace(/<[^>]*>/g, '')
      .trim()
      .slice(0, 120);
  }
  function normalizeDate(d) {
    if (d == null || d === '') return null;
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? null : dt.toISOString();
  }
  function formatDateForDisplay(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    // Example: 14 September 2026
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function formatDateForInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.pages) && parsed.pages.length) {
          state = parsed;
          // ensure nextId exists
          if (!state.nextId) state.nextId = Math.max(...state.pages.map(p => p.id)) + 1;
          // migrate old theme/paper ids to new + ensure metadata defaults
          let needsSave = false;
          state.pages.forEach(p => {
            const before = p.theme;
            p.theme = normalizeTheme(p.theme);
            if (before !== p.theme) needsSave = true;
            const beforePaper = p.paper;
            p.paper = normalizePaper(p.paper);
            if (beforePaper !== p.paper) needsSave = true;
            // metadata — ensure optional fields exist and normalized
            if (!('date' in p)) {
              p.date = null;
              needsSave = true;
            } else {
              const nd = normalizeDate(p.date);
              if (nd !== p.date) {
                p.date = nd;
                needsSave = true;
              }
            }
            if (!('mood' in p)) {
              p.mood = null;
              needsSave = true;
            } else {
              const nm = normalizeMood(p.mood);
              if (nm !== p.mood) {
                p.mood = nm;
                needsSave = true;
              }
            }
            if (!('weather' in p)) {
              p.weather = null;
              needsSave = true;
            } else {
              const nw = normalizeWeather(p.weather);
              if (nw !== p.weather) {
                p.weather = nw;
                needsSave = true;
              }
            }
            if (!('location' in p)) {
              p.location = '';
              needsSave = true;
            } else {
              const nl = normalizeLocation(p.location);
              if (nl !== p.location) {
                p.location = nl;
                needsSave = true;
              }
            }
          });
          if (needsSave) saveState();
          return;
        }
      }
    } catch (_) {}
    // migrate legacy per-page content keys if present
    let migrated = false;
    state.pages.forEach(p => {
      try {
        const legacy = localStorage.getItem(LEGACY_PREFIX + p.id);
        if (legacy && !p.content) {
          p.content = legacy;
          migrated = true;
        }
        const themeLegacy = localStorage.getItem(LEGACY_PREFIX + p.id + '-theme');
        if (themeLegacy) {
          p.theme = normalizeTheme(themeLegacy);
          migrated = true;
        }
        const decoLegacy = localStorage.getItem(LEGACY_PREFIX + p.id + '-decorations');
        if (decoLegacy) {
          p.decorations = JSON.parse(decoLegacy);
          migrated = true;
        }
        // normalize already
        p.theme = normalizeTheme(p.theme);
        p.paper = normalizePaper(p.paper);
        // metadata defaults
        if (!('date' in p) || p.date === undefined) p.date = null;
        else p.date = normalizeDate(p.date);
        if (!('mood' in p) || p.mood === undefined) p.mood = null;
        else p.mood = normalizeMood(p.mood);
        if (!('weather' in p) || p.weather === undefined) p.weather = null;
        else p.weather = normalizeWeather(p.weather);
        if (!('location' in p) || p.location === undefined) p.location = '';
        else p.location = normalizeLocation(p.location);
      } catch (_) {}
    });
    if (migrated) saveState();
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
    // also keep per-page legacy for debugging? not needed
  }

  function getCurrentPage() {
    return state.pages[state.currentPageIndex];
  }

  // ============================================================
  // PAGE CONTENT — save/load
  // ============================================================
  function savePage() {
    const page = getCurrentPage();
    if (!page) return;
    // Save only visible spread's writing areas (avoid stale cross-contamination for N>2)
    // For N>2 we reuse DOM slots, so only the pages currently shown have live DOM
    const spreadStart = Math.floor(state.currentPageIndex / 2) * 2;
    const visible = [state.pages[spreadStart], state.pages[spreadStart + 1]].filter(Boolean);
    visible.forEach(p => {
      // Prefer slot's current area (handles reuse)
      const slotEl =
        p.id === (state.pages[spreadStart] && state.pages[spreadStart].id)
          ? leftPageEl
          : rightPageEl;
      const slotArea = slotEl ? slotEl.querySelector('.page-writing-area') : null;
      const area = slotArea || writingAreas[p.id];
      if (area) p.content = area.innerHTML;
    });
    // Also ensure fallback: if no spread (edge case), try all writingAreas
    if (!visible.length) {
      state.pages.forEach(p => {
        const area = writingAreas[p.id];
        if (area && document.body.contains(area)) p.content = area.innerHTML;
      });
    }
    saveState();
  }

  function loadPage(index) {
    if (index < 0 || index >= state.pages.length) return false;
    // save current before switching
    savePage();
    state.currentPageIndex = index;
    saveState();
    renderCurrentPage();
    updateNavButtons();
    updatePageNumbers();
    renderNavigationHints();
    return true;
  }

  // Legacy name alias
  function loadPageState() {
    loadState();
  }

  // ============================================================
  // RENDER
  // ============================================================
  function renderCurrentPage() {
    const page = getCurrentPage();
    if (!page || !leftPageEl || !rightPageEl) return;

    // Single vs spread view
    if (isSingleView()) {
      // Show only current page centered in left slot, hide right
      rightPageEl.style.display = 'none';
      leftPageEl.style.display = '';
      const p = page;
      p.theme = normalizeTheme(p.theme);
      p.paper = normalizePaper(p.paper);
      leftPageEl.dataset.page = String(p.id);
      leftPageEl.dataset.theme = p.theme || 'classic-leather';
      leftPageEl.dataset.paper = p.paper || 'plain';
      leftPageEl.className = leftPageEl.className.replace(/\btheme-[a-z0-9-]+\b/g, '').trim();
      leftPageEl.classList.add('theme-' + (p.theme || 'classic-leather'));
      leftPageEl.className = leftPageEl.className.replace(/\bpaper-[a-z0-9-]+\b/g, '').trim();
      leftPageEl.classList.add('paper-' + (p.paper || 'plain'));
      let pat = leftPageEl.querySelector('.paper-pattern');
      if (!pat) {
        pat = document.createElement('div');
        pat.className = 'paper-pattern';
        pat.setAttribute('aria-hidden', 'true');
        leftPageEl.insertBefore(pat, leftPageEl.firstChild);
      }
      if (window.MemoriumThemeConfig && window.MemoriumThemeConfig.THEMES[p.theme]) {
        leftPageEl.dataset.themeFamily = window.MemoriumThemeConfig.THEMES[p.theme].family;
      }
      const slotArea = leftPageEl.querySelector('.page-writing-area');
      if (slotArea) {
        writingAreas[p.id] = slotArea;
        if (p.content != null) slotArea.innerHTML = p.content;
      } else {
        const area = writingAreas[p.id];
        if (area && p.content != null) area.innerHTML = p.content;
      }
      const numEl = leftPageEl.querySelector('.page-number');
      if (numEl) numEl.textContent = p.pageNumber != null ? p.pageNumber : p.id;
      ensureMetadataBar(leftPageEl, p);
      // Hide right metadata
      const rBar = rightPageEl.querySelector('.page-metadata-bar');
      if (rBar) rBar.style.display = 'none';
      leftPageEl.classList.add('page-active');
      rightPageEl.classList.remove('page-active');
      if (notebookEl) {
        notebookEl.dataset.current = String(p.id);
        notebookEl.classList.add('view-single');
        notebookEl.classList.remove('view-spread');
        notebookEl.dataset.view = 'single';
      }
      renderDecorations();
      if (window.MemoriumTheme) {
        const curTheme = normalizeTheme(p.theme || 'classic-leather');
        document.querySelectorAll('.theme-dot').forEach(d => {
          d.classList.toggle('active', d.dataset.theme === curTheme);
        });
      }
      return;
    } else {
      if (notebookEl) {
        notebookEl.classList.remove('view-single');
        notebookEl.classList.add('view-spread');
        notebookEl.dataset.view = 'spread';
      }
    }

    // Open-book spread for N pages: show two facing pages per spread
    // For N>2 we reuse the two DOM slots and swap content (no new DOM)
    const spreadStart = Math.floor(state.currentPageIndex / 2) * 2;
    const leftPage = state.pages[spreadStart] || null;
    const rightPage = state.pages[spreadStart + 1] || null;

    [leftPage, rightPage].forEach((p, idx) => {
      const el = idx === 0 ? leftPageEl : rightPageEl;
      if (!p) {
        el.style.display = 'none';
        return;
      }
      el.style.display = '';
      p.theme = normalizeTheme(p.theme);
      p.paper = normalizePaper(p.paper);
      el.dataset.page = String(p.id);
      el.dataset.theme = p.theme || 'classic-leather';
      el.dataset.paper = p.paper || 'plain';
      // Remove any old theme-* class and add new (avoid touching theme-family-system etc)
      el.className = el.className.replace(/\btheme-[a-z0-9-]+\b/g, '').trim();
      el.classList.add('theme-' + (p.theme || 'classic-leather'));
      // Paper class
      el.className = el.className.replace(/\bpaper-[a-z0-9-]+\b/g, '').trim();
      el.classList.add('paper-' + (p.paper || 'plain'));
      // Ensure paper pattern element
      let pat = el.querySelector('.paper-pattern');
      if (!pat) {
        pat = document.createElement('div');
        pat.className = 'paper-pattern';
        pat.setAttribute('aria-hidden', 'true');
        el.insertBefore(pat, el.firstChild);
      }
      // Set family for CSS
      if (window.MemoriumThemeConfig && window.MemoriumThemeConfig.THEMES[p.theme]) {
        el.dataset.themeFamily = window.MemoriumThemeConfig.THEMES[p.theme].family;
      }
      // Map writing area — reuse slot's area for the page currently shown
      const slotArea = el.querySelector('.page-writing-area');
      if (slotArea) {
        writingAreas[p.id] = slotArea;
        if (p.content != null) slotArea.innerHTML = p.content;
      } else {
        const area = writingAreas[p.id];
        if (area && p.content != null) area.innerHTML = p.content;
      }
      const numEl = el.querySelector('.page-number');
      if (numEl) numEl.textContent = p.pageNumber != null ? p.pageNumber : p.id;
      ensureMetadataBar(el, p);
    });

    // Hide metadata on hidden slot if any
    if (!rightPage) {
      const rBar = rightPageEl.querySelector('.page-metadata-bar');
      if (rBar) rBar.style.display = 'none';
    } else {
      const rBar = rightPageEl.querySelector('.page-metadata-bar');
      if (rBar) rBar.style.display = '';
    }
    if (!leftPage) {
      const lBar = leftPageEl.querySelector('.page-metadata-bar');
      if (lBar) lBar.style.display = 'none';
    }

    // highlight current page with subtle focus (within spread)
    const isLeftActive = state.currentPageIndex % 2 === 0;
    leftPageEl.classList.toggle('page-active', !!leftPage && isLeftActive);
    rightPageEl.classList.toggle('page-active', !!rightPage && !isLeftActive);
    if (notebookEl) notebookEl.dataset.current = String(page.id);

    renderDecorations();
    // notify theme manager of current theme
    if (window.MemoriumTheme) {
      // set dot highlight to current page theme
      const curTheme = normalizeTheme(page.theme || 'classic-leather');
      document.querySelectorAll('.theme-dot').forEach(d => {
        d.classList.toggle('active', d.dataset.theme === curTheme);
      });
    }
  }

  // ============================================================
  // METADATA (Step 11I) — date, mood, weather, location per page
  // Subtle vintage bar, optional, persists via saveState + API
  // ============================================================
  function ensureMetadataBar(pageEl, page) {
    if (!pageEl || !page) return;
    let bar = pageEl.querySelector('.page-metadata-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'page-metadata-bar';
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', 'Page metadata');
      bar.innerHTML = `
        <label class="meta-field meta-field--date" title="Date">
          <span class="meta-icon" aria-hidden="true">📅</span>
          <input type="date" class="meta-input meta-date-input" aria-label="Date">
          <span class="meta-date-display" aria-hidden="true"></span>
        </label>
        <label class="meta-field meta-field--time" title="Time">
          <span class="meta-icon" aria-hidden="true">🕒</span>
          <input type="time" class="meta-input meta-time-input" aria-label="Time">
        </label>
        <span class="meta-divider" aria-hidden="true">·</span>
        <span class="meta-field meta-field--mood" role="group" aria-label="Mood">
          <span class="meta-icon" aria-hidden="true">😊</span>
          <span class="meta-mood-options"></span>
        </span>
        <span class="meta-divider" aria-hidden="true">·</span>
        <span class="meta-field meta-field--weather" role="group" aria-label="Weather">
          <span class="meta-icon" aria-hidden="true">☀️</span>
          <span class="meta-weather-options"></span>
        </span>
        <span class="meta-divider" aria-hidden="true">·</span>
        <label class="meta-field meta-field--location" title="Location">
          <span class="meta-icon" aria-hidden="true">📍</span>
          <input type="text" class="meta-input meta-location-input" placeholder="NSU" maxlength="120" aria-label="Location" autocomplete="off">
        </label>
      `;
      // Insert after page-header or before divider
      const header = pageEl.querySelector('.page-header');
      const divider = pageEl.querySelector('.page-divider');
      if (header && header.parentNode) {
        // place after header
        if (divider) header.parentNode.insertBefore(bar, divider);
        else header.parentNode.insertBefore(bar, header.nextSibling);
      } else {
        const content = pageEl.querySelector('.notebook-page-content');
        if (content) content.insertBefore(bar, content.firstChild);
        else pageEl.appendChild(bar);
      }
      // Build mood options
      const moodContainer = bar.querySelector('.meta-mood-options');
      MOODS.forEach(m => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'meta-mood-btn';
        btn.dataset.mood = m.id;
        btn.setAttribute('aria-label', m.label);
        btn.setAttribute('aria-pressed', 'false');
        btn.title = m.label;
        btn.textContent = m.icon;
        btn.addEventListener('click', () => handleMetadataChange(page, 'mood', m.id));
        moodContainer.appendChild(btn);
      });
      // Build weather options
      const weatherContainer = bar.querySelector('.meta-weather-options');
      WEATHERS.forEach(w => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'meta-weather-btn';
        btn.dataset.weather = w.id;
        btn.setAttribute('aria-label', w.label);
        btn.setAttribute('aria-pressed', 'false');
        btn.title = w.label;
        btn.textContent = w.icon;
        btn.addEventListener('click', () => handleMetadataChange(page, 'weather', w.id));
        weatherContainer.appendChild(btn);
      });
      // Date + Time inputs — combine to single ISO
      const dateInput = bar.querySelector('.meta-date-input');
      const timeInput = bar.querySelector('.meta-time-input');
      const getCombinedDateTime = () => {
        const dateVal = dateInput.value;
        const timeVal = timeInput.value;
        if (!dateVal && !timeVal) return null;
        if (!dateVal && timeVal) {
          // No date but time set: use today as date
          const today = new Date().toISOString().slice(0, 10);
          const t = timeVal || '00:00';
          const iso = new Date(`${today}T${t}:00`).toISOString();
          return isNaN(new Date(iso).getTime()) ? null : iso;
        }
        if (dateVal && !timeVal) {
          const iso = new Date(`${dateVal}T00:00:00`).toISOString();
          return isNaN(new Date(iso).getTime()) ? null : iso;
        }
        const iso = new Date(`${dateVal}T${timeVal}:00`).toISOString();
        return isNaN(new Date(iso).getTime()) ? null : iso;
      };
      dateInput.addEventListener('change', () => {
        const iso = getCombinedDateTime();
        handleMetadataChange(page, 'date', iso);
      });
      timeInput.addEventListener('change', () => {
        const iso = getCombinedDateTime();
        handleMetadataChange(page, 'date', iso);
      });
      // Also handle time input via input event for quicker feedback
      timeInput.addEventListener('input', () => {
        // Debounced? immediate for preview
        const iso = getCombinedDateTime();
        if (iso) handleMetadataChange(page, 'date', iso);
      });
      // Location input — debounced
      const locInput = bar.querySelector('.meta-location-input');
      let locTimer = null;
      locInput.addEventListener('input', e => {
        clearTimeout(locTimer);
        locTimer = setTimeout(() => handleMetadataChange(page, 'location', e.target.value), 600);
      });
      locInput.addEventListener('blur', e => {
        clearTimeout(locTimer);
        handleMetadataChange(page, 'location', e.target.value);
      });
      // Click on date display focuses input
      const dateDisplay = bar.querySelector('.meta-date-display');
      if (dateDisplay && dateInput) {
        dateDisplay.addEventListener('click', () =>
          dateInput.showPicker ? dateInput.showPicker() : dateInput.focus()
        );
      }
    }
    // Update values from page
    updateMetadataBar(bar, page);
  }

  function updateMetadataBar(bar, page) {
    if (!bar || !page) return;
    // Date + Time — combine to single ISO, display date + time
    const dateInput = bar.querySelector('.meta-date-input');
    const timeInput = bar.querySelector('.meta-time-input');
    const dateDisplay = bar.querySelector('.meta-date-display');
    const iso = page.date ? normalizeDate(page.date) : null;
    const display = iso ? formatDateForDisplay(iso) : '';
    const inputVal = iso ? formatDateForInput(iso) : '';
    const timeVal = iso ? new Date(iso).toISOString().slice(11, 16) : '';
    // Only show time if not midnight or if user explicitly set time (we show time if date exists)
    const showTime = iso ? timeVal : '';
    if (dateInput && dateInput.value !== inputVal) dateInput.value = inputVal;
    if (timeInput) {
      // Avoid overwriting when user is typing
      if (document.activeElement !== timeInput) {
        if (timeInput.value !== showTime) timeInput.value = showTime;
      }
      // Disable time if no date and no time set? Keep enabled for today fallback
      // Toggle has-value for time
      const hasTime = !!showTime && showTime !== '00:00';
      // Still show has-value if date exists
      bar.querySelector('.meta-field--time')?.classList.toggle('has-value', !!iso);
      // If iso is midnight, we still show 00:00 as placeholder but not has-value
      if (timeInput.value === '00:00' && !hasTime) {
        // Keep as 00:00 but not highlight
      }
    }
    if (dateDisplay) {
      // Combine date display with time if not midnight
      let displayWithTime = display || '—';
      if (iso && timeVal && timeVal !== '00:00') {
        // Format time as e.g., 2:30 PM
        try {
          const d = new Date(iso);
          const t = d.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          });
          displayWithTime = `${display} · ${t}`;
        } catch (_) {
          displayWithTime = `${display} ${timeVal}`;
        }
      }
      dateDisplay.textContent = displayWithTime;
      dateDisplay.title = display
        ? `Date: ${display}${timeVal && timeVal !== '00:00' ? ' ' + timeVal : ''} (click to edit)`
        : 'Add date';
      bar.querySelector('.meta-field--date').classList.toggle('has-value', !!iso);
    }
    // Mood
    const mood = normalizeMood(page.mood);
    bar.querySelectorAll('.meta-mood-btn').forEach(btn => {
      const on = btn.dataset.mood === mood;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    bar.querySelector('.meta-field--mood').classList.toggle('has-value', !!mood);
    // Weather
    const weather = normalizeWeather(page.weather);
    bar.querySelectorAll('.meta-weather-btn').forEach(btn => {
      const on = btn.dataset.weather === weather;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    bar.querySelector('.meta-field--weather').classList.toggle('has-value', !!weather);
    // Location
    const locInput = bar.querySelector('.meta-location-input');
    const loc = normalizeLocation(page.location);
    if (locInput && document.activeElement !== locInput) {
      if (locInput.value !== loc) locInput.value = loc;
    }
    bar.querySelector('.meta-field--location').classList.toggle('has-value', !!loc);
    // Update header indicators if present (page-indicators)
    const pageEl = bar.closest('.notebook-page');
    if (pageEl) {
      const moodIcon = pageEl.querySelector('.page-mood');
      const weatherIcon = pageEl.querySelector('.page-weather');
      if (moodIcon) {
        const m = MOODS.find(x => x.id === mood);
        moodIcon.textContent = m ? m.icon : '😊';
        moodIcon.style.opacity = m ? '1' : '0.35';
        moodIcon.title = m ? m.label : 'Mood';
      }
      if (weatherIcon) {
        const w = WEATHERS.find(x => x.id === weather);
        weatherIcon.textContent = w ? w.icon : '☀️';
        weatherIcon.style.opacity = w ? '1' : '0.35';
        weatherIcon.title = w ? w.label : 'Weather';
      }
    }
  }

  function handleMetadataChange(page, field, value) {
    if (!page) return;
    // Toggle off if same mood/weather clicked again (optional)
    if (field === 'mood' && page.mood === value) value = null;
    if (field === 'weather' && page.weather === value) value = null;
    if (field === 'mood') value = normalizeMood(value);
    if (field === 'weather') value = normalizeWeather(value);
    if (field === 'location') value = normalizeLocation(value);
    if (field === 'date') value = normalizeDate(value);
    // Update page in state (find by id reference)
    page[field] = value;
    // Also update state.pages reference (page is already reference, but ensure)
    saveState();
    // Update UI
    const pageEl =
      document.querySelector(`.notebook-page[data-page="${page.id}"]`) ||
      (page.id === state.pages[0].id ? leftPageEl : rightPageEl);
    if (pageEl) {
      const bar = pageEl.querySelector('.page-metadata-bar');
      if (bar) updateMetadataBar(bar, page);
    }
    // Trigger autosave via existing mechanism (savePage will persist content, but metadata already in state)
    // Also trigger API persistence via journal.js listener if present
    document.dispatchEvent(
      new CustomEvent('memorium:metachange', { detail: { field, value, pageId: page.id } })
    );
    // For API mode, also directly try to save page metadata via general save
    // Use debounced save to avoid spam, but ensure metadata saved quickly
    if (window.MemoriumNotebook && window.savePage) {
      // savePage already saves state, but API persistence for metadata handled in journal.js
      // Call savePage to ensure content+metadata saved locally, then journal.js will handle API
      try {
        window.savePage();
      } catch (_) {}
    }
  }

  function updatePageNumbers() {
    // numbers already updated in renderCurrentPage, also update header if needed
  }

  function updateNavButtons() {
    if (!navPrev || !navNext) return;
    const canPrev = state.currentPageIndex > 0;
    const canNext = state.currentPageIndex < state.pages.length - 1;
    // with spread model we actually have only 2 pages visible together, prev/next switches spread focus
    // keep simple: disable at ends
    navPrev.style.opacity = canPrev ? '1' : '0.45';
    navPrev.style.pointerEvents = canPrev ? 'auto' : 'none';
    navPrev.setAttribute('aria-disabled', String(!canPrev));
    navNext.style.opacity = canNext ? '1' : '0.45';
    navNext.style.pointerEvents = canNext ? 'auto' : 'none';
    navNext.setAttribute('aria-disabled', String(!canNext));
  }

  function renderNavigationHints() {
    const prevHint = document.querySelector('.notebook-nav-hint--prev');
    const nextHint = document.querySelector('.notebook-nav-hint--next');
    if (prevHint) prevHint.style.display = state.currentPageIndex > 0 ? 'block' : 'none';
    if (nextHint)
      nextHint.style.display = state.currentPageIndex < state.pages.length - 1 ? 'block' : 'none';
  }

  // ============================================================
  // NAVIGATION
  // ============================================================
  function nextPage() {
    if (state.currentPageIndex >= state.pages.length - 1) return false;
    animateTurn('next');
    try {
      if (window.MemoriumSound && window.MemoriumSound.playInteraction)
        window.MemoriumSound.playInteraction('page-flip');
    } catch (_) {}
    return loadPage(state.currentPageIndex + 1);
  }
  function previousPage() {
    if (state.currentPageIndex <= 0) return false;
    animateTurn('prev');
    try {
      if (window.MemoriumSound && window.MemoriumSound.playInteraction)
        window.MemoriumSound.playInteraction('page-flip');
    } catch (_) {}
    return loadPage(state.currentPageIndex - 1);
  }
  function goToPage(index) {
    const isUserTurn = index !== state.currentPageIndex && index >= 0 && index < state.pages.length;
    const result = loadPage(index);
    if (isUserTurn && result) {
      try {
        if (window.MemoriumSound && window.MemoriumSound.playInteraction)
          window.MemoriumSound.playInteraction('page-flip');
      } catch (_) {}
    }
    return result;
  }

  function animateTurn(dir) {
    if (!notebookEl) return;
    notebookEl.classList.remove('turn-next', 'turn-prev');
    void notebookEl.offsetWidth;
    notebookEl.classList.add(dir === 'next' ? 'turn-next' : 'turn-prev');
    setTimeout(() => notebookEl.classList.remove('turn-next', 'turn-prev'), 450);
  }

  // ============================================================
  // PAGE CREATION
  // ============================================================
  function createPage(opts) {
    opts = opts || {};
    const newId = state.nextId++;
    const cur = getCurrentPage();
    // opts may contain theme/paper/mood/weather/date/location/pen — validate via existing normalizers
    const newPage = {
      id: newId,
      title: new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      theme: normalizeTheme((opts.theme != null ? opts.theme : cur?.theme) || 'classic-leather'),
      paper: normalizePaper((opts.paper != null ? opts.paper : cur?.paper) || 'plain'),
      date: normalizeDate(opts.date !== undefined ? opts.date : null),
      mood: normalizeMood(opts.mood !== undefined ? opts.mood : null),
      weather: normalizeWeather(opts.weather !== undefined ? opts.weather : null),
      location: normalizeLocation(opts.location !== undefined ? opts.location : ''),
      content: `<p class="page-paragraph"><span class="page-first-letter">D</span>ear Diary...</p>`,
      decorations: [],
    };
    // Pen selection — reuse existing pen system, do not store per-page field unless needed
    if (opts.pen && window.MemoriumPen && window.MemoriumPen.selectPen) {
      try {
        window.MemoriumPen.selectPen(opts.pen);
      } catch (_) {}
    }
    state.pages.push(newPage);
    // Extend DOM if needed: for simplicity, if we now have >2 pages, we reuse rightPage for new content via render
    // But to keep spread, we need to allow virtual pages: current model shows only first two DOM nodes.
    // For new pages beyond 2, we will reuse the DOM nodes with new content (paging through data, not DOM)
    saveState();
    loadPage(state.pages.length - 1);
    return newPage;
  }

  // ============================================================
  // THEMING
  // ============================================================
  function applyThemeToCurrent(theme) {
    const page = getCurrentPage();
    if (!page) return;
    const resolved = normalizeTheme(theme);
    page.theme = resolved;
    saveState();
    renderCurrentPage();
    // Apply globally via theme manager if not already handling
    if (
      window.MemoriumTheme &&
      typeof window.MemoriumTheme.applyTheme === 'function' &&
      !applyThemeToCurrent._fromManager
    ) {
      try {
        applyThemeToCurrent._fromManager = true;
        window.MemoriumTheme.applyTheme(resolved, { syncNotebook: false, persist: true });
      } finally {
        applyThemeToCurrent._fromManager = false;
      }
    }
    document.dispatchEvent(
      new CustomEvent('memorium:themechange-notebook', { detail: { theme: resolved } })
    );
  }

  function applyPaperToCurrent(paper) {
    const page = getCurrentPage();
    if (!page) return;
    const resolved = normalizePaper(paper);
    page.paper = resolved;
    saveState();
    renderCurrentPage();
    // Notify paper manager if not already handling
    if (
      window.MemoriumPaper &&
      typeof window.MemoriumPaper.applyPaper === 'function' &&
      !applyPaperToCurrent._fromManager
    ) {
      try {
        applyPaperToCurrent._fromManager = true;
        window.MemoriumPaper.applyPaper(resolved, { syncNotebook: false, persist: true });
      } finally {
        applyPaperToCurrent._fromManager = false;
      }
    }
    document.dispatchEvent(
      new CustomEvent('memorium:paperchange-notebook', { detail: { paper: resolved } })
    );
  }

  // ============================================================
  // DECORATIONS
  // ============================================================
  function addDecoration(type, opts = {}) {
    const page = getCurrentPage();
    if (!page) return null;
    const id = 'd' + Date.now() + Math.random().toString(36).slice(2, 6);
    const deco = {
      id,
      type,
      x: opts.x ?? 24 + Math.random() * 40,
      y: opts.y ?? 24 + Math.random() * 40,
      rot: opts.rot ?? Math.random() * 6 - 3,
      text: opts.text ?? '',
      emoji: opts.emoji ?? null,
    };
    if (type === 'sticky') deco.text = opts.text || 'New note…';
    if (type === 'sticker')
      deco.emoji = opts.emoji || STICKER_SET[Math.floor(Math.random() * STICKER_SET.length)];
    if (type === 'paper') deco.text = opts.text || 'Remember this moment';
    if (type === 'flower') deco.emoji = opts.emoji || '🌸';
    if (type === 'tape') {
      deco.text = opts.text || '';
      deco.config = Object.assign({ color: 'rgba(255,233,120,0.55)' }, opts.config || {});
    }
    if (type === 'stamp') {
      deco.text = opts.text || 'POST';
      deco.emoji = opts.emoji || '✉️';
      deco.config = Object.assign({ color: '#E8D9C5' }, opts.config || {});
    }
    if (type === 'bookmark') {
      deco.text = opts.text || 'Bookmark';
      deco.config = Object.assign({ color: '#C9A227' }, opts.config || {});
    }
    if (type === 'clip') {
      deco.text = opts.text || '';
      deco.config = Object.assign({ color: '#B0B0B0' }, opts.config || {});
    }
    page.decorations.push(deco);
    saveState();
    renderDecorations();
    return deco;
  }

  function removeDecoration(id) {
    const page = getCurrentPage();
    if (!page) return;
    const idx = page.decorations.findIndex(d => d.id === id);
    if (idx !== -1) {
      page.decorations.splice(idx, 1);
      saveState();
      renderDecorations();
    }
  }

  function renderDecorations() {
    const page = getCurrentPage();
    if (!page || !leftPageEl || !rightPageEl) return;
    // Clear existing decoration layers and re-render for current page
    const layers = document.querySelectorAll('.page-decoration-layer');
    layers.forEach(l => {
      l.innerHTML = '';
      l.style.position = 'absolute';
      l.style.inset = '0';
      l.style.pointerEvents = 'none';
      l.style.zIndex = '1';
    });

    // target layer is the current page's slot within the spread (avoid hardcoded 0/1)
    const isLeft = state.currentPageIndex % 2 === 0;
    const targetPageEl = isLeft ? leftPageEl : rightPageEl;
    // Ensure target actually corresponds to current page's spread
    // If N>2 and spread mismatched, fallback to computed
    const layer = targetPageEl.querySelector('.page-decoration-layer');
    if (!layer) return;
    layer.style.pointerEvents = 'none';
    layer.style.zIndex = '1';

    page.decorations.forEach(deco => {
      const el = document.createElement('div');
      el.className = `decoration decoration--${deco.type}`;
      el.dataset.id = deco.id;
      el.style.position = 'absolute';
      el.style.left = deco.x + 'px';
      el.style.top = deco.y + 'px';
      el.style.transform = `rotate(${deco.rot}deg)`;
      el.style.cursor = 'grab';
      el.style.pointerEvents = 'auto';
      el.style.touchAction = 'none';

      if (deco.type === 'sticky') {
        el.classList.add('note');
        el.style.width = '170px';
        el.style.minHeight = '90px';
        el.style.padding = '14px 12px';
        el.style.fontFamily = "'Caveat', cursive";
        el.style.fontSize = '18px';
        el.textContent = deco.text;
        // remove button
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = '✕';
        rm.title = 'Remove';
        rm.style.cssText =
          'position:absolute;top:4px;right:6px;background:transparent;border:none;color:#B5A590;font-size:12px;cursor:pointer';
        rm.addEventListener('click', e => {
          e.stopPropagation();
          removeDecoration(deco.id);
        });
        el.appendChild(rm);
        // edit on dblclick
        el.addEventListener('dblclick', () => {
          const input = document.createElement('textarea');
          input.value = deco.text;
          input.style.width = '100%';
          input.style.height = '60px';
          input.style.fontFamily = "'Caveat', cursive";
          el.innerHTML = '';
          el.appendChild(input);
          input.focus();
          const save = () => {
            deco.text = input.value;
            saveState();
            renderDecorations();
          };
          input.addEventListener('blur', save);
          input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              save();
            }
          });
        });
      } else if (deco.type === 'sticker') {
        el.textContent = deco.emoji;
        el.style.fontSize = '28px';
        el.style.filter = 'sepia(0.2)';
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = '✕';
        rm.style.cssText =
          'position:absolute;top:-8px;right:-8px;width:18px;height:18px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;font-size:10px;cursor:pointer';
        rm.addEventListener('click', e => {
          e.stopPropagation();
          removeDecoration(deco.id);
        });
        el.appendChild(rm);
      } else if (deco.type === 'paper') {
        el.classList.add('paper-scrap');
        el.style.background = '#FFFAF1';
        el.style.border = '1px solid #DDD1BF';
        el.style.padding = '10px 12px';
        el.style.fontFamily = "'Caveat', cursive";
        el.style.fontSize = '16px';
        el.style.boxShadow = '2px 3px 8px rgba(0,0,0,.08)';
        el.style.transform += ' rotate(-1deg)';
        el.style.maxWidth = '160px';
        el.textContent = deco.text;
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = '✕';
        rm.style.cssText =
          'position:absolute;top:2px;right:4px;background:transparent;border:none;color:#B5A590;font-size:11px;cursor:pointer';
        rm.addEventListener('click', e => {
          e.stopPropagation();
          removeDecoration(deco.id);
        });
        el.appendChild(rm);
      } else if (deco.type === 'flower') {
        el.textContent = deco.emoji || '🌸';
        el.style.fontSize = '26px';
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = '✕';
        rm.style.cssText =
          'position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:50%;border:none;background:rgba(0,0,0,.5);color:#fff;font-size:9px;cursor:pointer';
        rm.addEventListener('click', e => {
          e.stopPropagation();
          removeDecoration(deco.id);
        });
        el.appendChild(rm);
      } else if (deco.type === 'tape') {
        // Washi tape — translucent, vintage
        el.style.width = '110px';
        el.style.height = '28px';
        el.style.background =
          deco.config && deco.config.color ? deco.config.color : 'rgba(255,233,120,0.55)';
        el.style.border = '1px dashed rgba(107,79,59,0.22)';
        el.style.borderRadius = '2px';
        el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.45)';
        el.style.opacity = '0.92';
        // subtle tape texture
        el.style.backgroundImage =
          'repeating-linear-gradient(90deg, transparent 0 6px, rgba(0,0,0,0.04) 6px 7px)';
        if (deco.text) {
          el.style.fontFamily = "'Caveat', cursive";
          el.style.fontSize = '12px';
          el.style.color = '#5A4A3E';
          el.style.display = 'flex';
          el.style.alignItems = 'center';
          el.style.justifyContent = 'center';
          el.textContent = deco.text;
        }
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = '✕';
        rm.style.cssText =
          'position:absolute;top:-8px;right:-8px;width:16px;height:16px;border-radius:50%;border:none;background:rgba(0,0,0,.5);color:#fff;font-size:9px;cursor:pointer';
        rm.addEventListener('click', e => {
          e.stopPropagation();
          removeDecoration(deco.id);
        });
        el.appendChild(rm);
      } else if (deco.type === 'stamp') {
        // Postage stamp — vintage
        el.style.width = '78px';
        el.style.height = '92px';
        el.style.background = (deco.config && deco.config.color) || '#FDF6EE';
        el.style.border = '2px dashed #C9A227';
        el.style.borderRadius = '4px';
        el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12), inset 0 0 0 1px rgba(255,255,255,0.6)';
        el.style.display = 'flex';
        el.style.flexDirection = 'column';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.padding = '6px';
        el.style.fontFamily = "'Caveat', cursive";
        // perforated edge effect via inner shadow
        el.style.backgroundImage = 'radial-gradient(circle, transparent 2px, #FDF6EE 2px)';
        el.style.backgroundSize = '10px 10px';
        // content
        const stampIcon = document.createElement('span');
        stampIcon.textContent = deco.emoji || '✉️';
        stampIcon.style.fontSize = '22px';
        stampIcon.style.filter = 'sepia(0.3)';
        el.appendChild(stampIcon);
        const stampText = document.createElement('span');
        stampText.textContent = deco.text || 'POST';
        stampText.style.fontSize = '10px';
        stampText.style.letterSpacing = '0.08em';
        stampText.style.color = '#8B7355';
        stampText.style.fontWeight = '600';
        stampText.style.marginTop = '2px';
        el.appendChild(stampText);
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = '✕';
        rm.style.cssText =
          'position:absolute;top:-8px;right:-8px;width:16px;height:16px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;font-size:9px;cursor:pointer';
        rm.addEventListener('click', e => {
          e.stopPropagation();
          removeDecoration(deco.id);
        });
        el.appendChild(rm);
      } else if (deco.type === 'bookmark') {
        // Bookmark ribbon — vintage
        el.style.width = '28px';
        el.style.height = '74px';
        el.style.background = (deco.config && deco.config.color) || '#C9A227';
        el.style.borderRadius = '2px 2px 0 0';
        el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.25)';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.paddingTop = '6px';
        el.style.clipPath = 'polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)';
        if (deco.text) {
          const bText = document.createElement('span');
          bText.textContent = deco.text.slice(0, 8);
          bText.style.writingMode = 'vertical-rl';
          bText.style.fontFamily = "'Caveat', cursive";
          bText.style.fontSize = '11px';
          bText.style.color = '#FFF8E7';
          bText.style.letterSpacing = '0.04em';
          bText.style.textShadow = '0 1px 1px rgba(0,0,0,0.18)';
          el.appendChild(bText);
        }
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = '✕';
        rm.style.cssText =
          'position:absolute;top:-6px;right:-8px;width:14px;height:14px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;font-size:8px;cursor:pointer';
        rm.addEventListener('click', e => {
          e.stopPropagation();
          removeDecoration(deco.id);
        });
        el.appendChild(rm);
      } else if (deco.type === 'clip') {
        // Paper clip — metallic vintage
        el.style.width = '22px';
        el.style.height = '54px';
        el.style.background = 'transparent';
        el.style.border = 'none';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.textContent = '📎';
        el.style.fontSize = '32px';
        el.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.12)) sepia(0.15)';
        el.style.transform += ' rotate(8deg)';
        if (deco.text) {
          el.title = deco.text;
        }
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = '✕';
        rm.style.cssText =
          'position:absolute;top:-6px;right:-6px;width:14px;height:14px;border-radius:50%;border:none;background:rgba(0,0,0,.5);color:#fff;font-size:8px;cursor:pointer';
        rm.addEventListener('click', e => {
          e.stopPropagation();
          removeDecoration(deco.id);
        });
        el.appendChild(rm);
      }

      // drag
      makeDraggable(el, deco);
      layer.appendChild(el);
    });

    // hide empty state if decorations exist
    const emptyState = document.querySelector('.page-empty-state');
    if (emptyState) emptyState.style.display = page.decorations.length ? 'none' : '';
    // also render images
    renderImages();
  }

  function renderImages() {
    const page = getCurrentPage();
    if (!page) return;
    const targetPageEl = state.currentPageIndex === 0 ? leftPageEl : rightPageEl;
    if (!targetPageEl) return;
    const layer = targetPageEl.querySelector('.page-decoration-layer');
    if (!layer) return;
    // Remove old image nodes
    layer.querySelectorAll('.decoration--image').forEach(n => n.remove());
    // If in API mode, fetch images via API and render
    if (window.MemoriumAPI && window.MemoriumAPI.isAuthed() && page._apiId) {
      window.MemoriumAPI.listImages(page._apiId)
        .then(res => {
          const images = res.data || [];
          // Store in state for drag persistence (not localStorage for binary, just refs)
          page.images = images.map(img => ({
            _apiId: img._id,
            id: img._id,
            filename: img.filename,
            x: img.position ? img.position.x : 24,
            y: img.position ? img.position.y : 24,
            rotation: img.rotation || 0,
            url: img.url,
          }));
          images.forEach(img => {
            const el = document.createElement('div');
            el.className = 'decoration decoration--image';
            el.dataset.id = img._id;
            el.style.position = 'absolute';
            el.style.left = (img.position ? img.position.x : 24) + 'px';
            el.style.top = (img.position ? img.position.y : 24) + 'px';
            el.style.transform = `rotate(${img.rotation || 0}deg)`;
            el.style.cursor = 'grab';
            el.style.pointerEvents = 'auto';
            el.style.maxWidth = '180px';
            el.style.boxShadow = '2px 4px 10px rgba(0,0,0,.15)';
            el.style.border = '1px solid #DDD1BF';
            el.style.background = '#FFF';
            el.style.padding = '4px';
            // Fetch image via centralized API wrapper (handles JWT/refresh)
            window.MemoriumAPI.getImageBlob(img._id)
              .then(blob => {
                const url = URL.createObjectURL(blob);
                const im = document.createElement('img');
                im.src = url;
                im.style.display = 'block';
                im.style.maxWidth = '170px';
                im.style.maxHeight = '170px';
                im.style.pointerEvents = 'none';
                el.appendChild(im);
              })
              .catch(() => {
                el.textContent = '(image unavailable)';
              });
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.textContent = '✕';
            rm.title = 'Delete image';
            rm.style.cssText =
              'position:absolute;top:-8px;right:-8px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;font-size:11px;cursor:pointer';
            rm.addEventListener('click', async e => {
              e.stopPropagation();
              try {
                await window.MemoriumAPI.deleteImage(img._id);
                renderImages();
              } catch (err) {
                alert(err.message);
              }
            });
            el.appendChild(rm);
            // draggable
            const deco = {
              x: img.position ? img.position.x : 24,
              y: img.position ? img.position.y : 24,
              rot: img.rotation || 0,
              _apiId: img._id,
              id: img._id,
            };
            makeDraggableForImage(el, deco);
            layer.appendChild(el);
            layer.style.pointerEvents = 'auto';
          });
          if (images.length) {
            const emptyState = document.querySelector('.page-empty-state');
            if (emptyState) emptyState.style.display = 'none';
          }
        })
        .catch(() => {});
      return;
    }
    // Local fallback: render images stored in page.images (from localStorage)
    if (page.images && page.images.length) {
      page.images.forEach(img => {
        const el = document.createElement('div');
        el.className = 'decoration decoration--image';
        el.dataset.id = img.id || img._apiId;
        el.style.position = 'absolute';
        el.style.left = (img.x || 24) + 'px';
        el.style.top = (img.y || 24) + 'px';
        el.style.transform = `rotate(${img.rotation || 0}deg)`;
        el.style.cursor = 'grab';
        el.style.maxWidth = '180px';
        el.style.boxShadow = '2px 4px 10px rgba(0,0,0,.15)';
        el.style.border = '1px solid #DDD1BF';
        el.style.background = '#FFF';
        el.style.padding = '4px';
        if (img.src) {
          const im = document.createElement('img');
          im.src = img.src;
          im.style.maxWidth = '170px';
          im.style.display = 'block';
          el.appendChild(im);
        } else if (img.url) {
          el.textContent = '[image]';
        }
        const rm = document.createElement('button');
        rm.type = 'button';
        rm.textContent = '✕';
        rm.style.cssText =
          'position:absolute;top:-8px;right:-8px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;font-size:11px;cursor:pointer';
        rm.addEventListener('click', () => {
          const idx = page.images.indexOf(img);
          if (idx !== -1) {
            page.images.splice(idx, 1);
            saveState();
            renderImages();
          }
        });
        el.appendChild(rm);
        makeDraggable(el, img);
        layer.appendChild(el);
      });
      layer.style.pointerEvents = 'auto';
    }
  }

  function makeDraggableForImage(el, deco) {
    let startX = 0,
      startY = 0,
      origX = 0,
      origY = 0,
      dragging = false;
    el.addEventListener('pointerdown', e => {
      if (e.target.tagName === 'BUTTON') return;
      dragging = true;
      el.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;
      origX = deco.x;
      origY = deco.y;
      el.style.cursor = 'grabbing';
      el.style.zIndex = '5';
    });
    el.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX,
        dy = e.clientY - startY;
      deco.x = Math.max(0, Math.min(260, origX + dx));
      deco.y = Math.max(0, Math.min(420, origY + dy));
      el.style.left = deco.x + 'px';
      el.style.top = deco.y + 'px';
    });
    const end = e => {
      if (!dragging) return;
      dragging = false;
      el.style.cursor = 'grab';
      el.style.zIndex = '';
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (_) {}
      if (window.MemoriumAPI && deco._apiId && window.MemoriumAPI.updateImage) {
        window.MemoriumAPI.updateImage(deco._apiId, {
          position: { x: deco.x, y: deco.y },
          rotation: deco.rot,
        }).catch(() => {});
      } else {
        // fallback local
        try {
          localStorage.setItem('memorium-state-v2', JSON.stringify(state));
        } catch {}
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function makeDraggable(el, deco) {
    let startX = 0,
      startY = 0,
      origX = 0,
      origY = 0,
      dragging = false;
    el.addEventListener('pointerdown', e => {
      if (
        e.target.tagName === 'BUTTON' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.tagName === 'INPUT'
      )
        return;
      dragging = true;
      el.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startY = e.clientY;
      origX = deco.x;
      origY = deco.y;
      el.style.cursor = 'grabbing';
      el.style.zIndex = '5';
    });
    el.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      deco.x = Math.max(0, Math.min(260, origX + dx));
      deco.y = Math.max(0, Math.min(420, origY + dy));
      el.style.left = deco.x + 'px';
      el.style.top = deco.y + 'px';
    });
    const end = e => {
      if (!dragging) return;
      dragging = false;
      el.style.cursor = 'grab';
      el.style.zIndex = '';
      try {
        el.releasePointerCapture(e.pointerId);
      } catch (_) {}
      saveState();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // ============================================================
  // TOOLBAR & INIT
  // ============================================================
  function ensureDecorationBar() {
    if (document.querySelector('.decoration-bar')) return;
    if (!notebookEl) return;
    const bar = document.createElement('div');
    bar.className = 'decoration-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Decorations');
    bar.style.cssText =
      'display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;justify-content:center;padding:.7rem 1rem;margin:.6rem auto;background:rgba(248,241,231,.92);border:1px solid rgba(107,79,59,.1);border-radius:999px;backdrop-filter:blur(10px);max-width:max-content;box-shadow:0 4px 16px rgba(0,0,0,.06)';

    const label = document.createElement('span');
    label.textContent = 'Decorate';
    label.style.cssText =
      'font-family:var(--heading-font);font-size:.82rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-right:.2rem';
    bar.appendChild(label);

    const buttons = [
      { label: 'Sticky', type: 'sticky' },
      { label: 'Tape', type: 'tape' },
      { label: 'Paper', type: 'paper' },
      { label: 'Flower', type: 'flower' },
      { label: 'Sticker', type: 'sticker' },
      { label: 'Stamp', type: 'stamp' },
      { label: 'Bookmark', type: 'bookmark' },
      { label: 'Clip', type: 'clip' },
      { label: 'Image', type: 'image' },
      { label: '+ Page', type: 'newpage' },
    ];
    // Hidden file input for image upload
    let fileInput = document.getElementById('memorium-image-input');
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.id = 'memorium-image-input';
      fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
      fileInput.style.display = 'none';
      document.body.appendChild(fileInput);
      const showImagePreview = file => {
        return new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = ev => {
            const overlay = document.createElement('div');
            overlay.className = 'memorium-preview-overlay';
            overlay.style.cssText =
              'position:fixed;inset:0;background:rgba(43,33,27,.55);backdrop-filter:blur(4px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px';
            overlay.innerHTML =
              '<div role="dialog" aria-modal="true" aria-label="Image preview" style="background:var(--paper);border:1px solid var(--border);border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.2);max-width:min(92vw,420px);width:100%;overflow:hidden">' +
              '<div style="padding:14px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;background:linear-gradient(to bottom, var(--paper), var(--old-paper))">' +
              '<span style="font-family:var(--heading-font);font-weight:600;color:var(--text-dark)">Preview — ' +
              file.name.replace(/</g, '&lt;') +
              '</span><button data-close style="border:none;background:var(--paper);width:28px;height:28px;border-radius:50%;border:1px solid var(--border);cursor:pointer">✕</button></div>' +
              '<div style="padding:14px"><img alt="preview" style="display:block;max-width:100%;max-height:320px;margin:0 auto;border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow-sm)"><p style="margin-top:10px;font-family:var(--heading-font);font-size:.85rem;color:var(--text-muted);text-align:center">' +
              (file.size / 1024).toFixed(1) +
              ' KB • ' +
              file.type +
              '</p></div>' +
              '<div style="display:flex;gap:10px;padding:14px 16px;border-top:1px solid var(--border);justify-content:flex-end;background:var(--paper)">' +
              '<button data-cancel style="padding:.5rem 1rem;border-radius:999px;border:1px solid var(--border);background:var(--paper);font-family:var(--heading-font);cursor:pointer">Cancel</button>' +
              '<button data-confirm style="padding:.5rem 1.1rem;border-radius:999px;border:none;background:var(--primary);color:var(--paper);font-family:var(--heading-font);cursor:pointer">Upload</button></div></div>';
            const img = overlay.querySelector('img');
            img.src = ev.target.result;
            const close = () => {
              overlay.remove();
              document.removeEventListener('keydown', onKey);
              resolve(false);
            };
            const confirm = () => {
              overlay.remove();
              document.removeEventListener('keydown', onKey);
              resolve(true);
            };
            const onKey = e => {
              if (e.key === 'Escape') close();
            };
            document.addEventListener('keydown', onKey);
            overlay.addEventListener('click', e => {
              if (e.target === overlay) close();
            });
            overlay.querySelector('[data-close]').addEventListener('click', close);
            overlay.querySelector('[data-cancel]').addEventListener('click', close);
            overlay.querySelector('[data-confirm]').addEventListener('click', confirm);
            document.body.appendChild(overlay);
            overlay.querySelector('[data-confirm]').focus();
          };
          reader.readAsDataURL(file);
        });
      };

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          if (window.MemoriumUtils)
            window.MemoriumUtils.showToast('Image too large. Max 5 MB', 'error');
          else alert('Image too large. Max 5 MB');
          fileInput.value = '';
          return;
        }
        if (
          !['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)
        ) {
          if (window.MemoriumUtils)
            window.MemoriumUtils.showToast('Unsupported image type', 'error');
          else alert('Unsupported image type');
          fileInput.value = '';
          return;
        }
        const confirmed = await showImagePreview(file);
        if (!confirmed) {
          fileInput.value = '';
          return;
        }
        const toast = window.MemoriumUtils
          ? window.MemoriumUtils.showToast('Uploading…', 'info')
          : null;
        // Use API if available
        if (window.MemoriumAPI && window.MemoriumAPI.isAuthed()) {
          const state = window.MemoriumNotebook ? window.MemoriumNotebook.getState() : null;
          const cur = state ? state.pages[state.currentPageIndex] : null;
          if (cur && cur._apiId) {
            // show loading on notebook
            const nb = document.querySelector('.notebook');
            const loader =
              window.MemoriumUtils && nb
                ? window.MemoriumUtils.showLoading(nb, 'Uploading image…')
                : null;
            try {
              const res = await window.MemoriumAPI.uploadImage(cur._apiId, file, { x: 30, y: 30 });
              if (cur) {
                if (!cur.images) cur.images = [];
                cur.images.push({
                  _apiId: res.data._id,
                  id: res.data._id,
                  filename: res.data.filename,
                  url: res.data.url,
                  x: res.data.position.x,
                  y: res.data.position.y,
                  rotation: res.data.rotation,
                });
                try {
                  localStorage.setItem('memorium-state-v2', JSON.stringify(state));
                } catch {}
                renderImages();
                if (window.MemoriumUtils)
                  window.MemoriumUtils.showToast('Image uploaded', 'success');
              }
            } catch (e) {
              if (window.MemoriumUtils)
                window.MemoriumUtils.showToast(e.message || 'Upload failed', 'error');
              else alert(e.message || 'Upload failed');
            } finally {
              if (loader) window.MemoriumUtils.hideLoading(nb);
              if (toast) toast.remove();
            }
          } else {
            if (window.MemoriumUtils)
              window.MemoriumUtils.showToast('Please open a journal first', 'error');
            else alert('Please open a journal first');
            if (toast) toast.remove();
          }
        } else {
          // Fallback local preview (no backend)
          const reader = new FileReader();
          reader.onload = ev => {
            const deco = addDecoration('paper', { text: file.name });
            if (deco) {
              deco.type = 'image-local';
              deco.src = ev.target.result;
              renderDecorations();
              renderImages();
            }
            if (toast) toast.remove();
          };
          reader.readAsDataURL(file);
        }
        fileInput.value = '';
      });
    }
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = b.label;
      btn.dataset.deco = b.type;
      btn.style.cssText =
        'padding:.4rem .85rem;border-radius:999px;border:1px solid rgba(107,79,59,.15);background:var(--paper);font-family:var(--heading-font);font-size:.82rem;cursor:pointer;transition:all .15s';
      btn.addEventListener('click', () => {
        if (b.type === 'newpage') showPageCreationDialog();
        else if (b.type === 'image') fileInput.click();
        else addDecoration(b.type);
      });
      btn.addEventListener('mouseenter', () => (btn.style.transform = 'translateY(-1px)'));
      btn.addEventListener('mouseleave', () => (btn.style.transform = ''));
      bar.appendChild(btn);
    });

    // insert after ambient bar or before notebook
    const ambientBar = document.querySelector('.ambient-bar');
    const themeBar = document.querySelector('.theme-bar');
    const anchor = ambientBar || themeBar;
    if (anchor && anchor.nextSibling) anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    else notebookEl.parentNode.insertBefore(bar, notebookEl);
    decorationBar = bar;
  }

  // ============================================================
  // PAGE CREATION EXPERIENCE (Step 11L) — pre-creation chooser
  // Vintage modal, reuses theme/paper/pen/mood/weather
  // ============================================================
  let _pageCreationDialog = null;

  function hidePageCreationDialog() {
    if (_pageCreationDialog) {
      _pageCreationDialog.remove();
      _pageCreationDialog = null;
      document.removeEventListener('keydown', _pageCreationEscHandler);
    }
  }
  function _pageCreationEscHandler(e) {
    if (e.key === 'Escape' || e.key === 'Esc') hidePageCreationDialog();
  }

  function showPageCreationDialog() {
    if (_pageCreationDialog) return;
    const cur = getCurrentPage();
    const curTheme = cur ? normalizeTheme(cur.theme) : 'classic-leather';
    const curPaper = cur ? normalizePaper(cur.paper) : 'plain';
    let curPenId = null;
    try {
      curPenId =
        window.MemoriumPen && window.MemoriumPen.getSelectedPenId
          ? window.MemoriumPen.getSelectedPenId()
          : null;
    } catch (_) {}
    const curMood = cur ? normalizeMood(cur.mood) : null;
    const curWeather = cur ? normalizeWeather(cur.weather) : null;

    // Inject dialog styles once (vintage, compact)
    if (!document.getElementById('memorium-page-create-style')) {
      const s = document.createElement('style');
      s.id = 'memorium-page-create-style';
      s.textContent = `
        .page-create-overlay{position:fixed;inset:0;background:rgba(43,33,27,0.48);backdrop-filter:blur(4px);z-index:1200;display:flex;align-items:center;justify-content:center;padding:16px;animation:pageCreateFade 0.18s ease}
        @keyframes pageCreateFade{from{opacity:0}to{opacity:1}}
        .page-create-dialog{width:min(92vw,560px);max-height:90vh;overflow:auto;background:linear-gradient(180deg,#FFFEFB 0%,#FFF8F0 100%),repeating-linear-gradient(0deg,transparent,transparent 26px,rgba(107,79,59,0.02) 26px,rgba(107,79,59,0.02) 27px);border:1px solid var(--theme-border,#DDD1BF);border-radius:16px;box-shadow:0 18px 48px rgba(0,0,0,0.28),0 6px 18px rgba(0,0,0,0.12),inset 0 1px 0 rgba(255,255,255,0.9);position:relative;padding:1rem 1.1rem 1rem}
        .page-create-dialog::before{content:'';position:absolute;top:0;left:18px;bottom:0;width:1px;background:rgba(201,162,39,0.16);pointer-events:none}
        .page-create-header{display:flex;align-items:center;gap:0.8rem;padding:0.2rem 0.2rem 0.8rem 1.2rem;border-bottom:1px solid rgba(107,79,59,0.08);margin:-0.2rem -0.2rem 0.9rem -0.2rem}
        .page-create-icon{width:34px;height:34px;display:grid;place-items:center;background:var(--theme-paper,#F8F1E7);border:1px solid var(--theme-border,#DDD1BF);border-radius:8px;font-size:16px;box-shadow:0 2px 6px rgba(0,0,0,0.06)}
        .page-create-title{font-family:var(--heading-font,'Cormorant Garamond',serif);font-size:1.05rem;font-weight:700;color:var(--text-dark,#2F241F);margin:0;line-height:1}
        .page-create-subtitle{font-family:var(--heading-font,'Cormorant Garamond',serif);font-size:0.74rem;color:var(--text-muted,#9B8E84);letter-spacing:0.06em;text-transform:uppercase;margin:2px 0 0}
        .page-create-close{margin-left:auto;width:28px;height:28px;border-radius:50%;border:1px solid var(--theme-border,#DDD1BF);background:var(--theme-paper,#F8F1E7);font-size:14px;cursor:pointer}
        .page-create-body{display:grid;gap:0.9rem;padding-left:1rem}
        .page-create-section{border:1px solid rgba(107,79,59,0.08);border-radius:10px;background:rgba(248,241,231,0.55);padding:0.6rem 0.7rem}
        .page-create-section-title{font-family:var(--heading-font,'Cormorant Garamond',serif);font-size:0.74rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted,#6E6259);margin:0 0 0.45rem}
        .page-create-row{display:flex;flex-wrap:wrap;gap:0.4rem;align-items:center}
        .page-create-select{padding:0.4rem 0.6rem;border-radius:999px;border:1px solid var(--theme-border,#DDD1BF);background:#FFFEFB;font-family:var(--heading-font,'Cormorant Garamond',serif);font-size:0.82rem;min-width:140px;max-width:100%}
        .page-create-mood-btn,.page-create-weather-btn{width:28px;height:28px;border-radius:50%;border:1.5px solid transparent;background:#FFFEFB;cursor:pointer;font-size:14px;display:grid;place-items:center;transition:all 0.16s ease}
        .page-create-mood-btn:hover,.page-create-weather-btn:hover{transform:scale(1.06);border-color:rgba(107,79,59,0.14);box-shadow:0 2px 8px rgba(0,0,0,0.06)}
        .page-create-mood-btn.active,.page-create-weather-btn.active{background:#FFFEFB;border-color:var(--theme-accent,#C9A227);box-shadow:0 0 0 3px rgba(201,162,39,0.14)}
        .page-create-actions{display:flex;gap:0.6rem;justify-content:flex-end;padding:0.7rem 0 0.2rem 1rem;border-top:1px solid rgba(107,79,59,0.08);margin-top:0.4rem}
        .page-create-btn{padding:0.5rem 1.1rem;border-radius:999px;border:1px solid var(--theme-border,#DDD1BF);background:#FFFEFB;font-family:var(--heading-font,'Cormorant Garamond',serif);font-size:0.86rem;font-weight:600;cursor:pointer;transition:all 0.18s ease}
        .page-create-btn--primary{background:var(--theme-cover,#5C3D2E);color:var(--theme-button-text,#F8F1E7);border-color:var(--theme-cover-edge,#4A2E20)}
        .page-create-btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,0.08)}
        .page-create-btn:focus-visible{outline:2px solid var(--theme-accent,#C9A227);outline-offset:2px}
        @media(max-width:480px){.page-create-dialog{padding:0.8rem 0.7rem}.page-create-body{padding-left:0}}
      `;
      document.head.appendChild(s);
    }

    const overlay = document.createElement('div');
    overlay.className = 'page-create-overlay';
    overlay.setAttribute('role', 'presentation');
    overlay.innerHTML = `
      <div class="page-create-dialog" role="dialog" aria-modal="true" aria-label="Create new page">
        <div class="page-create-header">
          <span class="page-create-icon" aria-hidden="true">📖</span>
          <div>
            <h3 class="page-create-title">New Page</h3>
            <p class="page-create-subtitle">Choose initial setup — all optional</p>
          </div>
          <button type="button" class="page-create-close" aria-label="Close" title="Close">✕</button>
        </div>
        <div class="page-create-body">
          <div class="page-create-section">
            <p class="page-create-section-title">Theme</p>
            <div class="page-create-row" data-field="theme"></div>
          </div>
          <div class="page-create-section">
            <p class="page-create-section-title">Paper</p>
            <div class="page-create-row" data-field="paper"></div>
          </div>
          <div class="page-create-section">
            <p class="page-create-section-title">Pen</p>
            <div class="page-create-row" data-field="pen"></div>
          </div>
          <div class="page-create-section">
            <p class="page-create-section-title">Mood <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:0.72rem;color:#9B8E84">— optional</span></p>
            <div class="page-create-row" data-field="mood"></div>
          </div>
          <div class="page-create-section">
            <p class="page-create-section-title">Weather <span style="font-weight:400;text-transform:none;letter-spacing:0;font-size:0.72rem;color:#9B8E84">— optional</span></p>
            <div class="page-create-row" data-field="weather"></div>
          </div>
        </div>
        <div class="page-create-actions">
          <button type="button" class="page-create-btn" data-action="cancel">Cancel</button>
          <button type="button" class="page-create-btn page-create-btn--primary" data-action="create">Create Page</button>
        </div>
      </div>
    `;
    _pageCreationDialog = overlay;
    document.body.appendChild(overlay);
    document.addEventListener('keydown', _pageCreationEscHandler);

    // Populate Theme
    const themeRow = overlay.querySelector('[data-field="theme"]');
    const themeSelect = document.createElement('select');
    themeSelect.className = 'page-create-select';
    themeSelect.setAttribute('aria-label', 'Theme');
    // Add current theme as first option plus families
    const curOpt = document.createElement('option');
    curOpt.value = curTheme;
    const curThemeData = window.MemoriumThemeConfig
      ? window.MemoriumThemeConfig.THEMES[curTheme]
      : null;
    curOpt.textContent = (curThemeData ? curThemeData.name : curTheme) + ' (current)';
    themeSelect.appendChild(curOpt);
    if (window.MemoriumThemeConfig && window.MemoriumThemeConfig.ALL_THEME_IDS) {
      window.MemoriumThemeConfig.ALL_THEME_IDS.forEach(id => {
        if (id === curTheme) return;
        const opt = document.createElement('option');
        opt.value = id;
        const td = window.MemoriumThemeConfig.THEMES[id];
        opt.textContent = td ? td.name : id;
        themeSelect.appendChild(opt);
      });
    }
    themeRow.appendChild(themeSelect);

    // Paper
    const paperRow = overlay.querySelector('[data-field="paper"]');
    const paperSelect = document.createElement('select');
    paperSelect.className = 'page-create-select';
    paperSelect.setAttribute('aria-label', 'Paper');
    const paperCurOpt = document.createElement('option');
    paperCurOpt.value = curPaper;
    const curPaperData = window.MemoriumPaperConfig
      ? window.MemoriumPaperConfig.PAPERS[curPaper]
      : null;
    paperCurOpt.textContent = (curPaperData ? curPaperData.label : curPaper) + ' (current)';
    paperSelect.appendChild(paperCurOpt);
    if (window.MemoriumPaperConfig) {
      window.MemoriumPaperConfig.getAllPapers().forEach(p => {
        if (p.id === curPaper) return;
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.label;
        paperSelect.appendChild(o);
      });
    }
    paperRow.appendChild(paperSelect);

    // Pen
    const penRow = overlay.querySelector('[data-field="pen"]');
    const penSelect = document.createElement('select');
    penSelect.className = 'page-create-select';
    penSelect.setAttribute('aria-label', 'Pen');
    const curPenOpt = document.createElement('option');
    curPenOpt.value = curPenId || '';
    try {
      const penData = window.MemoriumPen ? window.MemoriumPen.getSelectedPen() : null;
      curPenOpt.textContent = (penData ? penData.name : curPenId || 'Current pen') + ' (current)';
    } catch (_) {
      curPenOpt.textContent = (curPenId || 'Current pen') + ' (current)';
    }
    penSelect.appendChild(curPenOpt);
    if (window.MemoriumPenConfig) {
      window.MemoriumPenConfig.getAllPapers =
        window.MemoriumPenConfig.getAllPapers || window.MemoriumPenConfig.getAllPens;
      const allPens = window.MemoriumPenConfig.getAllPens
        ? window.MemoriumPenConfig.getAllPens()
        : [];
      allPens.forEach(p => {
        if (p.id === curPenId) return;
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.name;
        penSelect.appendChild(o);
      });
    }
    penRow.appendChild(penSelect);

    // Mood
    const moodRow = overlay.querySelector('[data-field="mood"]');
    // Clear button
    const moodClear = document.createElement('button');
    moodClear.type = 'button';
    moodClear.className = 'page-create-mood-btn';
    moodClear.dataset.mood = '';
    moodClear.setAttribute('aria-label', 'No mood');
    moodClear.title = 'No mood';
    moodClear.textContent = '—';
    moodClear.style.fontSize = '10px';
    moodRow.appendChild(moodClear);
    MOODS.forEach(m => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'page-create-mood-btn';
      b.dataset.mood = m.id;
      b.setAttribute('aria-label', m.label);
      b.title = m.label;
      b.textContent = m.icon;
      if (m.id === curMood) b.classList.add('active');
      moodRow.appendChild(b);
    });
    let selectedMood = curMood;
    moodRow.querySelectorAll('[data-mood]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.mood || null;
        selectedMood = val || null;
        // toggle off if same? For creation, empty means no mood
        moodRow
          .querySelectorAll('[data-mood]')
          .forEach(b =>
            b.classList.toggle('active', b.dataset.mood === selectedMood && !!selectedMood)
          );
        // clear button active if no mood
        moodClear.classList.toggle('active', !selectedMood);
      });
    });
    if (!curMood) moodClear.classList.add('active');

    // Weather
    const weatherRow = overlay.querySelector('[data-field="weather"]');
    const weatherClear = document.createElement('button');
    weatherClear.type = 'button';
    weatherClear.className = 'page-create-weather-btn';
    weatherClear.dataset.weather = '';
    weatherClear.setAttribute('aria-label', 'No weather');
    weatherClear.title = 'No weather';
    weatherClear.textContent = '—';
    weatherClear.style.fontSize = '10px';
    weatherRow.appendChild(weatherClear);
    WEATHERS.forEach(w => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'page-create-weather-btn';
      b.dataset.weather = w.id;
      b.setAttribute('aria-label', w.label);
      b.title = w.label;
      b.textContent = w.icon;
      if (w.id === curWeather) b.classList.add('active');
      weatherRow.appendChild(b);
    });
    let selectedWeather = curWeather;
    weatherRow.querySelectorAll('[data-weather]').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.weather || null;
        selectedWeather = val || null;
        weatherRow
          .querySelectorAll('[data-weather]')
          .forEach(b =>
            b.classList.toggle('active', b.dataset.weather === selectedWeather && !!selectedWeather)
          );
        weatherClear.classList.toggle('active', !selectedWeather);
      });
    });
    if (!curWeather) weatherClear.classList.add('active');

    // Close handlers
    overlay.addEventListener('click', e => {
      if (e.target === overlay) hidePageCreationDialog();
    });
    overlay.querySelector('.page-create-close').addEventListener('click', hidePageCreationDialog);
    overlay
      .querySelector('[data-action="cancel"]')
      .addEventListener('click', hidePageCreationDialog);
    overlay.querySelector('[data-action="create"]').addEventListener('click', () => {
      const themeVal = themeSelect.value || curTheme;
      const paperVal = paperSelect.value || curPaper;
      const penVal = penSelect.value || curPenId;
      // pen selection via existing system
      hidePageCreationDialog();
      createPage({
        theme: themeVal,
        paper: paperVal,
        pen: penVal,
        mood: selectedMood,
        weather: selectedWeather,
        date: null,
        location: '',
      });
    });
    // Focus first select
    setTimeout(() => themeSelect.focus(), 0);
  }

  function renderPageElements() {
    notebookEl = document.querySelector('.notebook');
    if (!notebookEl) return;
    leftPageEl = document.querySelector('.notebook-page--left');
    rightPageEl = document.querySelector('.notebook-page--right');
    if (!leftPageEl || !rightPageEl) return;

    // map writing areas
    state.pages.forEach(p => {
      const el =
        p.id === state.pages[0].id ? leftPageEl : p.id === state.pages[1]?.id ? rightPageEl : null;
      // Fallback: if more than 2 pages, both map to current visible pages - we handle via renderCurrentPage swapping content, so we only need two DOM slots
      // Instead map by position: left slot holds first page of spread, right holds second - for simplicity map directly if exists in DOM
      let domEl = document.querySelector(`.notebook-page[data-page="${p.id}"]`);
      if (!domEl) {
        // reuse first/last slot if new page beyond initial two - will be rendered via renderCurrentPage swapping
        domEl = null;
      }
      // Ensure writingAreas map uses current DOM slots for simplicity
    });
    // Simpler: just map the two visible slots
    const leftArea = leftPageEl.querySelector('.page-writing-area');
    const rightArea = rightPageEl.querySelector('.page-writing-area');
    // right page in original has no writing area, only decoration area; we support both
    if (leftArea) writingAreas[state.pages[0].id] = leftArea;
    // if right has writing area, map it, else create one hidden for persistence of decoration page content
    if (rightArea) {
      // if state has only 2 pages, right page id is 13
      if (state.pages[1]) writingAreas[state.pages[1].id] = rightArea;
    } else {
      // create a hidden writing area for right page to store content if user types on decoration page? not needed
      // But ensure we have an entry for page 13 to persist decorations layer text? we skip
    }
    // For new pages beyond 2, we will reuse the same DOM elements and swap content, so writingAreas will be reassigned in renderCurrentPage
    // Create nav controls
    navPrev = document.createElement('button');
    navPrev.type = 'button';
    navPrev.className = 'notebook-nav nav-prev';
    navPrev.textContent = '◀ Prev';
    navPrev.setAttribute('aria-label', 'Previous page');
    navPrev.style.cssText =
      'padding:.55rem 1rem;border-radius:999px;border:1px solid rgba(107,79,59,.18);background:var(--paper);font-family:var(--heading-font);font-size:.88rem;cursor:pointer;transition:all .2s';
    navNext = document.createElement('button');
    navNext.type = 'button';
    navNext.className = 'notebook-nav nav-next';
    navNext.textContent = 'Next ▶';
    navNext.setAttribute('aria-label', 'Next page');
    navNext.style.cssText = navPrev.style.cssText;

    // container
    const navContainer = document.createElement('div');
    navContainer.className = 'notebook-nav-container';
    navContainer.style.cssText =
      'display:flex;gap:1rem;justify-content:center;align-items:center;margin:1rem auto;width:max-content';
    navContainer.appendChild(navPrev);
    // page indicator
    const indicator = document.createElement('span');
    indicator.id = 'page-indicator';
    indicator.style.cssText =
      'font-family:var(--heading-font);font-size:.9rem;color:var(--text-muted);min-width:70px;text-align:center';
    navContainer.appendChild(indicator);
    navContainer.appendChild(navNext);
    // insert after notebook
    notebookEl.parentNode.insertBefore(navContainer, notebookEl.nextSibling);

    // style for turn animation
    if (!document.getElementById('memorium-turn-style')) {
      const s = document.createElement('style');
      s.id = 'memorium-turn-style';
      s.textContent =
        '.notebook.turn-next .notebook-page--right{animation: pageTurnNext .42s ease} .notebook.turn-prev .notebook-page--left{animation: pageTurnPrev .42s ease} @keyframes pageTurnNext{0%{transform: rotateY(0)} 50%{transform: rotateY(-12deg) translateX(-6px)} 100%{transform: rotateY(0)}} @keyframes pageTurnPrev{0%{transform: rotateY(0)} 50%{transform: rotateY(12deg) translateX(6px)} 100%{transform: rotateY(0)}} .notebook-page{transform-origin: center} @media(max-width:768px){.notebook-nav-container{flex-wrap:wrap}}';
      document.head.appendChild(s);
    }
  }

  function setupEventListeners() {
    if (navPrev) {
      navPrev.addEventListener('click', previousPage);
      navPrev.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          previousPage();
        }
      });
    }
    if (navNext) {
      navNext.addEventListener('click', nextPage);
      navNext.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          nextPage();
        }
      });
    }
    // keyboard
    document.addEventListener('keydown', e => {
      // Ctrl/Cmd+S — save
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        savePage();
        if (window.MemoriumUtils) window.MemoriumUtils.showToast('Saved', 'success');
        return;
      }
      // Esc — close preview/modal
      if (e.key === 'Escape' || e.key === 'Esc') {
        const preview = document.querySelector('.memorium-preview-overlay');
        if (preview) {
          preview.remove();
          return;
        }
        const toastContainer = document.getElementById('memorium-toast-container');
        // close any open modal if needed
        const modal = document.querySelector('[role="dialog"]');
        if (modal && modal.closest('.memorium-preview-overlay')) {
          modal.closest('.memorium-preview-overlay').remove();
          return;
        }
      }
      const t = document.activeElement;
      // Do not hijack arrow keys when typing in inputs, search, or editing
      if (t) {
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return;
        if (t.isContentEditable) return;
        if (t.closest && t.closest('.memorium-search')) return;
        if (t.closest && t.closest('.page-writing-area')) return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        previousPage();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextPage();
      }
    });
    // autosave debounced every 5s (keep paper feel, show subtle toast on save)
    const autosave = debounce(() => {
      savePage();
      if (window.MemoriumUtils && document.hasFocus()) {
        // only toast if user is still on page, avoid spam
        // show subtle "Autosaved" for API mode, otherwise silent local save
        if (window.MemoriumAPI && window.MemoriumAPI.isAuthed()) {
          window.MemoriumUtils.showToast('Autosaved', 'success');
        }
      }
    }, 5000);
    // save on input (not just blur) for better persistence
    Object.values(writingAreas).forEach(area => {
      if (!area) return;
      area.addEventListener('input', autosave);
      area.addEventListener('blur', savePage);
    });
    // delegate input for future pages' areas (since we swap content, listeners remain on same DOM nodes - fine)
    // Also listen for clicks on notebook-page to focus writing
    // create decoration via dblclick on decoration area already handled in renderDecorations? we keep also for empty area
    const decArea = document.querySelector('.page-decoration-area');
    if (decArea) {
      decArea.addEventListener('dblclick', e => {
        e.preventDefault();
        addDecoration('sticky');
      });
    }
    // theme change listener
    document.addEventListener('memorium:themechange', e => {
      const theme = e.detail && e.detail.theme;
      if (theme) applyThemeToCurrent(theme);
    });
    // paper change listener (Step 11F) — per-page, no global glitch
    document.addEventListener('memorium:paperchange', e => {
      const paper = e.detail && e.detail.paper;
      if (paper) applyPaperToCurrent(paper);
    });
    // also handle clicks on page nav hints
    const prevHint = document.querySelector('.notebook-nav-hint--prev');
    const nextHint = document.querySelector('.notebook-nav-hint--next');
    if (prevHint)
      ((prevHint.style.cursor = 'pointer'), prevHint.addEventListener('click', previousPage));
    if (nextHint)
      ((nextHint.style.cursor = 'pointer'), nextHint.addEventListener('click', nextPage));
  }

  // ============================================================
  // STEP 11E — PHYSICAL PAGE INTERACTION
  // Subtle edge lift, corner curl, drag-to-turn, swipe, flip
  // Preserves writing safety, reuses MemoriumSound, theme etc.
  // ============================================================
  let _physDragging = false;
  let _physDragPage = null;
  let _physHandle = null;
  let _physStartX = 0;
  let _physStartY = 0;
  let _physSwipeStartX = 0;
  let _physSwipeStartY = 0;
  let _physSwipeActive = false;
  let _physSwipePointerId = null;

  function isWritingSelectionActive() {
    try {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return false;
      const active = document.activeElement;
      if (active && active.isContentEditable) {
        if (active.contains(sel.anchorNode) || active.contains(sel.focusNode)) return true;
      }
      // also check if selection is inside any writing area
      const areas = document.querySelectorAll('.page-writing-area');
      for (const a of areas) {
        if (a.contains(sel.anchorNode) || a.contains(sel.focusNode)) return true;
      }
    } catch (_) {}
    return false;
  }

  function canNavigate(dir) {
    if (dir === 'next') return state.currentPageIndex < state.pages.length - 1;
    if (dir === 'prev') return state.currentPageIndex > 0;
    return false;
  }

  function ensurePhysicalHandles() {
    if (!notebookEl || !leftPageEl || !rightPageEl) return;
    // avoid duplicate
    if (notebookEl._physHandles) return;
    notebookEl._physHandles = true;

    // add corner curls + drag shadow if missing
    [leftPageEl, rightPageEl].forEach((pageEl, idx) => {
      if (!pageEl.querySelector('.page-corner-curl')) {
        const curl = document.createElement('div');
        curl.className =
          'page-corner-curl ' + (idx === 0 ? 'page-corner-curl--left' : 'page-corner-curl--right');
        curl.setAttribute('aria-hidden', 'true');
        pageEl.appendChild(curl);
      }
      if (!pageEl.querySelector('.notebook-page-shadow--drag')) {
        const sd = document.createElement('div');
        sd.className = 'notebook-page-shadow--drag';
        sd.setAttribute('aria-hidden', 'true');
        pageEl.appendChild(sd);
      }
    });

    // right edge handle — next
    if (!rightPageEl.querySelector('.page-edge-handle--right')) {
      const h = document.createElement('div');
      h.className = 'page-edge-handle page-edge-handle--right';
      h.dataset.dir = 'next';
      h.setAttribute('aria-label', 'Drag to next page');
      h.setAttribute('role', 'button');
      h.setAttribute('tabindex', '0');
      rightPageEl.appendChild(h);
      // hover lift
      h.addEventListener('pointerenter', () => {
        if (_physDragging || window.matchMedia('(pointer: coarse)').matches) return;
        if (!canNavigate('next')) return;
        rightPageEl.classList.add('edge-hover');
        const c = rightPageEl.querySelector('.page-corner-curl--right');
        if (c) c.classList.add('visible');
      });
      h.addEventListener('pointerleave', () => {
        if (_physDragging) return;
        rightPageEl.classList.remove('edge-hover');
        const c = rightPageEl.querySelector('.page-corner-curl--right');
        if (c) c.classList.remove('visible');
      });
      h.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          nextPage();
        }
      });
      h.addEventListener('click', e => {
        // click-to-turn fallback — but not after drag
        if (_physDragging) return;
        e.preventDefault();
        nextPage();
      });
      h.addEventListener('pointerdown', onPhysDragStart);
    }

    // left edge handle — prev
    if (!leftPageEl.querySelector('.page-edge-handle--left')) {
      const h = document.createElement('div');
      h.className = 'page-edge-handle page-edge-handle--left';
      h.dataset.dir = 'prev';
      h.setAttribute('aria-label', 'Drag to previous page');
      h.setAttribute('role', 'button');
      h.setAttribute('tabindex', '0');
      leftPageEl.appendChild(h);
      h.addEventListener('pointerenter', () => {
        if (_physDragging || window.matchMedia('(pointer: coarse)').matches) return;
        if (!canNavigate('prev')) return;
        leftPageEl.classList.add('edge-hover');
        const c = leftPageEl.querySelector('.page-corner-curl--left');
        if (c) c.classList.add('visible');
      });
      h.addEventListener('pointerleave', () => {
        if (_physDragging) return;
        leftPageEl.classList.remove('edge-hover');
        const c = leftPageEl.querySelector('.page-corner-curl--left');
        if (c) c.classList.remove('visible');
      });
      h.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          previousPage();
        }
      });
      h.addEventListener('click', e => {
        if (_physDragging) return;
        e.preventDefault();
        previousPage();
      });
      h.addEventListener('pointerdown', onPhysDragStart);
    }

    // fallback mousemove edge hover for devices without handle hover (desktop)
    notebookEl.addEventListener('mousemove', onPhysEdgeHover);
    notebookEl.addEventListener('mouseleave', clearPhysHover);

    // swipe handling — pointer events on notebook (mobile)
    notebookEl.addEventListener('pointerdown', onPhysSwipeDown, { passive: true });
  }

  function onPhysEdgeHover(e) {
    if (_physDragging) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (!leftPageEl || !rightPageEl) return;
    // ignore when over writing selection or decorations
    if (
      e.target.closest &&
      (e.target.closest('.decoration') || e.target.closest('.page-writing-area'))
    ) {
      // still allow if near edge? but suppress to keep writing safe
      // check if pointer is truly near outer edge beyond writing area padding
      // if inside writing area central, don't show lift
      const isWriting = !!e.target.closest('.page-writing-area');
      if (isWriting && !e.target.closest('.page-edge-handle')) {
        // suppress unless actually over handle zone
        // we already handle handles, so just skip global hover when inside writing
        return;
      }
    }
    const rRect = rightPageEl.getBoundingClientRect();
    const lRect = leftPageEl.getBoundingClientRect();
    const nearRight =
      e.clientX > rRect.right - 44 &&
      e.clientX < rRect.right + 10 &&
      e.clientY > rRect.top &&
      e.clientY < rRect.bottom;
    const nearLeft =
      e.clientX < lRect.left + 44 &&
      e.clientX > lRect.left - 10 &&
      e.clientY > lRect.top &&
      e.clientY < lRect.bottom;
    // right
    if (nearRight && canNavigate('next')) {
      rightPageEl.classList.add('edge-hover');
      const c = rightPageEl.querySelector('.page-corner-curl--right');
      if (c) c.classList.add('visible');
    } else {
      rightPageEl.classList.remove('edge-hover');
      const c = rightPageEl.querySelector('.page-corner-curl--right');
      if (c) c.classList.remove('visible');
    }
    if (nearLeft && canNavigate('prev')) {
      leftPageEl.classList.add('edge-hover');
      const c = leftPageEl.querySelector('.page-corner-curl--left');
      if (c) c.classList.add('visible');
    } else {
      leftPageEl.classList.remove('edge-hover');
      const c = leftPageEl.querySelector('.page-corner-curl--left');
      if (c) c.classList.remove('visible');
    }
  }

  function clearPhysHover() {
    if (!leftPageEl || !rightPageEl) return;
    leftPageEl.classList.remove('edge-hover');
    rightPageEl.classList.remove('edge-hover');
    const cr = rightPageEl.querySelector('.page-corner-curl--right');
    const cl = leftPageEl.querySelector('.page-corner-curl--left');
    if (cr) cr.classList.remove('visible');
    if (cl) cl.classList.remove('visible');
  }

  function onPhysDragStart(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const handle = e.currentTarget;
    const dir = handle.dataset.dir;
    if (!canNavigate(dir)) return;
    if (isWritingSelectionActive()) return;
    if (e.target.closest && e.target.closest('.decoration')) return;
    // touch should not be confused with scroll — pointer capture will handle
    e.preventDefault();
    _physDragging = true;
    _physHandle = handle;
    _physDragPage = dir === 'next' ? rightPageEl : leftPageEl;
    _physStartX = e.clientX;
    _physStartY = e.clientY;
    clearPhysHover();
    _physDragPage.classList.add('is-dragging');
    _physDragPage.style.transition = 'none';
    // ensure pointer capture
    try {
      handle.setPointerCapture(e.pointerId);
    } catch (_) {}
    document.addEventListener('pointermove', onPhysDragMove);
    document.addEventListener('pointerup', onPhysDragEnd);
    document.addEventListener('pointercancel', onPhysDragEnd);
  }

  function onPhysDragMove(e) {
    if (!_physDragging || !_physDragPage) return;
    const dx = e.clientX - _physStartX;
    const dy = e.clientY - _physStartY;
    // if vertical dominates and small horizontal, don't interfere with scroll — but allow horizontal drag
    if (Math.abs(dy) > Math.abs(dx) * 1.4 && Math.abs(dx) < 16) return;
    // prevent scrolling while dragging
    if (Math.abs(dx) > 8) e.preventDefault();
    const pageWidth = _physDragPage.getBoundingClientRect().width || 480;
    const isNext = _physDragPage === rightPageEl;
    let adx;
    if (isNext) {
      adx = Math.min(0, dx); // only left
    } else {
      adx = Math.max(0, dx); // only right
    }
    const progress = Math.min(1, Math.abs(adx) / pageWidth);
    const rotate = (isNext ? -1 : 1) * progress * 36;
    const translate = adx * 0.55;
    const lift = -progress * 5;
    _physDragPage.style.transform = `translateX(${translate}px) translateY(${lift}px) rotateY(${rotate}deg)`;
    const shadow = _physDragPage.querySelector('.notebook-page-shadow--drag');
    if (shadow) shadow.style.opacity = String(progress * 0.9);
    const curl = _physDragPage.querySelector('.page-corner-curl');
    if (curl) {
      curl.classList.add('visible');
      curl.style.opacity = String(0.7 + progress * 0.3);
    }
  }

  function onPhysDragEnd(e) {
    if (!_physDragging || !_physDragPage) return;
    const wasPage = _physDragPage;
    const wasHandle = _physHandle;
    const dx = e.clientX - _physStartX;
    const pageWidth = wasPage.getBoundingClientRect().width || 480;
    const progress = Math.abs(dx) / pageWidth;
    const absDx = Math.abs(dx);
    const isNext = wasPage === rightPageEl;
    const effectiveDx = isNext ? Math.min(0, dx) : Math.max(0, dx);
    const shouldTurn =
      canNavigate(isNext ? 'next' : 'prev') &&
      (progress > 0.22 || absDx > 84) &&
      Math.abs(effectiveDx) > 8 &&
      (isNext ? effectiveDx < -1 : effectiveDx > 1);
    // cleanup
    _physDragging = false;
    _physDragPage = null;
    _physHandle = null;
    wasPage.classList.remove('is-dragging', 'edge-hover');
    wasPage.style.transition = '';
    const shadow = wasPage.querySelector('.notebook-page-shadow--drag');
    if (shadow) shadow.style.opacity = '0';
    const curl = wasPage.querySelector('.page-corner-curl');
    if (curl) {
      curl.style.opacity = '';
      // keep visible briefly if turning, else hide
      if (!shouldTurn) curl.classList.remove('visible');
    }
    try {
      wasHandle && wasHandle.releasePointerCapture && wasHandle.releasePointerCapture(e.pointerId);
    } catch (_) {}
    document.removeEventListener('pointermove', onPhysDragMove);
    document.removeEventListener('pointerup', onPhysDragEnd);
    document.removeEventListener('pointercancel', onPhysDragEnd);

    if (shouldTurn) {
      wasPage.style.transform = '';
      if (isNext) {
        notebookEl.classList.add('is-flipping-next');
        setTimeout(() => notebookEl.classList.remove('is-flipping-next'), 620);
        nextPage();
      } else {
        notebookEl.classList.add('is-flipping-prev');
        setTimeout(() => notebookEl.classList.remove('is-flipping-prev'), 620);
        previousPage();
      }
      // hide curl after turn
      setTimeout(() => {
        if (curl) curl.classList.remove('visible');
      }, 400);
    } else {
      // snap back
      wasPage.style.transform = 'translateX(0) translateY(0) rotateY(0)';
      setTimeout(() => {
        wasPage.style.transform = '';
      }, 340);
    }
  }

  // Swipe (mobile) — anywhere on notebook, horizontal swipe
  function onPhysSwipeDown(e) {
    // ignore if handle already dragging or decoration
    if (_physDragging) return;
    if (
      e.target.closest &&
      (e.target.closest('.page-edge-handle') ||
        e.target.closest('.decoration') ||
        e.target.closest('button') ||
        e.target.closest('a'))
    )
      return;
    // writing safety: if selection active inside writing area, ignore swipe
    if (isWritingSelectionActive()) return;
    // only primary pointer
    if (e.isPrimary === false) return;
    // ignore right-click
    if (e.button !== undefined && e.button !== 0) return;
    // store start for potential swipe
    _physSwipeStartX = e.clientX;
    _physSwipeStartY = e.clientY;
    _physSwipeActive = true;
    _physSwipePointerId = e.pointerId;
    // we listen on document for move/up to catch swipe beyond notebook
    document.addEventListener('pointermove', onPhysSwipeMove, { passive: true });
    document.addEventListener('pointerup', onPhysSwipeUp, { passive: true });
    document.addEventListener('pointercancel', onPhysSwipeUp, { passive: true });
  }

  function onPhysSwipeMove(e) {
    if (!_physSwipeActive) return;
    if (e.pointerId !== _physSwipePointerId) return;
    // we don't prevent here, just track — threshold decides at Up
    // if vertical scroll dominates, cancel swipe
    const dx = e.clientX - _physSwipeStartX;
    const dy = e.clientY - _physSwipeStartY;
    if (Math.abs(dy) > Math.abs(dx) + 10 && Math.abs(dx) < 24) {
      // vertical scroll — cancel swipe to not interfere
      _physSwipeActive = false;
      cleanupSwipe();
    }
  }

  function onPhysSwipeUp(e) {
    if (!_physSwipeActive) return;
    if (e.pointerId !== _physSwipePointerId) return;
    const dx = e.clientX - _physSwipeStartX;
    const dy = e.clientY - _physSwipeStartY;
    _physSwipeActive = false;
    cleanupSwipe();
    // must be substantial horizontal and not too vertical
    if (Math.abs(dx) < 62) return;
    if (Math.abs(dy) > Math.abs(dx) * 0.9) return;
    // don't swipe if contenteditable is focused and user was selecting text (already handled) or typing
    const active = document.activeElement;
    if (active && active.isContentEditable) {
      // if active and swipe started inside writing area, require larger threshold to avoid accidental turns
      const inWriting = e.target.closest && e.target.closest('.page-writing-area');
      if (inWriting && Math.abs(dx) < 84) return;
    }
    if (dx < 0 && canNavigate('next')) {
      // swipe left → next
      notebookEl.classList.add('is-flipping-next');
      setTimeout(() => notebookEl.classList.remove('is-flipping-next'), 620);
      nextPage();
    } else if (dx > 0 && canNavigate('prev')) {
      // swipe right → prev
      notebookEl.classList.add('is-flipping-prev');
      setTimeout(() => notebookEl.classList.remove('is-flipping-prev'), 620);
      previousPage();
    }
  }

  function cleanupSwipe() {
    document.removeEventListener('pointermove', onPhysSwipeMove);
    document.removeEventListener('pointerup', onPhysSwipeUp);
    document.removeEventListener('pointercancel', onPhysSwipeUp);
  }

  function setupPhysicalInteraction() {
    ensurePhysicalHandles();
    // re-ensure handles after page render (pages swap content but handles stay on same DOM nodes — fine)
    // observe future renders to re-ensure if DOM recreated
    const obs = new MutationObserver(() => ensurePhysicalHandles());
    if (notebookEl) obs.observe(notebookEl, { childList: true, subtree: true });
  }

  function debounce(fn, ms) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  function init() {
    loadState();
    renderPageElements();
    ensureDecorationBar();
    // ensure theme/ambient bars are created (they self-init on DOMContentLoaded, but we call again if needed)
    if (window.MemoriumTheme && document.querySelector('.theme-bar') == null) {
      // theme.js will create it, but we trigger manually if needed
    }
    renderCurrentPage();
    updateNavButtons();
    renderNavigationHints();
    setupEventListeners();
    setupPhysicalInteraction();
    // View toggle (single/spread) beside searchbar
    (function setupViewToggle() {
      const singleBtn = document.querySelector('.view-btn[data-view="single"]');
      const spreadBtn = document.querySelector('.view-btn[data-view="spread"]');
      if (!singleBtn || !spreadBtn) return;
      function bind(btn) {
        btn.addEventListener('click', () => {
          setViewMode(btn.dataset.view);
        });
      }
      bind(singleBtn);
      bind(spreadBtn);
      // Initialize UI and notebook view class
      if (notebookEl) {
        notebookEl.classList.toggle('view-single', isSingleView());
        notebookEl.classList.toggle('view-spread', !isSingleView());
        notebookEl.dataset.view = viewMode;
      }
      updateViewToggleUI();
      // Also apply on view change from other tabs? no
    })();
    // update indicator text
    const upd = () => {
      const ind = document.getElementById('page-indicator');
      if (ind) ind.textContent = `Page ${state.currentPageIndex + 1} / ${state.pages.length}`;
    };
    upd();
    // patch updateNavButtons to also update indicator
    const origUpd = updateNavButtons;
    updateNavButtons = function () {
      origUpd();
      upd();
    };
    updateNavButtons();
  }

  // Expose required names globally for testing / reuse
  window.nextPage = nextPage;
  window.previousPage = previousPage;
  window.savePage = savePage;
  window.loadPage = loadPage;
  window.createPage = createPage;
  window.addDecoration = addDecoration;
  window.removeDecoration = removeDecoration;
  // also expose for internal reuse
  window.MemoriumNotebook = {
    nextPage,
    previousPage,
    savePage,
    loadPage,
    createPage,
    addDecoration,
    removeDecoration,
    getState: () => state,
    applyThemeToCurrent,
    applyPaperToCurrent,
    getViewMode,
    setViewMode,
    isSingleView,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
