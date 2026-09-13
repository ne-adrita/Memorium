/* ============================================================
   Memorium — Frontend API layer (plain JS)
   Centralized fetch, base URL, JWT, error handling.
   No secrets, no Mongo URI, no JWT_SECRET.
   ============================================================ */
(function () {
  const API_BASE = window.__MEMORIUM_API_URL || 'http://localhost:3000';
  const TOKEN_KEY = 'memorium-token';
  const USER_KEY = 'memorium-user';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  function setToken(token, user) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch {}
  }
  function clearAuth() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {}
  }
  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function isAuthed() { return !!getToken(); }

  async function request(path, opts = {}) {
    const url = API_BASE + path;
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch(url, { ...opts, headers });
    let data;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (res.status === 401) {
      clearAuth();
      // redirect to login if not already there, but don't loop
      if (!window.location.pathname.includes('login.html') && !window.location.pathname.includes('register.html')) {
        // allow caller to handle, but also emit event
        window.dispatchEvent(new CustomEvent('memorium:unauthorized'));
      }
    }
    if (!res.ok) {
      const msg = (data && data.message) ? data.message : `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // Auth
  async function register(name, email, password) {
    const res = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    if (res.data && res.data.token) setToken(res.data.token, res.data.user);
    return res;
  }
  async function login(email, password) {
    const res = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (res.data && res.data.token) setToken(res.data.token, res.data.user);
    return res;
  }
  async function getMe() {
    return request('/api/auth/me');
  }
  function logout() {
    clearAuth();
    window.location.href = 'login.html';
  }

  // Journals
  function listJournals() { return request('/api/journals'); }
  function getJournal(id) { return request('/api/journals/' + encodeURIComponent(id)); }
  function createJournal(data) { return request('/api/journals', { method: 'POST', body: JSON.stringify(data) }); }
  function updateJournal(id, data) { return request('/api/journals/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(data) }); }
  function deleteJournal(id) { return request('/api/journals/' + encodeURIComponent(id), { method: 'DELETE' }); }

  // Pages
  function listPages(journalId) { return request('/api/journals/' + encodeURIComponent(journalId) + '/pages'); }
  function getPage(id) { return request('/api/pages/' + encodeURIComponent(id)); }
  function createPage(journalId, data) { return request('/api/journals/' + encodeURIComponent(journalId) + '/pages', { method: 'POST', body: JSON.stringify(data) }); }
  function updatePage(id, data) { return request('/api/pages/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(data) }); }
  function deletePage(id) { return request('/api/pages/' + encodeURIComponent(id), { method: 'DELETE' }); }

  // Decorations
  function listDecorations(pageId) { return request('/api/pages/' + encodeURIComponent(pageId) + '/decorations'); }
  function createDecoration(pageId, data) { return request('/api/pages/' + encodeURIComponent(pageId) + '/decorations', { method: 'POST', body: JSON.stringify(data) }); }
  function updateDecoration(id, data) { return request('/api/decorations/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(data) }); }
  function deleteDecoration(id) { return request('/api/decorations/' + encodeURIComponent(id), { method: 'DELETE' }); }
  function getDecoration(id) { return request('/api/decorations/' + encodeURIComponent(id)); }

  // Images
  async function uploadImage(pageId, file, position = {}) {
    const url = API_BASE + '/api/pages/' + encodeURIComponent(pageId) + '/images';
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const fd = new FormData();
    fd.append('image', file);
    if (position.x !== undefined) fd.append('x', String(position.x));
    if (position.y !== undefined) fd.append('y', String(position.y));
    const res = await fetch(url, { method: 'POST', headers, body: fd });
    let data; const text = await res.text(); try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (res.status === 401) {
      clearAuth();
      if (!window.location.pathname.includes('login.html')) window.dispatchEvent(new CustomEvent('memorium:unauthorized'));
    }
    if (!res.ok) {
      const msg = (data && data.message) ? data.message : `Upload failed (${res.status})`;
      const err = new Error(msg); err.status = res.status; err.data = data; throw err;
    }
    return data;
  }
  function listImages(pageId) { return request('/api/pages/' + encodeURIComponent(pageId) + '/images'); }
  function getImageUrl(id) { return API_BASE + '/api/images/' + encodeURIComponent(id); }
  function deleteImage(id) { return request('/api/images/' + encodeURIComponent(id), { method: 'DELETE' }); }
  function updateImage(id, data) { return request('/api/images/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(data) }); }

  // Migration helper: detect local journal data
  function getLocalNotebookState() {
    try {
      const raw = localStorage.getItem('memorium-state-v2');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  async function migrateLocalToBackend(journalId) {
    const local = getLocalNotebookState();
    if (!local || !local.pages || !local.pages.length) return { migrated: 0 };
    // Only migrate if user has local pages with content and journal exists
    let count = 0;
    for (let i = 0; i < local.pages.length; i++) {
      const p = local.pages[i];
      if (!p.content || !p.content.trim()) continue;
      // Skip if already migrated marker
      try {
        await createPage(journalId, {
          pageNumber: p.id || (i + 1),
          title: p.title || '',
          content: p.content,
          theme: p.theme || 'parchment'
        });
        count++;
      } catch (e) {
        // duplicate pageNumber is ok to skip
        if (e.status !== 409) console.warn('migrate page failed', e);
      }
      // decorations per local page would need pageId from created page; simplified: migrate decorations via separate loop after
    }
    return { migrated: count };
  }

  window.MemoriumAPI = {
    API_BASE, getToken, setToken, clearAuth, getUser, isAuthed, request,
    register, login, getMe, logout,
    listJournals, getJournal, createJournal, updateJournal, deleteJournal,
    listPages, getPage, createPage, updatePage, deletePage,
    listDecorations, createDecoration, updateDecoration, deleteDecoration, getDecoration,
    uploadImage, listImages, getImageUrl, deleteImage, updateImage,
    getLocalNotebookState, migrateLocalToBackend
  };
})();
