/* ============================================================
   MEMORIUM — Diary Tools Drawer (11U)
   Focused diary: diary centered, tools hidden behind ⋮
   Moves existing panels into an accordion drawer, reuses handlers
   No framework, vintage aesthetic
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'memorium_drawer_open';
  const SECTION_STATE_KEY = 'memorium_drawer_sections';

  let overlay = null;
  let drawer = null;
  // eslint-disable-next-line prefer-const
  let trigger = null;
  let isOpen = false;
  let observer = null;

  const SECTIONS = [
    { id: 'pen', label: '✒️ Pen', icon: '✒️', selector: '#pen-holder-system', defaultOpen: true },
    {
      id: 'theme',
      label: '🎨 Theme',
      icon: '🎨',
      selector: '#theme-family-system',
      defaultOpen: false,
    },
    { id: 'paper', label: '📄 Paper', icon: '📄', selector: '#paper-system', defaultOpen: false },
    {
      id: 'writing',
      label: '📝 Sticky Notes & Writing',
      icon: '📝',
      selector: '#writing-tools-bar',
      defaultOpen: false,
    },
    {
      id: 'decorations',
      label: '🖼️ Decorations',
      icon: '🖼️',
      selector: '.decoration-bar',
      defaultOpen: false,
    },
    { id: 'sound', label: '🔊 Sound', icon: '🔊', selector: '#sound-system', defaultOpen: false },
    {
      id: 'ambient',
      label: '🌙 Environment',
      icon: '🌙',
      selector: '.ambient-bar',
      defaultOpen: false,
    },
    {
      id: 'details',
      label: '📔 Diary Details',
      icon: '📔',
      selector: null,
      defaultOpen: false,
      custom: true,
    },
  ];

  function getSectionState() {
    try {
      const raw = localStorage.getItem(SECTION_STATE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    const state = {};
    SECTIONS.forEach(s => {
      state[s.id] = !!s.defaultOpen;
    });
    return state;
  }
  function saveSectionState(state) {
    try {
      localStorage.setItem(SECTION_STATE_KEY, JSON.stringify(state));
    } catch (_) {}
  }

  function createTrigger() {
    const existing = document.getElementById('memorium-tools-trigger');
    if (existing) {
      trigger = existing;
      return existing;
    }
    const btn = document.createElement('button');
    btn.id = 'memorium-tools-trigger';
    btn.className = 'memorium-tools-trigger';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Open diary tools');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', 'memorium-tools-drawer');
    btn.setAttribute('title', 'Diary tools (⋮)');
    btn.textContent = '⋮';
    btn.style.letterSpacing = '2px';
    // Place fixed; if notebook-section exists, we still keep fixed for consistent access
    document.body.appendChild(btn);
    trigger = btn;
    btn.addEventListener('click', () => (isOpen ? closeDrawer() : openDrawer()));
    return btn;
  }

  function createDrawer() {
    const existingDrawer = document.getElementById('memorium-tools-drawer');
    if (existingDrawer) {
      drawer = existingDrawer;
      overlay = document.getElementById('memorium-tools-overlay');
      return existingDrawer;
    }
    overlay = document.createElement('div');
    overlay.id = 'memorium-tools-overlay';
    overlay.className = 'memorium-tools-overlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.addEventListener('click', closeDrawer);
    document.body.appendChild(overlay);

    drawer = document.createElement('aside');
    drawer.id = 'memorium-tools-drawer';
    drawer.className = 'memorium-tools-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-label', 'Diary tools');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = `
      <div class="memorium-drawer-header">
        <div>
          <h2 class="memorium-drawer-title">Diary Tools</h2>
          <p class="memorium-drawer-subtitle">Pen · Theme · Paper · Decorations</p>
        </div>
        <button type="button" class="memorium-drawer-close" aria-label="Close diary tools">✕</button>
      </div>
      <div class="memorium-drawer-body" id="memorium-drawer-body"></div>
    `;
    document.body.appendChild(drawer);
    drawer.querySelector('.memorium-drawer-close').addEventListener('click', closeDrawer);
    return drawer;
  }

  function buildSections() {
    const body = drawer.querySelector('#memorium-drawer-body');
    body.innerHTML = '';
    const sectionState = getSectionState();

    SECTIONS.forEach(sec => {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'memorium-drawer-section';
      sectionEl.dataset.section = sec.id;

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'drawer-section-header';
      header.setAttribute('aria-expanded', sectionState[sec.id] ? 'true' : 'false');
      header.setAttribute('aria-controls', `memorium-section-${sec.id}`);
      header.innerHTML = `<span>${sec.label}</span><span class="drawer-section-chevron" aria-hidden="true">▶</span>`;
      sectionEl.appendChild(header);

      const content = document.createElement('div');
      content.id = `memorium-section-${sec.id}`;
      content.className = 'drawer-section-content';
      if (!sectionState[sec.id]) content.hidden = true;
      sectionEl.appendChild(content);

      header.addEventListener('click', () => {
        const expanded = header.getAttribute('aria-expanded') === 'true';
        const next = !expanded;
        header.setAttribute('aria-expanded', String(next));
        content.hidden = !next;
        const state = getSectionState();
        state[sec.id] = next;
        saveSectionState(state);
      });

      body.appendChild(sectionEl);
    });
  }

  function getSectionContent(id) {
    return drawer ? drawer.querySelector(`#memorium-section-${id}`) : null;
  }

  function moveTool(selector, sectionId) {
    const content = getSectionContent(sectionId);
    if (!content) return false;
    const el = document.querySelector(selector);
    if (!el) return false;
    // Avoid moving if already in correct section
    if (content.contains(el)) return true;
    content.appendChild(el);
    // Remove inline width constraints that were for centered layout — drawer CSS will override, but ensure visible
    el.style.display = '';
    return true;
  }

  function buildDiaryDetails() {
    const content = getSectionContent('details');
    if (!content) return;
    // Avoid rebuilding if already built
    if (content.querySelector('.drawer-details-grid')) return;

    const wrap = document.createElement('div');
    wrap.className = 'drawer-details-grid';
    wrap.innerHTML = `
      <div class="drawer-details-row">
        <label class="drawer-details-label" for="drawer-date">Date</label>
        <input type="date" id="drawer-date" class="drawer-details-input" aria-label="Date">
      </div>
      <div class="drawer-details-row">
        <span class="drawer-details-label">Mood</span>
        <div class="drawer-mood-grid" role="group" aria-label="Mood"></div>
      </div>
      <div class="drawer-details-row">
        <span class="drawer-details-label">Weather</span>
        <div class="drawer-weather-grid" role="group" aria-label="Weather"></div>
      </div>
      <div class="drawer-details-row">
        <label class="drawer-details-label" for="drawer-location">Location</label>
        <input type="text" id="drawer-location" class="drawer-details-input" placeholder="NSU" maxlength="120" autocomplete="off" aria-label="Location">
      </div>
      <p style="font-family:var(--heading-font);font-size:0.7rem;color:var(--text-muted);margin-top:0.2rem">Edits apply to the current page and sync to the page's own metadata bar.</p>
    `;
    content.appendChild(wrap);

    const MOODS = [
      { id: 'happy', icon: '😊', label: 'Happy' },
      { id: 'calm', icon: '😌', label: 'Calm' },
      { id: 'sad', icon: '😢', label: 'Sad' },
      { id: 'angry', icon: '😡', label: 'Angry' },
      { id: 'loved', icon: '❤️', label: 'Loved' },
      { id: 'tired', icon: '😴', label: 'Tired' },
    ];
    const WEATHERS = [
      { id: 'sunny', icon: '☀️', label: 'Sunny' },
      { id: 'rainy', icon: '🌧', label: 'Rainy' },
      { id: 'cloudy', icon: '☁️', label: 'Cloudy' },
      { id: 'night', icon: '🌙', label: 'Night' },
    ];

    const moodGrid = wrap.querySelector('.drawer-mood-grid');
    const weatherGrid = wrap.querySelector('.drawer-weather-grid');
    const dateInput = wrap.querySelector('#drawer-date');
    const locInput = wrap.querySelector('#drawer-location');

    function getCurrentPageFromNotebook() {
      try {
        if (window.MemoriumNotebook && window.MemoriumNotebook.getState) {
          const s = window.MemoriumNotebook.getState();
          if (s && s.pages && s.pages[s.currentPageIndex]) return s.pages[s.currentPageIndex];
        }
      } catch (_) {}
      return null;
    }
    function normalizeDate(d) {
      if (!d) return '';
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
    }
    function updateUIFromPage() {
      const page = getCurrentPageFromNotebook();
      if (!page) return;
      dateInput.value = normalizeDate(page.date);
      if (document.activeElement !== locInput) locInput.value = page.location || '';
      const curMood = page.mood || null;
      moodGrid.querySelectorAll('.drawer-mood-btn').forEach(b => {
        const on = b.dataset.mood === curMood;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
      const curWeather = page.weather || null;
      weatherGrid.querySelectorAll('.drawer-weather-btn').forEach(b => {
        const on = b.dataset.weather === curWeather;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }
    function dispatchMeta(field, value) {
      const page = getCurrentPageFromNotebook();
      if (!page) return;
      // Toggle off if same
      if (
        (field === 'mood' && page.mood === value) ||
        (field === 'weather' && page.weather === value)
      )
        value = null;
      document.dispatchEvent(
        new CustomEvent('memorium:metachange', { detail: { field, value, pageId: page.id } })
      );
      // Also update local state optimistically via notebook's handler? The notebook's handleMetadataChange will be triggered via the page's own bar,
      // but we also directly update the page object for drawer sync
      // To keep drawer in sync without duplicating logic, we rely on the existing notebook listener that will update state via journal.js
      // For immediate feedback, update local page and trigger UI
      setTimeout(updateUIFromPage, 50);
      setTimeout(updateUIFromPage, 300);
    }

    MOODS.forEach(m => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'drawer-mood-btn';
      btn.dataset.mood = m.id;
      btn.setAttribute('aria-label', m.label);
      btn.setAttribute('aria-pressed', 'false');
      btn.title = m.label;
      btn.textContent = m.icon;
      btn.addEventListener('click', () => dispatchMeta('mood', m.id));
      moodGrid.appendChild(btn);
    });
    WEATHERS.forEach(w => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'drawer-weather-btn';
      btn.dataset.weather = w.id;
      btn.setAttribute('aria-label', w.label);
      btn.setAttribute('aria-pressed', 'false');
      btn.title = w.label;
      btn.textContent = w.icon;
      btn.addEventListener('click', () => dispatchMeta('weather', w.id));
      weatherGrid.appendChild(btn);
    });
    dateInput.addEventListener('change', e => {
      const val = e.target.value ? new Date(e.target.value).toISOString() : null;
      dispatchMeta('date', val);
    });
    let locTimer = null;
    locInput.addEventListener('input', e => {
      clearTimeout(locTimer);
      locTimer = setTimeout(() => dispatchMeta('location', e.target.value), 600);
    });
    locInput.addEventListener('blur', e => {
      clearTimeout(locTimer);
      dispatchMeta('location', e.target.value);
    });

    // Keep in sync when page changes (listen to notebook events and polling)
    document.addEventListener('memorium:metachange', updateUIFromPage);
    // Notebook page changes don't fire metachange, so poll on drawer open and on page load
    setInterval(updateUIFromPage, 1000);
    // Update now and when drawer opens
    setTimeout(updateUIFromPage, 500);
    drawer.addEventListener('transitionend', updateUIFromPage);
    // Also observe notebook state changes via custom event if available
    document.addEventListener('click', e => {
      if (e.target.closest && e.target.closest('.notebook-nav-container, .notebook-nav-hint')) {
        setTimeout(updateUIFromPage, 400);
      }
    });
  }

  function collectTools() {
    if (!drawer) return;
    let anyMoved = false;
    SECTIONS.forEach(sec => {
      if (sec.custom) return;
      const moved = moveTool(sec.selector, sec.id);
      if (moved) anyMoved = true;
    });
    // Diary details is custom
    buildDiaryDetails();
    if (anyMoved) {
      document.body.classList.add('memorium-drawer-ready');
    }
    // If some tools not yet created, keep observer active to move them when they appear
  }

  function openDrawer() {
    if (!drawer || !overlay || !trigger) return;
    isOpen = true;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    const raf =
      window.requestAnimationFrame ||
      function (cb) {
        return setTimeout(cb, 0);
      };
    raf(() => {
      overlay.style.opacity = '1';
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      trigger.setAttribute('aria-expanded', 'true');
      trigger.setAttribute('aria-label', 'Close diary tools');
      // Focus first focusable in drawer for accessibility
      const first = drawer.querySelector('.memorium-drawer-close, .drawer-section-header');
      if (first && typeof first.focus === 'function') {
        try {
          first.focus();
        } catch (_) {}
      }
    });
    document.body.style.overflow = 'hidden';
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch (_) {}
    // Sync diary details
    setTimeout(() => {
      const ev = new Event('memorium:drawerOpened');
      document.dispatchEvent(ev);
    }, 100);
  }

  function closeDrawer() {
    if (!drawer || !overlay || !trigger) return;
    isOpen = false;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    overlay.style.opacity = '0';
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Open diary tools');
    // Delay hiding overlay for transition
    setTimeout(() => {
      if (!isOpen) {
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
      }
    }, 280);
    document.body.style.overflow = '';
    try {
      localStorage.setItem(STORAGE_KEY, 'false');
    } catch (_) {}
    trigger.focus();
  }

  function attachGlobalHandlers() {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (isOpen) {
          e.preventDefault();
          closeDrawer();
        }
      }
    });
    // Handle clicks outside? overlay handles.
  }

  function restoreState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'true') {
        // Do not auto-open on load to keep diary-first; keep closed by default
        // But if user explicitly left open, we keep closed to respect diary-first principle
        // So we intentionally do not restore open state automatically
        // isOpen = false;
      }
    } catch (_) {}
  }

  function init() {
    // Only on journal page (where notebook exists) — bookshelf etc. don't need drawer
    const isJournal =
      !!document.querySelector('.notebook') || !!document.getElementById('notebook-section');
    if (!isJournal) return;

    createTrigger();
    createDrawer();
    buildSections();
    collectTools();
    attachGlobalHandlers();
    restoreState();

    // Observe for late-created tools (theme, pen, etc. are created async)
    observer = new MutationObserver(() => {
      // Debounce
      clearTimeout(observer._t);
      observer._t = setTimeout(collectTools, 300);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Also poll for a few seconds to catch late tools
    let tries = 0;
    const poll = setInterval(() => {
      tries++;
      collectTools();
      if (tries > 20) clearInterval(poll);
    }, 500);

    // Re-collect on window load
    window.addEventListener('load', collectTools);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 0);
  }

  window.MemoriumToolsDrawer = {
    openDrawer,
    closeDrawer,
    isOpen: () => isOpen,
  };
})();
