/* ============================================================
   MEMORIUM — Pen Collection Configuration (Step 11B)
   Single source of truth for 8 physical pens.
   Each pen is a material object with ink, feel, and sound.
   ============================================================ */
(function () {
  'use strict';

  const PENS = {
    'classic-black-ink': {
      id: 'classic-black-ink',
      name: 'Classic Black Ink',
      type: 'fountain',
      color: '#1A1A1E',
      opacity: 0.98,
      size: 'medium',
      fontFamily: "'Lora', Georgia, serif",
      fontStyle: 'normal',
      fontWeight: 500,
      lineHeight: 1.6,
      writingSound: 'fountain-writing',
      style: 'elegant',
      description: 'Timeless black fountain ink — elegant and traditional',
    },
    'royal-blue-ink': {
      id: 'royal-blue-ink',
      name: 'Royal Blue Ink',
      type: 'fountain',
      color: '#23406A',
      opacity: 0.97,
      size: 'medium',
      fontFamily: "'Lora', Georgia, serif",
      fontStyle: 'normal',
      fontWeight: 500,
      lineHeight: 1.6,
      writingSound: 'fountain-writing',
      style: 'elegant',
      description: 'Deep blue fountain ink — classic diary feel',
    },
    'burgundy-fountain': {
      id: 'burgundy-fountain',
      name: 'Burgundy Fountain',
      type: 'fountain',
      color: '#6B2342',
      opacity: 0.96,
      size: 'medium',
      fontFamily: "'Cormorant Garamond', Georgia, serif",
      fontStyle: 'normal',
      fontWeight: 600,
      lineHeight: 1.65,
      writingSound: 'fountain-writing',
      style: 'elegant',
      description: 'Burgundy fountain ink — rich and refined',
    },
    'forest-green-ink': {
      id: 'forest-green-ink',
      name: 'Forest Green Ink',
      type: 'fountain',
      color: '#2D4A3E',
      opacity: 0.96,
      size: 'medium',
      fontFamily: "'Lora', Georgia, serif",
      fontStyle: 'italic',
      fontWeight: 500,
      lineHeight: 1.6,
      writingSound: 'fountain-writing',
      style: 'neat',
      description: 'Deep forest green — grounded and calm',
    },
    'graphite-pencil': {
      id: 'graphite-pencil',
      name: 'Graphite Pencil',
      type: 'pencil',
      color: '#5A5A5E',
      opacity: 0.78,
      size: 'fine',
      fontFamily: "'Caveat', cursive",
      fontStyle: 'normal',
      fontWeight: 500,
      lineHeight: 1.7,
      writingSound: 'pencil-writing',
      style: 'casual',
      description: 'Soft graphite pencil — gentle and sketchy',
    },
    'soft-black-gel': {
      id: 'soft-black-gel',
      name: 'Soft Black Gel',
      type: 'gel',
      color: '#232326',
      opacity: 0.99,
      size: 'medium',
      fontFamily: "'Lora', Georgia, serif",
      fontStyle: 'normal',
      fontWeight: 600,
      lineHeight: 1.55,
      writingSound: 'gel-writing',
      style: 'neat',
      description: 'Smooth gel ink — slightly heavier than fountain',
    },
    'golden-highlighter': {
      id: 'golden-highlighter',
      name: 'Golden Highlighter',
      type: 'highlighter',
      color: '#E0C350',
      opacity: 0.38,
      size: 'bold',
      fontFamily: "'Lora', Georgia, serif",
      fontStyle: 'normal',
      fontWeight: 700,
      lineHeight: 1.5,
      writingSound: 'highlighter-writing',
      style: 'soft',
      description: 'Translucent golden highlighter — soft glow',
    },
    'rose-ink': {
      id: 'rose-ink',
      name: 'Rose Ink',
      type: 'fountain',
      color: '#8B5A6E',
      opacity: 0.94,
      size: 'medium',
      fontFamily: "'Caveat', cursive",
      fontStyle: 'normal',
      fontWeight: 500,
      lineHeight: 1.7,
      writingSound: 'fountain-writing',
      style: 'soft',
      description: 'Muted rose ink — tender and romantic',
    },
    'typewriter-ink': {
      id: 'typewriter-ink',
      name: 'Typewriter Ink',
      type: 'gel',
      color: '#2F241F',
      opacity: 0.97,
      size: 'medium',
      fontFamily: "'Courier New', Courier, monospace",
      fontStyle: 'normal',
      fontWeight: 500,
      lineHeight: 1.6,
      writingSound: 'gel-writing',
      style: 'typewriter',
      description: 'Crisp typewriter — steady and mechanical',
    },
  };

  const ALL_PEN_IDS = Object.keys(PENS);
  const PEN_TYPES = ['fountain', 'gel', 'pencil', 'highlighter'];
  const PEN_SIZES = ['fine', 'medium', 'bold'];
  const PEN_STYLES = ['elegant', 'casual', 'neat', 'soft', 'bold', 'typewriter'];
  const DEFAULT_PEN = 'classic-black-ink';

  const SIZE_MAP = {
    fine: { px: 15, label: 'Fine', stroke: 1.2 },
    medium: { px: 18, label: 'Medium', stroke: 1.8 },
    bold: { px: 22, label: 'Bold', stroke: 2.4 },
  };

  function isValidPen(id) {
    return !!PENS[id];
  }
  function getPen(id) {
    return PENS[id] || PENS[DEFAULT_PEN];
  }
  function getAllPens() {
    return Object.values(PENS);
  }
  function isValidType(t) {
    return PEN_TYPES.includes(t);
  }
  function isValidSize(s) {
    return PEN_SIZES.includes(s);
  }
  function isValidStyle(s) {
    return PEN_STYLES.includes(s);
  }

  window.MemoriumPenConfig = {
    PENS,
    ALL_PEN_IDS,
    PEN_TYPES,
    PEN_SIZES,
    PEN_STYLES,
    SIZE_MAP,
    DEFAULT_PEN,
    isValidPen,
    getPen,
    getAllPens,
    isValidType,
    isValidSize,
    isValidStyle,
  };
})();
