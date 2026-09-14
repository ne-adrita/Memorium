/* ============================================================
   MEMORIUM — Paper Selector (Step 11F)
   7 papers per page, persists via Page/Journal API + local fallback
   Vintage desk panel, theme-independent, writing-safe
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_PAPER = 'memorium_paper';
  const JOURNAL_PAPER_CACHE = 'memorium_journal_paper_';

  function cfg() {
    return window.MemoriumPaperConfig;
  }
  function getDefaultPaper() {
    const c = cfg();
    return c ? c.DEFAULT_PAPER : 'plain';
  }
  function normalizePaper(raw) {
    const c = cfg();
    if (!c) return raw || 'plain';
    return c.normalizePaper(raw);
  }
  function isValidPaper(id) {
    const c = cfg();
    return c ? c.isValidPaper(id) : false;
  }
  function getPaperData(id) {
    const c = cfg();
    if (!c) return null;
    return c.PAPERS[id] || c.PAPERS[c.DEFAULT_PAPER];
  }

  // Persistence helpers — per journal cache
  function getJournalCachedPaper(journalId) {
    if (!journalId) return null;
    try {
      return localStorage.getItem(JOURNAL_PAPER_CACHE + journalId);
    } catch (_) {
      return null;
    }
  }
  function setJournalCachedPaper(journalId, paperId) {
    if (!journalId) return;
    try {
      localStorage.setItem(JOURNAL_PAPER_CACHE + journalId, paperId);
    } catch (_) {}
  }
  function getSavedPaper() {
    try {
      const v = localStorage.getItem(STORAGE_PAPER);
      if (!v) return null;
      return isValidPaper(v) ? v : null;
    } catch (_) {
      return null;
    }
  }
  function savePaper(paperId) {
    try {
      localStorage.setItem(STORAGE_PAPER, paperId);
    } catch (_) {}
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

  // Current paper for current page
  let activePaperId = null;

  function ensurePaperPatternEl(pageEl) {
    if (!pageEl) return null;
    let pat = pageEl.querySelector('.paper-pattern');
    if (!pat) {
      pat = document.createElement('div');
      pat.className = 'paper-pattern';
      pat.setAttribute('aria-hidden', 'true');
      // insert as first child inside page, behind content
      pageEl.insertBefore(pat, pageEl.firstChild);
    }
    return pat;
  }

  function applyPaperAttributes(paperId) {
    const resolved = normalizePaper(paperId);
    document.body.setAttribute('data-paper', resolved);
    document.documentElement.setAttribute('data-paper', resolved);
    const notebook = document.querySelector('.notebook');
    if (notebook) notebook.setAttribute('data-paper', resolved);
    document.querySelectorAll('.notebook-page, .page').forEach(el => {
      el.setAttribute('data-paper', resolved);
      // keep class for legacy
      el.className = el.className.replace(/\bpaper-[\w-]+\b/g, '').trim();
      el.classList.add('paper-' + resolved);
      ensurePaperPatternEl(el);
    });
  }

  function applyPaper(paperId, opts) {
    opts = opts || {};
    const c = cfg();
    if (!c) return;
    let resolved = normalizePaper(paperId);
    if (!c.isValidPaper(resolved)) resolved = c.DEFAULT_PAPER;
    activePaperId = resolved;

    // Update DOM
    applyPaperAttributes(resolved);
    // Update state for current page if notebook exists
    if (
      window.MemoriumNotebook &&
      typeof window.MemoriumNotebook.getState === 'function' &&
      opts.syncNotebook !== false
    ) {
      if (!applyPaper._inNotebookSync) {
        applyPaper._inNotebookSync = true;
        try {
          const st = window.MemoriumNotebook.getState();
          const cur = st.pages[st.currentPageIndex];
          if (cur) {
            cur.paper = resolved;
            // persist locally
            try {
              localStorage.setItem('memorium-state-v2', JSON.stringify(st));
            } catch (_) {}
            // re-render to ensure data-paper per page (renderCurrentPage handles theme only, we handle paper here)
            // Apply per-page data-paper correctly
            updatePagePaperAttributes();
          }
        } catch (_) {}
        applyPaper._inNotebookSync = false;
      }
    } else {
      // No notebook yet, just set global
      updatePagePaperAttributes();
    }

    if (opts.persist !== false) savePaper(resolved);
    highlightSelection(resolved);
    // Journal DB persistence
    if (opts.persistJournal !== false) persistJournalPaper(resolved);
    // Page DB persistence
    if (opts.persistPage !== false) persistPagePaper(resolved);

    document.dispatchEvent(
      new CustomEvent('memorium:paperchange', { detail: { paper: resolved, paperId: resolved } })
    );
    updatePreview(resolved);
    return resolved;
  }

  function updatePagePaperAttributes() {
    // Ensure each DOM page reflects its state paper, not just active global
    try {
      if (!window.MemoriumNotebook || !window.MemoriumNotebook.getState) {
        applyPaperAttributes(activePaperId);
        return;
      }
      const st = window.MemoriumNotebook.getState();
      const leftEl = document.querySelector('.notebook-page--left');
      const rightEl = document.querySelector('.notebook-page--right');
      // Map state pages to DOM slots (only first 2)
      const mapping = [
        { page: st.pages[0], el: leftEl },
        { page: st.pages[1], el: rightEl },
      ];
      mapping.forEach(({ page, el }) => {
        if (!page || !el) return;
        const p = normalizePaper(page.paper);
        el.setAttribute('data-paper', p);
        el.className = el.className.replace(/\bpaper-[\w-]+\b/g, '').trim();
        el.classList.add('paper-' + p);
        ensurePaperPatternEl(el);
      });
      // Also keep global attribute for default
      const cur = st.pages[st.currentPageIndex];
      if (cur) {
        const curPaper = normalizePaper(cur.paper);
        document.body.setAttribute('data-paper', curPaper);
        document.documentElement.setAttribute('data-paper', curPaper);
        const nb = document.querySelector('.notebook');
        if (nb) nb.setAttribute('data-paper', curPaper);
        activePaperId = curPaper;
        highlightSelection(curPaper);
        updatePreview(curPaper);
      }
    } catch (_) {
      applyPaperAttributes(activePaperId);
    }
  }

  async function persistJournalPaper(paperId) {
    try {
      const journalId = getCurrentJournalId();
      if (!journalId) return;
      if (!window.MemoriumAPI || !window.MemoriumAPI.isAuthed()) return;
      setJournalCachedPaper(journalId, paperId);
      await window.MemoriumAPI.updateJournal(journalId, { paper: paperId });
    } catch (_) {}
  }

  async function persistPagePaper(paperId) {
    try {
      if (!window.MemoriumNotebook || !window.MemoriumNotebook.getState) return;
      if (!window.MemoriumAPI || !window.MemoriumAPI.isAuthed()) return;
      const st = window.MemoriumNotebook.getState();
      const cur = st.pages[st.currentPageIndex];
      if (!cur || !cur._apiId) return;
      await window.MemoriumAPI.updatePage(cur._apiId, { paper: paperId });
    } catch (_) {}
  }

  async function restoreJournalPaper() {
    const journalId = getCurrentJournalId();
    if (!journalId) return null;
    if (!window.MemoriumAPI || !window.MemoriumAPI.isAuthed()) {
      const cached = getJournalCachedPaper(journalId);
      if (cached && isValidPaper(cached)) return cached;
      return null;
    }
    try {
      const res = await window.MemoriumAPI.getJournal(journalId);
      const j = res.data || res;
      if (j && j.paper && isValidPaper(j.paper)) {
        setJournalCachedPaper(journalId, j.paper);
        return j.paper;
      }
      return null;
    } catch (_) {
      const cached = getJournalCachedPaper(journalId);
      if (cached && isValidPaper(cached)) return cached;
      return null;
    }
  }

  // UI
  function highlightSelection(paperId) {
    activePaperId = paperId;
    document.querySelectorAll('.paper-item').forEach(el => {
      const on = el.dataset.paper === paperId;
      el.classList.toggle('selected', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      const check = el.querySelector('.paper-item-check');
      if (check) check.style.opacity = on ? '1' : '0';
      const label = el.querySelector('.paper-item-selected-label');
      if (label) label.style.display = on ? 'inline' : 'none';
    });
    updatePreview(paperId);
  }

  function updatePreview(paperId) {
    const preview = document.getElementById('paper-preview');
    if (!preview) return;
    const data = getPaperData(paperId);
    if (!data) return;
    const nameEl = preview.querySelector('.paper-preview-name');
    const descEl = preview.querySelector('.paper-preview-desc');
    if (nameEl) nameEl.textContent = data.label;
    if (descEl) descEl.textContent = data.description;
    // preview pattern
    const mini = preview.querySelector('.paper-preview-mini');
    if (mini) {
      mini.className = 'paper-preview-mini paper-preview-' + data.id;
      mini.setAttribute('data-paper', data.id);
      // ensure pattern inside mini if needed
      let pat = mini.querySelector('.paper-preview-pattern');
      if (!pat) {
        pat = document.createElement('div');
        pat.className = 'paper-preview-pattern';
        pat.style.cssText = 'position:absolute;inset:0;pointer-events:none;border-radius:inherit;';
        mini.style.position = 'relative';
        mini.style.overflow = 'hidden';
        mini.appendChild(pat);
      }
      // apply paper pattern to mini via inline style matching papers.css logic but simplified
      pat.className = 'paper-preview-pattern';
      // we rely on papers.css for mini via data-paper, but inline fallback
    }
  }

  function buildPaperSelector() {
    const c = cfg();
    if (!c) return null;
    if (document.getElementById('paper-system')) return document.getElementById('paper-system');
    const notebook = document.querySelector('.notebook');
    if (!notebook) return null;

    const wrapper = document.createElement('div');
    wrapper.id = 'paper-system';
    wrapper.className = 'paper-system';
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Paper selector');

    const saved = getSavedPaper() || getDefaultPaper();
    activePaperId = normalizePaper(saved);

    wrapper.innerHTML = `
      <div class="paper-system-header">
        <span class="paper-system-icon" aria-hidden="true">📄</span>
        <div>
          <h3 class="paper-system-title">Paper</h3>
          <p class="paper-system-subtitle">Choose your page texture</p>
        </div>
        <button type="button" class="paper-system-close" aria-label="Collapse paper selector" title="Collapse">—</button>
      </div>
      <div class="paper-grid" role="toolbar" aria-label="Paper types"></div>
      <div id="paper-preview" class="paper-preview" aria-live="polite">
        <div class="paper-preview-mini" data-paper="${activePaperId}">
          <div class="paper-preview-paper" aria-hidden="true"></div>
        </div>
        <div class="paper-preview-info">
          <span class="paper-preview-name"></span>
          <span class="paper-preview-desc" style="font-size:.72rem;color:var(--theme-text-muted,#6E6259);display:block;margin-top:2px"></span>
        </div>
      </div>
    `;

    const grid = wrapper.querySelector('.paper-grid');
    c.getAllPapers().forEach(paper => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'paper-item';
      btn.dataset.paper = paper.id;
      btn.setAttribute('aria-label', paper.label + ' paper');
      btn.setAttribute('aria-pressed', paper.id === activePaperId ? 'true' : 'false');
      if (paper.id === activePaperId) btn.classList.add('selected');
      // mini pattern inside button
      const patClass = 'paper-item-preview paper-preview-' + paper.id;
      btn.innerHTML = `
        <span class="${patClass}" data-paper="${paper.id}" aria-hidden="true" style="position:relative;overflow:hidden;display:block;height:56px;border-radius:8px;border:1px solid var(--theme-border,#DDD1BF);background:var(--theme-paper,#F8F1E7);">
          <span class="paper-item-pattern" style="position:absolute;inset:0;pointer-events:none;"></span>
        </span>
        <span class="paper-item-name">${paper.label}</span>
        <span class="paper-item-check" aria-hidden="true" style="opacity:${paper.id === activePaperId ? '1' : '0'}">✓</span>
        <span class="paper-item-selected-label" style="display:${paper.id === activePaperId ? 'inline' : 'none'}">✓ Selected</span>
      `;
      btn.addEventListener('click', () => applyPaper(paper.id));
      grid.appendChild(btn);
    });

    const closeBtn = wrapper.querySelector('.paper-system-close');
    let collapsed = false;
    try {
      const savedCollapsed = localStorage.getItem('memorium_paper_collapsed');
      if (savedCollapsed === 'true') collapsed = true;
    } catch (_) {}
    if (collapsed) {
      wrapper.classList.add('collapsed');
      closeBtn.textContent = '+';
      closeBtn.setAttribute('aria-label', 'Expand paper selector');
    }
    closeBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      wrapper.classList.toggle('collapsed', collapsed);
      closeBtn.textContent = collapsed ? '+' : '—';
      closeBtn.setAttribute(
        'aria-label',
        collapsed ? 'Expand paper selector' : 'Collapse paper selector'
      );
      try {
        localStorage.setItem('memorium_paper_collapsed', collapsed ? 'true' : 'false');
      } catch (_) {}
    });

    // Insert after pen holder if exists else after sound else after theme
    const penHolder = document.getElementById('pen-holder-system');
    const soundSystem = document.getElementById('sound-system');
    const themeSystem = document.getElementById('theme-family-system');
    if (penHolder && penHolder.parentNode)
      penHolder.parentNode.insertBefore(wrapper, penHolder.nextSibling);
    else if (soundSystem && soundSystem.parentNode)
      soundSystem.parentNode.insertBefore(wrapper, soundSystem.nextSibling);
    else if (themeSystem && themeSystem.parentNode)
      themeSystem.parentNode.insertBefore(wrapper, themeSystem.nextSibling);
    else {
      const parent = notebook.parentNode;
      parent.insertBefore(wrapper, notebook.nextSibling);
    }

    // Inject styles
    if (!document.getElementById('memorium-paper-style')) {
      const style = document.createElement('style');
      style.id = 'memorium-paper-style';
      style.textContent = `
        .paper-system{width:1100px;max-width:95vw;margin:1.2rem auto;background:linear-gradient(180deg,#FFFEFB 0%,#FFF8F0 100%),repeating-linear-gradient(0deg,transparent,transparent 26px,rgba(107,79,59,0.02) 26px,rgba(107,79,59,0.02) 27px);border:1px solid var(--theme-border,#DDD1BF);border-radius:16px;box-shadow:0 8px 32px var(--theme-shadow,rgba(0,0,0,0.12)),0 2px 8px rgba(0,0,0,0.06),inset 0 1px 0 rgba(255,255,255,0.9);padding:1.1rem 1.2rem 1rem;position:relative;overflow:hidden;transition:border-color 0.35s ease,box-shadow 0.35s ease;}
        .paper-system::before{content:'';position:absolute;top:0;left:18px;bottom:0;width:1px;background:rgba(201,162,39,0.18);pointer-events:none;}
        .paper-system::after{content:'';position:absolute;top:0;left:22px;bottom:0;width:1px;background:rgba(201,162,39,0.08);pointer-events:none;}
        .paper-system.collapsed .paper-grid,.paper-system.collapsed .paper-preview{display:none;}
        .paper-system-header{display:flex;align-items:center;gap:0.9rem;padding:0.2rem 0.2rem 0.9rem 1.4rem;border-bottom:1px solid rgba(107,79,59,0.08);margin:-0.2rem -0.2rem 0.9rem -0.2rem;}
        .paper-system-icon{width:36px;height:36px;display:grid;place-items:center;background:var(--theme-paper,#F8F1E7);border:1px solid var(--theme-border,#DDD1BF);border-radius:8px;font-size:18px;box-shadow:0 2px 6px rgba(0,0,0,0.06);}
        .paper-system-title{font-family:var(--heading-font,'Cormorant Garamond',serif);font-size:1.05rem;font-weight:700;color:var(--text-dark,#2F241F);letter-spacing:0.04em;margin:0;line-height:1;}
        .paper-system-subtitle{font-family:var(--heading-font,'Cormorant Garamond',serif);font-size:0.78rem;color:var(--text-muted,#9B8E84);letter-spacing:0.06em;text-transform:uppercase;margin:2px 0 0;}
        .paper-system-close{margin-left:auto;width:28px;height:28px;border-radius:50%;border:1px solid var(--theme-border,#DDD1BF);background:var(--theme-paper,#F8F1E7);font-size:16px;line-height:1;cursor:pointer;transition:all 0.2s ease;}
        .paper-system-close:hover{border-color:var(--theme-accent,#C9A227);color:var(--theme-accent);}
        .paper-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0.7rem;padding:0.2rem 0 0.9rem 1rem;}
        .paper-item{position:relative;display:flex;flex-direction:column;gap:0.4rem;padding:0.6rem 0.6rem 0.55rem;background:#FFFEFB;border:1.5px solid var(--theme-border,#DDD1BF);border-radius:12px;cursor:pointer;text-align:left;transition:all 0.22s ease;overflow:hidden;}
        .paper-item:hover{transform:translateY(-2px);box-shadow:0 6px 18px rgba(0,0,0,0.08);border-color:rgba(107,79,59,0.18);}
        .paper-item.selected{border-color:var(--theme-accent,#C9A227) !important;box-shadow:0 0 0 3px rgba(201,162,39,0.16),0 6px 18px rgba(0,0,0,0.08);}
        .paper-item:focus-visible{outline:2px solid var(--theme-accent);outline-offset:2px;}
        .paper-item-preview{position:relative;}
        .paper-item-name{font-family:var(--heading-font,'Cormorant Garamond',serif);font-size:0.78rem;font-weight:600;color:var(--text-dark,#2F241F);line-height:1.2;padding-left:2px;}
        .paper-item-check{position:absolute;top:6px;right:6px;width:20px;height:20px;border-radius:50%;background:var(--theme-accent,#C9A227);color:#fff;font-size:11px;display:grid;place-items:center;box-shadow:0 2px 6px rgba(0,0,0,0.15);transition:opacity 0.2s ease;}
        .paper-item-selected-label{font-family:var(--heading-font,'Cormorant Garamond',serif);font-size:0.68rem;font-weight:600;letter-spacing:0.04em;color:var(--theme-accent,#C9A227);padding-left:2px;}
        .paper-preview{display:flex;align-items:center;gap:0.9rem;padding:0.7rem 0.8rem 0.7rem 1rem;margin-left:1rem;background:rgba(248,241,231,0.85);border:1px solid var(--theme-border,#DDD1BF);border-radius:12px;backdrop-filter:blur(8px);transition:border-color 0.35s ease,background 0.35s ease;}
        .paper-preview-mini{flex-shrink:0;width:72px;height:44px;border-radius:8px;border:1px solid var(--theme-border,#DDD1BF);background:var(--theme-paper,#F8F1E7);position:relative;overflow:hidden;display:flex;align-items:stretch;}
        .paper-preview-paper{flex:1;background:transparent;}
        .paper-preview-info{flex:1;min-width:0;}
        .paper-preview-name{display:block;font-family:var(--heading-font,'Cormorant Garamond',serif);font-size:0.92rem;font-weight:700;color:var(--text-dark,#2F241F);line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
        @media (max-width:1024px){.paper-grid{grid-template-columns:repeat(2,1fr);} .paper-system{width:95vw;}}
        @media (max-width:768px){.paper-system{padding:0.9rem 0.8rem 0.8rem;margin:0.8rem auto;border-radius:12px;} .paper-system::before,.paper-system::after{display:none;} .paper-system-header{padding-left:0.2rem;} .paper-grid{gap:0.55rem;padding-left:0;grid-template-columns:repeat(2,1fr);} .paper-preview{margin-left:0;}}
        @media (max-width:480px){.paper-grid{grid-template-columns:1fr 1fr;gap:0.45rem;} .paper-item{padding:0.5rem;} .paper-item-name{font-size:0.72rem;}}
      `;
      document.head.appendChild(style);
    }

    updatePreview(activePaperId);
    highlightSelection(activePaperId);
    return wrapper;
  }

  async function init() {
    const c = cfg();
    if (!c) {
      setTimeout(init, 100);
      return;
    }
    // Try journal paper first, then saved, then default
    let chosen = null;
    const journalPaper = await restoreJournalPaper();
    if (journalPaper && isValidPaper(journalPaper)) {
      chosen = journalPaper;
      savePaper(chosen);
    } else {
      const saved = getSavedPaper();
      chosen = saved ? normalizePaper(saved) : getDefaultPaper();
      if (!isValidPaper(chosen)) chosen = getDefaultPaper();
    }
    activePaperId = chosen;
    // Apply globally before UI to avoid flash
    applyPaperAttributes(chosen);
    // Ensure per-page pattern elements exist after DOM ready
    const tryBuild = () => {
      if (!document.querySelector('.notebook')) {
        setTimeout(tryBuild, 300);
        return;
      }
      buildPaperSelector();
      // Ensure notebook state paper sync after load
      updatePagePaperAttributes();
      highlightSelection(chosen);
      updatePreview(chosen);
      document.dispatchEvent(
        new CustomEvent('memorium:paperchange', { detail: { paper: chosen } })
      );
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryBuild);
    else tryBuild();

    window.addEventListener('memorium:journalchange', async () => {
      const jt = await restoreJournalPaper();
      if (jt) applyPaper(jt);
    });
  }

  window.MemoriumPaper = {
    getPaper: getPaperData,
    getAllPapers: () => (cfg() ? cfg().getAllPapers() : []),
    getCurrentPaper: () => activePaperId,
    getSavedPaper,
    isValidPaper,
    normalizePaper,
    applyPaper,
    buildPaperSelector,
    getDefaultPaper,
  };

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 0));
  else setTimeout(init, 0);

  // Listen to notebook page changes to update preview
  document.addEventListener('memorium:pagechange', () => updatePagePaperAttributes());
})();
