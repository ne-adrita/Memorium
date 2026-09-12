/* ============================================================
   MEMORIUM — Theme Manager
   Centralized page theming. No framework.
   Persists to localStorage, ready for future API replacement.
   ============================================================ */
(function () {
    'use strict';

    const STORAGE_KEY = 'memorium-theme';
    const THEMES = {
        parchment:   { label: 'Parchment',   bg: '#F8F1E7' },
        vintage:     { label: 'Vintage',     bg: '#EFE3D0' },
        aged:        { label: 'Aged',        bg: '#E5D8C4' },
        handwritten: { label: 'Handwritten', bg: '#FFFAF1' }
    };
    const DEFAULT_THEME = 'parchment';

    function getSavedTheme() {
        try {
            const v = localStorage.getItem(STORAGE_KEY);
            return v && THEMES[v] ? v : null;
        } catch (_) { return null; }
    }

    function saveTheme(theme) {
        try { localStorage.setItem(STORAGE_KEY, theme); } catch (_) {}
    }

    // Apply theme — delegates to notebook for per-page if available, else global
    function applyTheme(theme) {
        if (!THEMES[theme]) theme = DEFAULT_THEME;
        // if notebook state manager exists, delegate per-page (keeps storage clean for API)
        if (window.MemoriumNotebook && typeof window.MemoriumNotebook.applyThemeToCurrent === 'function') {
            saveTheme(theme);
            highlightActiveDot(theme);
            document.dispatchEvent(new CustomEvent('memorium:themechange', { detail: { theme } }));
            return;
        }
        const pages = document.querySelectorAll('.notebook-page, .page');
        pages.forEach(el => {
            el.dataset.theme = theme;
            el.classList.remove('theme-parchment','theme-vintage','theme-aged','theme-handwritten');
            el.classList.add('theme-' + theme);
        });
        const notebook = document.querySelector('.notebook');
        if (notebook) notebook.dataset.theme = theme;
        saveTheme(theme);
        highlightActiveDot(theme);
        document.dispatchEvent(new CustomEvent('memorium:themechange', { detail: { theme } }));
    }

    function highlightActiveDot(theme) {
        document.querySelectorAll('.theme-dot').forEach(dot => {
            dot.classList.toggle('active', dot.dataset.theme === theme);
            dot.setAttribute('aria-pressed', dot.dataset.theme === theme ? 'true' : 'false');
        });
    }

    // Build theme bar UI if not present
    function ensureThemeBar() {
        if (document.querySelector('.theme-bar')) return;
        const notebook = document.querySelector('.notebook');
        if (!notebook) return;

        const bar = document.createElement('div');
        bar.className = 'theme-bar';
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', 'Page themes');

        const label = document.createElement('span');
        label.className = 'theme-label';
        label.textContent = 'Paper';
        bar.appendChild(label);

        Object.keys(THEMES).forEach(key => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'theme-dot';
            btn.dataset.theme = key;
            btn.title = THEMES[key].label;
            btn.setAttribute('aria-label', THEMES[key].label);
            btn.addEventListener('click', () => applyTheme(key));
            bar.appendChild(btn);
        });

        // insert before notebook or after
        notebook.parentNode.insertBefore(bar, notebook);
    }

    function init() {
        ensureThemeBar();
        const saved = getSavedTheme() || DEFAULT_THEME;
        applyTheme(saved);
        // if notebook.js already set per-page themes, this will be overwritten correctly later
    }

    // Expose globally for notebook.js reuse
    window.MemoriumTheme = { THEMES, applyTheme, getSavedTheme, DEFAULT_THEME };

    document.addEventListener('DOMContentLoaded', init);
})();
