/* Memorium — Auth UI wiring (plain JS) */
(function () {
  function showMsg(container, text, isError) {
    let el = container.querySelector('.auth-msg');
    if (!el) {
      el = document.createElement('div');
      el.className = 'auth-msg';
      el.style.cssText = 'margin-top:1rem;padding:.7rem 1rem;border-radius:12px;font-size:.9rem';
      container.appendChild(el);
    }
    el.textContent = text;
    el.style.background = isError ? 'rgba(184,92,92,.12)' : 'rgba(107,155,115,.12)';
    el.style.color = isError ? '#7A3E3E' : '#2F241F';
    el.style.border = '1px solid ' + (isError ? 'rgba(184,92,92,.2)' : 'rgba(107,155,115,.2)');
  }

  function wireForm(formId, type) {
    const form = document.getElementById(formId) || document.querySelector('form');
    if (!form) return;
    // prevent double wiring
    if (form.dataset.memoriumWired) return;
    form.dataset.memoriumWired = '1';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const orig = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'Please wait…'; }

      try {
        if (type === 'login') {
          const email = form.querySelector('#email').value.trim();
          const password = form.querySelector('#password').value;
          const res = await window.MemoriumAPI.login(email, password);
          showMsg(form, 'Welcome back, ' + (res.data.user.name || ''), false);
          setTimeout(() => window.location.href = 'bookshelf.html', 600);
        } else {
          const name = form.querySelector('#name').value.trim();
          const email = form.querySelector('#email').value.trim();
          const password = form.querySelector('#password').value;
          const res = await window.MemoriumAPI.register(name, email, password);
          showMsg(form, 'Account created for ' + res.data.user.name, false);
          setTimeout(() => window.location.href = 'bookshelf.html', 600);
        }
      } catch (err) {
        showMsg(form, err.message || 'Request failed', true);
        if (btn) { btn.disabled = false; btn.textContent = orig; }
      }
    });
  }

  function updateNavbar() {
    const isAuthed = window.MemoriumAPI && window.MemoriumAPI.isAuthed();
    const user = window.MemoriumAPI ? window.MemoriumAPI.getUser() : null;
    // Find nav-actions or create logout button
    const actions = document.querySelector('.nav-actions');
    if (!actions) return;
    // Remove existing auth buttons to avoid duplicates
    const existingLogout = document.getElementById('memorium-logout');
    const existingLogin = document.getElementById('memorium-login-link');
    if (isAuthed) {
      if (existingLogin) existingLogin.remove();
      if (!existingLogout) {
        const btn = document.createElement('button');
        btn.id = 'memorium-logout';
        btn.className = 'btn btn-outline';
        btn.textContent = 'Log out' + (user ? ' (' + user.name.split(' ')[0] + ')' : '');
        btn.addEventListener('click', () => {
          window.MemoriumAPI.logout();
        });
        actions.appendChild(btn);
      }
    } else {
      if (existingLogout) existingLogout.remove();
    }

    // If on protected pages without auth, show hint (do not auto-redirect from public pages like index)
    const protectedPages = ['bookshelf.html', 'journal.html', 'profile.html', 'settings.html'];
    const current = window.location.pathname.split('/').pop();
    if (protectedPages.includes(current) && !isAuthed) {
      // show inline hint if container exists
      const hint = document.getElementById('auth-hint');
      if (!hint) {
        const h = document.createElement('div');
        h.id = 'auth-hint';
        h.style.cssText = 'max-width:600px;margin:1rem auto;padding:1rem;background:rgba(201,162,39,.1);border:1px solid rgba(201,162,39,.2);border-radius:12px;text-align:center;font-family:var(--heading-font)';
        h.innerHTML = 'Please <a href="login.html" style="text-decoration:underline">sign in</a> to view your journals. You will be redirected.';
        document.body.prepend(h);
        setTimeout(() => window.location.href = 'login.html', 1800);
      }
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // Wire both pages: login has no #name, register has #name
    const hasName = !!document.getElementById('name');
    const form = document.querySelector('form');
    if (form) {
      if (hasName) wireForm(form.id || '', 'register');
      else if (document.getElementById('email') && document.getElementById('password')) {
        // Check if on register page by title
        if (document.title.includes('Get Started')) wireForm(form.id || '', 'register');
        else wireForm(form.id || '', 'login');
      }
    }
    // Fallback: if form has 3 inputs, it's register
    if (form && !form.dataset.memoriumWired) {
      const inputs = form.querySelectorAll('input');
      if (inputs.length >= 3) wireForm(form.id||'', 'register');
      else wireForm(form.id||'', 'login');
    }
    updateNavbar();

    // Handle 401 event from api.js
    window.addEventListener('memorium:unauthorized', () => {
      // already cleared token in api.js, now redirect if on protected page
      const protectedPages = ['bookshelf.html', 'journal.html', 'profile.html'];
      const cur = window.location.pathname.split('/').pop();
      if (protectedPages.includes(cur)) window.location.href = 'login.html';
    });
  });

  window.MemoriumAuth = { updateNavbar };
})();
