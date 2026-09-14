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

  const DEFAULT_PAGES = [
    {
      id: 12,
      title: 'Friday, February 14, 2026',
      theme: 'classic-leather',
      paper: 'plain',
      content: null,
      decorations: [],
    },
    {
      id: 13,
      title: 'Friday, February 14, 2026',
      theme: 'classic-leather',
      paper: 'plain',
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
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.pages) && parsed.pages.length) {
          state = parsed;
          // ensure nextId exists
          if (!state.nextId) state.nextId = Math.max(...state.pages.map(p => p.id)) + 1;
          // migrate old theme/paper ids to new
          let needsSave = false;
          state.pages.forEach(p => {
            const before = p.theme;
            p.theme = normalizeTheme(p.theme);
            if (before !== p.theme) needsSave = true;
            const beforePaper = p.paper;
            p.paper = normalizePaper(p.paper);
            if (beforePaper !== p.paper) needsSave = true;
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
    // save both left and right writing areas if present
    // left page holds main content, right page may also have decoration notes
    // we persist each page's writingArea separately
    state.pages.forEach(p => {
      const area = writingAreas[p.id];
      if (area) p.content = area.innerHTML;
    });
    // persist decorations already in state
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

    // For Step 4: notebook shows spread (both pages) always. We don't hide one side.
    // Instead we update dataset / content and add turn animation.
    leftPageEl.style.display = '';
    rightPageEl.style.display = '';

    // Update attributes and theme/paper per page
    state.pages.forEach(p => {
      p.theme = normalizeTheme(p.theme);
      p.paper = normalizePaper(p.paper);
      const el =
        p.id === state.pages[0].id ? leftPageEl : p.id === state.pages[1]?.id ? rightPageEl : null;
      if (!el) return;
      el.dataset.page = String(p.id);
      el.dataset.theme = p.theme || 'classic-leather';
      el.dataset.paper = p.paper || 'plain';
      // Remove any old theme-* class and add new
      el.className = el.className.replace(/\btheme-[\w-]+\b/g, '').trim();
      el.classList.add('theme-' + (p.theme || 'classic-leather'));
      // Paper class
      el.className = el.className.replace(/\bpaper-[\w-]+\b/g, '').trim();
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
      const area = writingAreas[p.id];
      if (area && p.content != null) area.innerHTML = p.content;
      const numEl = el.querySelector('.page-number');
      if (numEl) numEl.textContent = p.id;
    });

    // highlight current page with subtle focus
    leftPageEl.classList.toggle('page-active', state.currentPageIndex === 0);
    rightPageEl.classList.toggle('page-active', state.currentPageIndex === 1);
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
  function createPage() {
    const newId = state.nextId++;
    const newPage = {
      id: newId,
      title: new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      theme: normalizeTheme(getCurrentPage()?.theme || 'classic-leather'),
      paper: normalizePaper(getCurrentPage()?.paper || 'plain'),
      content: `<p class="page-paragraph"><span class="page-first-letter">D</span>ear Diary...</p>`,
      decorations: [],
    };
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
    // We render decorations on the right page's decoration layer, and also left if needed
    const layers = document.querySelectorAll('.page-decoration-layer');
    layers.forEach(l => {
      l.innerHTML = '';
      l.style.position = 'absolute';
      l.style.inset = '0';
      l.style.pointerEvents = 'none';
    });

    // target layer is the current page's layer
    const targetPageEl = state.currentPageIndex === 0 ? leftPageEl : rightPageEl;
    const layer = targetPageEl.querySelector('.page-decoration-layer');
    if (!layer) return;
    layer.style.pointerEvents = 'auto';

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
        el.textContent = '🌸';
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
      { label: 'Sticker', type: 'sticker' },
      { label: 'Paper', type: 'paper' },
      { label: 'Flower', type: 'flower' },
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
        if (b.type === 'newpage') createPage();
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
      if (
        t &&
        (t.tagName === 'TEXTAREA' ||
          t.tagName === 'INPUT' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        // allow arrow navigation when not editing? but skip if contenteditable focused to allow cursor movement
        if (t.isContentEditable) return;
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
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
