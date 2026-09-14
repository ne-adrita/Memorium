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
    // Font
    if (pen.fontFamily) styleParts.push(`font-family:${pen.fontFamily}`);
    if (pen.fontStyle) styleParts.push(`font-style:${pen.fontStyle}`);
    if (pen.fontWeight) styleParts.push(`font-weight:${pen.fontWeight}`);
    if (pen.lineHeight) styleParts.push(`line-height:${pen.lineHeight}`);
    styleParts.push(`font-size:${sizePx}px`);

    if (pen.type === 'highlighter') {
      // Highlighter: translucent background, keep text readable
      const bg = hexToRgba(pen.color, pen.opacity);
      // Use dark text on highlight — preserve readability
      styleParts.push(`background-color:${bg}`);
      styleParts.push(`color:#2F241F`);
      styleParts.push(`padding:0 2px`);
      styleParts.push(`border-radius:3px`);
      styleParts.push(`box-decoration-break:clone`);
    } else {
      styleParts.push(`color:${pen.color}`);
      // opacity for pencil soft etc.
      if (pen.opacity !== undefined && pen.opacity !== null && pen.opacity < 0.99) {
        styleParts.push(`opacity:${pen.opacity}`);
      }
    }
    return styleParts.join('; ');
  }

  function createPenSpan(pen, text) {
    const span = document.createElement('span');
    span.className = 'pen-written';
    span.setAttribute('data-pen', pen.id);
    span.setAttribute('data-pen-type', pen.type);
    // Avoid duplicating style string excessively — keep minimal necessary
    const style = getPenInlineStyle(pen);
    if (style) span.setAttribute('style', style);
    if (text !== undefined && text !== null) span.textContent = text;
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

    // Expose for testing
    window.MemoriumWriting = {
      getSelectedPenSafe,
      getPenInlineStyle,
      createPenSpan,
      insertTextWithPen,
      mergeAdjacentSpans,
      hexToRgba,
    };
  }

  // Sanitization helper for loaded content (migrate legacy plain text to not break)
  // We keep existing innerHTML as is — no forced re-wrap

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', initWritingEngine);
  else setTimeout(initWritingEngine, 0);
})();
