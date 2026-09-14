/* ============================================================
   MEMORIUM — Centralized Sound Manager (Step 11D)
   Ambience + interaction sounds, single state, no autoplay.
   Handles browser restrictions, missing files, volume, mute.
   ============================================================ */
(function () {
  'use strict';

  const STORAGE_KEY = 'memorium_sound_state';

  // Centralized audio paths — only local project assets
  const AMBIENT_SOUNDS = {
    rain: { label: 'Rain', file: 'audio/rain.mp3', icon: '🌧' },
    fireplace: { label: 'Fireplace', file: 'audio/fireplace.mp3', icon: '🔥' },
    birds: { label: 'Birds', file: 'audio/birds.mp3', icon: '🐦' },
    coffee: { label: 'Coffee shop', file: 'audio/coffee.mp3', icon: '☕' },
  };

  const INTERACTION_SOUNDS = {
    'page-flip': { label: 'Page flip', file: 'audio/page-flip.mp3' },
    writing: { label: 'Writing', file: 'audio/writing.mp3' },
    'fountain-writing': { label: 'Fountain writing', file: 'audio/writing.mp3' },
    'pencil-writing': { label: 'Pencil writing', file: 'audio/writing.mp3' },
    'gel-writing': { label: 'Gel writing', file: 'audio/writing.mp3' },
    'highlighter-writing': { label: 'Highlighter writing', file: 'audio/writing.mp3' },
  };

  const DEFAULT_STATE = {
    selectedAmbient: null, // last chosen id, persisted but not auto-played
    activeAmbient: null, // currently playing id (null if stopped)
    isAmbientPlaying: false,
    muted: false,
    masterVolume: 0.85,
    ambientVolume: 0.5,
    interactionVolume: 0.55,
  };

  // Runtime state (centralized)
  const state = Object.assign({}, DEFAULT_STATE);
  let ambientAudio = null;
  let pageFlipAudio = null;
  let writingAudio = null;
  let writingStopTimer = null;
  let isWritingPlaying = false;
  const disabledSounds = {}; // id -> true if file invalid
  let initDone = false;

  const WRITING_STOP_DELAY = 500; // 300-700ms per spec, choose 500

  function clamp01(v) {
    const n = parseFloat(v);
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          state.selectedAmbient =
            parsed.selectedAmbient && AMBIENT_SOUNDS[parsed.selectedAmbient]
              ? parsed.selectedAmbient
              : null;
          state.muted = !!parsed.muted;
          if (parsed.masterVolume !== undefined) state.masterVolume = clamp01(parsed.masterVolume);
          if (parsed.ambientVolume !== undefined)
            state.ambientVolume = clamp01(parsed.ambientVolume);
          if (parsed.interactionVolume !== undefined)
            state.interactionVolume = clamp01(parsed.interactionVolume);
          // Do NOT restore isAmbientPlaying / activeAmbient as playing — respect no-autoplay
          // But keep selectedAmbient so UI can show last chosen
        }
      }
    } catch (_) {}
  }

  function saveState() {
    try {
      const toSave = {
        selectedAmbient: state.selectedAmbient,
        muted: state.muted,
        masterVolume: state.masterVolume,
        ambientVolume: state.ambientVolume,
        interactionVolume: state.interactionVolume,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (_) {}
  }

  function getEffectiveAmbientVolume() {
    if (state.muted) return 0;
    return clamp01(state.masterVolume * state.ambientVolume);
  }
  function getEffectiveInteractionVolume() {
    if (state.muted) return 0;
    return clamp01(state.masterVolume * state.interactionVolume);
  }

  function ensureAmbientAudio() {
    if (ambientAudio) return ambientAudio;
    const existing = document.getElementById('memorium-ambient-audio');
    if (existing) {
      ambientAudio = existing;
    } else {
      ambientAudio = document.createElement('audio');
      ambientAudio.id = 'memorium-ambient-audio';
      ambientAudio.preload = 'none';
      ambientAudio.loop = true;
      document.body.appendChild(ambientAudio);
    }
    ambientAudio.loop = true;
    ambientAudio.preload = 'none';
    ambientAudio.addEventListener('error', () => {
      const src = ambientAudio.getAttribute('src') || '';
      const id = Object.keys(AMBIENT_SOUNDS).find(k => AMBIENT_SOUNDS[k].file === src);
      if (id) {
        disabledSounds[id] = true;
        console.warn('[MemoriumSound] Ambient audio failed to load, disabling:', id, src);
      }
      // graceful: stop playing state
      state.isAmbientPlaying = false;
      state.activeAmbient = null;
      updateUI();
    });
    return ambientAudio;
  }

  function ensurePageFlipAudio() {
    if (pageFlipAudio) return pageFlipAudio;
    const existing = document.getElementById('memorium-pageflip-audio');
    if (existing) {
      pageFlipAudio = existing;
    } else {
      pageFlipAudio = document.createElement('audio');
      pageFlipAudio.id = 'memorium-pageflip-audio';
      pageFlipAudio.preload = 'auto';
      document.body.appendChild(pageFlipAudio);
    }
    pageFlipAudio.loop = false;
    pageFlipAudio.preload = 'auto';
    pageFlipAudio.addEventListener('error', () => {
      disabledSounds['page-flip'] = true;
      console.warn('[MemoriumSound] Page-flip audio failed to load');
    });
    return pageFlipAudio;
  }

  function ensureWritingAudio() {
    if (writingAudio) return writingAudio;
    const existing = document.getElementById('memorium-writing-audio');
    if (existing) {
      writingAudio = existing;
    } else {
      writingAudio = document.createElement('audio');
      writingAudio.id = 'memorium-writing-audio';
      writingAudio.preload = 'none';
      writingAudio.loop = true;
      document.body.appendChild(writingAudio);
    }
    writingAudio.loop = true;
    writingAudio.preload = 'none';
    writingAudio.addEventListener('error', () => {
      const src = writingAudio.getAttribute('src') || '';
      console.warn('[MemoriumSound] Writing audio failed:', src);
      // disable per-pen sound that mapped to this file
      Object.keys(INTERACTION_SOUNDS).forEach(k => {
        if (INTERACTION_SOUNDS[k].file === src) disabledSounds[k] = true;
      });
      isWritingPlaying = false;
    });
    return writingAudio;
  }

  function applyVolumes() {
    if (ambientAudio) {
      ambientAudio.volume = getEffectiveAmbientVolume();
      ambientAudio.muted = !!state.muted;
    }
    if (pageFlipAudio) {
      pageFlipAudio.volume = getEffectiveInteractionVolume();
      pageFlipAudio.muted = !!state.muted;
    }
    if (writingAudio) {
      writingAudio.volume = getEffectiveInteractionVolume();
      writingAudio.muted = !!state.muted;
    }
  }

  // ---- Ambient API ----
  function playAmbient(id) {
    if (!id || !AMBIENT_SOUNDS[id]) {
      console.warn('[MemoriumSound] Unknown ambient sound:', id);
      return false;
    }
    if (disabledSounds[id]) {
      console.warn('[MemoriumSound] Ambient sound disabled due to invalid file:', id);
      return false;
    }
    const audio = ensureAmbientAudio();
    // If same sound already playing, just ensure volume/mute correct
    if (state.activeAmbient === id && state.isAmbientPlaying && !audio.paused) {
      applyVolumes();
      state.selectedAmbient = id;
      saveState();
      updateUI();
      return true;
    }
    // Stop previous if different
    if (state.activeAmbient && state.activeAmbient !== id && !audio.paused) {
      try {
        audio.pause();
      } catch (_) {}
      audio.currentTime = 0;
    }
    const file = AMBIENT_SOUNDS[id].file;
    if (audio.getAttribute('src') !== file) {
      audio.src = file;
      audio.load();
    }
    audio.loop = true;
    audio.volume = getEffectiveAmbientVolume();
    audio.muted = !!state.muted;
    // Must be called from user gesture per spec; we attempt and handle autoplay block
    const p = audio.play();
    if (p && p.catch) {
      p.then(() => {
        state.activeAmbient = id;
        state.selectedAmbient = id;
        state.isAmbientPlaying = true;
        saveState();
        updateUI();
        document.dispatchEvent(
          new CustomEvent('memorium:soundchange', { detail: { ambient: id, playing: true } })
        );
      }).catch(err => {
        // Autoplay blocked or file invalid
        state.isAmbientPlaying = false;
        console.warn(
          '[MemoriumSound] Ambient play blocked or failed:',
          id,
          err && err.message ? err.message : err
        );
        // If file empty, will also fire error event and be disabled
        updateUI();
        const status = document.querySelector('.sound-status');
        if (status) status.textContent = 'Sound blocked — interact again to play';
      });
      // Optimistic state but will correct on catch
      state.selectedAmbient = id;
      saveState();
      updateUI();
      return true;
    }
    // No promise (old browser)
    state.activeAmbient = id;
    state.selectedAmbient = id;
    state.isAmbientPlaying = true;
    saveState();
    updateUI();
    return true;
  }

  function stopAmbient() {
    state.selectedAmbient = state.activeAmbient || state.selectedAmbient;
    state.activeAmbient = null;
    state.isAmbientPlaying = false;
    if (ambientAudio) {
      try {
        ambientAudio.pause();
      } catch (_) {}
      ambientAudio.currentTime = 0;
    }
    saveState();
    updateUI();
    document.dispatchEvent(
      new CustomEvent('memorium:soundchange', { detail: { ambient: null, playing: false } })
    );
    return true;
  }

  // ---- Interaction: page flip ----
  function playInteraction(id) {
    if (!id || !INTERACTION_SOUNDS[id]) {
      // Try to allow 'page-flip' alias plus pen sounds
      if (id && !disabledSounds[id]) console.warn('[MemoriumSound] Unknown interaction sound:', id);
      return false;
    }
    if (disabledSounds[id]) {
      console.warn('[MemoriumSound] Interaction sound disabled (invalid file):', id);
      return false;
    }
    if (state.muted) return false;
    const vol = getEffectiveInteractionVolume();
    if (vol <= 0.01) return false;

    if (id === 'page-flip') {
      const audio = ensurePageFlipAudio();
      const file = INTERACTION_SOUNDS[id].file;
      if (audio.getAttribute('src') !== file) {
        audio.src = file;
        audio.load();
      }
      audio.volume = vol;
      audio.muted = false;
      audio.currentTime = 0;
      const p = audio.play();
      if (p && p.catch)
        p.catch(err => {
          console.warn(
            '[MemoriumSound] page-flip play failed:',
            err && err.message ? err.message : err
          );
        });
      return true;
    }
    // For writing sounds via playInteraction, we treat as one-shot fallback, but writing should use debounced loop
    // If caller asks for writing via playInteraction, start debounced writing loop
    if (id === 'writing' || id.endsWith('-writing')) {
      return handleWritingActivity(id);
    }
    // Generic one-shot
    const audio = ensurePageFlipAudio();
    const rec = INTERACTION_SOUNDS[id];
    const file = rec ? rec.file : 'audio/' + id + '.mp3';
    if (audio.getAttribute('src') !== file) {
      audio.src = file;
      audio.load();
    }
    audio.volume = vol;
    audio.currentTime = 0;
    const p2 = audio.play();
    if (p2 && p2.catch) p2.catch(() => {});
    return true;
  }

  // ---- Writing sound (debounced loop) ----
  function resolveWritingSoundId(penSoundId) {
    if (!penSoundId) {
      // Try to get from pen manager
      try {
        const mgr = window.MemoriumPen;
        if (mgr && mgr.getSelectedPen) {
          const pen = mgr.getSelectedPen();
          if (pen && pen.writingSound) return pen.writingSound;
        }
      } catch (_) {}
      return 'writing';
    }
    if (INTERACTION_SOUNDS[penSoundId]) return penSoundId;
    // If penSound unknown, fallback to writing
    return 'writing';
  }

  function handleWritingActivity(penSoundId) {
    if (state.muted) return false;
    const vol = getEffectiveInteractionVolume();
    if (vol <= 0.01) return false;
    const soundId = resolveWritingSoundId(penSoundId);
    if (disabledSounds[soundId]) {
      // Fallback to generic writing if pen-specific disabled
      if (soundId !== 'writing' && !disabledSounds['writing']) {
        return handleWritingActivity('writing');
      }
      return false;
    }
    const rec = INTERACTION_SOUNDS[soundId];
    const file = rec ? rec.file : 'audio/' + soundId + '.mp3';
    const audio = ensureWritingAudio();
    if (disabledSounds[file]) return false;
    // If pen switched, update src
    if (audio.getAttribute('src') !== file) {
      const wasPlaying = isWritingPlaying && !audio.paused;
      if (wasPlaying) {
        try {
          audio.pause();
        } catch (_) {}
      }
      audio.src = file;
      audio.load();
      isWritingPlaying = false;
    }
    audio.loop = true;
    audio.volume = vol;
    audio.muted = false;
    if (!isWritingPlaying || audio.paused) {
      const p = audio.play();
      if (p && p.catch) {
        p.then(() => {
          isWritingPlaying = true;
        }).catch(err => {
          // Autoplay block or invalid file — disable gracefully, don't break diary
          console.warn(
            '[MemoriumSound] Writing sound play blocked/failed:',
            soundId,
            err && err.message ? err.message : err
          );
          isWritingPlaying = false;
          // Don't mark disabled permanently if it's autoplay block; error event will disable if file invalid
        });
      } else {
        isWritingPlaying = true;
      }
    } else {
      // Already playing, keep volume updated
      audio.volume = vol;
    }
    // Reset stop timer: stop after inactivity
    if (writingStopTimer) clearTimeout(writingStopTimer);
    writingStopTimer = setTimeout(() => {
      stopWritingSound();
    }, WRITING_STOP_DELAY);
    return true;
  }

  function stopWritingSound() {
    if (writingStopTimer) {
      clearTimeout(writingStopTimer);
      writingStopTimer = null;
    }
    if (writingAudio) {
      try {
        writingAudio.pause();
      } catch (_) {}
      // keep currentTime for quick resume? reset to 0 for clean loop
      // don't reset currentTime aggressively to avoid seek issues on loop
    }
    isWritingPlaying = false;
    return true;
  }

  function notifyWritingInput(penSoundId) {
    // Public hook for writing.js to call on each user keystroke
    // Ignores programmatic restores — caller must ensure only user input calls this
    return handleWritingActivity(penSoundId);
  }

  // ---- Volume / mute ----
  function setMasterVolume(v) {
    const clamped = clamp01(v);
    state.masterVolume = clamped;
    applyVolumes();
    saveState();
    updateUI();
    return clamped;
  }
  function setAmbientVolume(v) {
    const clamped = clamp01(v);
    state.ambientVolume = clamped;
    if (ambientAudio) ambientAudio.volume = getEffectiveAmbientVolume();
    saveState();
    updateUI();
    return clamped;
  }
  function setInteractionVolume(v) {
    const clamped = clamp01(v);
    state.interactionVolume = clamped;
    const vol = getEffectiveInteractionVolume();
    if (pageFlipAudio) pageFlipAudio.volume = vol;
    if (writingAudio) writingAudio.volume = vol;
    saveState();
    updateUI();
    return clamped;
  }
  function setMuted(v) {
    const muted = !!v;
    state.muted = muted;
    if (ambientAudio) ambientAudio.muted = muted;
    if (pageFlipAudio) pageFlipAudio.muted = muted;
    if (writingAudio) writingAudio.muted = muted;
    // If muted, we keep ambient playing state but muted; if unmuted, ensure ambient resumes if it was playing
    if (!muted && state.isAmbientPlaying && state.activeAmbient) {
      if (ambientAudio && ambientAudio.paused) {
        const p = ambientAudio.play();
        if (p && p.catch) p.catch(() => {});
      }
    }
    saveState();
    updateUI();
    document.dispatchEvent(new CustomEvent('memorium:soundchange', { detail: { muted } }));
    return muted;
  }
  function getState() {
    return {
      selectedAmbient: state.selectedAmbient,
      activeAmbient: state.activeAmbient,
      isAmbientPlaying: state.isAmbientPlaying,
      muted: state.muted,
      masterVolume: state.masterVolume,
      ambientVolume: state.ambientVolume,
      interactionVolume: state.interactionVolume,
      disabledSounds: Object.assign({}, disabledSounds),
      isWritingPlaying,
    };
  }

  // ---- UI ----
  function updateUI() {
    const panel = document.getElementById('sound-system');
    if (!panel) return;
    // Ambient buttons
    panel.querySelectorAll('[data-ambient]').forEach(btn => {
      const id = btn.dataset.ambient;
      const isActive = state.isAmbientPlaying && state.activeAmbient === id;
      const isSelected = state.selectedAmbient === id;
      btn.classList.toggle('active', isActive);
      btn.classList.toggle('selected', !isActive && isSelected);
      btn.setAttribute('aria-pressed', String(isActive));
      btn.disabled = !!disabledSounds[id];
      if (disabledSounds[id]) btn.title = 'Audio unavailable';
      else btn.title = AMBIENT_SOUNDS[id] ? AMBIENT_SOUNDS[id].label : id;
    });
    const stopBtn = panel.querySelector('[data-action="stop-ambient"]');
    if (stopBtn) {
      stopBtn.disabled = !state.isAmbientPlaying;
      stopBtn.setAttribute('aria-pressed', String(!state.isAmbientPlaying));
    }
    const muteBtn = panel.querySelector('[data-control="mute"]');
    if (muteBtn) {
      muteBtn.classList.toggle('active', !!state.muted);
      muteBtn.setAttribute('aria-pressed', String(!!state.muted));
      muteBtn.textContent = state.muted ? '🔇 Muted' : '🔊 Sound on';
    }
    const master = panel.querySelector('[data-control="master"]');
    if (master) master.value = String(state.masterVolume);
    const ambient = panel.querySelector('[data-control="ambient"]');
    if (ambient) ambient.value = String(state.ambientVolume);
    const inter = panel.querySelector('[data-control="interaction"]');
    if (inter) inter.value = String(state.interactionVolume);
    // Value labels
    const masterVal = panel.querySelector('[data-value="master"]');
    if (masterVal) masterVal.textContent = Math.round(state.masterVolume * 100) + '%';
    const ambientVal = panel.querySelector('[data-value="ambient"]');
    if (ambientVal) ambientVal.textContent = Math.round(state.ambientVolume * 100) + '%';
    const interVal = panel.querySelector('[data-value="interaction"]');
    if (interVal) interVal.textContent = Math.round(state.interactionVolume * 100) + '%';

    const status = panel.querySelector('.sound-status');
    if (status) {
      if (state.muted) status.textContent = 'Muted';
      else if (state.isAmbientPlaying && state.activeAmbient)
        status.textContent = `Playing: ${AMBIENT_SOUNDS[state.activeAmbient].label}`;
      else if (state.selectedAmbient)
        status.textContent = `Ready: ${AMBIENT_SOUNDS[state.selectedAmbient].label} (tap to play)`;
      else status.textContent = 'Choose ambience';
    }
    // Disable sliders when muted? Keep enabled but show muted state via CSS
    panel.classList.toggle('is-muted', !!state.muted);
    panel.classList.toggle('is-playing', !!state.isAmbientPlaying);
  }

  function buildSoundPanel() {
    if (document.getElementById('sound-system')) return document.getElementById('sound-system');
    const notebook = document.querySelector('.notebook');
    if (!notebook) return null;

    const panel = document.createElement('div');
    panel.id = 'sound-system';
    panel.className = 'sound-system';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Sound controls');

    // Determine collapsed persisted?
    let collapsed = false;
    try {
      const c = localStorage.getItem('memorium_sound_collapsed');
      if (c === 'true') collapsed = true;
    } catch (_) {}

    panel.innerHTML = `
      <div class="sound-header">
        <span class="sound-icon" aria-hidden="true">🎧</span>
        <div class="sound-header-text">
          <h3 class="sound-title">Sound</h3>
          <p class="sound-subtitle">Ambience & page whispers</p>
        </div>
        <button type="button" class="sound-collapse" aria-label="${collapsed ? 'Expand' : 'Collapse'} sound panel" title="${collapsed ? 'Expand' : 'Collapse'}">${collapsed ? '+' : '—'}</button>
      </div>

      <div class="sound-body">
        <div class="sound-ambient-group">
          <div class="sound-label-row">
            <span class="sound-label">Ambience</span>
            <span class="sound-hint">tap to play — loops softly</span>
          </div>
          <div class="ambient-choices" role="toolbar" aria-label="Ambient sounds"></div>
          <button type="button" class="sound-stop" data-action="stop-ambient" aria-label="Stop ambient sound">Stop</button>
        </div>

        <div class="sound-controls">
          <button type="button" class="sound-mute-btn" data-control="mute" aria-pressed="false" aria-label="Mute all sounds">🔊 Sound on</button>

          <div class="sound-slider-group">
            <label class="sound-slider-label">
              <span>Master</span>
              <input type="range" class="sound-range" data-control="master" min="0" max="1" step="0.05" aria-label="Master volume">
              <span class="sound-volume-value" data-value="master">85%</span>
            </label>
            <label class="sound-slider-label">
              <span>Ambience</span>
              <input type="range" class="sound-range" data-control="ambient" min="0" max="1" step="0.05" aria-label="Ambience volume">
              <span class="sound-volume-value" data-value="ambient">50%</span>
            </label>
            <label class="sound-slider-label">
              <span>Writing</span>
              <input type="range" class="sound-range" data-control="interaction" min="0" max="1" step="0.05" aria-label="Writing and page-flip volume">
              <span class="sound-volume-value" data-value="interaction">55%</span>
            </label>
          </div>
        </div>

        <div class="sound-status" aria-live="polite">Choose ambience</div>
        <p class="sound-footnote">Sound starts only after you tap. Writing whispers follow your pen.</p>
      </div>
    `;

    // Populate ambient choices
    const choices = panel.querySelector('.ambient-choices');
    Object.keys(AMBIENT_SOUNDS).forEach(id => {
      const cfg = AMBIENT_SOUNDS[id];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ambient-choice';
      btn.dataset.ambient = id;
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', cfg.label + ' ambient');
      btn.innerHTML = `<span class="ambient-choice-icon" aria-hidden="true">${cfg.icon}</span><span class="ambient-choice-label">${cfg.label}</span>`;
      btn.addEventListener('click', () => {
        // User interaction — required for autoplay
        if (state.isAmbientPlaying && state.activeAmbient === id) {
          stopAmbient();
        } else {
          playAmbient(id);
        }
      });
      choices.appendChild(btn);
    });

    // Stop button
    panel.querySelector('[data-action="stop-ambient"]').addEventListener('click', stopAmbient);

    // Mute
    panel
      .querySelector('[data-control="mute"]')
      .addEventListener('click', () => setMuted(!state.muted));

    // Sliders
    panel
      .querySelector('[data-control="master"]')
      .addEventListener('input', e => setMasterVolume(e.target.value));
    panel
      .querySelector('[data-control="ambient"]')
      .addEventListener('input', e => setAmbientVolume(e.target.value));
    panel
      .querySelector('[data-control="interaction"]')
      .addEventListener('input', e => setInteractionVolume(e.target.value));

    // Collapse
    const collapseBtn = panel.querySelector('.sound-collapse');
    if (collapsed) panel.classList.add('collapsed');
    collapseBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      panel.classList.toggle('collapsed', collapsed);
      collapseBtn.textContent = collapsed ? '+' : '—';
      collapseBtn.setAttribute(
        'aria-label',
        collapsed ? 'Expand sound panel' : 'Collapse sound panel'
      );
      try {
        localStorage.setItem('memorium_sound_collapsed', collapsed ? 'true' : 'false');
      } catch (_) {}
    });

    // Keyboard: focus handling already via buttons

    // Insert near notebook: after pen holder if exists, else after theme system, else before notebook
    const penHolder = document.getElementById('pen-holder-system');
    const themeSystem = document.getElementById('theme-family-system');
    if (penHolder && penHolder.parentNode) {
      penHolder.parentNode.insertBefore(panel, penHolder.nextSibling);
    } else if (themeSystem && themeSystem.parentNode) {
      themeSystem.parentNode.insertBefore(panel, themeSystem.nextSibling);
    } else {
      const parent = notebook.parentNode;
      parent.insertBefore(panel, notebook.nextSibling);
    }

    // Inject styles if not present
    if (!document.getElementById('memorium-sound-style')) {
      const style = document.createElement('style');
      style.id = 'memorium-sound-style';
      style.textContent = `
        .sound-system{
          width:1100px; max-width:95vw; margin:1.2rem auto;
          background: linear-gradient(180deg, #FFFEFB 0%, #FFF8F0 100%), repeating-linear-gradient(0deg, transparent, transparent 26px, rgba(107,79,59,0.02) 26px, rgba(107,79,59,0.02) 27px);
          border:1px solid var(--theme-border, #DDD1BF); border-radius:16px;
          box-shadow: 0 8px 32px var(--theme-shadow, rgba(0,0,0,0.12)), 0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9);
          padding:1.1rem 1.2rem 1rem; position:relative; overflow:hidden;
          transition: border-color 0.35s ease, box-shadow 0.35s ease;
        }
        .sound-system::before{ content:''; position:absolute; top:0; left:18px; bottom:0; width:1px; background: rgba(201,162,39,0.18); pointer-events:none; }
        .sound-system::after{ content:''; position:absolute; top:0; left:22px; bottom:0; width:1px; background: rgba(201,162,39,0.08); pointer-events:none; }
        .sound-system.collapsed .sound-body{ display:none; }
        .sound-header{ display:flex; align-items:center; gap:0.9rem; padding:0.2rem 0.2rem 0.9rem 1.4rem; border-bottom:1px solid rgba(107,79,59,0.08); margin:-0.2rem -0.2rem 0.9rem -0.2rem; }
        .sound-icon{ width:36px; height:36px; display:grid; place-items:center; background: var(--theme-paper, #F8F1E7); border:1px solid var(--theme-border, #DDD1BF); border-radius:8px; font-size:18px; box-shadow:0 2px 6px rgba(0,0,0,0.06); }
        .sound-title{ font-family:var(--heading-font, 'Cormorant Garamond', serif); font-size:1.05rem; font-weight:700; color:var(--text-dark, #2F241F); letter-spacing:0.04em; margin:0; line-height:1; }
        .sound-subtitle{ font-family:var(--heading-font, 'Cormorant Garamond', serif); font-size:0.78rem; color:var(--text-muted, #9B8E84); letter-spacing:0.06em; text-transform:uppercase; margin:2px 0 0; }
        .sound-collapse{ margin-left:auto; width:28px; height:28px; border-radius:50%; border:1px solid var(--theme-border, #DDD1BF); background: var(--theme-paper, #F8F1E7); font-size:16px; line-height:1; cursor:pointer; transition: all 0.2s ease; }
        .sound-collapse:hover{ border-color:var(--theme-accent, #C9A227); color:var(--theme-accent); }
        .sound-label-row{ display:flex; align-items:baseline; gap:0.6rem; margin:0 0 0.5rem 1rem; }
        .sound-label{ font-family:var(--heading-font, 'Cormorant Garamond', serif); font-size:0.82rem; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; color:var(--text-muted, #6E6259); }
        .sound-hint{ font-family:var(--heading-font, 'Cormorant Garamond', serif); font-size:0.72rem; color:var(--theme-text-muted, #9B8E84); }
        .ambient-choices{ display:flex; gap:0.55rem; flex-wrap:wrap; padding:0.2rem 0 0.7rem 1rem; }
        .ambient-choice{ display:flex; flex-direction:column; align-items:center; gap:0.3rem; padding:0.55rem 0.7rem 0.5rem; background:#FFFEFB; border:1.5px solid var(--theme-border, #DDD1BF); border-radius:12px; cursor:pointer; min-width:78px; transition: all 0.22s ease; }
        .ambient-choice:hover{ transform:translateY(-1px); border-color:rgba(107,79,59,0.18); box-shadow:0 4px 12px rgba(0,0,0,0.06); }
        .ambient-choice.active{ border-color:var(--theme-accent, #C9A227); background:#FFFEFB; box-shadow:0 0 0 3px rgba(201,162,39,0.16), 0 4px 12px rgba(0,0,0,0.07); }
        .ambient-choice.selected{ border-color:rgba(201,162,39,0.35); background:rgba(201,162,39,0.04); }
        .ambient-choice:disabled{ opacity:0.5; cursor:not-allowed; transform:none; box-shadow:none; }
        .ambient-choice:focus-visible{ outline:2px solid var(--theme-accent); outline-offset:2px; }
        .ambient-choice-icon{ font-size:18px; line-height:1; }
        .ambient-choice-label{ font-family:var(--heading-font, 'Cormorant Garamond', serif); font-size:0.72rem; font-weight:600; letter-spacing:0.05em; text-transform:uppercase; color:var(--text-muted, #6E6259); text-align:center; }
        .ambient-choice.active .ambient-choice-label{ color:var(--text-dark, #2F241F); }
        .sound-stop{ margin:0.1rem 0 0.9rem 1rem; padding:0.38rem 0.9rem; border-radius:999px; border:1px solid var(--theme-border, #DDD1BF); background:#FFFEFB; font-family:var(--heading-font, 'Cormorant Garamond', serif); font-size:0.78rem; font-weight:600; cursor:pointer; transition:all 0.18s ease; }
        .sound-stop:hover:not(:disabled){ border-color:var(--theme-accent); color:var(--theme-accent); transform:translateY(-1px); }
        .sound-stop:disabled{ opacity:0.45; cursor:not-allowed; }
        .sound-stop:focus-visible{ outline:2px solid var(--theme-accent); outline-offset:2px; }
        .sound-controls{ display:flex; flex-direction:column; gap:0.7rem; padding:0.8rem 0.9rem 0.7rem 1rem; margin-left:1rem; background:rgba(248,241,231,0.85); border:1px solid var(--theme-border, #DDD1BF); border-radius:12px; backdrop-filter:blur(8px); }
        .sound-mute-btn{ align-self:flex-start; padding:0.45rem 0.9rem; border-radius:999px; border:1.5px solid var(--theme-border, #DDD1BF); background:#FFFEFB; font-family:var(--heading-font, 'Cormorant Garamond', serif); font-size:0.82rem; font-weight:600; cursor:pointer; transition:all 0.2s ease; }
        .sound-mute-btn.active{ background:var(--theme-cover, #5C3D2E); color:var(--theme-button-text, #F8F1E7); border-color:var(--theme-cover-edge, #4A2E20); box-shadow:0 2px 8px rgba(0,0,0,0.12); }
        .sound-mute-btn:hover{ transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.08); }
        .sound-mute-btn:focus-visible{ outline:2px solid var(--theme-accent); outline-offset:2px; }
        .sound-slider-group{ display:flex; flex-direction:column; gap:0.55rem; }
        .sound-slider-label{ display:flex; align-items:center; gap:0.6rem; font-family:var(--heading-font, 'Cormorant Garamond', serif); font-size:0.74rem; color:var(--text-muted, #6E6259); }
        .sound-slider-label span:first-child{ min-width:72px; font-weight:700; letter-spacing:0.05em; text-transform:uppercase; font-size:0.70rem; }
        .sound-range{ flex:1; height:4px; -webkit-appearance:none; appearance:none; background: linear-gradient(to right, rgba(107,79,59,0.12), var(--theme-accent, #C9A227)); border-radius:999px; outline:none; }
        .sound-range::-webkit-slider-thumb{ -webkit-appearance:none; width:16px; height:16px; border-radius:50%; background:#FFFEFB; border:1.5px solid var(--theme-accent, #C9A227); box-shadow:0 1px 4px rgba(0,0,0,0.14); cursor:pointer; }
        .sound-range::-moz-range-thumb{ width:16px; height:16px; border-radius:50%; background:#FFFEFB; border:1.5px solid var(--theme-accent, #C9A227); box-shadow:0 1px 4px rgba(0,0,0,0.14); cursor:pointer; }
        .sound-volume-value{ min-width:36px; text-align:right; font-weight:700; color:var(--text-dark, #2F241F); font-size:0.78rem; }
        .sound-status{ margin:0.7rem 0 0 1rem; font-family:var(--heading-font, 'Cormorant Garamond', serif); font-size:0.78rem; color:var(--theme-text-muted, #6E6259); min-height:1.1em; }
        .sound-footnote{ margin:0.35rem 0 0 1rem; font-family:var(--heading-font, 'Cormorant Garamond', serif); font-size:0.68rem; letter-spacing:0.02em; color:var(--text-muted, #9B8E84); }
        .sound-system.is-muted .sound-range{ opacity:0.6; }
        @media (max-width: 768px){
          .sound-system{ padding:0.9rem 0.8rem 0.8rem; margin:0.8rem auto; border-radius:12px; }
          .sound-system::before, .sound-system::after{ display:none; }
          .sound-header{ padding-left:0.2rem; }
          .ambient-choices{ gap:0.4rem; padding-left:0; flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; padding-bottom:0.6rem; }
          .ambient-choices::-webkit-scrollbar{ display:none; }
          .ambient-choice{ min-width:74px; flex-shrink:0; }
          .sound-controls{ margin-left:0; }
          .sound-label-row, .sound-stop, .sound-status, .sound-footnote{ margin-left:0; }
        }
        @media (max-width: 480px){
          .ambient-choice{ min-width:68px; padding:0.45rem 0.5rem; }
          .sound-slider-label span:first-child{ min-width:62px; }
        }
      `;
      document.head.appendChild(style);
    }

    updateUI();
    return panel;
  }

  function init() {
    if (initDone) return;
    initDone = true;
    loadState();
    // Create audio elements lazily but set volumes
    ensureAmbientAudio();
    ensurePageFlipAudio();
    ensureWritingAudio();
    applyVolumes();
    // Do NOT autoplay: keep ambient paused even if selectedAmbient exists
    if (state.selectedAmbient) {
      const a = ensureAmbientAudio();
      const file = AMBIENT_SOUNDS[state.selectedAmbient]
        ? AMBIENT_SOUNDS[state.selectedAmbient].file
        : null;
      if (file) a.src = file;
      a.pause();
      state.isAmbientPlaying = false;
      state.activeAmbient = null;
    }
    // Try build panel now or defer until notebook exists
    const tryBuild = () => {
      if (!document.querySelector('.notebook')) {
        setTimeout(tryBuild, 300);
        return;
      }
      buildSoundPanel();
      updateUI();
      console.info(
        '[MemoriumSound] Initialized. Selected ambient:',
        state.selectedAmbient,
        'muted:',
        state.muted
      );
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryBuild);
    } else {
      tryBuild();
    }
    // Listen for theme change to keep border/accent reactive (CSS vars auto handle)
    document.addEventListener('memorium:themechange', () => {
      // no JS needed
    });
  }

  // Expose
  window.MemoriumSound = {
    init,
    playAmbient,
    stopAmbient,
    playInteraction,
    setMasterVolume,
    setAmbientVolume,
    setInteractionVolume,
    setMuted,
    getState,
    // writing helpers
    notifyWritingInput,
    handleWritingActivity,
    stopWritingSound,
    _internals: {
      AMBIENT_SOUNDS,
      INTERACTION_SOUNDS,
      STORAGE_KEY,
      clamp01,
    },
  };

  // Auto-init on DOM
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);

  // Also expose for legacy ambient.js shim
  window.MemoriumSoundConfig = { AMBIENT_SOUNDS, INTERACTION_SOUNDS };
})();
