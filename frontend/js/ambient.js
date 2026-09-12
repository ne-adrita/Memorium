/* ============================================================
   MEMORIUM — Ambience
   Lightweight, user-controlled. No autoplay.
   Visual paper/ink atmosphere + optional sound toggle.
   ============================================================ */
(function () {
    'use strict';

    const STORAGE_KEY = 'memorium-ambience';
    const DEFAULTS = { grain: true, warmLight: true, soundEnabled: false, sound: 'rain' };

    function loadPrefs() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS);
        } catch (_) { return Object.assign({}, DEFAULTS); }
    }
    function savePrefs(prefs) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch (_) {}
    }

    let prefs = loadPrefs();
    let audioEl = null;

    function applyVisualAmbience() {
        const notebook = document.querySelector('.notebook');
        if (!notebook) return;
        notebook.classList.toggle('ambience-grain', !!prefs.grain);
        notebook.classList.toggle('ambience-warm', !!prefs.warmLight);
        // desk warm light overlay handled via CSS class on body
        document.body.classList.toggle('warm-ambience', !!prefs.warmLight);
    }

    function ensureAudio() {
        if (audioEl) return audioEl;
        const existing = document.getElementById('memorium-ambient-audio');
        if (existing) { audioEl = existing; return audioEl; }
        audioEl = document.createElement('audio');
        audioEl.id = 'memorium-ambient-audio';
        audioEl.loop = true;
        audioEl.preload = 'none';
        audioEl.volume = 0.35;
        document.body.appendChild(audioEl);
        return audioEl;
    }

    function setSound(soundName) {
        prefs.sound = soundName;
        if (prefs.soundEnabled) playSound();
        savePrefs(prefs);
        updateControls();
    }

    function playSound() {
        if (!prefs.soundEnabled) return;
        const el = ensureAudio();
        // map sound name to file - files exist but may be empty; fail gracefully
        const src = `audio/${prefs.sound}.mp3`;
        if (el.getAttribute('src') !== src) el.src = src;
        const p = el.play();
        if (p && p.catch) p.catch(() => {
            // Autoplay blocked or file empty - show subtle hint, don't loop error
            el.pause();
            const btn = document.querySelector('[data-ambience="sound"]');
            if (btn) btn.title = 'Sound unavailable';
        });
    }

    function pauseSound() { if (audioEl) audioEl.pause(); }

    function toggleSound() {
        prefs.soundEnabled = !prefs.soundEnabled;
        savePrefs(prefs);
        if (prefs.soundEnabled) playSound(); else pauseSound();
        updateControls();
    }

    function toggleGrain() { prefs.grain = !prefs.grain; savePrefs(prefs); applyVisualAmbience(); updateControls(); }
    function toggleWarmLight() { prefs.warmLight = !prefs.warmLight; savePrefs(prefs); applyVisualAmbience(); updateControls(); }

    function updateControls() {
        document.querySelectorAll('[data-ambience="grain"]').forEach(b => {
            b.setAttribute('aria-pressed', String(!!prefs.grain));
            b.classList.toggle('active', !!prefs.grain);
        });
        document.querySelectorAll('[data-ambience="warm"]').forEach(b => {
            b.setAttribute('aria-pressed', String(!!prefs.warmLight));
            b.classList.toggle('active', !!prefs.warmLight);
        });
        document.querySelectorAll('[data-ambience="sound"]').forEach(b => {
            b.setAttribute('aria-pressed', String(!!prefs.soundEnabled));
            b.classList.toggle('active', !!prefs.soundEnabled);
            b.textContent = prefs.soundEnabled ? '🔊 Sound on' : '🔈 Sound off';
        });
        document.querySelectorAll('.ambient-sound-select').forEach(sel => {
            sel.value = prefs.sound;
            sel.disabled = !prefs.soundEnabled;
        });
    }

    function ensureAmbientBar() {
        if (document.querySelector('.ambient-bar')) return;
        const notebook = document.querySelector('.notebook');
        if (!notebook) return;

        const bar = document.createElement('div');
        bar.className = 'ambient-bar';
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', 'Ambience');
        bar.innerHTML = `
            <span class="ambient-label">Ambience</span>
            <button type="button" class="ambient-btn" data-ambience="grain" aria-pressed="true" title="Toggle paper grain">Grain</button>
            <button type="button" class="ambient-btn" data-ambience="warm" aria-pressed="true" title="Toggle warm light">Warm light</button>
            <button type="button" class="ambient-btn" data-ambience="sound" aria-pressed="false" title="Play ambient sound (user-initiated)">🔈 Sound off</button>
            <select class="ambient-sound-select" aria-label="Ambient sound">
                <option value="rain">Rain</option>
                <option value="fireplace">Fireplace</option>
                <option value="birds">Birds</option>
                <option value="coffee">Coffee shop</option>
                <option value="writing">Writing</option>
            </select>
        `;
        // insert after theme bar if present, else before notebook
        const themeBar = document.querySelector('.theme-bar');
        if (themeBar && themeBar.nextSibling) themeBar.parentNode.insertBefore(bar, themeBar.nextSibling);
        else notebook.parentNode.insertBefore(bar, notebook);

        bar.querySelector('[data-ambience="grain"]').addEventListener('click', toggleGrain);
        bar.querySelector('[data-ambience="warm"]').addEventListener('click', toggleWarmLight);
        bar.querySelector('[data-ambience="sound"]').addEventListener('click', toggleSound);
        bar.querySelector('.ambient-sound-select').addEventListener('change', (e) => setSound(e.target.value));
    }

    function init() {
        ensureAmbientBar();
        applyVisualAmbience();
        // Do NOT autoplay audio - only if user previously enabled and interacts, wait for click
        // We do not call playSound() automatically if soundEnabled, to respect no-autoplay rule.
        // Instead, show controls as enabled but require user click to start.
        if (prefs.soundEnabled) {
            // prepare element but don't play until user gesture
            ensureAudio().src = `audio/${prefs.sound}.mp3`;
        }
        updateControls();
        // inject minimal CSS if not present
        if (!document.getElementById('memorium-ambient-style')) {
            const style = document.createElement('style');
            style.id = 'memorium-ambient-style';
            style.textContent = `
                .ambient-bar{display:flex;gap:.5rem;align-items:center;justify-content:center;flex-wrap:wrap;padding:.7rem 1rem;margin:.6rem auto;background:rgba(248,241,231,.9);border:1px solid rgba(107,79,59,.1);border-radius:999px;backdrop-filter:blur(10px);max-width:max-content;box-shadow:0 4px 16px rgba(0,0,0,.06)}
                .ambient-label{font-family:var(--heading-font);font-size:.82rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-right:.2rem}
                .ambient-btn{padding:.4rem .8rem;border-radius:999px;border:1px solid rgba(107,79,59,.15);background:var(--paper);font-family:var(--heading-font);font-size:.82rem;cursor:pointer;transition:all .2s}
                .ambient-btn.active{background:var(--primary);color:var(--paper);border-color:var(--primary)}
                .ambient-sound-select{padding:.35rem .6rem;border-radius:999px;border:1px solid rgba(107,79,59,.15);background:var(--paper);font-size:.82rem}
                .ambience-grain{position:relative}
                .ambience-grain::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.07;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.4'/%3E%3C/svg%3E");mix-blend-mode:multiply}
                .warm-ambience .notebook{box-shadow:0 20px 50px rgba(0,0,0,.5),0 5px 15px rgba(0,0,0,.3), 0 0 80px rgba(255,200,120,.12)}
                @media(max-width:768px){.ambient-bar{padding:.6rem .8rem}}
            `;
            document.head.appendChild(style);
        }
    }

    window.MemoriumAmbience = { toggleGrain, toggleWarmLight, toggleSound, setSound, loadPrefs, prefs: () => prefs };
    document.addEventListener('DOMContentLoaded', init);
})();
