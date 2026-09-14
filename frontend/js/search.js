/* Memorium — Search / Find in Diary (Step 11N)
   Client-side search over existing Journal/Page data.
   Reuses already-loaded API data where practical, caches to avoid repeated full loads.
   Covers: page content, page title, journal title, date, mood, weather, location.
   Vintage UX, safe HTML, case-insensitive partial matching, mobile-friendly.
*/
(function () {
  'use strict';

  const CACHE_TTL = 60000; // 1 minute cache for pages
  let journalsCache = null;
  let pagesCache = {}; // journalId -> pages array
  let lastFetchAt = 0;
  let fetching = null;

  const MOOD_LABELS = {
    happy: 'Happy',
    calm: 'Calm',
    sad: 'Sad',
    angry: 'Angry',
    loved: 'Loved',
    tired: 'Tired',
  };
  const WEATHER_LABELS = { sunny: 'Sunny', rainy: 'Rainy', cloudy: 'Cloudy', night: 'Night' };

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function stripHtml(html) {
    if (!html) return '';
    // keep spaces between tags
    return String(html)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function formatDateForSearch(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    // multiple forms for matching
    const isoDate = d.toISOString().slice(0, 10); // 2026-02-14
    const display = d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const short = d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return isoDate + ' ' + display + ' ' + short;
  }

  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments;
      const ctx = this;
      clearTimeout(t);
      t = setTimeout(function () {
        fn.apply(ctx, args);
      }, ms);
    };
  }

  function getCurrentJournalId() {
    try {
      const qs = new URLSearchParams(window.location.search).get('journalId');
      if (qs) return qs;
      return localStorage.getItem('memorium-current-journal');
    } catch (e) {
      return null;
    }
  }

  // Fetch all journals + pages with caching, reuse already-loaded data where possible
  function fetchAllData() {
    const now = Date.now();
    if (journalsCache && now - lastFetchAt < CACHE_TTL && fetching === null) {
      // return cached quickly but still return promise for uniform interface
      return Promise.resolve({ journals: journalsCache, pagesCache: pagesCache });
    }
    if (fetching) return fetching;

    const authed =
      window.MemoriumAPI && window.MemoriumAPI.isAuthed && window.MemoriumAPI.isAuthed();

    if (!authed) {
      // Unauthenticated — search local notebook state only
      fetching = Promise.resolve().then(function () {
        let local = null;
        try {
          const raw = localStorage.getItem('memorium-state-v2');
          local = raw ? JSON.parse(raw) : null;
        } catch (e) {
          local = null;
        }
        let pages = [];
        if (local && Array.isArray(local.pages)) pages = local.pages.slice();
        const journalId = getCurrentJournalId() || 'local';
        const fakeJournal = {
          _id: journalId,
          title: 'My Journal',
          updatedAt: new Date().toISOString(),
        };
        const pc = {};
        pc[journalId] = pages;
        journalsCache = [fakeJournal];
        pagesCache = pc;
        lastFetchAt = Date.now();
        fetching = null;
        return { journals: journalsCache, pagesCache: pagesCache };
      });
      return fetching;
    }

    // Authed — fetch journals then pages per journal
    fetching = window.MemoriumAPI.listJournals()
      .then(function (res) {
        const journals = res && res.data ? res.data : [];
        journalsCache = journals;
        if (!journals.length) {
          pagesCache = {};
          lastFetchAt = Date.now();
          fetching = null;
          return { journals: journalsCache, pagesCache: pagesCache };
        }
        // Fetch pages for each journal in parallel, tolerate failures
        const promises = journals.map(function (j) {
          // reuse cached pages if recent and same journal?
          if (pagesCache[j._id] && now - lastFetchAt < CACHE_TTL) {
            return Promise.resolve({ id: j._id, pages: pagesCache[j._id] });
          }
          return window.MemoriumAPI.listPages(j._id)
            .then(function (pr) {
              return { id: j._id, pages: pr && pr.data ? pr.data : [] };
            })
            .catch(function () {
              return { id: j._id, pages: pagesCache[j._id] || [] };
            });
        });
        return Promise.all(promises).then(function (results) {
          const newCache = {};
          results.forEach(function (r) {
            newCache[r.id] = r.pages;
          });
          pagesCache = newCache;
          lastFetchAt = Date.now();
          fetching = null;
          return { journals: journalsCache, pagesCache: pagesCache };
        });
      })
      .catch(function (err) {
        fetching = null;
        throw err;
      });
    return fetching;
  }

  function invalidateCache() {
    lastFetchAt = 0;
    fetching = null;
  }

  // Core search — case-insensitive partial matching
  function searchAll(query, data) {
    const q = String(query || '').trim();
    if (!q) return [];
    const qLower = q.toLowerCase();
    const journals = data.journals || [];
    const pCache = data.pagesCache || {};
    let results = [];

    journals.forEach(function (journal) {
      const jTitleLower = String(journal.title || '').toLowerCase();
      const journalTitleMatched = jTitleLower.indexOf(qLower) !== -1;
      const pages = pCache[journal._id] || [];
      pages.forEach(function (page) {
        const titleLower = String(page.title || '').toLowerCase();
        const locLower = String(page.location || '').toLowerCase();
        const moodLower = String(page.mood || '').toLowerCase();
        const weatherLower = String(page.weather || '').toLowerCase();
        const dateStr = formatDateForSearch(page.date).toLowerCase();
        const contentPlain = stripHtml(page.content || '');
        const contentLower = contentPlain.toLowerCase();

        const matchedFields = [];
        let matched = false;

        if (contentLower.indexOf(qLower) !== -1) {
          matched = true;
          matchedFields.push('content');
        }
        if (titleLower.indexOf(qLower) !== -1) {
          matched = true;
          matchedFields.push('title');
        }
        if (dateStr && dateStr.indexOf(qLower) !== -1) {
          matched = true;
          matchedFields.push('date');
        }
        if (moodLower && moodLower.indexOf(qLower) !== -1) {
          matched = true;
          matchedFields.push('mood');
        }
        if (weatherLower && weatherLower.indexOf(qLower) !== -1) {
          matched = true;
          matchedFields.push('weather');
        }
        if (locLower && locLower.indexOf(qLower) !== -1) {
          matched = true;
          matchedFields.push('location');
        }
        // Journal title — avoid exposing every page when only journal matches (limit to first page)
        if (journalTitleMatched) {
          const isFirstPage = page.pageNumber === 1 || pages.indexOf(page) === 0;
          if (matched || isFirstPage) {
            matched = true;
            if (matchedFields.indexOf('journal') === -1) matchedFields.push('journal');
          }
        }

        if (!matched) return;

        // snippet: prioritize content around match, fallback to title/meta
        let snippetText = '';
        let snippetSource = 'content';
        if (matchedFields.indexOf('content') !== -1) {
          const idx = contentLower.indexOf(qLower);
          if (idx !== -1) {
            let start = Math.max(0, idx - 40);
            const end = Math.min(contentPlain.length, start + 95);
            // if start >0, we truncated left — keep end adjusted already? keep simple
            if (start > 0 && end - start < 95) {
              // if we cut near end, ensure we show up to 95 chars if possible
              const needed = 95 - (end - start);
              start = Math.max(0, start - needed);
            }
            snippetText = contentPlain.slice(start, end).trim();
            if (start > 0) snippetText = '…' + snippetText;
            if (end < contentPlain.length) snippetText = snippetText + '…';
          } else {
            snippetText = contentPlain.slice(0, 90).trim();
            if (contentPlain.length > 90) snippetText += '…';
          }
        } else if (matchedFields.indexOf('title') !== -1) {
          snippetText = String(page.title || '')
            .trim()
            .slice(0, 100);
          snippetSource = 'title';
        } else if (matchedFields.indexOf('journal') !== -1) {
          snippetText = String(journal.title || '')
            .trim()
            .slice(0, 100);
          snippetSource = 'journal';
        } else if (matchedFields.indexOf('mood') !== -1) {
          snippetText = 'Mood: ' + (page.mood || '');
          snippetSource = 'mood';
        } else if (matchedFields.indexOf('weather') !== -1) {
          snippetText = 'Weather: ' + (page.weather || '');
          snippetSource = 'weather';
        } else if (matchedFields.indexOf('location') !== -1) {
          snippetText = 'Location: ' + (page.location || '');
          snippetSource = 'location';
        } else if (matchedFields.indexOf('date') !== -1) {
          snippetText = 'Date: ' + formatDateForSearch(page.date);
          snippetSource = 'date';
        }
        if (!snippetText && contentPlain) {
          snippetText = contentPlain.slice(0, 90).trim();
          if (contentPlain.length > 90) snippetText += '…';
        }
        if (!snippetText) snippetText = String(page.title || 'Untitled').slice(0, 90);

        const pageNum = page.pageNumber != null ? page.pageNumber : page.id != null ? page.id : '';
        const pageId = page._id || page._apiId || page.id || '';

        results.push({
          journal: journal,
          page: page,
          journalId: journal._id,
          journalTitle: journal.title || 'Untitled Journal',
          pageNumber: pageNum,
          pageId: pageId,
          pageTitle: page.title || '',
          snippetText: snippetText,
          snippetSource: snippetSource,
          contentPlain: contentPlain,
          matchedFields: matchedFields,
        });
      });
    });

    // Sort: content/title matches first, then journal, then metadata; stable by journal updatedAt then pageNumber
    results.sort(function (a, b) {
      const score = function (r) {
        if (r.matchedFields.indexOf('content') !== -1) return 0;
        if (r.matchedFields.indexOf('title') !== -1) return 1;
        if (r.matchedFields.indexOf('journal') !== -1) return 2;
        return 3;
      };
      const sa = score(a),
        sb = score(b);
      if (sa !== sb) return sa - sb;
      const ta = new Date(a.journal.effectiveUpdatedAt || a.journal.updatedAt || 0).getTime();
      const tb = new Date(b.journal.effectiveUpdatedAt || b.journal.updatedAt || 0).getTime();
      if (ta !== tb) return tb - ta;
      return (a.pageNumber || 0) - (b.pageNumber || 0);
    });

    // Cap to 30 for performance/UI
    if (results.length > 30) results = results.slice(0, 30);
    return results;
  }

  function buildHighlightedSnippet(snippetText, query) {
    const q = String(query || '');
    if (!q) return escapeHtml(snippetText);
    const lowerSnippet = snippetText.toLowerCase();
    const lowerQ = q.toLowerCase();
    const idx = lowerSnippet.indexOf(lowerQ);
    if (idx === -1) return escapeHtml(snippetText);
    const before = snippetText.slice(0, idx);
    const match = snippetText.slice(idx, idx + q.length);
    const after = snippetText.slice(idx + q.length);
    return (
      escapeHtml(before) +
      '<span class="memorium-search-hl">' +
      escapeHtml(match) +
      '</span>' +
      escapeHtml(after)
    );
  }

  function formatMetaDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Rendering
  function renderResults(container, query, results) {
    if (!container) return;
    const qEsc = escapeHtml(query);
    if (!String(query || '').trim()) {
      container.innerHTML =
        '<div class="memorium-search-state memorium-search-state--empty">Type to find your memories — search writings, titles, moods &amp; places</div>';
      return;
    }
    if (!results || !results.length) {
      container.innerHTML =
        '<div class="memorium-search-state memorium-search-state--no-results">No memories found for “<strong>' +
        qEsc +
        '</strong>”<br><em>Try another word — search is case-insensitive and matches partial text</em></div>';
      return;
    }
    let html = '';
    results.forEach(function (r, idx) {
      const journalEsc = escapeHtml(r.journalTitle);
      const pageNumEsc = escapeHtml(String(r.pageNumber));
      const pageTitleEsc = escapeHtml(r.pageTitle || '');
      const snippetHtml = buildHighlightedSnippet(r.snippetText || '', query);
      let metaBadges = '';
      // show relevant metadata badges, mark matched ones
      const hasMood = !!r.page.mood;
      const hasWeather = !!r.page.weather;
      const hasLoc = !!String(r.page.location || '').trim();
      const hasDate = !!r.page.date;
      const isMatched = function (field) {
        return r.matchedFields.indexOf(field) !== -1;
      };
      if (hasDate) {
        const dateLabel = formatMetaDate(r.page.date);
        metaBadges +=
          '<span class="memorium-search-badge' +
          (isMatched('date') ? ' memorium-search-badge--matched' : '') +
          '">📅 ' +
          escapeHtml(dateLabel) +
          '</span>';
      }
      if (hasMood) {
        const moodIcon =
          r.page.mood === 'happy'
            ? '😊'
            : r.page.mood === 'calm'
              ? '😌'
              : r.page.mood === 'sad'
                ? '😢'
                : r.page.mood === 'angry'
                  ? '😡'
                  : r.page.mood === 'loved'
                    ? '❤️'
                    : r.page.mood === 'tired'
                      ? '😴'
                      : '·';
        const moodLabel = MOOD_LABELS[r.page.mood] || r.page.mood;
        metaBadges +=
          '<span class="memorium-search-badge' +
          (isMatched('mood') ? ' memorium-search-badge--matched' : '') +
          '">' +
          moodIcon +
          ' ' +
          escapeHtml(moodLabel) +
          '</span>';
      }
      if (hasWeather) {
        const wIcon =
          r.page.weather === 'sunny'
            ? '☀️'
            : r.page.weather === 'rainy'
              ? '🌧'
              : r.page.weather === 'cloudy'
                ? '☁️'
                : r.page.weather === 'night'
                  ? '🌙'
                  : '·';
        const wLabel = WEATHER_LABELS[r.page.weather] || r.page.weather;
        metaBadges +=
          '<span class="memorium-search-badge' +
          (isMatched('weather') ? ' memorium-search-badge--matched' : '') +
          '">' +
          wIcon +
          ' ' +
          escapeHtml(wLabel) +
          '</span>';
      }
      if (hasLoc) {
        metaBadges +=
          '<span class="memorium-search-badge' +
          (isMatched('location') ? ' memorium-search-badge--matched' : '') +
          '">📍 ' +
          escapeHtml(String(r.page.location).slice(0, 24)) +
          '</span>';
      }
      // matched label
      let matchedLabel = '';
      if (r.matchedFields.length) {
        const labels = r.matchedFields.map(function (f) {
          if (f === 'content') return 'writing';
          if (f === 'journal') return 'journal';
          return f;
        });
        // dedup
        const uniq = [];
        labels.forEach(function (l) {
          if (uniq.indexOf(l) === -1) uniq.push(l);
        });
        matchedLabel =
          '<span class="memorium-search-match-label">matched: ' +
          escapeHtml(uniq.slice(0, 3).join(', ')) +
          '</span>';
      }
      const snippetCls = r.snippetText
        ? 'memorium-search-snippet'
        : 'memorium-search-snippet memorium-search-snippet--empty';
      let snippetContent = r.snippetText
        ? snippetHtml
        : '<em>Empty page — “' + pageTitleEsc + '”</em>';
      if (r.snippetSource === 'title' && r.pageTitle) {
        snippetContent =
          '<strong style="font-family:var(--heading-font);font-weight:600;color:#6E6259;">Title:</strong> ' +
          snippetContent;
      }
      html +=
        '<button type="button" class="memorium-search-item" data-journal-id="' +
        escapeHtml(r.journalId) +
        '" data-page-id="' +
        escapeHtml(r.pageId) +
        '" data-page-number="' +
        escapeHtml(String(r.pageNumber)) +
        '" data-index="' +
        idx +
        '" aria-label="Open ' +
        journalEsc +
        ' page ' +
        pageNumEsc +
        '">' +
        '  <div class="memorium-search-item-header">' +
        '    <span class="memorium-search-journal" title="' +
        journalEsc +
        '">' +
        journalEsc +
        '</span>' +
        '    <span class="memorium-search-dot" aria-hidden="true">·</span>' +
        '    <span class="memorium-search-page">Page ' +
        pageNumEsc +
        '</span>' +
        '    ' +
        matchedLabel +
        '  </div>' +
        '  <div class="' +
        snippetCls +
        '">' +
        snippetContent +
        '</div>' +
        (pageTitleEsc && r.snippetSource !== 'title'
          ? '  <div style="font-family:var(--heading-font);font-size:0.72rem;color:#8B7355;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Title: ' +
            pageTitleEsc +
            '</div>'
          : '') +
        (metaBadges ? '  <div class="memorium-search-meta-row">' + metaBadges + '</div>' : '') +
        '</button>';
    });
    html +=
      '<div class="memorium-search-footer"><span>' +
      results.length +
      ' result' +
      (results.length === 1 ? '' : 's') +
      '</span><span>Click to open page</span></div>';
    container.innerHTML = html;
  }

  // Navigation
  function openResult(journalId, pageNumber, pageId) {
    // Try in-place navigation if same journal is open and notebook state available
    const currentId = getCurrentJournalId();
    if (
      String(currentId) === String(journalId) &&
      window.MemoriumNotebook &&
      window.MemoriumNotebook.getState
    ) {
      try {
        const state = window.MemoriumNotebook.getState();
        if (state && Array.isArray(state.pages) && state.pages.length) {
          let idx = -1;
          for (let i = 0; i < state.pages.length; i++) {
            const p = state.pages[i];
            const pid = p._apiId || p._id || p.id || '';
            const pn = p.pageNumber != null ? String(p.pageNumber) : String(p.id || '');
            if (String(pid) === String(pageId) && pageId) {
              idx = i;
              break;
            }
            if (String(pn) === String(pageNumber) && String(pageNumber) !== '') {
              idx = i;
              break;
            }
            if (p.pageNumber === Number(pageNumber)) {
              idx = i;
              break;
            }
          }
          if (idx >= 0) {
            hideAll();
            window.MemoriumNotebook.loadPage(idx);
            const sec = document.getElementById('notebook-section');
            if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
            try {
              const url = new URL(window.location.href);
              url.searchParams.set('journalId', journalId);
              if (pageNumber != null && String(pageNumber) !== '')
                url.searchParams.set('page', String(pageNumber));
              if (pageId) url.searchParams.set('pageId', String(pageId));
              history.replaceState({}, '', url.toString());
            } catch (e) {}
            return;
          }
        }
      } catch (e) {}
    }
    try {
      localStorage.setItem('memorium-current-journal', journalId);
    } catch (e) {}
    let href = 'journal.html?journalId=' + encodeURIComponent(journalId);
    if (pageNumber != null && String(pageNumber) !== '')
      href += '&page=' + encodeURIComponent(String(pageNumber));
    if (pageId != null && String(pageId) !== '' && String(pageId) !== String(pageNumber)) {
      // only add pageId if it looks like ObjectId (24 hex) to avoid confusion with numeric ids
      if (String(pageId).length >= 8) href += '&pageId=' + encodeURIComponent(String(pageId));
    }
    window.location.href = href;
  }

  function hideAll() {
    document.querySelectorAll('.memorium-search-results').forEach(function (el) {
      el.hidden = true;
      el.setAttribute('hidden', '');
    });
    document.querySelectorAll('.memorium-search-input-wrap').forEach(function (w) {
      w.classList.remove('has-results');
    });
  }

  function show(el) {
    if (!el) return;
    el.hidden = false;
    el.removeAttribute('hidden');
  }

  // Bind one search instance (input + results)
  function bindSearchInstance(root) {
    if (!root) return;
    const input =
      root.querySelector('.memorium-search-input') ||
      document.getElementById('memoriumSearchInput');
    const resultsEl =
      root.querySelector('.memorium-search-results') ||
      document.getElementById('memoriumSearchResults');
    const clearBtn =
      root.querySelector('.memorium-search-clear') ||
      document.getElementById('memoriumSearchClear');
    if (!input || !resultsEl) return;
    // Prevent double binding
    if (input._memoriumSearchBound) return;
    input._memoriumSearchBound = true;

    let lastQuery = '';
    let lastResults = [];

    function updateClear() {
      if (!clearBtn) return;
      if (String(input.value || '').trim()) {
        clearBtn.hidden = false;
        clearBtn.removeAttribute('hidden');
      } else {
        clearBtn.hidden = true;
        clearBtn.setAttribute('hidden', '');
      }
    }

    const doSearch = debounce(function () {
      const q = String(input.value || '');
      lastQuery = q;
      updateClear();
      if (!q.trim()) {
        // Empty state — show hint when focused
        if (document.activeElement === input) {
          resultsEl.innerHTML =
            '<div class="memorium-search-state memorium-search-state--empty">Type to find your memories — search writings, titles, moods &amp; places</div>';
          show(resultsEl);
          resultsEl.closest('.memorium-search-input-wrap') &&
            resultsEl.closest('.memorium-search-input-wrap').classList.add('has-results');
          input.closest('.memorium-search') &&
            input.closest('.memorium-search-input-wrap') &&
            input.closest('.memorium-search-input-wrap').classList.add('has-results');
        } else {
          hideAll();
        }
        return;
      }
      // Show loading
      resultsEl.innerHTML = '<div class="memorium-search-state">Dusting the pages…</div>';
      show(resultsEl);
      fetchAllData()
        .then(function (data) {
          // Ensure query hasn't changed during fetch
          if (String(input.value || '') !== q) return;
          const found = searchAll(q, data);
          lastResults = found;
          renderResults(resultsEl, q, found);
          show(resultsEl);
        })
        .catch(function (err) {
          const msg = err && err.message ? err.message : 'Could not search';
          resultsEl.innerHTML =
            '<div class="memorium-search-state memorium-search-state--no-results">' +
            escapeHtml(msg) +
            '</div>';
          show(resultsEl);
        });
    }, 260);

    input.addEventListener('input', doSearch);
    input.addEventListener('focus', function () {
      const q = String(input.value || '').trim();
      if (!q) {
        resultsEl.innerHTML =
          '<div class="memorium-search-state memorium-search-state--empty">Type to find your memories — search writings, titles, moods &amp; places</div>';
        show(resultsEl);
      } else if (lastQuery === q && lastResults.length) {
        renderResults(resultsEl, q, lastResults);
        show(resultsEl);
      } else {
        doSearch();
      }
    });
    // click clear
    if (clearBtn) {
      clearBtn.addEventListener('click', function (e) {
        e.preventDefault();
        input.value = '';
        updateClear();
        hideAll();
        input.focus();
      });
    }
    // Escape handling
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') {
        if (String(input.value || '').trim()) {
          input.value = '';
          updateClear();
          hideAll();
          e.stopPropagation();
        } else {
          hideAll();
        }
      }
      if (e.key === 'ArrowDown' && !resultsEl.hidden) {
        e.preventDefault();
        const first = resultsEl.querySelector('.memorium-search-item');
        if (first) first.focus();
      }
    });
    // results keyboard nav and click
    resultsEl.addEventListener('click', function (e) {
      const btn = e.target.closest('.memorium-search-item');
      if (!btn) return;
      e.preventDefault();
      const jid = btn.getAttribute('data-journal-id');
      const pid = btn.getAttribute('data-page-id');
      const pn = btn.getAttribute('data-page-number');
      openResult(jid, pn, pid);
    });
    resultsEl.addEventListener('keydown', function (e) {
      const item = e.target.closest('.memorium-search-item');
      if (!item) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        let next = item.nextElementSibling;
        while (next && !next.classList.contains('memorium-search-item'))
          next = next.nextElementSibling;
        if (next) next.focus();
        else input.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        let prev = item.previousElementSibling;
        while (prev && !prev.classList.contains('memorium-search-item'))
          prev = prev.previousElementSibling;
        if (prev) prev.focus();
        else input.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        hideAll();
        input.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const jid2 = item.getAttribute('data-journal-id');
        const pid2 = item.getAttribute('data-page-id');
        const pn2 = item.getAttribute('data-page-number');
        openResult(jid2, pn2, pid2);
      }
    });
  }

  function initAll() {
    // Bind any .memorium-search containers
    const containers = document.querySelectorAll('.memorium-search');
    if (!containers.length) return;
    containers.forEach(bindSearchInstance);
    // Also ensure global click outside closes
    document.addEventListener('click', function (e) {
      const inside = e.target.closest && e.target.closest('.memorium-search');
      if (!inside) hideAll();
    });
    // Invalidate cache when pages change (createPage event) or writing changes
    document.addEventListener('memorium:metachange', invalidateCache);
    document.addEventListener('memorium:themechange', invalidateCache);
    document.addEventListener('memorium:paperchange', invalidateCache);
    // Writing content changes — debounce invalidate so search shows fresh snippets
    document.addEventListener('input', function (e) {
      const t = e.target;
      if (t && t.closest && t.closest('.page-writing-area')) {
        clearTimeout(window._memoriumSearchInputTimer);
        window._memoriumSearchInputTimer = setTimeout(invalidateCache, 1200);
      }
    });
    // When a new page is created, invalidate after short delay
    const origCreate = window.createPage;
    if (origCreate && !origCreate._searchPatched) {
      const patched = function () {
        const res = origCreate.apply(this, arguments);
        setTimeout(invalidateCache, 800);
        return res;
      };
      patched._searchPatched = true;
      // Don't override immediately if journal.js hasn't patched yet — poll
      setTimeout(function () {
        if (window.createPage === origCreate) window.createPage = patched;
      }, 600);
    }
  }

  // Expose for tests/manual
  window.MemoriumSearch = {
    stripHtml: stripHtml,
    escapeHtml: escapeHtml,
    searchAll: searchAll,
    fetchAllData: fetchAllData,
    renderResults: renderResults,
    invalidateCache: invalidateCache,
    _getCache: function () {
      return { journalsCache: journalsCache, pagesCache: pagesCache };
    },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAll);
  else setTimeout(initAll, 0);

  // Also re-init when DOM changes (SPA inserts)
  let observerDebounce = null;
  const mo = new MutationObserver(function () {
    clearTimeout(observerDebounce);
    observerDebounce = setTimeout(initAll, 300);
  });
  try {
    if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    else
      document.addEventListener('DOMContentLoaded', function () {
        mo.observe(document.body, { childList: true, subtree: true });
      });
  } catch (e) {}
})();
