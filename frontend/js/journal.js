/* Memorium — Journal page: load notebook from API, handle journalId, migration, saving */
(function () {
  function getJournalId() {
    const qs = new URLSearchParams(window.location.search).get('journalId');
    if (qs) {
      localStorage.setItem('memorium-current-journal', qs);
      return qs;
    }
    return localStorage.getItem('memorium-current-journal');
  }

  // 11N — parse requested page from URL (supports page, pageNumber, pageId)
  function getRequestedPageParams() {
    try {
      const sp = new URLSearchParams(window.location.search);
      return {
        page: sp.get('page') || sp.get('pageNumber') || sp.get('pageNum'),
        pageId: sp.get('pageId') || sp.get('page_id'),
      };
    } catch (e) {
      return { page: null, pageId: null };
    }
  }

  function findPageIndex(statePages, req) {
    if (!statePages || !statePages.length || !req) return -1;
    const targetNum = req.page != null ? String(req.page).trim() : null;
    const targetId = req.pageId != null ? String(req.pageId).trim() : null;
    if (targetId) {
      for (let i = 0; i < statePages.length; i++) {
        const p = statePages[i];
        const pid = p._apiId || p._id || String(p.id || '');
        if (String(pid) === targetId) return i;
      }
    }
    if (targetNum) {
      // numeric pageNumber match
      const num = Number(targetNum);
      if (!isNaN(num)) {
        for (let k = 0; k < statePages.length; k++) {
          if (statePages[k].pageNumber === num || statePages[k].id === num) return k;
        }
      }
      // fallback string match on pageNumber or title
      for (let j = 0; j < statePages.length; j++) {
        const pj = statePages[j];
        if (String(pj.pageNumber) === targetNum || String(pj.id) === targetNum) return j;
      }
    }
    return -1;
  }

  function showStatus(msg, isError) {
    const sec = document.getElementById('notebook-section');
    if (!sec) return;
    let el = document.getElementById('journal-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'journal-status';
      el.style.cssText =
        'max-width:600px;margin:1rem auto;padding:.8rem 1rem;border-radius:10px;text-align:center;font-size:.9rem';
      sec.prepend(el);
    }
    el.textContent = msg;
    el.style.background = isError ? 'rgba(184,92,92,.12)' : 'rgba(107,155,115,.12)';
    el.style.color = isError ? '#7A3E3E' : '#2F241F';
    el.style.border = '1px solid ' + (isError ? 'rgba(184,92,92,.2)' : 'rgba(107,155,115,.2)');
    if (!isError) setTimeout(() => el && el.remove(), 2500);
  }

  async function ensureJournal() {
    let jid = getJournalId();
    const api = window.MemoriumAPI;
    if (!api || !api.isAuthed()) {
      showStatus('Please sign in to sync your journal. Local mode active.', true);
      return null;
    }
    try {
      // Verify journal exists and is owned
      if (jid) {
        try {
          await api.getJournal(jid);
          return jid;
        } catch (e) {
          if (e.status === 404 || e.status === 403) {
            // invalid or not owned, clear and create new
            localStorage.removeItem('memorium-current-journal');
            jid = null;
          } else throw e;
        }
      }
      // No valid journal, list and pick first or create
      const list = await api.listJournals();
      if (list.data && list.data.length) {
        jid = list.data[0]._id;
        localStorage.setItem('memorium-current-journal', jid);
        return jid;
      }
      // Create first journal
      const created = await api.createJournal({
        title: 'My Journal',
        description: 'First journal',
      });
      jid = created.data._id;
      localStorage.setItem('memorium-current-journal', jid);
      showStatus('Created your first journal', false);
      return jid;
    } catch (e) {
      showStatus('Could not load journal: ' + e.message, true);
      return null;
    }
  }

  // Patch notebook to use API when journalId available
  async function patchNotebookWithAPI(journalId) {
    if (!journalId || !window.MemoriumAPI || !window.MemoriumNotebook) return;
    const api = window.MemoriumAPI;
    const nb = window.MemoriumNotebook;
    const originalSavePage = window.savePage;
    const originalAddDecoration = window.addDecoration;
    const originalRemoveDecoration = window.removeDecoration;
    const originalCreatePage = window.createPage;

    // Helper to get current pageId from state (API uses Mongo _id, local uses numeric id)
    // We will maintain a mapping: local state pages will be replaced with API pages
    let apiPages = [];
    const pageIdMap = {}; // local id -> api _id

    async function loadFromAPI() {
      try {
        const res = await api.listPages(journalId);
        apiPages = res.data || [];
        apiPages.sort((a, b) => a.pageNumber - b.pageNumber);
        if (!apiPages.length) {
          // Migrate local if exists
          const local = api.getLocalNotebookState();
          if (local && local.pages && local.pages.length) {
            showStatus('Migrating local pages to cloud…', false);
            const mig = await api.migrateLocalToBackend(journalId);
            if (mig.migrated) {
              showStatus('Migrated ' + mig.migrated + ' pages', false);
              // reload
              const r2 = await api.listPages(journalId);
              apiPages = r2.data || [];
              apiPages.sort((a, b) => a.pageNumber - b.pageNumber);
            }
          }
          if (!apiPages.length) {
            // create initial two pages to match local defaults
            const resolve = window.MemoriumThemeConfig
              ? window.MemoriumThemeConfig.resolveThemeId
              : t => t || 'classic-leather';
            const resolvePaper = window.MemoriumPaperConfig
              ? window.MemoriumPaperConfig.normalizePaper
              : p => p || 'plain';
            const journalTheme =
              (await api
                .getJournal(journalId)
                .then(r => r.data && r.data.themeId)
                .catch(() => null)) ||
              resolve(
                localStorage.getItem('memorium_theme') ||
                  localStorage.getItem('memorium-theme') ||
                  'classic-leather'
              );
            const journalPaper =
              (await api
                .getJournal(journalId)
                .then(r => r.data && r.data.paper)
                .catch(() => null)) ||
              resolvePaper(localStorage.getItem('memorium_paper') || 'plain');
            const p1 = await api.createPage(journalId, {
              pageNumber: 1,
              title: 'Page 1',
              content: '<p><span class="page-first-letter">D</span>ear Diary…</p>',
              theme: resolve(journalTheme),
              paper: resolvePaper(journalPaper),
            });
            const p2 = await api.createPage(journalId, {
              pageNumber: 2,
              title: 'Page 2',
              content: '',
              theme: resolve(journalTheme),
              paper: resolvePaper(journalPaper),
            });
            apiPages = [p1.data, p2.data];
          }
        }
        // Fetch journal-level theme and apply globally (DB is source of truth per spec)
        let journalThemeId = null;
        let journalPaperId = null;
        try {
          const jres = await api.getJournal(journalId);
          journalThemeId = jres.data && jres.data.themeId;
          journalPaperId = jres.data && jres.data.paper;
        } catch (_) {}
        const resolveTheme = window.MemoriumThemeConfig
          ? window.MemoriumThemeConfig.resolveThemeId
          : t => t || 'classic-leather';
        const resolvePaper2 = window.MemoriumPaperConfig
          ? window.MemoriumPaperConfig.normalizePaper
          : p => p || 'plain';
        if (
          journalThemeId &&
          window.MemoriumThemeConfig &&
          window.MemoriumThemeConfig.isValidTheme(journalThemeId)
        ) {
          const norm = resolveTheme(journalThemeId);
          localStorage.setItem('memorium_theme', norm);
          try {
            localStorage.setItem('memorium_journal_theme_' + journalId, norm);
          } catch (_) {}
          if (window.MemoriumTheme && window.MemoriumTheme.applyTheme) {
            // Apply without re-persisting journal (avoid loop)
            window.MemoriumTheme.applyTheme(norm, { persistJournal: false });
          }
        } else if (!journalThemeId) {
          // No journal theme yet — migrate local theme to journal
          const localTheme = resolveTheme(
            localStorage.getItem('memorium_theme') ||
              localStorage.getItem('memorium-theme') ||
              'classic-leather'
          );
          if (localTheme) {
            journalThemeId = localTheme;
            try {
              await api.updateJournal(journalId, { themeId: localTheme });
            } catch (_) {}
          }
        }
        // Journal paper
        const isValidPaper = window.MemoriumPaperConfig
          ? window.MemoriumPaperConfig.isValidPaper
          : p => ['plain', 'ruled', 'dotted', 'grid', 'vintage', 'handmade', 'torn'].includes(p);
        if (journalPaperId && isValidPaper(journalPaperId)) {
          const normP = resolvePaper2(journalPaperId);
          try {
            localStorage.setItem('memorium_paper', normP);
          } catch (_) {}
          try {
            localStorage.setItem('memorium_journal_paper_' + journalId, normP);
          } catch (_) {}
          if (window.MemoriumPaper && window.MemoriumPaper.applyPaper) {
            window.MemoriumPaper.applyPaper(normP, { persistJournal: false, persistPage: false });
          }
        } else if (!journalPaperId) {
          const localPaper = resolvePaper2(localStorage.getItem('memorium_paper') || 'plain');
          if (localPaper) {
            journalPaperId = localPaper;
            try {
              await api.updateJournal(journalId, { paper: localPaper });
            } catch (_) {}
          }
        }
        // Convert API pages to local state shape
        const newPages = apiPages.map(p => ({
          _apiId: p._id,
          id: p.pageNumber,
          pageNumber: p.pageNumber,
          title: p.title,
          content: p.content,
          theme: p.theme || journalThemeId || 'classic-leather',
          paper: p.paper || journalPaperId || 'plain',
          date: p.date || null,
          mood: p.mood || null,
          weather: p.weather || null,
          location: p.location || '',
          decorations: [], // will load per page
        }));
        // Load decorations and images per page
        for (const np of newPages) {
          try {
            const dres = await api.listDecorations(np._apiId);
            np.decorations = (dres.data || []).map(d => ({
              _apiId: d._id,
              id: d._id,
              type: d.type,
              x: d.position.x,
              y: d.position.y,
              rot: d.rotation,
              text: d.text,
              emoji: d.emoji,
              config: d.config,
            }));
          } catch {}
          try {
            const ires = await api.listImages(np._apiId);
            np.images = (ires.data || []).map(img => ({
              _apiId: img._id,
              id: img._id,
              x: img.position ? img.position.x : 24,
              y: img.position ? img.position.y : 24,
              rotation: img.rotation || 0,
              url: img.url,
              filename: img.filename,
            }));
          } catch {}
        }
        // Replace notebook state
        const state = nb.getState();
        state.pages = newPages;
        state.currentPageIndex = 0;
        state.nextId = Math.max(...newPages.map(p => p.pageNumber), 0) + 1;
        // Persist locally as backup but primary is API
        try {
          localStorage.setItem('memorium-state-v2', JSON.stringify(state));
        } catch {}
        // Re-render via notebook's internal function (trigger via loadPage)
        if (window.loadPage) window.loadPage(0);
        // 11N — if URL requests a specific page, open it (reuse existing navigation flow)
        try {
          const req = getRequestedPageParams();
          if ((req.page || req.pageId) && window.loadPage) {
            const targetIdx = findPageIndex(newPages, req);
            if (targetIdx >= 0 && targetIdx < newPages.length) {
              window.loadPage(targetIdx);
              // ensure scroll to notebook after slight delay
              setTimeout(function () {
                const sec = document.getElementById('notebook-section');
                if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 300);
            }
          }
        } catch (e) {}
        // Also refresh decorations rendering
        showStatus('Loaded ' + newPages.length + ' pages from cloud', false);
      } catch (e) {
        showStatus('Failed to load pages: ' + e.message, true);
        console.error(e);
      }
    }

    // Override savePage to also PUT to API — notebook already debounces 5s, so use short 800ms here for total ~5.8s
    let saveTimeout = null;
    let lastToast = 0;
    window.savePage = function () {
      // call original to update local state
      originalSavePage();
      const state = nb.getState();
      const cur = state.pages[state.currentPageIndex];
      if (!cur || !cur._apiId) return;
      clearTimeout(saveTimeout);
      // short debounce to batch rapid edits, autosave toast throttled
      saveTimeout = setTimeout(async () => {
        const nbEl = document.querySelector('.notebook');
        const loader =
          window.MemoriumUtils && nbEl ? window.MemoriumUtils.showLoading(nbEl, 'Saving…') : null;
        try {
          // Get current content from correctly-mapped visible slot (supports N>2 via spread)
          let area = document.querySelector(
            `.notebook-page[data-page="${cur.id}"] .page-writing-area`
          );
          if (!area) {
            const isLeft = state.currentPageIndex % 2 === 0;
            const slotEl = isLeft
              ? document.querySelector('.notebook-page--left')
              : document.querySelector('.notebook-page--right');
            area = slotEl
              ? slotEl.querySelector('.page-writing-area')
              : document.querySelector('.page-writing-area');
          }
          const content = area ? area.innerHTML : cur.content;
          await api.updatePage(cur._apiId, {
            content,
            theme: cur.theme,
            paper: cur.paper,
            date: cur.date,
            mood: cur.mood,
            weather: cur.weather,
            location: cur.location,
          });
          cur.content = content;
          showStatus('Saved to cloud', false);
          if (window.MemoriumUtils && Date.now() - lastToast > 4000) {
            window.MemoriumUtils.showToast('Autosaved', 'success');
            lastToast = Date.now();
          }
        } catch (e) {
          showStatus('Save failed, kept locally: ' + e.message, true);
          if (window.MemoriumUtils) window.MemoriumUtils.showToast('Save failed', 'error');
        } finally {
          if (loader && window.MemoriumUtils) window.MemoriumUtils.hideLoading(nbEl);
        }
      }, 800);
    };
    // Ctrl+S manual save — single immediate PUT, avoid double-debounce
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        clearTimeout(saveTimeout);
        // ensure local state is fresh
        try {
          originalSavePage();
        } catch (_) {}
        const cur2 = nb.getState().pages[nb.getState().currentPageIndex];
        if (!cur2 || !cur2._apiId) {
          if (window.MemoriumUtils) window.MemoriumUtils.showToast('Saved locally', 'success');
          return;
        }
        let area2 = document.querySelector(
          `.notebook-page[data-page="${cur2.id}"] .page-writing-area`
        );
        if (!area2) {
          const isLeft = nb.getState().currentPageIndex % 2 === 0;
          const slotEl = isLeft
            ? document.querySelector('.notebook-page--left')
            : document.querySelector('.notebook-page--right');
          area2 = slotEl
            ? slotEl.querySelector('.page-writing-area')
            : document.querySelector('.page-writing-area');
        }
        const content = area2 ? area2.innerHTML : cur2.content;
        api
          .updatePage(cur2._apiId, {
            content,
            theme: cur2.theme,
            paper: cur2.paper,
            date: cur2.date,
            mood: cur2.mood,
            weather: cur2.weather,
            location: cur2.location,
          })
          .then(() => {
            cur2.content = content;
            showStatus('Saved', false);
            if (window.MemoriumUtils) window.MemoriumUtils.showToast('Saved', 'success');
          })
          .catch(err => {
            if (window.MemoriumUtils) window.MemoriumUtils.showToast(err.message, 'error');
          });
      }
      if (e.key === 'Escape' || e.key === 'Esc') {
        const overlay = document.querySelector('.memorium-preview-overlay');
        if (overlay) overlay.remove();
      }
    });

    // Override addDecoration to also POST
    window.addDecoration = function (type, opts = {}) {
      const deco = originalAddDecoration(type, opts);
      const state = nb.getState();
      const cur = state.pages[state.currentPageIndex];
      if (!cur || !cur._apiId || !deco) return deco;
      // Keep local id, but also create on server and replace id
      (async () => {
        try {
          const res = await api.createDecoration(cur._apiId, {
            type: deco.type,
            position: { x: deco.x, y: deco.y },
            rotation: deco.rot,
            text: deco.text,
            emoji: deco.emoji,
            config: {},
          });
          deco._apiId = res.data._id;
          deco.id = res.data._id;
          // update state and persist
          try {
            localStorage.setItem('memorium-state-v2', JSON.stringify(state));
          } catch {}
        } catch (e) {
          showStatus('Decoration save failed: ' + e.message, true);
        }
      })();
      return deco;
    };

    window.removeDecoration = function (id) {
      const state = nb.getState();
      const cur = state.pages[state.currentPageIndex];
      const deco = cur ? cur.decorations.find(d => d.id === id || d._apiId === id) : null;
      const apiId = deco ? deco._apiId || deco.id : id;
      originalRemoveDecoration(id);
      if (cur && cur._apiId && apiId) {
        api
          .deleteDecoration(apiId)
          .catch(e => showStatus('Delete deco failed: ' + e.message, true));
      }
    };

    window.createPage = function (opts) {
      opts = opts || {};
      const state = nb.getState();
      const nextNum = state.nextId || Math.max(...state.pages.map(p => p.pageNumber), 0) + 1;
      // optimistic local, then create on server
      (async () => {
        try {
          const resolve2 = window.MemoriumThemeConfig
            ? window.MemoriumThemeConfig.resolveThemeId
            : t => t || 'classic-leather';
          const resolvePaper = window.MemoriumPaperConfig
            ? window.MemoriumPaperConfig.normalizePaper
            : p => p || 'plain';
          const curTheme = opts.theme
            ? resolve2(opts.theme)
            : resolve2(
                state.pages[state.currentPageIndex]?.theme ||
                  localStorage.getItem('memorium_theme') ||
                  'classic-leather'
              );
          const curPaper = opts.paper
            ? resolvePaper(opts.paper)
            : resolvePaper(
                state.pages[state.currentPageIndex]?.paper ||
                  localStorage.getItem('memorium_paper') ||
                  'plain'
              );
          // pen handled locally via notebook createPage pen selection
          if (opts.pen && window.MemoriumPen && window.MemoriumPen.selectPen) {
            try {
              window.MemoriumPen.selectPen(opts.pen);
            } catch (_) {}
          }
          const payload = {
            pageNumber: nextNum,
            title: 'Page ' + nextNum,
            content: '<p><span class="page-first-letter">D</span>ear Diary…</p>',
            theme: curTheme,
            paper: curPaper,
          };
          // optional metadata for 11I/11L
          if (opts.mood != null) payload.mood = opts.mood;
          if (opts.weather != null) payload.weather = opts.weather;
          if (opts.date != null) payload.date = opts.date;
          if (opts.location != null) payload.location = opts.location;
          const res = await api.createPage(journalId, payload);
          // reload from API to get correct ordering
          await loadFromAPI();
          window.loadPage(state.pages.length - 1);
        } catch (e) {
          showStatus('Create page failed: ' + e.message, true);
          // fallback to local with same opts
          try {
            originalCreatePage(opts);
          } catch (_) {
            originalCreatePage();
          }
        }
      })();
      // return placeholder
      return { id: nextNum, pageNumber: nextNum };
    };

    // Also handle theme changes via API — page + journal level
    window.addEventListener('memorium:themechange', async e => {
      const theme = e.detail && (e.detail.theme || e.detail.themeId);
      if (!theme) return;
      // Update journal-level theme (source of truth per spec)
      try {
        if (window.MemoriumAPI && window.MemoriumAPI.isAuthed()) {
          await api.updateJournal(journalId, { themeId: theme });
        }
      } catch (err) {
        console.warn('journal theme save failed', err);
      }
      // Also update current page theme
      const state = nb.getState();
      const cur = state.pages[state.currentPageIndex];
      if (!cur || !cur._apiId) return;
      try {
        await api.updatePage(cur._apiId, { theme });
      } catch (err) {
        console.warn('page theme save failed', err);
      }
    });

    // Paper changes — page + journal level (11F)
    window.addEventListener('memorium:paperchange', async e => {
      const paper = e.detail && e.detail.paper;
      if (!paper) return;
      try {
        if (window.MemoriumAPI && window.MemoriumAPI.isAuthed()) {
          await api.updateJournal(journalId, { paper });
        }
      } catch (err) {
        console.warn('journal paper save failed', err);
      }
      const state = nb.getState();
      const cur = state.pages[state.currentPageIndex];
      if (!cur || !cur._apiId) return;
      try {
        await api.updatePage(cur._apiId, { paper });
      } catch (err) {
        console.warn('page paper save failed', err);
      }
    });

    // Metadata changes — page level only (11I)
    window.addEventListener('memorium:metachange', async e => {
      const detail = e.detail || {};
      const { field, value, pageId } = detail;
      if (!field) return;
      const state = nb.getState();
      // Find page by apiId or numeric id
      const cur =
        state.pages.find(
          p => String(p.id) === String(pageId) || String(p._apiId) === String(pageId)
        ) || state.pages[state.currentPageIndex];
      if (!cur || !cur._apiId) return;
      const payload = {};
      if (field === 'date') payload.date = value;
      else if (field === 'mood') payload.mood = value;
      else if (field === 'weather') payload.weather = value;
      else if (field === 'location') payload.location = value;
      else return;
      try {
        await api.updatePage(cur._apiId, payload);
      } catch (err) {
        console.warn('page metadata save failed', err);
      }
    });

    // Initial load
    await loadFromAPI();

    // Handle drag end for decorations to PUT position
    // Patch makeDraggable end already calls saveState; we also need to PUT
    // We will intercept via mutation observer or override renderDecorations drag end
    // For simplicity, after any decoration drag, the saveState will be called, but we also need to persist to API
    // We'll watch for pointerup on decorations
    document.addEventListener('pointerup', async e => {
      const target = e.target.closest && e.target.closest('.decoration');
      if (!target || !target.dataset.id) return;
      const state2 = nb.getState();
      const cur2 = state2.pages[state2.currentPageIndex];
      const deco = cur2 ? cur2.decorations.find(d => d.id === target.dataset.id) : null;
      if (!deco || !deco._apiId) return;
      // x,y already updated in state via drag
      try {
        await api.updateDecoration(deco._apiId, {
          position: { x: deco.x, y: deco.y },
          rotation: deco.rot,
        });
      } catch {}
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const jid = await ensureJournal();
    if (jid && window.MemoriumNotebook) {
      // Wait a tick for notebook init
      setTimeout(() => patchNotebookWithAPI(jid), 300);
    } else if (jid) {
      // notebook not yet loaded, poll
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (window.MemoriumNotebook) {
          clearInterval(iv);
          patchNotebookWithAPI(jid);
        }
        if (tries > 20) clearInterval(iv);
      }, 200);
    }
  });

  // 11N — Fallback page navigation for local mode or when API path didn't trigger
  // Ensures ?page= or ?pageId= works even when not going through loadFromAPI
  function tryLocalPageNav() {
    const req = getRequestedPageParams();
    if (!req.page && !req.pageId) return;
    const nb = window.MemoriumNotebook;
    if (!nb || !nb.getState) return false;
    try {
      const state = nb.getState();
      if (!state || !Array.isArray(state.pages) || !state.pages.length) return false;
      const idx = findPageIndex(state.pages, req);
      if (idx >= 0 && idx !== state.currentPageIndex) {
        if (window.loadPage) window.loadPage(idx);
        const sec = document.getElementById('notebook-section');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
      }
    } catch (e) {}
    return false;
  }
  // Poll shortly after load for local navigation
  document.addEventListener('DOMContentLoaded', function () {
    let attempts = 0;
    const iv2 = setInterval(function () {
      attempts++;
      if (tryLocalPageNav()) clearInterval(iv2);
      if (attempts > 20) clearInterval(iv2);
    }, 300);
  });

  window.MemoriumJournal = {
    getJournalId,
    ensureJournal,
    getRequestedPageParams: getRequestedPageParams,
  };
})();
