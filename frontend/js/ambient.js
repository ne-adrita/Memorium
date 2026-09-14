/* ============================================================
   MEMORIUM — Ambience
   Lightweight, user-controlled. No autoplay.
   Visual paper/ink atmosphere + optional sound toggle.
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'memorium-ambience';
  const DEFAULTS = { grain: true, warmLight: true };

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      // Migrate old sound fields out — sound now handled by MemoriumSound (single source of truth)
      const prefs = Object.assign({}, DEFAULTS, parsed);
      if ('soundEnabled' in prefs) delete prefs.soundEnabled;
      if ('sound' in prefs) delete prefs.sound;
      return prefs;
    } catch (_) {
      return Object.assign({}, DEFAULTS);
    }
  }
  function savePrefs(prefs) {
    try {
      const toSave = { grain: !!prefs.grain, warmLight: !!prefs.warmLight };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (_) {}
  }

  const prefs = loadPrefs();
  // Sound is now centralized in MemoriumSound — keep shim for backward compat
  let audioEl = null;

  function applyVisualAmbience() {
    const notebook = document.querySelector('.notebook');
    if (!notebook) return;
    notebook.classList.toggle('ambience-grain', !!prefs.grain);
    notebook.classList.toggle('ambience-warm', !!prefs.warmLight);
    // desk warm light overlay handled via CSS class on body
    document.body.classList.toggle('warm-ambience', !!prefs.warmLight);
  }

  // Legacy sound shims — delegate to MemoriumSound if available, else no-op
  function ensureAudio() {
    if (window.MemoriumSound) return null;
    if (audioEl) return audioEl;
    const existing = document.getElementById('memorium-ambient-audio');
    if (existing) {
      audioEl = existing;
      return audioEl;
    }
    return null;
  }

  function setSound(soundName) {
    if (window.MemoriumSound && window.MemoriumSound.playAmbient) {
      window.MemoriumSound.playAmbient(soundName);
      return;
    }
    // fallback no-op (sound centralized, this shim kept for tests)
  }

  function playSound() {
    // delegated — ambient audio now managed by MemoriumSound.init()/playAmbient
  }

  function pauseSound() {
    if (window.MemoriumSound && window.MemoriumSound.stopAmbient) {
      window.MemoriumSound.stopAmbient();
    }
  }

  function toggleSound() {
    if (window.MemoriumSound) {
      const st = window.MemoriumSound.getState();
      if (st && st.isAmbientPlaying) window.MemoriumSound.stopAmbient();
      else if (st && st.selectedAmbient) window.MemoriumSound.playAmbient(st.selectedAmbient);
      else window.MemoriumSound.playAmbient('rain');
      return;
    }
  }

  function toggleGrain() {
    prefs.grain = !prefs.grain;
    savePrefs(prefs);
    applyVisualAmbience();
    updateControls();
  }
  function toggleWarmLight() {
    prefs.warmLight = !prefs.warmLight;
    savePrefs(prefs);
    applyVisualAmbience();
    updateControls();
  }

  function updateControls() {
    document.querySelectorAll('[data-ambience="grain"]').forEach(b => {
      b.setAttribute('aria-pressed', String(!!prefs.grain));
      b.classList.toggle('active', !!prefs.grain);
    });
    document.querySelectorAll('[data-ambience="warm"]').forEach(b => {
      b.setAttribute('aria-pressed', String(!!prefs.warmLight));
      b.classList.toggle('active', !!prefs.warmLight);
    });
    // Sound controls now belong to MemoriumSound panel; keep hidden legacy selectors in sync if they exist
    if (window.MemoriumSound) {
      const st = window.MemoriumSound.getState();
      document.querySelectorAll('[data-ambience="sound"]').forEach(b => {
        const playing = !!(st && st.isAmbientPlaying);
        b.setAttribute('aria-pressed', String(playing));
        b.classList.toggle('active', playing);
        b.textContent = playing ? '🔊 Sound on' : '🔈 Sound off';
      });
      document.querySelectorAll('.ambient-sound-select').forEach(sel => {
        sel.value = st && st.selectedAmbient ? st.selectedAmbient : 'rain';
        sel.disabled = false;
      });
    }
  }

  function ensureAmbientBar() {
    if (document.querySelector('.ambient-bar')) return;
    const notebook = document.querySelector('.notebook');
    if (!notebook) return;

    const bar = document.createElement('div');
    bar.className = 'ambient-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Visual ambience');
    bar.innerHTML = `
            <span class="ambient-label">Ambience</span>
            <button type="button" class="ambient-btn" data-ambience="grain" aria-pressed="true" title="Toggle paper grain">Grain</button>
            <button type="button" class="ambient-btn" data-ambience="warm" aria-pressed="true" title="Toggle warm light">Warm light</button>
            <span class="ambient-sound-hint" style="font-family:var(--heading-font, 'Cormorant Garamond', serif);font-size:0.72rem;color:var(--text-muted, #6E6259);margin-left:0.3rem;">Sound → panel below</span>
        `;
    // insert after theme system if present, else before notebook (visual only — sound handled by MemoriumSound)
    const themeSystem = document.getElementById('theme-family-system');
    const penHolder = document.getElementById('pen-holder-system');
    const anchor = penHolder || themeSystem || document.querySelector('.theme-bar');
    if (anchor && anchor.nextSibling) anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    else notebook.parentNode.insertBefore(bar, notebook);

    bar.querySelector('[data-ambience="grain"]').addEventListener('click', toggleGrain);
    bar.querySelector('[data-ambience="warm"]').addEventListener('click', toggleWarmLight);
    // Legacy sound listeners kept for external callers, but hidden from UI (sound panel owns them now)
  }

  function init() {
    ensureAmbientBar();
    applyVisualAmbience();
    // Visual-only; sound no longer autoplayed here — MemoriumSound owns playback and respects user gesture
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

  window.MemoriumAmbience = {
    toggleGrain,
    toggleWarmLight,
    toggleSound,
    setSound,
    loadPrefs,
    prefs: () => prefs,
  };
  document.addEventListener('DOMContentLoaded', init);
})();
