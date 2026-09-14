/* ============================================================
   Memorium — Frontend API layer (plain JS)
   Centralized fetch, base URL, JWT, error handling.
   No secrets, no Mongo URI, no JWT_SECRET.
   Config is loaded from js/config.js (window.__MEMORIUM_API_URL)
   ============================================================ */
(function () {
  // config.js sets window.__MEMORIUM_API_URL; fallback for backwards compat
  const rawBase =
    typeof window.__MEMORIUM_API_URL === 'string' && window.__MEMORIUM_API_URL.trim()
      ? window.__MEMORIUM_API_URL.trim()
      : window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3000'
        : window.location.origin;
  const API_BASE = rawBase.replace(/\/$/, '');
  const TOKEN_KEY = 'memorium-token';
  const USER_KEY = 'memorium-user';

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
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
    } catch {
      return null;
    }
  }
  function isAuthed() {
    return !!getToken();
  }

  // Refresh handling: single flight to avoid parallel refresh calls
  let isRefreshing = false;
  let failedQueue = [];

  function processQueue(error, token) {
    failedQueue.forEach(p => {
      if (error) p.reject(error);
      else p.resolve(token);
    });
    failedQueue = [];
  }

  async function refreshAccessToken() {
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      });
    }
    isRefreshing = true;
    try {
      const url = API_BASE + '/api/auth/refresh';
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      let data;
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (!res.ok) throw new Error(data && data.message ? data.message : 'Refresh failed');
      const newToken = data && data.data && (data.data.token || data.data.accessToken);
      if (!newToken) throw new Error('No token in refresh response');
      // preserve user if available, else keep existing
      const user = getUser();
      setToken(newToken, user);
      processQueue(null, newToken);
      return newToken;
    } catch (err) {
      processQueue(err, null);
      clearAuth();
      if (
        !window.location.pathname.includes('login.html') &&
        !window.location.pathname.includes('register.html')
      ) {
        window.dispatchEvent(new CustomEvent('memorium:unauthorized'));
      }
      throw err;
    } finally {
      isRefreshing = false;
    }
  }

  async function request(path, opts = {}) {
    const url = API_BASE + path;
    const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    // Always include credentials so refresh httpOnly cookie is sent where needed
    const fetchOpts = { ...opts, headers, credentials: 'include' };
    let res = await fetch(url, fetchOpts);
    let data;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }

    // If 401 and not already trying refresh, and not an auth endpoint that should not refresh, try once
    const isAuthPath =
      path.startsWith('/api/auth/login') ||
      path.startsWith('/api/auth/register') ||
      path.startsWith('/api/auth/refresh') ||
      path.startsWith('/api/auth/logout');
    if (res.status === 401 && !opts._retry && !isAuthPath) {
      try {
        const newToken = await refreshAccessToken();
        // retry original request with new token
        const retryHeaders = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
        retryHeaders['Authorization'] = 'Bearer ' + newToken;
        const retryOpts = { ...opts, headers: retryHeaders, credentials: 'include', _retry: true };
        res = await fetch(url, retryOpts);
        const retryText = await res.text();
        try {
          data = retryText ? JSON.parse(retryText) : null;
        } catch {
          data = retryText;
        }
        if (!res.ok) {
          const msg = data && data.message ? data.message : `Request failed (${res.status})`;
          const err = new Error(msg);
          err.status = res.status;
          err.data = data;
          if (res.status === 401) {
            clearAuth();
            window.dispatchEvent(new CustomEvent('memorium:unauthorized'));
          }
          throw err;
        }
        return data;
      } catch (refreshErr) {
        // refresh failed — already cleared auth and dispatched event
        const msg = data && data.message ? data.message : `Request failed (${res.status})`;
        const err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
      }
    }

    if (res.status === 401) {
      clearAuth();
      if (
        !window.location.pathname.includes('login.html') &&
        !window.location.pathname.includes('register.html')
      ) {
        window.dispatchEvent(new CustomEvent('memorium:unauthorized'));
      }
    }
    if (!res.ok) {
      const msg = data && data.message ? data.message : `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // Auth
  async function register(name, email, password) {
    const res = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
    const tok = res.data && (res.data.token || res.data.accessToken);
    if (tok) setToken(tok, res.data.user);
    return res;
  }
  async function login(email, password) {
    const res = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    const tok = res.data && (res.data.token || res.data.accessToken);
    if (tok) setToken(tok, res.data.user);
    return res;
  }
  async function getMe() {
    return request('/api/auth/me');
  }
  async function refresh() {
    try {
      const url = API_BASE + '/api/auth/refresh';
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      let data;
      const text = await res.text();
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      if (!res.ok) throw new Error(data && data.message ? data.message : 'Refresh failed');
      const tok = data && data.data && (data.data.token || data.data.accessToken);
      if (tok) {
        const user = getUser();
        setToken(tok, user);
      }
      return data;
    } catch (e) {
      clearAuth();
      throw e;
    }
  }
  async function logout() {
    try {
      await fetch(API_BASE + '/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}),
        },
      });
    } catch {}
    clearAuth();
    window.location.href = 'login.html';
  }

  // Journals
  function listJournals() {
    return request('/api/journals');
  }
  function getJournal(id) {
    return request('/api/journals/' + encodeURIComponent(id));
  }
  function createJournal(data) {
    return request('/api/journals', { method: 'POST', body: JSON.stringify(data) });
  }
  function updateJournal(id, data) {
    return request('/api/journals/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
  function deleteJournal(id) {
    return request('/api/journals/' + encodeURIComponent(id), { method: 'DELETE' });
  }

  // Pages
  function listPages(journalId) {
    return request('/api/journals/' + encodeURIComponent(journalId) + '/pages');
  }
  function getPage(id) {
    return request('/api/pages/' + encodeURIComponent(id));
  }
  function createPage(journalId, data) {
    return request('/api/journals/' + encodeURIComponent(journalId) + '/pages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  function updatePage(id, data) {
    return request('/api/pages/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
  function deletePage(id) {
    return request('/api/pages/' + encodeURIComponent(id), { method: 'DELETE' });
  }

  // Decorations
  function listDecorations(pageId) {
    return request('/api/pages/' + encodeURIComponent(pageId) + '/decorations');
  }
  function createDecoration(pageId, data) {
    return request('/api/pages/' + encodeURIComponent(pageId) + '/decorations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  function updateDecoration(id, data) {
    return request('/api/decorations/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
  function deleteDecoration(id) {
    return request('/api/decorations/' + encodeURIComponent(id), { method: 'DELETE' });
  }
  function getDecoration(id) {
    return request('/api/decorations/' + encodeURIComponent(id));
  }

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
    let res = await fetch(url, { method: 'POST', headers, body: fd, credentials: 'include' });
    let data;
    let text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    // Try refresh once on 401
    if (res.status === 401) {
      try {
        const newToken = await refreshAccessToken();
        const retryHeaders = {};
        if (newToken) retryHeaders['Authorization'] = 'Bearer ' + newToken;
        const retryFd = new FormData();
        retryFd.append('image', file);
        if (position.x !== undefined) retryFd.append('x', String(position.x));
        if (position.y !== undefined) retryFd.append('y', String(position.y));
        res = await fetch(url, {
          method: 'POST',
          headers: retryHeaders,
          body: retryFd,
          credentials: 'include',
        });
        text = await res.text();
        try {
          data = text ? JSON.parse(text) : null;
        } catch {
          data = text;
        }
        if (!res.ok)
          throw new Error(data && data.message ? data.message : `Upload failed (${res.status})`);
        return data;
      } catch (e) {
        clearAuth();
        if (!window.location.pathname.includes('login.html'))
          window.dispatchEvent(new CustomEvent('memorium:unauthorized'));
      }
    }
    if (!res.ok) {
      const msg = data && data.message ? data.message : `Upload failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
  function listImages(pageId) {
    return request('/api/pages/' + encodeURIComponent(pageId) + '/images');
  }
  function getImageUrl(id) {
    return API_BASE + '/api/images/' + encodeURIComponent(id);
  }
  async function getImageBlob(id) {
    const url = API_BASE + '/api/images/' + encodeURIComponent(id);
    const token = getToken();
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    let res = await fetch(url, { headers, credentials: 'include' });
    if (res.status === 401) {
      try {
        const newToken = await refreshAccessToken();
        const retryHeaders = {};
        if (newToken) retryHeaders['Authorization'] = 'Bearer ' + newToken;
        res = await fetch(url, { headers: retryHeaders, credentials: 'include' });
      } catch (e) {
        clearAuth();
      }
    }
    if (!res.ok) {
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }
      const msg = data && data.message ? data.message : `Image fetch failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return res.blob();
  }
  function deleteImage(id) {
    return request('/api/images/' + encodeURIComponent(id), { method: 'DELETE' });
  }
  function updateImage(id, data) {
    return request('/api/images/' + encodeURIComponent(id), {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Migration helper: detect local journal data
  function getLocalNotebookState() {
    try {
      const raw = localStorage.getItem('memorium-state-v2');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
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
          pageNumber: p.id || i + 1,
          title: p.title || '',
          content: p.content,
          theme: p.theme || 'classic-leather',
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
    API_BASE,
    getToken,
    setToken,
    clearAuth,
    getUser,
    isAuthed,
    request,
    register,
    login,
    getMe,
    logout,
    refresh,
    listJournals,
    getJournal,
    createJournal,
    updateJournal,
    deleteJournal,
    listPages,
    getPage,
    createPage,
    updatePage,
    deletePage,
    listDecorations,
    createDecoration,
    updateDecoration,
    deleteDecoration,
    getDecoration,
    uploadImage,
    listImages,
    getImageUrl,
    getImageBlob,
    deleteImage,
    updateImage,
    getLocalNotebookState,
    migrateLocalToBackend,
    refreshAccessToken,
  };
})();
