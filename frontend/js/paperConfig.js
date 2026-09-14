/* ============================================================
   MEMORIUM — Paper Types Configuration (Step 11F)
   Centralized 7 paper types, CSS-based patterns behind writing
   ============================================================ */
(function () {
  'use strict';

  const PAPERS = {
    plain: {
      id: 'plain',
      label: 'Plain',
      description: 'Clean smooth paper',
      icon: '▭',
    },
    ruled: {
      id: 'ruled',
      label: 'Ruled',
      description: 'Classic horizontal lines',
      icon: '☰',
    },
    dotted: {
      id: 'dotted',
      label: 'Dotted',
      description: 'Subtle dot grid',
      icon: '⋮',
    },
    grid: {
      id: 'grid',
      label: 'Grid',
      description: 'Soft square grid',
      icon: '⊞',
    },
    vintage: {
      id: 'vintage',
      label: 'Vintage',
      description: 'Aged vintage texture',
      icon: '📜',
    },
    handmade: {
      id: 'handmade',
      label: 'Handmade',
      description: 'Organic handmade fiber',
      icon: '◫',
    },
    torn: {
      id: 'torn',
      label: 'Torn Edge',
      description: 'Subtle torn edge',
      icon: '✂',
    },
  };

  const ALL_PAPER_IDS = Object.keys(PAPERS);
  const DEFAULT_PAPER = 'plain';

  function isValidPaper(id) {
    return !!PAPERS[id];
  }
  function getPaper(id) {
    return PAPERS[id] || PAPERS[DEFAULT_PAPER];
  }
  function getAllPapers() {
    return Object.values(PAPERS);
  }
  function normalizePaper(raw) {
    if (!raw) return DEFAULT_PAPER;
    if (PAPERS[raw]) return raw;
    return DEFAULT_PAPER;
  }

  window.MemoriumPaperConfig = {
    PAPERS,
    ALL_PAPER_IDS,
    DEFAULT_PAPER,
    isValidPaper,
    getPaper,
    getAllPapers,
    normalizePaper,
  };
})();
