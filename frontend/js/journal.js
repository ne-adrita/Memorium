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

  function showStatus(msg, isError) {
    const sec = document.getElementById('notebook-section');
    if (!sec) return;
    let el = document.getElementById('journal-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'journal-status';
      el.style.cssText = 'max-width:600px;margin:1rem auto;padding:.8rem 1rem;border-radius:10px;text-align:center;font-size:.9rem';
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
      const created = await api.createJournal({ title: 'My Journal', description: 'First journal' });
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
    let pageIdMap = {}; // local id -> api _id

    async function loadFromAPI() {
      try {
        const res = await api.listPages(journalId);
        apiPages = res.data || [];
        apiPages.sort((a,b)=>a.pageNumber - b.pageNumber);
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
              apiPages.sort((a,b)=>a.pageNumber - b.pageNumber);
            }
          }
          if (!apiPages.length) {
            // create initial two pages to match local defaults
            const p1 = await api.createPage(journalId, { pageNumber: 1, title: 'Page 1', content: '<p><span class="page-first-letter">D</span>ear Diary…</p>', theme: 'parchment' });
            const p2 = await api.createPage(journalId, { pageNumber: 2, title: 'Page 2', content: '', theme: 'parchment' });
            apiPages = [p1.data, p2.data];
          }
        }
        // Convert API pages to local state shape
        const newPages = apiPages.map(p => ({
          _apiId: p._id,
          id: p.pageNumber,
          pageNumber: p.pageNumber,
          title: p.title,
          content: p.content,
          theme: p.theme,
          decorations: [] // will load per page
        }));
        // Load decorations per page
        for (let np of newPages) {
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
              config: d.config
            }));
          } catch {}
        }
        // Replace notebook state
        const state = nb.getState();
        state.pages = newPages;
        state.currentPageIndex = 0;
        state.nextId = Math.max(...newPages.map(p=>p.pageNumber), 0) + 1;
        // Persist locally as backup but primary is API
        try { localStorage.setItem('memorium-state-v2', JSON.stringify(state)); } catch {}
        // Re-render via notebook's internal function (trigger via loadPage)
        if (window.loadPage) window.loadPage(0);
        // Also refresh decorations rendering
        showStatus('Loaded ' + newPages.length + ' pages from cloud', false);
      } catch (e) {
        showStatus('Failed to load pages: ' + e.message, true);
        console.error(e);
      }
    }

    // Override savePage to also PUT to API (debounced)
    let saveTimeout = null;
    window.savePage = function() {
      // call original to update local state
      originalSavePage();
      const state = nb.getState();
      const cur = state.pages[state.currentPageIndex];
      if (!cur || !cur._apiId) return;
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(async () => {
        try {
          // Get current content from DOM
          const area = document.querySelector(`.notebook-page[data-page="${cur.id}"] .page-writing-area`) || document.querySelector('.page-writing-area');
          const content = area ? area.innerHTML : cur.content;
          await api.updatePage(cur._apiId, { content, theme: cur.theme });
          cur.content = content;
          showStatus('Saved to cloud', false);
        } catch (e) {
          showStatus('Save failed, kept locally: ' + e.message, true);
        }
      }, 600);
    };

    // Override addDecoration to also POST
    window.addDecoration = function(type, opts={}) {
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
            config: {}
          });
          deco._apiId = res.data._id;
          deco.id = res.data._id;
          // update state and persist
          try { localStorage.setItem('memorium-state-v2', JSON.stringify(state)); } catch {}
        } catch (e) { showStatus('Decoration save failed: ' + e.message, true); }
      })();
      return deco;
    };

    window.removeDecoration = function(id) {
      const state = nb.getState();
      const cur = state.pages[state.currentPageIndex];
      const deco = cur ? cur.decorations.find(d=>d.id===id || d._apiId===id) : null;
      const apiId = deco ? (deco._apiId || deco.id) : id;
      originalRemoveDecoration(id);
      if (cur && cur._apiId && apiId) {
        api.deleteDecoration(apiId).catch(e=>showStatus('Delete deco failed: '+e.message,true));
      }
    };

    window.createPage = function() {
      const state = nb.getState();
      const nextNum = (state.nextId || Math.max(...state.pages.map(p=>p.pageNumber),0)+1);
      // optimistic local, then create on server
      (async () => {
        try {
          const res = await api.createPage(journalId, {
            pageNumber: nextNum,
            title: 'Page ' + nextNum,
            content: '<p><span class="page-first-letter">D</span>ear Diary…</p>',
            theme: state.pages[state.currentPageIndex]?.theme || 'parchment'
          });
          // reload from API to get correct ordering
          await loadFromAPI();
          window.loadPage(state.pages.length-1);
        } catch (e) {
          showStatus('Create page failed: '+e.message, true);
          // fallback to local
          originalCreatePage();
        }
      })();
      // return placeholder
      return { id: nextNum, pageNumber: nextNum };
    };

    // Also handle theme changes via API
    window.addEventListener('memorium:themechange', async (e) => {
      const state = nb.getState();
      const cur = state.pages[state.currentPageIndex];
      if (!cur || !cur._apiId) return;
      try {
        await api.updatePage(cur._apiId, { theme: e.detail.theme });
      } catch (err) { console.warn('theme save failed', err); }
    });

    // Initial load
    await loadFromAPI();

    // Handle drag end for decorations to PUT position
    // Patch makeDraggable end already calls saveState; we also need to PUT
    // We will intercept via mutation observer or override renderDecorations drag end
    // For simplicity, after any decoration drag, the saveState will be called, but we also need to persist to API
    // We'll watch for pointerup on decorations
    document.addEventListener('pointerup', async (e) => {
      const target = e.target.closest && e.target.closest('.decoration');
      if (!target || !target.dataset.id) return;
      const state2 = nb.getState();
      const cur2 = state2.pages[state2.currentPageIndex];
      const deco = cur2 ? cur2.decorations.find(d=>d.id===target.dataset.id) : null;
      if (!deco || !deco._apiId) return;
      // x,y already updated in state via drag
      try {
        await api.updateDecoration(deco._apiId, { position: { x: deco.x, y: deco.y }, rotation: deco.rot });
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

  window.MemoriumJournal = { getJournalId, ensureJournal };
})();
