/* Memorium — Bookshelf: journal CRUD via API */
(function () {
  function qsParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  async function render() {
    const grid = document.querySelector('.grid.grid--auto');
    const container = grid ? grid.parentElement : null;
    if (!grid) return;

    // Loading state
    grid.innerHTML =
      '<p style="text-align:center;padding:2rem;color:var(--text-muted)">Loading your library…</p>';

    if (!window.MemoriumAPI || !window.MemoriumAPI.isAuthed()) {
      grid.innerHTML =
        '<p style="text-align:center;padding:2rem">Please <a href="login.html" style="text-decoration:underline">sign in</a> to see your journals.</p>';
      return;
    }

    try {
      const res = await window.MemoriumAPI.listJournals();
      const journals = res.data || [];

      if (!journals.length) {
        grid.innerHTML = `
          <div style="grid-column:1/-1;text-align:center;padding:2rem;background:var(--paper);border-radius:12px;border:1px dashed var(--border)">
            <p style="color:var(--text-muted)">No journals yet. Create your first one.</p>
            <button id="create-first" class="btn btn-primary" style="margin-top:1rem">+ Create Journal</button>
            <p style="margin-top:.8rem;color:var(--text-muted);font-size:.85rem">Local data? <button id="migrate-local" class="btn btn-outline btn-sm" style="margin-left:.5rem">Migrate from localStorage</button></p>
          </div>`;
        bindCreate(grid);
        bindMigrate();
        return;
      }

      grid.innerHTML = '';
      journals.forEach(j => {
        const card = document.createElement('article');
        card.className = 'card';
        card.style.cssText =
          'aspect-ratio:3/4;margin-bottom:var(--space-6);cursor:pointer;background:var(--paper);border:1px solid var(--border);border-radius:12px;overflow:hidden;display:flex;flex-direction:column';
        card.dataset.journalId = j._id;
        card.innerHTML = `
          <div class="card-header" style="background:var(--paper);padding:var(--space-5);border-radius:var(--radius-md) var(--radius-md) 0 0;border-bottom:1px solid var(--border)">
            <span class="card-meta" style="color:var(--primary);font-family:var(--heading-font)">${escapeHtml(j.title || 'Untitled')}</span>
          </div>
          <div class="card-body" style="padding:var(--space-4);flex:1">
            <p class="card-text" style="color:var(--text-dark);font-size:.95rem;line-height:1.6">${escapeHtml((j.description || 'No description').slice(0, 120))}</p>
            <p style="margin-top:.6rem;color:var(--text-muted);font-size:.8rem">${new Date(j.updatedAt).toLocaleDateString()}</p>
          </div>
          <div class="card-footer" style="padding:var(--space-3);border-top:1px solid var(--border);display:flex;gap:.5rem">
            <button class="btn btn-outline btn-sm open-btn" data-id="${j._id}" style="flex:1">Open</button>
            <button class="btn btn-outline btn-sm delete-btn" data-id="${j._id}" title="Delete">🗑</button>
          </div>`;
        grid.appendChild(card);
      });

      // Bind open
      grid.querySelectorAll('.open-btn').forEach(b => {
        b.addEventListener('click', e => {
          e.stopPropagation();
          const id = b.dataset.id;
          localStorage.setItem('memorium-current-journal', id);
          window.location.href = 'journal.html?journalId=' + encodeURIComponent(id);
        });
      });
      grid.querySelectorAll('.card').forEach(c => {
        c.addEventListener('click', () => {
          const id = c.dataset.journalId;
          localStorage.setItem('memorium-current-journal', id);
          window.location.href = 'journal.html?journalId=' + encodeURIComponent(id);
        });
      });
      grid.querySelectorAll('.delete-btn').forEach(b => {
        b.addEventListener('click', async e => {
          e.stopPropagation();
          if (!confirm('Delete this journal and all its pages?')) return;
          try {
            await window.MemoriumAPI.deleteJournal(b.dataset.id);
            render();
          } catch (err) {
            alert(err.message);
          }
        });
      });
    } catch (err) {
      grid.innerHTML = `<p style="text-align:center;color:var(--danger);padding:2rem">${escapeHtml(err.message)} ${err.status === 401 ? '<br><a href="login.html" style="text-decoration:underline">Sign in</a>' : ''}</p>`;
    }
  }

  function bindCreate(scope) {
    const btn = scope
      ? scope.querySelector('#create-first')
      : document.querySelector('#create-first, a[href="journal.html"]');
    // Also hook the existing "Start New Journal" link
    document.querySelectorAll('a[href="journal.html"].btn').forEach(a => {
      a.addEventListener('click', async e => {
        if (!window.MemoriumAPI.isAuthed()) return; // let it go to journal.html which will check auth
        e.preventDefault();
        const title = prompt('Journal title:', 'My Journal ' + new Date().toLocaleDateString());
        if (!title) return;
        try {
          const res = await window.MemoriumAPI.createJournal({ title });
          localStorage.setItem('memorium-current-journal', res.data._id);
          window.location.href = 'journal.html?journalId=' + encodeURIComponent(res.data._id);
        } catch (err) {
          alert(err.message);
        }
      });
    });
    if (btn) {
      btn.addEventListener('click', async () => {
        const title = prompt('Journal title:', 'My Journal');
        if (!title) return;
        try {
          const res = await window.MemoriumAPI.createJournal({ title });
          render();
          localStorage.setItem('memorium-current-journal', res.data._id);
        } catch (err) {
          alert(err.message);
        }
      });
    }
  }

  function bindMigrate() {
    const b = document.getElementById('migrate-local');
    if (!b) return;
    b.addEventListener('click', async () => {
      const local = window.MemoriumAPI.getLocalNotebookState();
      if (!local || !local.pages.length) {
        alert('No local data to migrate');
        return;
      }
      // Need a journal to migrate into
      let jid = localStorage.getItem('memorium-current-journal');
      if (!jid) {
        // create one
        try {
          const res = await window.MemoriumAPI.createJournal({
            title: 'Migrated Journal',
            description: 'From localStorage',
          });
          jid = res.data._id;
        } catch (e) {
          alert('Create journal failed: ' + e.message);
          return;
        }
      }
      const res = await window.MemoriumAPI.migrateLocalToBackend(jid);
      alert('Migrated ' + res.migrated + ' pages');
      // Do NOT delete localStorage silently - ask
      if (confirm('Migration complete. Clear local copy? (You can keep it as backup)')) {
        // keep ambience prefs, only clear notebook state after success
        // localStorage.removeItem('memorium-state-v2'); // commented to preserve per spec: do not silently delete
      }
      render();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    render();
    bindCreate();
  });

  window.MemoriumBookshelf = { render };
})();
