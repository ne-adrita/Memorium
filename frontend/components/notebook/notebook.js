/* ============================================================
   MEMORIUM — Notebook Interactivity
   Plain JS — No frameworks, no external deps.
   ============================================================ */

(function() {
    'use strict';

    // ============================================================
    // CONFIGURATION — Page data
    // ============================================================

    const PAGES = [
        {
            id: 12,
            isLeft: true,
            title: 'Friday, February 14, 2026',
            // Content is loaded/saved from localStorage below
        },
        {
            id: 13,
            isLeft: false,
            title: 'Friday, February 14, 2026',
            // Content is loaded/saved from localStorage below
        }
    ];

    // Track current page index in the PAGES array
    let currentPageIndex = 0;

    // ============================================================
    // ELEMENT REFERENCES
    // ============================================================

    const notebookEl = document.querySelector('.notebook');
    const pageElements = {};
    const writingAreas = {};
    const pageNumbers = {};

    const navPrev = document.createElement('div');
    const navNext = document.createElement('div');

    // ============================================================
    // INITIALISATION
    // ============================================================

    function init() {
        renderPageElements();
        loadPageStatesFromStorage();
        setupEventListeners();
        updateNavButtons();
        renderNavigationHints();
        updatePageNumber();
    }

    function renderPageElements() {
        // Create navigation controls
        navPrev.className = 'notebook-nav nav-prev';
        navPrev.innerHTML = '◀ Prev Page';
        navPrev.setAttribute('role', 'button');
        navPrev.setAttribute('tabindex', '0');
        navPrev.title = 'Previous Page (ArrowLeft)';

        navNext.className = 'notebook-nav nav-next';
        navNext.innerHTML = 'Next Page ▶';
        navNext.setAttribute('role', 'button');
        navNext.setAttribute('tabindex', '0');
        navNext.title = 'Next Page (ArrowRight)';

        // Insert navigation at the bottom of the notebook
        if (notebookEl) {
            notebookEl.style.position = 'relative';
            notebookEl.style.userSelect = 'none';

            // Create a wrapper container for navigation
            const navContainer = document.createElement('div');
            navContainer.style.position = 'absolute';
            navContainer.style.bottom = '10px';
            navContainer.style.left = '50%';
            navContainer.style.transform = 'translateX(-50%)';
            navContainer.style.display = 'flex';
            navContainer.style.gap = '1rem';
            navContainer.style.zIndex = '10';

            navContainer.appendChild(navPrev);
            navContainer.appendChild(navNext);
            notebookEl.appendChild(navContainer);

            // Build element references for each page
            PAGES.forEach(page => {
                const leftPage = document.querySelector(`.notebook-page--left`);
                const rightPage = document.querySelector(`.notebook-page--right`);

                if (page.isLeft) {
                    pageElements[page.id] = leftPage;
                    // Find the writing area inside
                    const writingArea = leftPage.querySelector('.page-writing-area');
                    if (writingArea) {
                        writingAreas[page.id] = writingArea;
                    }
                    const pageNum = leftPage.querySelector('.page-number');
                    if (pageNum) {
                        pageNumbers[page.id] = pageNum;
                    }
                } else {
                    pageElements[page.id] = rightPage;
                    const writingArea = rightPage.querySelector('.page-writing-area');
                    if (writingArea) {
                        writingAreas[page.id] = writingArea;
                    }
                    const pageNum = rightPage.querySelector('.page-number');
                    if (pageNum) {
                        pageNumbers[page.id] = pageNum;
                    }
                }
            });
        }
    }

    // ============================================================
    // PAGE STATE (localStorage)
    // ============================================================

    function loadPageStatesFromStorage() {
        for (let i = 0; i < PAGES.length; i++) {
            const key = `memorium-page-${PAGES[i].id}`;
            const saved = localStorage.getItem(key);
            if (saved) {
                // Restore content into the writing area
                if (writingAreas[PAGES[i].id]) {
                    writingAreas[PAGES[i].id].innerHTML = saved;
                }
            }
        }
    }

    function saveCurrentPageToStorage() {
        const currentPage = PAGES[currentPageIndex];
        const key = `memorium-page-${currentPage.id}`;
        if (writingAreas[currentPage.id]) {
            localStorage.setItem(key, writingAreas[currentPage.id].innerHTML);
        }
    }

    // ============================================================
    // PAGE NAVIGATION
    // ============================================================

    function goToPage(index) {
        // Don't navigate out of bounds
        if (index < 0 || index >= PAGES.length) {
            return false;
        }

        // Save current page content before leaving
        saveCurrentPageToStorage();

        // Update state
        currentPageIndex = index;

        // Hide all pages, show current
        Object.values(pageElements).forEach(el => {
            el.style.display = 'none';
        });
        pageElements[PAGES[currentPageIndex].id].style.display = 'block';

        // Update UI
        updateNavButtons();
        updatePageNumber();
        renderNavigationHints();

        // Load content for the new current page
        loadPageStatesFromStorage();

        return true;
    }

    function nextPage() {
        return goToPage(currentPageIndex + 1);
    }

    function previousPage() {
        return goToPage(currentPageIndex - 1);
    }

    function updateNavButtons() {
        if (!navPrev || !navNext) return;

        const canGoPrevious = currentPageIndex > 0;
        const canGoNext = currentPageIndex < PAGES.length - 1;

        navPrev.style.opacity = canGoPrevious ? '1' : '0.5';
        navPrev.style.pointerEvents = canGoPrevious ? 'auto' : 'none';

        navNext.style.opacity = canGoNext ? '1' : '0.5';
        navNext.style.pointerEvents = canGoNext ? 'auto' : 'none';
    }

    // ============================================================
    // PAGE NUMBER DISPLAY
    // ============================================================

    function updatePageNumber() {
        const currentPage = PAGES[currentPageIndex];
        if (pageNumbers[currentPage.id]) {
            pageNumbers[currentPage.id].textContent = currentPage.id;
        }
    }

    // ============================================================
    // KEYBOARD NAVIGATION
    // ============================================================

    function setupKeyboardNav() {
        document.addEventListener('keydown', function(e) {
            // Disable keyboard nav if a textarea/input is focused
            const focused = document.activeElement;
            if (focused.tagName === 'TEXTAREA' || focused.tagName === 'INPUT' || focused.tagName === 'SELECT') {
                return;
            }

            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                previousPage();
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                nextPage();
            }
        });
    }

    // ============================================================
    // DECORATIONS — Sticky notes
    // ============================================================

    function createStickyNote(text = '') {
        const note = document.createElement('div');
        note.className = 'note';
        note.textContent = text || 'New note…';
        note.draggable = true;

        // Make it editable on double-click
        let isEditing = false;
        note.addEventListener('dblclick', function() {
            if (isEditing) return;
            isEditing = true;
            const originalText = note.textContent;
            const input = document.createElement('input');
            input.value = originalText;
            input.style.cssText = `
                width: 100%;
                padding: 8px 12px;
                font-family: 'Caveat', cursive;
                font-size: 22px;
                color: #4A3528;
                background: #FFF9C4;
                border: 1px solid #C4A882;
                border-radius: 2px 8px 2px 8px;
                box-sizing: border-box;
                outline: none;
            `;
            input.focus();
            input.select();

            function saveNote() {
                note.textContent = input.value;
                isEditing = false;
                input.remove();
            }

            input.addEventListener('blur', saveNote);
            input.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    saveNote();
                }
                if (e.key === 'Escape') {
                    note.textContent = originalText;
                    isEditing = false;
                    input.remove();
                }
            });

            // Insert input before the note
            note.innerHTML = '';
            note.appendChild(input);
        });

        // Add remove button
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'remove-note';
        removeBtn.title = 'Remove this note';
        removeBtn.innerHTML = '✕';
        removeBtn.style.cssText = `
            position: absolute;
            top: 6px;
            right: 6px;
            background: transparent;
            border: none;
            color: #B5A590;
            font-size: 14px;
            cursor: pointer;
            padding: 0;
        `;
        removeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            note.remove();
        });

        note.appendChild(removeBtn);

        // Insert after the decoration area or on the current page
        const decorationArea = document.querySelector('.page-decoration-area');
        const rightPage = document.querySelector('.notebook-page--right');
        if (decorationArea && rightPage) {
            rightPage.querySelector('.page-body').appendChild(note);
        } else if (notebookEl) {
            notebookEl.appendChild(note);
        }

        return note;
    }

    // ============================================================
    // EVENT LISTENERS
    // ============================================================

    function setupEventListeners() {
        // Navigation buttons
        if (navPrev) {
            navPrev.addEventListener('click', previousPage);
            navPrev.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    previousPage();
                }
            });
        }

        if (navNext) {
            navNext.addEventListener('click', nextPage);
            navNext.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    nextPage();
                }
            });
        }

        // Keyboard navigation
        setupKeyboardNav();

        // Content editing - save on blur of writing area
        Object.values(writingAreas).forEach(area => {
            if (area) {
                area.addEventListener('blur', saveCurrentPageToStorage);
            }
        });

        // Create sticky note on double-click of decoration area
        const decorationArea = document.querySelector('.page-decoration-area');
        if (decorationArea) {
            decorationArea.addEventListener('dblclick', function(e) {
                e.preventDefault();
                createStickyNote();
            });
        }
    }

    // ============================================================
    // RENDER NAVIGATION HINTS (the existing aria-hidden ones)
    // ============================================================

    function renderNavigationHints() {
        const prevHint = document.querySelector('.notebook-nav-hint--prev');
        const nextHint = document.querySelector('.notebook-nav-hint--next');

        if (prevHint) {
            prevHint.style.display = currentPageIndex > 0 ? 'block' : 'none';
        }
        if (nextHint) {
            nextHint.style.display = currentPageIndex < PAGES.length - 1 ? 'block' : 'none';
        }
    }

    // ============================================================
    // STARTUP
    // ============================================================

    document.addEventListener('DOMContentLoaded', init);
})();