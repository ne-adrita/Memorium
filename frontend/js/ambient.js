/* ============================================================
   MEMORIUM — Ambience (Step 11J: Desk / Environment)
   Lightweight, user-controlled. Visual desk ambience only.
   Grain/warmLight + 4 desk modes: Day/Sunset/Night/Candle.
   No sound, no autoplay audio — 11D sound stays independent.
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'memorium-ambience';
  const AMBIENCE_MODES = [
    { id: 'day', label: 'Day', icon: '☀️' },
    { id: 'sunset', label: 'Sunset', icon: '🌅' },
    { id: 'night', label: 'Night', icon: '🌙' },
    { id: 'candle', label: 'Candle', icon: '🕯' },
  ];
  const AMBIENCE_IDS = AMBIENCE_MODES.map(m => m.id);
  const DEFAULT_AMBIENCE = 'day';
  const DEFAULTS = { grain: true, warmLight: true, mode: DEFAULT_AMBIENCE };

  function isValidAmbience(id) {
    return AMBIENCE_IDS.includes(id);
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const prefs = Object.assign({}, DEFAULTS, parsed);
      if ('soundEnabled' in prefs) delete prefs.soundEnabled;
      if ('sound' in prefs) delete prefs.sound;
      if (!isValidAmbience(prefs.mode)) prefs.mode = DEFAULT_AMBIENCE;
      // migrate boolean warmLight from old code — keep
      return prefs;
    } catch (_) {
      return Object.assign({}, DEFAULTS);
    }
  }
  function savePrefs(prefs) {
    try {
      const toSave = {
        grain: !!prefs.grain,
        warmLight: !!prefs.warmLight,
        mode: isValidAmbience(prefs.mode) ? prefs.mode : DEFAULT_AMBIENCE,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (_) {}
  }

  const prefs = loadPrefs();
  let audioEl = null;

  function applyVisualAmbience() {
    const notebook = document.querySelector('.notebook');
    if (notebook) {
      notebook.classList.toggle('ambience-grain', !!prefs.grain);
      notebook.classList.toggle('ambience-warm', !!prefs.warmLight);
    }
    document.body.classList.toggle('warm-ambience', !!prefs.warmLight);
    // Desk ambience — visual only, via data-ambience on body/html
    const mode = isValidAmbience(prefs.mode) ? prefs.mode : DEFAULT_AMBIENCE;
    document.body.setAttribute('data-ambience', mode);
    document.documentElement.setAttribute('data-ambience', mode);
    const nb = document.querySelector('.notebook');
    if (nb) nb.setAttribute('data-ambience', mode);
  }

  function setDeskAmbience(mode) {
    if (!isValidAmbience(mode)) return false;
    prefs.mode = mode;
    savePrefs(prefs);
    applyVisualAmbience();
    updateControls();
    document.dispatchEvent(new CustomEvent('memorium:ambiencechange', { detail: { mode } }));
    return true;
  }

  function getDeskAmbience() {
    return isValidAmbience(prefs.mode) ? prefs.mode : DEFAULT_AMBIENCE;
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
  }

  function playSound() {}

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
    // Desk ambience mode buttons
    const mode = getDeskAmbience();
    document.querySelectorAll('[data-ambience-mode]').forEach(b => {
      const on = b.dataset.ambienceMode === mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    // Sound shim sync
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
    bar.setAttribute('aria-label', 'Visual ambience & desk environment');
    // Vintage pill bar: grain/warm + desk modes (Day/Sunset/Night/Candle) + sound hint
    bar.innerHTML = `
            <span class="ambient-label">Ambience</span>
            <button type="button" class="ambient-btn" data-ambience="grain" aria-pressed="true" title="Toggle paper grain">Grain</button>
            <button type="button" class="ambient-btn" data-ambience="warm" aria-pressed="true" title="Toggle warm light">Warm light</button>
            <span class="ambient-divider" aria-hidden="true" style="width:1px;height:18px;background:rgba(107,79,59,0.12);margin:0 0.15rem;display:inline-block;vertical-align:middle"></span>
            <span class="ambient-label" style="font-size:0.72rem;letter-spacing:0.06em">Desk</span>
            <span class="ambient-desk-group" role="group" aria-label="Desk ambience modes" style="display:inline-flex;gap:0.3rem;align-items:center">
              <button type="button" class="ambient-btn ambient-btn--desk" data-ambience-mode="day" aria-pressed="true" title="Day — bright natural light">☀️ Day</button>
              <button type="button" class="ambient-btn ambient-btn--desk" data-ambience-mode="sunset" aria-pressed="false" title="Sunset — warm golden hour">🌅 Sunset</button>
              <button type="button" class="ambient-btn ambient-btn--desk" data-ambience-mode="night" aria-pressed="false" title="Night — darker surroundings">🌙 Night</button>
              <button type="button" class="ambient-btn ambient-btn--desk" data-ambience-mode="candle" aria-pressed="false" title="Candle — warm glow + subtle flicker">🕯 Candle</button>
            </span>
            <span class="ambient-sound-hint" style="font-family:var(--heading-font, 'Cormorant Garamond', serif);font-size:0.72rem;color:var(--text-muted, #6E6259);margin-left:0.15rem;">Sound → panel below</span>
        `;
    const themeSystem = document.getElementById('theme-family-system');
    const penHolder = document.getElementById('pen-holder-system');
    const anchor = penHolder || themeSystem || document.querySelector('.theme-bar');
    if (anchor && anchor.nextSibling) anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    else notebook.parentNode.insertBefore(bar, notebook);

    bar.querySelector('[data-ambience="grain"]').addEventListener('click', toggleGrain);
    bar.querySelector('[data-ambience="warm"]').addEventListener('click', toggleWarmLight);
    bar.querySelectorAll('[data-ambience-mode]').forEach(btn => {
      btn.addEventListener('click', () => setDeskAmbience(btn.dataset.ambienceMode));
    });
  }

  function init() {
    ensureAmbientBar();
    applyVisualAmbience();
    updateControls();
    if (!document.getElementById('memorium-ambient-style')) {
      const style = document.createElement('style');
      style.id = 'memorium-ambient-style';
      style.textContent = `
                .ambient-bar{display:flex;gap:.5rem;align-items:center;justify-content:center;flex-wrap:wrap;padding:.7rem 1rem;margin:.6rem auto;background:rgba(248,241,231,.9);border:1px solid rgba(107,79,59,.1);border-radius:999px;backdrop-filter:blur(10px);max-width:max-content;box-shadow:0 4px 16px rgba(0,0,0,.06)}
                .ambient-label{font-family:var(--heading-font);font-size:.82rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-right:.2rem}
                .ambient-btn{padding:.4rem .8rem;border-radius:999px;border:1px solid rgba(107,79,59,.15);background:var(--paper);font-family:var(--heading-font);font-size:.82rem;cursor:pointer;transition:all .2s}
                .ambient-btn.active{background:var(--primary);color:var(--paper);border-color:var(--primary)}
                .ambient-btn--desk{padding:.38rem .65rem;font-size:.78rem}
                .ambient-btn--desk.active{background:var(--theme-cover, #5C3D2E);color:var(--theme-button-text, #F8F1E7);border-color:var(--theme-cover-edge, #4A2E20);box-shadow:0 2px 8px rgba(0,0,0,0.12)}
                .ambient-sound-select{padding:.35rem .6rem;border-radius:999px;border:1px solid rgba(107,79,59,.15);background:var(--paper);font-size:.82rem}
                .ambience-grain{position:relative}
                .ambience-grain::after{content:'';position:absolute;inset:0;pointer-events:none;opacity:.07;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.4'/%3E%3C/svg%3E");mix-blend-mode:multiply}
                .warm-ambience .notebook{box-shadow:0 20px 50px rgba(0,0,0,.5),0 5px 15px rgba(0,0,0,.3), 0 0 80px rgba(255,200,120,.12)}
                @media(max-width:768px){.ambient-bar{padding:.6rem .8rem;gap:.4rem}.ambient-btn{padding:.38rem .6rem;font-size:.76rem}.ambient-btn--desk{padding:.34rem .5rem;font-size:.72rem}}
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
    setDeskAmbience,
    getDeskAmbience,
    isValidAmbience,
    AMBIENCE_MODES,
  };
  document.addEventListener('DOMContentLoaded', init);
})();
