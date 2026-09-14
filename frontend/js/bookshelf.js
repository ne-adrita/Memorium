/* Memorium — Bookshelf Experience (Step 11M)
   Physical vintage books on a wooden shelf.
   Reuses existing Journal/Page APIs and theme system.
   No duplicate endpoints — smallest compatible enrichment.
*/
(function () {
  'use strict';

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function formatLastUpdated(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays === 0) {
      const hours = Math.floor(diffMs / 3600000);
      if (hours <= 0) return 'Updated just now';
      if (hours === 1) return 'Updated 1 hour ago';
      return 'Updated ' + hours + ' hours ago';
    }
    if (diffDays === 1) return 'Updated yesterday';
    if (diffDays < 7) return 'Updated ' + diffDays + ' days ago';
    if (diffDays < 30) return 'Updated ' + Math.floor(diffDays / 7) + ' weeks ago';
    // vintage date
    return (
      'Updated ' +
      d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    );
  }

  function shortDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getThemeColors(themeId) {
    const cfg = window.MemoriumThemeConfig;
    if (cfg && cfg.getTheme) {
      const t = cfg.getTheme(cfg.resolveThemeId ? cfg.resolveThemeId(themeId) : themeId);
      if (t && t.colors) return t.colors;
    }
    // fallback
    return {
      cover: '#5C3D2E',
      coverEdge: '#4A2E20',
      coverInner: '#6B4F3B',
      paper: '#F8F1E7',
      border: '#DDD1BF',
      shadow: 'rgba(50,35,25,0.28)',
      ribbon: '#C9A227',
      text: '#2F241F',
    };
  }

  function themeLabel(themeId) {
    const cfg = window.MemoriumThemeConfig;
    if (cfg && cfg.getTheme) {
      const t = cfg.getTheme(cfg.resolveThemeId ? cfg.resolveThemeId(themeId) : themeId);
      if (t && t.name) return t.name;
    }
    if (!themeId) return 'Classic';
    return themeId.replace(/-/g, ' ').replace(/\b\w/g, s => s.toUpperCase());
  }

  function stripPreview(text, max) {
    if (!text) return '';
    const s = String(text).replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    return s.slice(0, max).trim() + '…';
  }

  async function render() {
    const grid = document.getElementById('bookshelfGrid');
    const countEl = document.getElementById('bookshelfCount');
    if (!grid) return;

    grid.setAttribute('aria-busy', 'true');

    if (!window.MemoriumAPI || !window.MemoriumAPI.isAuthed()) {
      if (countEl) countEl.textContent = 'Sign in to see your shelf';
      grid.innerHTML =
        '<div class="bookshelf-auth" role="status">' +
        '<p style="margin-bottom:0.6rem;font-size:1.05rem">Please <a href="login.html">sign in</a> to open your library.</p>' +
        '<p style="color:rgba(248,241,231,0.6);font-size:0.88rem">Your vintage diaries are waiting on the shelf.</p>' +
        '</div>';
      grid.setAttribute('aria-busy', 'false');
      return;
    }

    grid.innerHTML =
      '<div class="bookshelf-loading" role="status"><div class="bookshelf-spinner" aria-hidden="true"></div><p>Dusting the shelves…</p></div>';

    try {
      const res = await window.MemoriumAPI.listJournals();
      const journals = res.data || [];

      if (!journals.length) {
        if (countEl) countEl.textContent = '0 journals · your shelf is empty';
        grid.innerHTML = renderEmpty();
        bindCreate(grid);
        bindMigrate(grid);
        grid.setAttribute('aria-busy', 'false');
        return;
      }

      // Ensure sorting: pinned first, then effectiveUpdatedAt / updatedAt desc
      journals.sort((a, b) => {
        const pinA = a.isPinned ? 1 : 0;
        const pinB = b.isPinned ? 1 : 0;
        if (pinA !== pinB) return pinB - pinA;
        const tA = new Date(
          a.effectiveUpdatedAt || a.lastPageUpdatedAt || a.updatedAt || 0
        ).getTime();
        const tB = new Date(
          b.effectiveUpdatedAt || b.lastPageUpdatedAt || b.updatedAt || 0
        ).getTime();
        return tB - tA;
      });

      if (countEl) {
        const totalPages = journals.reduce((s, j) => s + (j.pageCount || 0), 0);
        const pinnedCount = journals.filter(j => j.isPinned).length;
        let txt = journals.length + (journals.length === 1 ? ' journal' : ' journals');
        if (totalPages) txt += ' · ' + totalPages + (totalPages === 1 ? ' page' : ' pages');
        if (pinnedCount) txt += ' · ' + pinnedCount + ' pinned';
        countEl.textContent = txt;
      }

      // If backend didn't enrich (older data), lazily enrich pageCount/preview without loading full content
      const needsEnrich = journals.some(j => j.pageCount === undefined);
      if (needsEnrich) {
        // Fetch counts in parallel but limited — one request per journal for page list (only needs count, but we also get preview)
        // Use Promise.all with graceful fallback
        await Promise.all(
          journals.map(async j => {
            if (j.pageCount !== undefined) return;
            try {
              const pr = await window.MemoriumAPI.listPages(j._id);
              const pages = pr.data || [];
              j.pageCount = pages.length;
              // preview from pageNumber 1
              const first = pages.find(p => p.pageNumber === 1) || pages[0];
              if (first && first.content) {
                j.previewText = first.content
                  .replace(/<[^>]*>/g, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .slice(0, 140);
              } else j.previewText = '';
              const latest = pages.reduce((max, p) => {
                const t = new Date(p.updatedAt).getTime();
                return t > max ? t : max;
              }, 0);
              if (latest)
                j.effectiveUpdatedAt = new Date(
                  Math.max(new Date(j.updatedAt).getTime(), latest)
                ).toISOString();
            } catch (_) {
              j.pageCount = j.pageCount || 0;
              j.previewText = j.previewText || '';
            }
          })
        );
        // re-sort after enrich
        journals.sort((a, b) => {
          const pinA = a.isPinned ? 1 : 0;
          const pinB = b.isPinned ? 1 : 0;
          if (pinA !== pinB) return pinB - pinA;
          const tA = new Date(a.effectiveUpdatedAt || a.updatedAt || 0).getTime();
          const tB = new Date(b.effectiveUpdatedAt || b.updatedAt || 0).getTime();
          return tB - tA;
        });
      }

      grid.innerHTML = '';

      // Optional pinned divider if any pinned
      const hasPinned = journals.some(j => j.isPinned);
      const hasUnpinned = journals.some(j => !j.isPinned);

      journals.forEach((j, idx) => {
        // Insert divider between pinned and unpinned
        if (hasPinned && hasUnpinned && idx > 0 && !j.isPinned && journals[idx - 1].isPinned) {
          const div = document.createElement('div');
          div.className = 'bookshelf-divider';
          div.setAttribute('aria-hidden', 'true');
          div.innerHTML = '<span>More journals</span>';
          grid.appendChild(div);
        }

        const colors = getThemeColors(j.themeId || j.theme || 'classic-leather');
        const coverBg =
          'linear-gradient(135deg, ' +
          colors.cover +
          ' 0%, ' +
          colors.coverEdge +
          ' 45%, ' +
          colors.coverInner +
          ' 100%)';
        const lastIso = j.effectiveUpdatedAt || j.lastPageUpdatedAt || j.updatedAt;
        const pageCount = j.pageCount != null ? j.pageCount : 0;
        const preview = j.previewText ? stripPreview(j.previewText, 92) : '';
        const isPinned = !!j.isPinned;

        const book = document.createElement('article');
        book.className = 'book' + (isPinned ? ' is-pinned' : '');
        book.setAttribute('role', 'button');
        book.setAttribute('tabindex', '0');
        book.setAttribute(
          'aria-label',
          (j.title || 'Untitled') + ', ' + pageCount + ' pages, ' + formatLastUpdated(lastIso)
        );
        book.dataset.journalId = j._id;

        book.innerHTML =
          '<div class="book-cover" data-theme="' +
          escapeHtml(j.themeId || 'classic-leather') +
          '" style="background:' +
          escapeHtml(coverBg) +
          ';border-color:' +
          escapeHtml(colors.coverEdge) +
          '">' +
          '  <div class="book-spine-edge" aria-hidden="true"></div>' +
          '  <div class="book-shine" aria-hidden="true"></div>' +
          '  <div class="book-gold-line" aria-hidden="true"></div>' +
          '  <div class="book-gold-line book-gold-line--bottom" aria-hidden="true"></div>' +
          '  <button type="button" class="book-pin-btn" aria-label="' +
          (isPinned ? 'Unpin journal' : 'Pin journal') +
          '" title="' +
          (isPinned ? 'Unpin — remove from front' : 'Pin to front') +
          '">' +
          (isPinned ? '★' : '☆') +
          '</button>' +
          '  <div class="book-ribbon" aria-hidden="true" style="background:' +
          escapeHtml(colors.ribbon || '#C9A227') +
          '"></div>' +
          '  <div class="book-title-wrap">' +
          '    <h3 class="book-title">' +
          escapeHtml(j.title || 'Untitled') +
          '</h3>' +
          '    <span class="book-theme-label">' +
          escapeHtml(themeLabel(j.themeId || j.theme)) +
          '</span>' +
          '  </div>' +
          '  <div class="book-preview" aria-hidden="true">' +
          (preview
            ? '    <div class="book-preview-text">“' + escapeHtml(preview) + '”</div>'
            : '    <div class="book-preview-empty">Empty pages await ink</div>') +
          '    <div class="book-preview-lines" style="margin-top:4px"><span></span><span></span><span></span></div>' +
          '  </div>' +
          '</div>' +
          '<div class="book-meta">' +
          '  <div class="book-meta-title" title="' +
          escapeHtml(j.title || 'Untitled') +
          '">' +
          escapeHtml(j.title || 'Untitled') +
          '</div>' +
          '  <div class="book-meta-row">' +
          '    <span class="book-page-badge" title="' +
          pageCount +
          ' pages">' +
          '📄 ' +
          pageCount +
          ' ' +
          (pageCount === 1 ? 'page' : 'pages') +
          '</span>' +
          '    <span class="book-meta-dot" aria-hidden="true">·</span>' +
          '    <span class="book-last-updated" title="' +
          escapeHtml(shortDate(lastIso)) +
          '">' +
          escapeHtml(formatLastUpdated(lastIso)) +
          '</span>' +
          '  </div>' +
          '</div>' +
          '<div class="book-shadow" aria-hidden="true"></div>';

        grid.appendChild(book);
      });

      // Bind interactions
      grid.querySelectorAll('.book').forEach(el => {
        const id = el.dataset.journalId;
        function openJournal() {
          localStorage.setItem('memorium-current-journal', id);
          window.location.href = 'journal.html?journalId=' + encodeURIComponent(id);
        }
        el.addEventListener('click', e => {
          if (e.target.closest('.book-pin-btn')) return;
          openJournal();
        });
        el.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openJournal();
          }
        });
      });

      // Pin toggles
      grid.querySelectorAll('.book-pin-btn').forEach(btn => {
        btn.addEventListener('click', async e => {
          e.stopPropagation();
          e.preventDefault();
          const bookEl = btn.closest('.book');
          const id = bookEl.dataset.journalId;
          const currentlyPinned = bookEl.classList.contains('is-pinned');
          const nextPinned = !currentlyPinned;
          // Optimistic UI
          btn.textContent = nextPinned ? '★' : '☆';
          btn.setAttribute('aria-label', nextPinned ? 'Unpin journal' : 'Pin journal');
          btn.title = nextPinned ? 'Unpin — remove from front' : 'Pin to front';
          bookEl.classList.toggle('is-pinned', nextPinned);
          const prevRibbon = bookEl.querySelector('.book-ribbon');
          if (prevRibbon) prevRibbon.style.display = nextPinned ? 'block' : 'none';
          try {
            await window.MemoriumAPI.updateJournal(id, { isPinned: nextPinned });
            if (window.MemoriumUtils)
              window.MemoriumUtils.showToast(
                nextPinned ? 'Pinned to front' : 'Unpinned',
                'success'
              );
            // Re-render to reflect sorted order
            render();
          } catch (err) {
            // revert
            bookEl.classList.toggle('is-pinned', currentlyPinned);
            btn.textContent = currentlyPinned ? '★' : '☆';
            if (window.MemoriumUtils) window.MemoriumUtils.showToast(err.message, 'error');
            else alert(err.message);
          }
        });
      });

      // Bind delete via hover? Keep subtle: long-press or context? For now no delete button on shelf to preserve vintage feel.
      // Delete still available via journal page; but we add a small hidden delete for completeness on right-click
      grid.setAttribute('aria-busy', 'false');
    } catch (err) {
      if (window.MemoriumUtils) window.MemoriumUtils.showToast(err.message, 'error');
      grid.innerHTML =
        '<div class="bookshelf-auth" role="alert" style="border-color:rgba(184,92,92,0.22)">' +
        '<p style="color:#b85c5c">' +
        escapeHtml(err.message) +
        '</p>' +
        (err.status === 401
          ? '<p style="margin-top:0.6rem"><a href="login.html" style="color:#c9a227;text-decoration:underline">Sign in</a></p>'
          : '') +
        '<p style="margin-top:0.8rem"><button type="button" class="btn-shelf-outline" id="bookshelfRetry">Retry</button></p>' +
        '</div>';
      const retry = document.getElementById('bookshelfRetry');
      if (retry) retry.addEventListener('click', render);
      grid.setAttribute('aria-busy', 'false');
      if (countEl) countEl.textContent = 'Could not load shelf';
    }
  }

  function renderEmpty() {
    return (
      '' +
      '<div class="bookshelf-empty" role="status">' +
      '  <div class="bookshelf-empty-illustration" aria-hidden="true">' +
      '    <div class="empty-book" style="background: linear-gradient(135deg, #7a5a42 0%, #5c3d2e 100%)"></div>' +
      '    <div class="empty-book empty-book--tall" style="background: linear-gradient(135deg, #6b2436 0%, #4a1824 100%)"></div>' +
      '    <div class="empty-book empty-book--tilted" style="background: linear-gradient(135deg, #4a6b8a 0%, #1e3a5c 100%); transform: rotate(-6deg)"></div>' +
      '    <div class="empty-book empty-book--short" style="background: linear-gradient(135deg, #8b5a6b 0%, #6b4452 100%)"></div>' +
      '  </div>' +
      '  <div class="bookshelf-empty-text">' +
      '    <h3>Your shelf is waiting</h3>' +
      '    <p>Every vintage library begins with a single diary. Create your first journal — it will age beautifully with you, page by page.</p>' +
      '  </div>' +
      '  <div class="bookshelf-empty-actions">' +
      '    <button type="button" class="btn-shelf" id="create-first">✍️ Create First Journal</button>' +
      '    <button type="button" class="btn-shelf-outline" id="migrate-local" style="display:none">Migrate local pages</button>' +
      '  </div>' +
      '  <p style="margin-top:0.6rem;color:rgba(248,241,231,0.45);font-family:var(--heading-font,\'Cormorant Garamond\',serif);font-size:0.78rem;letter-spacing:0.06em;text-transform:uppercase">Tip: your cover theme will show here as a real book</p>' +
      '</div>'
    );
  }

  function bindCreate(scope) {
    const btn = scope
      ? scope.querySelector('#create-first')
      : document.getElementById('create-first');
    const newBtn = document.getElementById('bookshelfNewBtn');
    const local =
      window.MemoriumAPI &&
      window.MemoriumAPI.getLocalNotebookState &&
      window.MemoriumAPI.getLocalNotebookState();
    const migrateBtn = scope
      ? scope.querySelector('#migrate-local')
      : document.getElementById('migrate-local');
    if (migrateBtn && local && local.pages && local.pages.length) migrateBtn.style.display = '';

    async function createFlow(defaultTitle) {
      if (!window.MemoriumAPI.isAuthed()) {
        window.location.href = 'login.html';
        return;
      }
      const title = prompt(
        'Journal title:',
        defaultTitle || 'My Journal ' + new Date().toLocaleDateString()
      );
      if (!title || !title.trim()) return;
      try {
        const res = await window.MemoriumAPI.createJournal({ title: title.trim() });
        localStorage.setItem('memorium-current-journal', res.data._id);
        if (window.MemoriumUtils) window.MemoriumUtils.showToast('Journal created', 'success');
        window.location.href = 'journal.html?journalId=' + encodeURIComponent(res.data._id);
      } catch (err) {
        if (window.MemoriumUtils) window.MemoriumUtils.showToast(err.message, 'error');
        else alert(err.message);
      }
    }

    if (btn) btn.addEventListener('click', () => createFlow('My Journal'));
    if (newBtn) {
      newBtn.addEventListener('click', e => {
        e.preventDefault();
        createFlow('My Journal');
      });
    }
    // Also intercept any legacy link with href=journal.html btn
    document.querySelectorAll('a[href="journal.html"].btn').forEach(a => {
      a.addEventListener('click', async e => {
        if (!window.MemoriumAPI.isAuthed()) return;
        e.preventDefault();
        createFlow('My Journal');
      });
    });
  }

  function bindMigrate(scope) {
    const b = scope
      ? scope.querySelector('#migrate-local')
      : document.getElementById('migrate-local');
    if (!b) return;
    const local = window.MemoriumAPI.getLocalNotebookState();
    if (!local || !local.pages || !local.pages.length) {
      b.style.display = 'none';
      return;
    }
    b.style.display = '';
    b.addEventListener('click', async () => {
      if (!local || !local.pages.length) {
        if (window.MemoriumUtils)
          window.MemoriumUtils.showToast('No local data to migrate', 'error');
        return;
      }
      let jid = localStorage.getItem('memorium-current-journal');
      if (!jid) {
        try {
          const res = await window.MemoriumAPI.createJournal({
            title: 'Migrated Journal',
            description: 'From localStorage',
          });
          jid = res.data._id;
        } catch (e) {
          if (window.MemoriumUtils)
            window.MemoriumUtils.showToast('Create journal failed: ' + e.message, 'error');
          return;
        }
      }
      const loader = window.MemoriumUtils
        ? window.MemoriumUtils.showLoading(document.body, 'Migrating…')
        : null;
      try {
        const res = await window.MemoriumAPI.migrateLocalToBackend(jid);
        if (window.MemoriumUtils)
          window.MemoriumUtils.showToast('Migrated ' + res.migrated + ' pages', 'success');
      } catch (e) {
        if (window.MemoriumUtils) window.MemoriumUtils.showToast(e.message, 'error');
      } finally {
        if (loader && window.MemoriumUtils) window.MemoriumUtils.hideLoading(document.body);
      }
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    bindCreate();
    // Re-render if theme changes anywhere (should not happen on bookshelf but keep live)
    window.addEventListener('memorium:themechange', () => {
      // debounced
      setTimeout(render, 300);
    });
  });

  window.MemoriumBookshelf = { render };
})();
