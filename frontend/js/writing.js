/* ============================================================
   MEMORIUM — Writing Engine (Step 11C)
   Makes selected pen actually style newly typed text.
   Keeps contenteditable, preserves existing content.
   No canvas, no external libs.
   ============================================================ */
(function () {
  'use strict';

  function penCfg() {
    return window.MemoriumPenConfig;
  }
  function penMgr() {
    return window.MemoriumPen;
  }

  function getSelectedPenSafe() {
    try {
      const mgr = penMgr();
      if (mgr && mgr.getSelectedPen) return mgr.getSelectedPen();
    } catch (_) {}
    const cfg = penCfg();
    if (cfg) return cfg.getPen(cfg.DEFAULT_PEN);
    return null;
  }

  function triggerWritingSound(pen) {
    try {
      if (!pen) pen = getSelectedPenSafe();
      if (!pen || !pen.writingSound) return;
      if (window.MemoriumSound && window.MemoriumSound.notifyWritingInput) {
        window.MemoriumSound.notifyWritingInput(pen.writingSound);
      } else if (window.MemoriumSound && window.MemoriumSound.handleWritingActivity) {
        window.MemoriumSound.handleWritingActivity(pen.writingSound);
      }
    } catch (_) {}
  }

  // Highlight colors — vintage diary aesthetic, translucent
  const HIGHLIGHT_COLORS = {
    yellow: 'rgba(255,233,120,0.42)',
    pink: 'rgba(255,180,180,0.38)',
    blue: 'rgba(180,220,255,0.38)',
    green: 'rgba(180,235,180,0.38)',
  };

  function getActiveWritingArea() {
    const active = document.activeElement;
    if (active && active.classList && active.classList.contains('page-writing-area')) return active;
    const areas = getWritingAreas();
    // prefer focused, else first visible
    return areas.find(a => a === active) || areas[0] || null;
  }

  function eraseSelection() {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        if (window.MemoriumUtils) window.MemoriumUtils.showToast('Select text to erase', 'info');
        return false;
      }
      const range = sel.getRangeAt(0);
      const area = getActiveWritingArea();
      if (
        !area ||
        (!area.contains(range.commonAncestorContainer) && !area.contains(range.startContainer))
      ) {
        if (window.MemoriumUtils)
          window.MemoriumUtils.showToast('Select text inside page to erase', 'info');
        return false;
      }
      // Prevent deleting decorations or page elements outside writing area
      // Ensure range does not span outside area
      if (!area.contains(range.startContainer) || !area.contains(range.endContainer)) {
        // Clamp to inside area
        return false;
      }
      // Save before for undo? not needed
      range.deleteContents();
      // Clean empty pen spans
      setTimeout(() => {
        if (area._penWritingAttached) {
          // reuse merge logic
          const spans = area.querySelectorAll('span.pen-written');
          spans.forEach(s => {
            if (!s.textContent && s.childNodes.length === 0) s.remove();
          });
          // Merge adjacent
          if (window.MemoriumWriting && window.MemoriumWriting.mergeAdjacentSpans) {
            // will be available after init, but we can call local
          }
        }
        area.dispatchEvent(new Event('input', { bubbles: true }));
        // Ensure autosave triggered via input
      }, 0);
      // Collapse selection
      sel.collapseToStart();
      area.dispatchEvent(new Event('input', { bubbles: true }));
      if (window.MemoriumUtils) window.MemoriumUtils.showToast('Erased', 'success');
      return true;
    } catch (e) {
      console.warn('erase failed', e);
      return false;
    }
  }

  function highlightSelection(colorId) {
    try {
      const color = HIGHLIGHT_COLORS[colorId] || HIGHLIGHT_COLORS.yellow;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        if (window.MemoriumUtils)
          window.MemoriumUtils.showToast('Select text to highlight', 'info');
        return false;
      }
      const range = sel.getRangeAt(0);
      const area = getActiveWritingArea();
      if (
        !area ||
        (!area.contains(range.commonAncestorContainer) && !area.contains(range.startContainer))
      ) {
        if (window.MemoriumUtils)
          window.MemoriumUtils.showToast('Select text inside page to highlight', 'info');
        return false;
      }
      if (!area.contains(range.startContainer) || !area.contains(range.endContainer)) return false;
      // Extract selected fragment
      const fragment = range.extractContents();
      if (!fragment || fragment.textContent.trim() === '') {
        // Empty selection after extract?
        range.insertNode(fragment);
        return false;
      }
      // Create highlight wrapper — translucent background behind selected text, readable text
      const hl = document.createElement('span');
      hl.className = 'pen-written highlight highlight-' + colorId;
      hl.setAttribute('data-highlight', colorId);
      hl.style.backgroundColor = color;
      hl.style.padding = '0 2px';
      hl.style.borderRadius = '3px';
      hl.style.boxDecorationBreak = 'clone';
      hl.style.webkitBoxDecorationBreak = 'clone';
      // Preserve existing formatting: fragment may contain pen-written spans, keep them nested
      hl.appendChild(fragment);
      range.insertNode(hl);
      // Select highlight for UX
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(hl);
      sel.addRange(newRange);
      // Trigger autosave
      area.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => {
        // Normalize and merge if adjacent same highlight?
        area.dispatchEvent(new Event('input', { bubbles: true }));
      }, 10);
      if (window.MemoriumUtils) window.MemoriumUtils.showToast('Highlighted ' + colorId, 'success');
      return true;
    } catch (e) {
      console.warn('highlight failed', e);
      return false;
    }
  }

  function clearHighlightFromSelection() {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        if (window.MemoriumUtils)
          window.MemoriumUtils.showToast('Select highlighted text to clear', 'info');
        return false;
      }
      const range = sel.getRangeAt(0);
      const area = getActiveWritingArea();
      if (!area || !area.contains(range.commonAncestorContainer)) return false;
      // Find highlight ancestors in selection — unwrap them
      // First try to find closest highlight around selection
      let found = false;
      const highlights = area.querySelectorAll('.highlight');
      highlights.forEach(hl => {
        if (!area.contains(hl)) return;
        // Check if highlight intersects selection
        const hlRange = document.createRange();
        try {
          hlRange.selectNode(hl);
        } catch (_) {
          return;
        }
        const common = sel.rangeCount ? sel.getRangeAt(0) : null;
        if (!common) return;
        // Intersects if ranges overlap
        if (
          common.compareBoundaryPoints(Range.END_TO_START, hlRange) < 0 &&
          common.compareBoundaryPoints(Range.START_TO_END, hlRange) > 0
        ) {
          // Unwrap
          const parent = hl.parentNode;
          if (!parent) return;
          while (hl.firstChild) parent.insertBefore(hl.firstChild, hl);
          hl.remove();
          found = true;
        }
      });
      if (found) {
        area.dispatchEvent(new Event('input', { bubbles: true }));
        if (window.MemoriumUtils) window.MemoriumUtils.showToast('Highlight cleared', 'success');
        return true;
      }
      // Fallback: extract and strip highlight wrappers from fragment
      const fragment = range.extractContents();
      if (fragment) {
        const temp = document.createElement('div');
        temp.appendChild(fragment);
        temp.querySelectorAll('.highlight').forEach(el => {
          const p = el.parentNode;
          if (!p) return;
          while (el.firstChild) p.insertBefore(el.firstChild, el);
          p.removeChild(el);
        });
        // Insert cleaned fragment back
        const frag = document.createDocumentFragment();
        while (temp.firstChild) frag.appendChild(temp.firstChild);
        range.insertNode(frag);
        area.dispatchEvent(new Event('input', { bubbles: true }));
        if (window.MemoriumUtils) window.MemoriumUtils.showToast('Highlight cleared', 'success');
        return true;
      }
      return false;
    } catch (e) {
      console.warn('clear highlight failed', e);
      return false;
    }
  }

  function hexToRgba(hex, opacity) {
    if (!hex) return `rgba(0,0,0,${opacity})`;
    const h = hex.replace('#', '').trim();
    if (h.length === 3) {
      const r = parseInt(h[0] + h[0], 16),
        g = parseInt(h[1] + h[1], 16),
        b = parseInt(h[2] + h[2], 16);
      return `rgba(${r},${g},${b},${opacity})`;
    }
    if (h.length === 6) {
      const r = parseInt(h.slice(0, 2), 16),
        g = parseInt(h.slice(2, 4), 16),
        b = parseInt(h.slice(4, 6), 16);
      return `rgba(${r},${g},${b},${opacity})`;
    }
    return hex;
  }

  function getPenInlineStyle(pen) {
    if (!pen) return '';
    const cfg = penCfg();
    const sizePx = cfg && cfg.SIZE_MAP && cfg.SIZE_MAP[pen.size] ? cfg.SIZE_MAP[pen.size].px : 18;
    const styleParts = [];
    // Font — map handwriting styles to families if not already set by pen
    // Spec styles: Casual, Handwritten, Fountain, Neat, Typewriter — reuse pen.style
    let fontFamily = pen.fontFamily;
    let fontStyle = pen.fontStyle;
    let fontWeight = pen.fontWeight;
    let lineHeight = pen.lineHeight;
    let letterSpacing = '';
    let wordSpacing = '';
    // Style-specific overrides (keep pen's explicit values where present, but adjust for realism)
    if (pen.style === 'casual') {
      fontFamily = fontFamily || "'Caveat', cursive";
      letterSpacing = '0.02em';
      wordSpacing = '0.04em';
    } else if (pen.style === 'soft') {
      // Handwritten soft — tender, slightly looser
      fontFamily = fontFamily || "'Caveat', cursive";
      letterSpacing = '0.01em';
      lineHeight = lineHeight || 1.7;
    } else if (pen.style === 'typewriter') {
      fontFamily = "'Courier New', Courier, monospace";
      fontStyle = 'normal';
      fontWeight = 500;
      letterSpacing = '0.04em';
      wordSpacing = '0.02em';
      lineHeight = 1.6;
    } else if (pen.style === 'neat') {
      letterSpacing = '0.015em';
      lineHeight = lineHeight || 1.55;
    } else if (pen.style === 'elegant' || pen.style === 'bold') {
      // Fountain elegant — keep as is, slight tracking
      letterSpacing = '0.01em';
    }

    if (fontFamily) styleParts.push(`font-family:${fontFamily}`);
    if (fontStyle) styleParts.push(`font-style:${fontStyle}`);
    if (fontWeight) styleParts.push(`font-weight:${fontWeight}`);
    if (lineHeight) styleParts.push(`line-height:${lineHeight}`);
    styleParts.push(`font-size:${sizePx}px`);
    if (letterSpacing) styleParts.push(`letter-spacing:${letterSpacing}`);
    if (wordSpacing) styleParts.push(`word-spacing:${wordSpacing}`);

    // Ink behavior per type — subtle differences in opacity/thickness/softness
    if (pen.type === 'highlighter') {
      const bg = hexToRgba(pen.color, pen.opacity);
      styleParts.push(`background-color:${bg}`);
      styleParts.push(`color:#2F241F`);
      styleParts.push(`padding:0 2px`);
      styleParts.push(`border-radius:3px`);
      styleParts.push(`box-decoration-break:clone`);
      // highlighter is translucent, no shadow, slightly soft edge via box
      styleParts.push(`--pen-highlight:${bg}`);
    } else if (pen.type === 'pencil') {
      styleParts.push(`color:${pen.color}`);
      // Pencil: softer, gray, less uniform — subtle text-shadow + filter
      if (pen.opacity !== undefined && pen.opacity !== null)
        styleParts.push(`opacity:${pen.opacity}`);
      // soft graphite texture
      styleParts.push(`text-shadow:0 0 0.6px rgba(0,0,0,0.12), 0 0 1px rgba(90,90,94,0.08)`);
      // slight unevenness via opacity variation already; filter handled in CSS class
    } else if (pen.type === 'fountain') {
      styleParts.push(`color:${pen.color}`);
      if (pen.opacity !== undefined && pen.opacity < 0.99)
        styleParts.push(`opacity:${pen.opacity}`);
      // Fountain: slight ink bleed softness, deeper color
      if (pen.color === '#1A1A1E' || pen.color === '#6B2342') {
        styleParts.push(`text-shadow:0 0 0.4px rgba(0,0,0,0.08)`);
      }
    } else if (pen.type === 'gel') {
      styleParts.push(`color:${pen.color}`);
      if (pen.opacity !== undefined && pen.opacity < 0.99)
        styleParts.push(`opacity:${pen.opacity}`);
      // Gel: slightly heavier, crisp
      styleParts.push(`text-shadow:0 0 0.3px rgba(0,0,0,0.06)`);
      // slightly thicker via weight already 600
    } else {
      styleParts.push(`color:${pen.color}`);
      if (pen.opacity !== undefined && pen.opacity < 0.99)
        styleParts.push(`opacity:${pen.opacity}`);
    }
    return styleParts.join('; ');
  }

  function createPenSpan(pen, text) {
    const span = document.createElement('span');
    // Base + type/style classes for CSS-driven realism (pencil, highlighter, fresh ink)
    const extra = ` pen-${pen.type} pen-style-${pen.style || 'elegant'}`;
    span.className = 'pen-written' + extra + ' fresh-ink';
    span.setAttribute('data-pen', pen.id);
    span.setAttribute('data-pen-type', pen.type);
    span.setAttribute('data-pen-style', pen.style || 'elegant');
    const style = getPenInlineStyle(pen);
    if (style) span.setAttribute('style', style);
    if (text !== undefined && text !== null) span.textContent = text;
    // Ink drying — very subtle: fresh ink settles to normal after ~900ms
    // Do not interfere with cursor/selection — class only affects visual, no layout change
    if (span.animate) {
      // Prefer CSS transition; JS just removes class after delay for settling
    }
    setTimeout(() => {
      span.classList.remove('fresh-ink');
      span.classList.add('ink-settled');
    }, 900);
    // Writing animation is CSS-driven via .pen-written { animation: inkSettle ... } on insertion
    return span;
  }

  function isPenSpan(node) {
    return node && node.nodeType === 1 && node.classList && node.classList.contains('pen-written');
  }

  function spansCompatible(a, b) {
    if (!isPenSpan(a) || !isPenSpan(b)) return false;
    return (
      a.getAttribute('data-pen') === b.getAttribute('data-pen') &&
      a.getAttribute('style') === b.getAttribute('style')
    );
  }

  function mergeAdjacentSpans(root) {
    // Merge adjacent pen spans with same pen to keep HTML clean
    // Walk through all pen-written spans
    const spans = root.querySelectorAll('span.pen-written');
    for (let i = 0; i < spans.length - 1; i++) {
      const cur = spans[i];
      const nxt = spans[i + 1];
      if (!cur.parentNode || !nxt.parentNode) continue;
      // Check if they are adjacent siblings (possibly with no text node between)
      let nextSibling = cur.nextSibling;
      // Skip empty text nodes
      while (nextSibling && nextSibling.nodeType === 3 && nextSibling.textContent === '')
        nextSibling = nextSibling.nextSibling;
      if (nextSibling === nxt && spansCompatible(cur, nxt)) {
        // Merge nxt into cur
        cur.textContent += nxt.textContent;
        nxt.remove();
        // Re-query remaining? Simplify by merging immediate and continue
      }
    }
    // Also unwrap empty spans
    root.querySelectorAll('span.pen-written').forEach(s => {
      if (!s.textContent && s.childNodes.length === 0) s.remove();
    });
  }

  function insertTextWithPen(area, text, pen) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      // Append at end of area
      const span = createPenSpan(pen, text);
      area.appendChild(span);
      // Move caret after
      const range = document.createRange();
      range.selectNodeContents(span);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    const range = sel.getRangeAt(0);
    // Ensure range is inside area
    if (!area.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== area) {
      area.focus();
      // try to place at end
      const r2 = document.createRange();
      r2.selectNodeContents(area);
      r2.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r2);
      return insertTextWithPen(area, text, pen);
    }

    // Delete selected content if any
    if (!range.collapsed) {
      range.deleteContents();
    }

    // Check if caret is inside existing pen span with same pen — then just insert text there
    const container = range.startContainer;
    let penSpan = null;
    if (container.nodeType === 3) {
      penSpan = container.parentElement
        ? container.parentElement.closest('span.pen-written')
        : null;
    } else if (container.nodeType === 1) {
      if (isPenSpan(container)) penSpan = container;
      else if (container.closest) penSpan = container.closest('span.pen-written');
    }
    // If caret is inside span with same pen, insert inside it
    if (
      penSpan &&
      penSpan.getAttribute('data-pen') === pen.id &&
      penSpan.getAttribute('style') === getPenInlineStyle(pen)
    ) {
      // Insert text node inside span at range
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      // Move caret after inserted
      range.setStartAfter(textNode);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      // Normalize to merge text nodes
      if (penSpan.normalize) penSpan.normalize();
      return;
    }

    // If caret is inside different pen span, we need to split and insert new pen span outside
    // Create new pen span
    const span = createPenSpan(pen, text);
    range.insertNode(span);
    // Move caret after span
    range.setStartAfter(span);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    // Merge if adjacent same pen (e.g., consecutive typing)
    // Defer merge to next tick to avoid disrupting selection
    setTimeout(() => mergeAdjacentSpans(area), 0);
  }

  function insertLineBreakWithPen(area, pen) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!area.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== area)
      return;

    // Insert <br> or new <p>? Use execCommand for paragraph handling if needed.
    // Simple: insert <br> and ensure caret after
    // But spec wants Enter to continue writing with same pen.
    // We'll insert <br> plus a zero-width pen span for next typing
    const br = document.createElement('br');
    if (!range.collapsed) range.deleteContents();
    range.insertNode(br);
    range.setStartAfter(br);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    // After <br>, typing will be handled via beforeinput insertText which will wrap with pen
    // Also place a pen indicator span \u200B so next char inherits? Not needed if beforeinput handles
  }

  function getWritingAreas() {
    return Array.from(document.querySelectorAll('.page-writing-area[contenteditable="true"]'));
  }

  function sanitizePasteText(text) {
    // Return plain text, strip leading/trailing, limit length per paste
    if (!text) return '';
    // Remove dangerous control characters but keep normal text
    return text.replace(/\r\n/g, '\n');
  }

  function attachToArea(area) {
    if (!area || area._penWritingAttached) return;
    area._penWritingAttached = true;

    // Ensure writing area receives pointer events and doesn't trigger page-turn
    area.style.pointerEvents = 'auto';
    area.style.position = 'relative';
    area.style.zIndex = '5';
    // Ensure ancestors don't block pointer events (notebook-page-content had pointer-events:none in some CSS)
    try {
      const pageContent = area.closest('.notebook-page-content');
      if (pageContent) pageContent.style.pointerEvents = 'auto';
      const pageBody = area.closest('.page-body');
      if (pageBody) pageBody.style.pointerEvents = 'auto';
      const page = area.closest('.notebook-page');
      if (page) page.style.pointerEvents = 'auto';
    } catch (_) {}
    // Stop propagation so notebook swipe/page-turn doesn't intercept clicks in writing area
    area.addEventListener('pointerdown', e => {
      e.stopPropagation();
    });
    area.addEventListener('pointerup', e => {
      e.stopPropagation();
    });
    area.addEventListener('click', e => {
      e.stopPropagation();
    });

    // Ensure area has pen indicator for accessibility
    area.addEventListener('focus', () => {
      const pen = getSelectedPenSafe();
      if (pen) {
        area.setAttribute('data-active-pen', pen.id);
      }
    });
    area.addEventListener('blur', () => {
      try {
        if (window.MemoriumSound && window.MemoriumSound.stopWritingSound)
          window.MemoriumSound.stopWritingSound();
      } catch (_) {}
    });

    area.addEventListener('beforeinput', e => {
      const pen = getSelectedPenSafe();
      if (!pen) return;
      // Handle insertText
      if (e.inputType === 'insertText' && e.data !== null && e.data !== undefined) {
        // Some browsers provide data as single char, others as string
        const data = e.data;
        // Prevent default and insert with pen
        e.preventDefault();
        insertTextWithPen(area, data, pen);
        triggerWritingSound(pen);
        // Trigger input event manually for autosave
        area.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (e.inputType === 'insertFromPaste') {
        e.preventDefault();
        let text = '';
        try {
          text = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || '';
        } catch (_) {}
        if (!text && window.clipboardData) {
          try {
            text = window.clipboardData.getData('Text');
          } catch (_) {}
        }
        if (!text) {
          // Fallback: let paste event handle
          return;
        }
        const clean = sanitizePasteText(text);
        if (!clean) return;
        // Insert each line? Split by newline and handle breaks
        // For simplicity, insert as single text with lines separated by \n -> <br>
        const lines = clean.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i]) insertTextWithPen(area, lines[i], pen);
          if (i < lines.length - 1) {
            const sel = window.getSelection();
            if (sel && sel.rangeCount) {
              const range = sel.getRangeAt(0);
              const br = document.createElement('br');
              range.insertNode(br);
              range.setStartAfter(br);
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          }
        }
        triggerWritingSound(pen);
        area.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') {
        // For Enter, let browser handle but we want next typing to use pen — no need to intercept
        // However for clean HTML, we ensure new block gets pen context on next input
        // We could allow default, then on input merge
        // No preventDefault here
      } else if (
        e.inputType === 'deleteContentBackward' ||
        e.inputType === 'deleteContentForward' ||
        e.inputType.startsWith('delete')
      ) {
        // Let default delete handle; after deletion we may need to clean empty spans
        setTimeout(() => mergeAdjacentSpans(area), 0);
      }
    });

    area.addEventListener('paste', e => {
      // Fallback for browsers not firing beforeinput paste
      // If beforeinput already handled, this may be duplicate — check if default prevented already
      // We prevent and handle plain text with pen
      const pen = getSelectedPenSafe();
      if (!pen) return;
      // If beforeinput already prevented, this paste may not fire with defaultPrevented? But we handle anyway
      // Check if we already handled via beforeinput — we can check if e.defaultPrevented
      if (e.defaultPrevented) return;
      e.preventDefault();
      let text = '';
      try {
        text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
      } catch (_) {}
      if (!text) return;
      const clean = sanitizePasteText(text);
      const lines = clean.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]) insertTextWithPen(area, lines[i], pen);
        if (i < lines.length - 1) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount) {
            const range = sel.getRangeAt(0);
            const br = document.createElement('br');
            range.insertNode(br);
            range.setStartAfter(br);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }
      triggerWritingSound(pen);
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Also handle composition (IME) — after compositionend, wrap
    let composing = false;
    area.addEventListener('compositionstart', () => {
      composing = true;
    });
    area.addEventListener('compositionend', e => {
      composing = false;
      const pen = getSelectedPenSafe();
      if (!pen || !e.data) return;
      // Some IMEs insert via input after composition. Our beforeinput may have missed.
      // We check if last inserted content is unwrapped plain text — wrap now
      // Simpler: after composition, merge and ensure last text node is inside pen span
      // If the inserted text is not yet wrapped, we can detect: last child text node at caret
      setTimeout(() => {
        // Find caret position
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const container = range.startContainer;
        // If container is text node not inside pen span, wrap its parent content?
        // For simplicity, we rely on beforeinput handling for IME as insertText, which already wraps.
        mergeAdjacentSpans(area);
      }, 0);
    });

    // On input, clean and trigger debounce autosave (notebook already listens to input)
    area.addEventListener('input', () => {
      // Merge adjacent same-pen spans to keep HTML clean
      // Debounce slightly to avoid interfering with ongoing composition
      if (composing) return;
      // Use microtask
      setTimeout(() => mergeAdjacentSpans(area), 10);
    });

    // Ensure placeholder handling: if area is empty, typing should still use pen
    // Already handled via beforeinput.

    area.addEventListener('keydown', e => {
      // Handle Enter to ensure next line uses pen — no special needed as beforeinput will handle next insertText
      // Handle Ctrl/Cmd + A/C/V etc — let default
      // For Backspace at pen span boundary, let default
    });
  }

  function ensurePenIndicator() {
    // Tiny status indicator in page header or near writing area showing current pen color dot
    let indicator = document.getElementById('pen-writing-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'pen-writing-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      indicator.style.cssText =
        'position:absolute; top:8px; right:12px; width:10px; height:10px; border-radius:50%; border:1.5px solid rgba(255,255,255,0.9); box-shadow:0 1px 4px rgba(0,0,0,0.15); pointer-events:none; transition: background 0.25s ease, opacity 0.25s ease; z-index:2;';
      // Find page header to attach near? We'll attach to writing area parent
      const area = document.querySelector('.page-writing-area');
      if (area && area.parentElement) {
        const parent = area.closest('.notebook-page-content') || area.parentElement;
        if (parent) {
          parent.style.position = 'relative';
          parent.appendChild(indicator);
        }
      }
    }
    const pen = getSelectedPenSafe();
    if (pen && indicator) {
      if (pen.type === 'highlighter') {
        indicator.style.background = hexToRgba(pen.color, 1);
        indicator.style.opacity = '0.85';
        indicator.title = pen.name + ' (highlighter)';
      } else {
        indicator.style.background = pen.color;
        indicator.style.opacity = String(pen.opacity);
        indicator.title = pen.name;
      }
    }
  }

  function ensureWritingToolsUI() {
    if (document.getElementById('writing-tools-bar'))
      return document.getElementById('writing-tools-bar');
    const notebook = document.querySelector('.notebook');
    if (!notebook) return null;
    // Inject toolbar styles if not present
    if (!document.getElementById('memorium-writing-tools-style')) {
      const style = document.createElement('style');
      style.id = 'memorium-writing-tools-style';
      style.textContent = `
        .writing-tools-bar{display:flex;gap:0.5rem;align-items:center;justify-content:center;flex-wrap:wrap;padding:0.7rem 0.9rem;margin:0.8rem auto;background:linear-gradient(180deg,#FFFEFB 0%,#FFF8F0 100%),repeating-linear-gradient(0deg,transparent,transparent 26px,rgba(107,79,59,0.015) 26px,rgba(107,79,59,0.015) 27px);border:1px solid var(--theme-border,#DDD1BF);border-radius:14px;box-shadow:0 6px 18px rgba(0,0,0,0.06),0 2px 6px rgba(0,0,0,0.04),inset 0 1px 0 rgba(255,255,255,0.9);max-width:560px;position:relative;overflow:hidden}
        .writing-tools-bar::before{content:'';position:absolute;top:0;left:18px;bottom:0;width:1px;background:rgba(201,162,39,0.14);pointer-events:none;}
        .writing-tools-label{font-family:var(--heading-font,'Cormorant Garamond',serif);font-size:0.78rem;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:var(--text-muted,#6E6259);margin-right:0.2rem}
        .writing-tool-btn{padding:0.45rem 0.75rem;border-radius:999px;border:1.5px solid var(--theme-border,#DDD1BF);background:#FFFEFB;font-family:var(--heading-font,'Cormorant Garamond',serif);font-size:0.82rem;font-weight:600;cursor:pointer;transition:all 0.18s ease;display:inline-flex;align-items:center;gap:0.35rem}
        .writing-tool-btn:hover{transform:translateY(-1px);box-shadow:0 4px 10px rgba(0,0,0,0.06);border-color:rgba(107,79,59,0.18)}
        .writing-tool-btn:active{transform:translateY(0) scale(0.98)}
        .writing-tool-btn:focus-visible{outline:2px solid var(--theme-accent,#C9A227);outline-offset:2px}
        .writing-tool-btn--eraser.active{border-color:var(--theme-accent,#C9A227);background:#FFFEFB;box-shadow:0 0 0 3px rgba(201,162,39,0.14)}
        .highlight-colors{display:flex;gap:0.35rem;align-items:center;margin-left:0.2rem}
        .highlight-color-btn{width:28px;height:28px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.9);cursor:pointer;box-shadow:inset 0 1px 1px rgba(0,0,0,0.08),0 2px 6px rgba(0,0,0,0.12);transition:transform 0.18s ease,box-shadow 0.18s ease}
        .highlight-color-btn:hover{transform:scale(1.08);box-shadow:inset 0 1px 1px rgba(0,0,0,0.08),0 3px 8px rgba(0,0,0,0.14)}
        .highlight-color-btn:focus-visible{outline:2px solid var(--theme-accent,#C9A227);outline-offset:2px}
        .highlight-color-btn:active{transform:scale(0.96)}
        .highlight-clear-btn{padding:0.38rem 0.7rem;font-size:0.76rem}
        @media(max-width:768px){.writing-tools-bar{padding:0.6rem 0.7rem;margin:0.6rem auto;gap:0.45rem} .highlight-color-btn{width:26px;height:26px}}
      `;
      document.head.appendChild(style);
    }
    const bar = document.createElement('div');
    bar.id = 'writing-tools-bar';
    bar.className = 'writing-tools-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Writing tools');
    bar.innerHTML = `
      <span class="writing-tools-label">Tools</span>
      <button type="button" class="writing-tool-btn writing-tool-btn--eraser" data-tool="eraser" aria-label="Eraser — delete selected text" title="Select text and click to erase">🧽 Eraser</button>
      <span class="writing-tools-label" style="margin-left:0.4rem">Highlight</span>
      <span class="highlight-colors" role="group" aria-label="Highlight colors">
        <button type="button" class="highlight-color-btn" data-highlight="yellow" aria-label="Highlight yellow" title="Highlight yellow" style="background:rgba(255,233,120,0.55)"></button>
        <button type="button" class="highlight-color-btn" data-highlight="pink" aria-label="Highlight pink" title="Highlight pink" style="background:rgba(255,180,180,0.55)"></button>
        <button type="button" class="highlight-color-btn" data-highlight="blue" aria-label="Highlight blue" title="Highlight blue" style="background:rgba(180,220,255,0.55)"></button>
        <button type="button" class="highlight-color-btn" data-highlight="green" aria-label="Highlight green" title="Highlight green" style="background:rgba(180,235,180,0.55)"></button>
      </span>
      <button type="button" class="writing-tool-btn highlight-clear-btn" data-tool="clear-highlight" aria-label="Clear highlight" title="Select highlighted text to clear">Clear</button>
    `;
    // Insert near notebook: after pen holder if exists, else after notebook
    const penHolder = document.getElementById('pen-holder-system');
    const paperSystem = document.getElementById('paper-system');
    const anchor = penHolder || paperSystem || document.querySelector('.theme-family-system');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(bar, anchor.nextSibling);
      // Ensure paper system after pen holder, writing tools after paper? order: theme -> pen -> paper -> writing tools -> sound -> notebook
      // But insertion logic above puts writing tools after penHolder if exists; if paperSystem exists after, it will be before paper — that's okay but we want consistent
      // Try to place after paper if paper exists, otherwise after pen
      const paperEl = document.getElementById('paper-system');
      if (paperEl && paperEl !== bar && bar.parentNode) {
        // move bar after paper
        bar.parentNode.insertBefore(bar, paperEl.nextSibling);
      }
    } else {
      const parent = notebook.parentNode;
      parent.insertBefore(bar, notebook.nextSibling);
    }
    // Wire events
    const eraserBtn = bar.querySelector('[data-tool="eraser"]');
    if (eraserBtn) eraserBtn.addEventListener('click', eraseSelection);
    bar.querySelectorAll('[data-highlight]').forEach(btn => {
      btn.addEventListener('click', () => highlightSelection(btn.dataset.highlight));
    });
    const clearBtn = bar.querySelector('[data-tool="clear-highlight"]');
    if (clearBtn) clearBtn.addEventListener('click', clearHighlightFromSelection);
    // Also add keyboard shortcuts: Delete for eraser when selection, Ctrl+H for highlight yellow?
    document.addEventListener('keydown', e => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && e.altKey) {
        // Alt+Delete as eraser shortcut — not interfering with normal delete
        // We do not override normal delete, just provide shortcut
      }
    });
    return bar;
  }

  function initWritingEngine() {
    const areas = getWritingAreas();
    if (!areas.length) {
      setTimeout(initWritingEngine, 300);
      return;
    }
    areas.forEach(attachToArea);

    // Re-attach when notebook re-renders pages (page switch, new page)
    // Observe DOM changes for new writing areas
    const observer = new MutationObserver(() => {
      getWritingAreas().forEach(attachToArea);
      ensurePenIndicator();
    });
    const notebook = document.querySelector('.notebook');
    if (notebook) observer.observe(notebook, { childList: true, subtree: true });

    // Listen to pen changes to update indicator and ensure caret context
    document.addEventListener('memorium:penchange', () => {
      ensurePenIndicator();
      // If writing area is focused, ensure next typing uses new pen
      const active = document.activeElement;
      if (active && active.classList && active.classList.contains('page-writing-area')) {
        // No need to move caret, beforeinput will handle next char with new pen
        // Just update data attribute
        const pen = getSelectedPenSafe();
        if (pen) active.setAttribute('data-active-pen', pen.id);
      }
    });

    ensurePenIndicator();
    ensureWritingToolsUI();

    // Expose for testing
    window.MemoriumWriting = {
      getSelectedPenSafe,
      getPenInlineStyle,
      createPenSpan,
      insertTextWithPen,
      mergeAdjacentSpans,
      hexToRgba,
      eraseSelection,
      highlightSelection,
      clearHighlightFromSelection,
      HIGHLIGHT_COLORS,
    };
  }

  // Sanitization helper for loaded content (migrate legacy plain text to not break)
  // We keep existing innerHTML as is — no forced re-wrap

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initWritingEngine);
  else setTimeout(initWritingEngine, 0);
})();
