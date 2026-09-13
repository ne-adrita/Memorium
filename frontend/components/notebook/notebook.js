/* ============================================================
   MEMORIUM — Notebook Interactivity (STEP 4)
   Plain JS — No frameworks, no external deps.
   Features: page turning, editing, theming, ambience-ready,
   decorations, localStorage persistence, page creation.
   ============================================================ */
(function () {
    'use strict';

    // ============================================================
    // STATE & CONFIGURATION
    // ============================================================
    const STORAGE_KEY = 'memorium-state-v2';
    const LEGACY_PREFIX = 'memorium-page-';

    const DEFAULT_PAGES = [
        { id: 12, title: 'Friday, February 14, 2026', theme: 'parchment', content: null, decorations: [] },
        { id: 13, title: 'Friday, February 14, 2026', theme: 'parchment', content: null, decorations: [] }
    ];

    // Decorations catalog
    const STICKER_SET = ['🌸','🍂','⭐','✨','🌿','🍁','💌','🕊️'];
    let state = {
        currentPageIndex: 0,
        pages: JSON.parse(JSON.stringify(DEFAULT_PAGES)),
        nextId: 14
    };

    // Elements
    let notebookEl = null;
    let leftPageEl = null;
    let rightPageEl = null;
    const writingAreas = {}; // id -> element
    let navPrev = null;
    let navNext = null;
    let decorationBar = null;

    // ============================================================
    // PERSISTENCE — clean structure ready for API replacement
    // ============================================================
    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && Array.isArray(parsed.pages) && parsed.pages.length) {
                    state = parsed;
                    // ensure nextId exists
                    if (!state.nextId) state.nextId = Math.max(...state.pages.map(p=>p.id)) + 1;
                    return;
                }
            }
        } catch (_) {}
        // migrate legacy per-page content keys if present
        let migrated = false;
        state.pages.forEach(p => {
            try {
                const legacy = localStorage.getItem(LEGACY_PREFIX + p.id);
                if (legacy && !p.content) { p.content = legacy; migrated = true; }
                const themeLegacy = localStorage.getItem(LEGACY_PREFIX + p.id + '-theme');
                if (themeLegacy) { p.theme = themeLegacy; migrated = true; }
                const decoLegacy = localStorage.getItem(LEGACY_PREFIX + p.id + '-decorations');
                if (decoLegacy) { p.decorations = JSON.parse(decoLegacy); migrated = true; }
            } catch (_) {}
        });
        if (migrated) saveState();
    }

    function saveState() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
        // also keep per-page legacy for debugging? not needed
    }

    function getCurrentPage() { return state.pages[state.currentPageIndex]; }

    // ============================================================
    // PAGE CONTENT — save/load
    // ============================================================
    function savePage() {
        const page = getCurrentPage();
        if (!page) return;
        // save both left and right writing areas if present
        // left page holds main content, right page may also have decoration notes
        // we persist each page's writingArea separately
        state.pages.forEach(p => {
            const area = writingAreas[p.id];
            if (area) p.content = area.innerHTML;
        });
        // persist decorations already in state
        saveState();
    }

    function loadPage(index) {
        if (index < 0 || index >= state.pages.length) return false;
        // save current before switching
        savePage();
        state.currentPageIndex = index;
        saveState();
        renderCurrentPage();
        updateNavButtons();
        updatePageNumbers();
        renderNavigationHints();
        return true;
    }

    // Legacy name alias
    function loadPageState() { loadState(); }

    // ============================================================
    // RENDER
    // ============================================================
    function renderCurrentPage() {
        const page = getCurrentPage();
        if (!page || !leftPageEl || !rightPageEl) return;

        // For Step 4: notebook shows spread (both pages) always. We don't hide one side.
        // Instead we update dataset / content and add turn animation.
        leftPageEl.style.display = '';
        rightPageEl.style.display = '';

        // Update attributes and theme per page
        state.pages.forEach(p => {
            const el = p.id === state.pages[0].id ? leftPageEl : (p.id === state.pages[1]?.id ? rightPageEl : null);
            if (!el) return;
            el.dataset.page = String(p.id);
            el.dataset.theme = p.theme || 'parchment';
            el.classList.remove('theme-parchment','theme-vintage','theme-aged','theme-handwritten');
            el.classList.add('theme-' + (p.theme || 'parchment'));
            const area = writingAreas[p.id];
            if (area && p.content != null) area.innerHTML = p.content;
            const numEl = el.querySelector('.page-number');
            if (numEl) numEl.textContent = p.id;
        });

        // highlight current page with subtle focus
        leftPageEl.classList.toggle('page-active', state.currentPageIndex === 0);
        rightPageEl.classList.toggle('page-active', state.currentPageIndex === 1);
        if (notebookEl) notebookEl.dataset.current = String(page.id);

        renderDecorations();
        // notify theme manager of current theme
        if (window.MemoriumTheme) {
            // set dot highlight to current page theme
            const curTheme = page.theme || 'parchment';
            document.querySelectorAll('.theme-dot').forEach(d => {
                d.classList.toggle('active', d.dataset.theme === curTheme);
            });
        }
    }

    function updatePageNumbers() {
        // numbers already updated in renderCurrentPage, also update header if needed
    }

    function updateNavButtons() {
        if (!navPrev || !navNext) return;
        const canPrev = state.currentPageIndex > 0;
        const canNext = state.currentPageIndex < state.pages.length - 1;
        // with spread model we actually have only 2 pages visible together, prev/next switches spread focus
        // keep simple: disable at ends
        navPrev.style.opacity = canPrev ? '1' : '0.45';
        navPrev.style.pointerEvents = canPrev ? 'auto' : 'none';
        navPrev.setAttribute('aria-disabled', String(!canPrev));
        navNext.style.opacity = canNext ? '1' : '0.45';
        navNext.style.pointerEvents = canNext ? 'auto' : 'none';
        navNext.setAttribute('aria-disabled', String(!canNext));
    }

    function renderNavigationHints() {
        const prevHint = document.querySelector('.notebook-nav-hint--prev');
        const nextHint = document.querySelector('.notebook-nav-hint--next');
        if (prevHint) prevHint.style.display = state.currentPageIndex > 0 ? 'block' : 'none';
        if (nextHint) nextHint.style.display = state.currentPageIndex < state.pages.length - 1 ? 'block' : 'none';
    }

    // ============================================================
    // NAVIGATION
    // ============================================================
    function nextPage() {
        if (state.currentPageIndex >= state.pages.length - 1) return false;
        animateTurn('next');
        return loadPage(state.currentPageIndex + 1);
    }
    function previousPage() {
        if (state.currentPageIndex <= 0) return false;
        animateTurn('prev');
        return loadPage(state.currentPageIndex - 1);
    }
    function goToPage(index) { return loadPage(index); }

    function animateTurn(dir) {
        if (!notebookEl) return;
        notebookEl.classList.remove('turn-next','turn-prev');
        void notebookEl.offsetWidth;
        notebookEl.classList.add(dir === 'next' ? 'turn-next' : 'turn-prev');
        setTimeout(() => notebookEl.classList.remove('turn-next','turn-prev'), 450);
    }

    // ============================================================
    // PAGE CREATION
    // ============================================================
    function createPage() {
        const newId = state.nextId++;
        const newPage = { id: newId, title: new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' }), theme: getCurrentPage()?.theme || 'parchment', content: `<p class="page-paragraph"><span class="page-first-letter">D</span>ear Diary...</p>`, decorations: [] };
        state.pages.push(newPage);
        // Extend DOM if needed: for simplicity, if we now have >2 pages, we reuse rightPage for new content via render
        // But to keep spread, we need to allow virtual pages: current model shows only first two DOM nodes.
        // For new pages beyond 2, we will reuse the DOM nodes with new content (paging through data, not DOM)
        saveState();
        loadPage(state.pages.length - 1);
        return newPage;
    }

    // ============================================================
    // THEMING
    // ============================================================
    function applyThemeToCurrent(theme) {
        const page = getCurrentPage();
        if (!page) return;
        page.theme = theme;
        saveState();
        renderCurrentPage();
        // also notify global theme manager
        if (window.MemoriumTheme && window.MemoriumTheme.applyTheme) {
            // avoid loop: only update dot highlight
        }
    }

    // ============================================================
    // DECORATIONS
    // ============================================================
    function addDecoration(type, opts = {}) {
        const page = getCurrentPage();
        if (!page) return null;
        const id = 'd' + Date.now() + Math.random().toString(36).slice(2,6);
        const deco = {
            id,
            type,
            x: opts.x ?? 24 + Math.random()*40,
            y: opts.y ?? 24 + Math.random()*40,
            rot: opts.rot ?? (Math.random()*6 - 3),
            text: opts.text ?? '',
            emoji: opts.emoji ?? null
        };
        if (type === 'sticky') deco.text = opts.text || 'New note…';
        if (type === 'sticker') deco.emoji = opts.emoji || STICKER_SET[Math.floor(Math.random()*STICKER_SET.length)];
        if (type === 'paper') deco.text = opts.text || 'Remember this moment';
        page.decorations.push(deco);
        saveState();
        renderDecorations();
        return deco;
    }

    function removeDecoration(id) {
        const page = getCurrentPage();
        if (!page) return;
        const idx = page.decorations.findIndex(d => d.id === id);
        if (idx !== -1) {
            page.decorations.splice(idx,1);
            saveState();
            renderDecorations();
        }
    }

    function renderDecorations() {
        const page = getCurrentPage();
        if (!page || !leftPageEl || !rightPageEl) return;
        // Clear existing decoration layers and re-render for current page
        // We render decorations on the right page's decoration layer, and also left if needed
        const layers = document.querySelectorAll('.page-decoration-layer');
        layers.forEach(l => { l.innerHTML = ''; l.style.position = 'absolute'; l.style.inset = '0'; l.style.pointerEvents = 'none'; });

        // target layer is the current page's layer
        const targetPageEl = state.currentPageIndex === 0 ? leftPageEl : rightPageEl;
        const layer = targetPageEl.querySelector('.page-decoration-layer');
        if (!layer) return;
        layer.style.pointerEvents = 'auto';

        page.decorations.forEach(deco => {
            const el = document.createElement('div');
            el.className = `decoration decoration--${deco.type}`;
            el.dataset.id = deco.id;
            el.style.position = 'absolute';
            el.style.left = deco.x + 'px';
            el.style.top = deco.y + 'px';
            el.style.transform = `rotate(${deco.rot}deg)`;
            el.style.cursor = 'grab';
            el.style.pointerEvents = 'auto';
            el.style.touchAction = 'none';

            if (deco.type === 'sticky') {
                el.classList.add('note');
                el.style.width = '170px';
                el.style.minHeight = '90px';
                el.style.padding = '14px 12px';
                el.style.fontFamily = "'Caveat', cursive";
                el.style.fontSize = '18px';
                el.textContent = deco.text;
                // remove button
                const rm = document.createElement('button');
                rm.type = 'button'; rm.textContent = '✕'; rm.title = 'Remove';
                rm.style.cssText = 'position:absolute;top:4px;right:6px;background:transparent;border:none;color:#B5A590;font-size:12px;cursor:pointer';
                rm.addEventListener('click', (e)=>{ e.stopPropagation(); removeDecoration(deco.id); });
                el.appendChild(rm);
                // edit on dblclick
                el.addEventListener('dblclick', () => {
                    const input = document.createElement('textarea');
                    input.value = deco.text;
                    input.style.width = '100%'; input.style.height = '60px';
                    input.style.fontFamily = "'Caveat', cursive";
                    el.innerHTML = ''; el.appendChild(input); input.focus();
                    const save = () => { deco.text = input.value; saveState(); renderDecorations(); };
                    input.addEventListener('blur', save);
                    input.addEventListener('keydown', e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); save(); }});
                });
            } else if (deco.type === 'sticker') {
                el.textContent = deco.emoji;
                el.style.fontSize = '28px';
                el.style.filter = 'sepia(0.2)';
                const rm = document.createElement('button');
                rm.type='button'; rm.textContent='✕'; rm.style.cssText='position:absolute;top:-8px;right:-8px;width:18px;height:18px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;font-size:10px;cursor:pointer';
                rm.addEventListener('click', e=>{ e.stopPropagation(); removeDecoration(deco.id); });
                el.appendChild(rm);
            } else if (deco.type === 'paper') {
                el.classList.add('paper-scrap');
                el.style.background = '#FFFAF1';
                el.style.border = '1px solid #DDD1BF';
                el.style.padding = '10px 12px';
                el.style.fontFamily = "'Caveat', cursive";
                el.style.fontSize = '16px';
                el.style.boxShadow = '2px 3px 8px rgba(0,0,0,.08)';
                el.style.transform += ' rotate(-1deg)';
                el.style.maxWidth = '160px';
                el.textContent = deco.text;
                const rm = document.createElement('button');
                rm.type='button'; rm.textContent='✕'; rm.style.cssText='position:absolute;top:2px;right:4px;background:transparent;border:none;color:#B5A590;font-size:11px;cursor:pointer';
                rm.addEventListener('click', e=>{ e.stopPropagation(); removeDecoration(deco.id); });
                el.appendChild(rm);
            } else if (deco.type === 'flower') {
                el.textContent = '🌸';
                el.style.fontSize = '26px';
                const rm = document.createElement('button');
                rm.type='button'; rm.textContent='✕'; rm.style.cssText='position:absolute;top:-6px;right:-6px;width:16px;height:16px;border-radius:50%;border:none;background:rgba(0,0,0,.5);color:#fff;font-size:9px;cursor:pointer';
                rm.addEventListener('click', e=>{ e.stopPropagation(); removeDecoration(deco.id); });
                el.appendChild(rm);
            }

            // drag
            makeDraggable(el, deco);
            layer.appendChild(el);
        });

        // hide empty state if decorations exist
        const emptyState = document.querySelector('.page-empty-state');
        if (emptyState) emptyState.style.display = page.decorations.length ? 'none' : '';
        // also render images
        renderImages();
    }

    function renderImages() {
        const page = getCurrentPage();
        if (!page) return;
        const targetPageEl = state.currentPageIndex === 0 ? leftPageEl : rightPageEl;
        if (!targetPageEl) return;
        const layer = targetPageEl.querySelector('.page-decoration-layer');
        if (!layer) return;
        // Remove old image nodes
        layer.querySelectorAll('.decoration--image').forEach(n=>n.remove());
        // If in API mode, fetch images via API and render
        if (window.MemoriumAPI && window.MemoriumAPI.isAuthed() && page._apiId) {
            window.MemoriumAPI.listImages(page._apiId).then(res=>{
                const images = res.data || [];
                // Store in state for drag persistence (not localStorage for binary, just refs)
                page.images = images.map(img=>({
                    _apiId: img._id, id: img._id, filename: img.filename,
                    x: img.position ? img.position.x : 24,
                    y: img.position ? img.position.y : 24,
                    rotation: img.rotation || 0,
                    url: img.url
                }));
                images.forEach(img=>{
                    const el = document.createElement('div');
                    el.className = 'decoration decoration--image';
                    el.dataset.id = img._id;
                    el.style.position='absolute';
                    el.style.left=(img.position?img.position.x:24)+'px';
                    el.style.top=(img.position?img.position.y:24)+'px';
                    el.style.transform=`rotate(${img.rotation||0}deg)`;
                    el.style.cursor='grab';
                    el.style.pointerEvents='auto';
                    el.style.maxWidth='180px';
                    el.style.boxShadow='2px 4px 10px rgba(0,0,0,.15)';
                    el.style.border='1px solid #DDD1BF';
                    el.style.background='#FFF';
                    el.style.padding='4px';
                    // Fetch image with auth and create blob URL
                    const token = window.MemoriumAPI.getToken();
                    fetch(window.MemoriumAPI.API_BASE + '/api/images/' + img._id, { headers: token?{Authorization:'Bearer '+token}:{}})
                        .then(r=> r.ok ? r.blob() : Promise.reject())
                        .then(blob=>{
                            const url = URL.createObjectURL(blob);
                            const im = document.createElement('img');
                            im.src=url;
                            im.style.display='block';
                            im.style.maxWidth='170px';
                            im.style.maxHeight='170px';
                            im.style.pointerEvents='none';
                            el.appendChild(im);
                        }).catch(()=>{ el.textContent='(image unavailable)'; });
                    const rm = document.createElement('button');
                    rm.type='button'; rm.textContent='✕'; rm.title='Delete image';
                    rm.style.cssText='position:absolute;top:-8px;right:-8px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;font-size:11px;cursor:pointer';
                    rm.addEventListener('click', async (e)=>{ e.stopPropagation(); try{ await window.MemoriumAPI.deleteImage(img._id); renderImages(); }catch(err){ alert(err.message);} });
                    el.appendChild(rm);
                    // draggable
                    let deco={x: img.position?img.position.x:24, y: img.position?img.position.y:24, rot: img.rotation||0, _apiId: img._id, id: img._id};
                    makeDraggableForImage(el, deco);
                    layer.appendChild(el);
                    layer.style.pointerEvents='auto';
                });
                if (images.length) {
                    const emptyState = document.querySelector('.page-empty-state');
                    if (emptyState) emptyState.style.display='none';
                }
            }).catch(()=>{});
            return;
        }
        // Local fallback: render images stored in page.images (from localStorage)
        if (page.images && page.images.length) {
            page.images.forEach(img=>{
                const el=document.createElement('div');
                el.className='decoration decoration--image';
                el.dataset.id=img.id||img._apiId;
                el.style.position='absolute'; el.style.left=(img.x||24)+'px'; el.style.top=(img.y||24)+'px';
                el.style.transform=`rotate(${img.rotation||0}deg)`; el.style.cursor='grab'; el.style.maxWidth='180px';
                el.style.boxShadow='2px 4px 10px rgba(0,0,0,.15)'; el.style.border='1px solid #DDD1BF'; el.style.background='#FFF'; el.style.padding='4px';
                if (img.src) {
                    const im=document.createElement('img'); im.src=img.src; im.style.maxWidth='170px'; im.style.display='block'; el.appendChild(im);
                } else if (img.url) {
                    el.textContent='[image]';
                }
                const rm=document.createElement('button'); rm.type='button'; rm.textContent='✕'; rm.style.cssText='position:absolute;top:-8px;right:-8px;width:20px;height:20px;border-radius:50%;border:none;background:rgba(0,0,0,.6);color:#fff;font-size:11px;cursor:pointer';
                rm.addEventListener('click',()=>{ const idx=page.images.indexOf(img); if(idx!==-1){ page.images.splice(idx,1); saveState(); renderImages(); }});
                el.appendChild(rm);
                makeDraggable(el, img);
                layer.appendChild(el);
            });
            layer.style.pointerEvents='auto';
        }
    }

    function makeDraggableForImage(el, deco) {
        let startX=0, startY=0, origX=0, origY=0, dragging=false;
        el.addEventListener('pointerdown', e=>{
            if (e.target.tagName==='BUTTON') return;
            dragging=true; el.setPointerCapture(e.pointerId);
            startX=e.clientX; startY=e.clientY; origX=deco.x; origY=deco.y;
            el.style.cursor='grabbing'; el.style.zIndex='5';
        });
        el.addEventListener('pointermove', e=>{
            if(!dragging) return;
            const dx=e.clientX-startX, dy=e.clientY-startY;
            deco.x=Math.max(0, Math.min(260, origX+dx));
            deco.y=Math.max(0, Math.min(420, origY+dy));
            el.style.left=deco.x+'px'; el.style.top=deco.y+'px';
        });
        const end=(e)=>{
            if(!dragging) return; dragging=false; el.style.cursor='grab'; el.style.zIndex='';
            try{ el.releasePointerCapture(e.pointerId);}catch(_){}
            if (window.MemoriumAPI && deco._apiId && window.MemoriumAPI.updateImage) {
                window.MemoriumAPI.updateImage(deco._apiId, { position: { x: deco.x, y: deco.y }, rotation: deco.rot }).catch(()=>{});
            } else {
                // fallback local
                try { localStorage.setItem('memorium-state-v2', JSON.stringify(state)); } catch {}
            }
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
    }

    function makeDraggable(el, deco) {
        let startX=0, startY=0, origX=0, origY=0, dragging=false;
        el.addEventListener('pointerdown', e=>{
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
            dragging = true;
            el.setPointerCapture(e.pointerId);
            startX = e.clientX; startY = e.clientY;
            origX = deco.x; origY = deco.y;
            el.style.cursor = 'grabbing';
            el.style.zIndex = '5';
        });
        el.addEventListener('pointermove', e=>{
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            deco.x = Math.max(0, Math.min(260, origX + dx));
            deco.y = Math.max(0, Math.min(420, origY + dy));
            el.style.left = deco.x + 'px';
            el.style.top = deco.y + 'px';
        });
        const end = (e)=>{
            if (!dragging) return;
            dragging = false;
            el.style.cursor = 'grab';
            el.style.zIndex = '';
            try { el.releasePointerCapture(e.pointerId); } catch(_){}
            saveState();
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
    }

    // ============================================================
    // TOOLBAR & INIT
    // ============================================================
    function ensureDecorationBar() {
        if (document.querySelector('.decoration-bar')) return;
        if (!notebookEl) return;
        const bar = document.createElement('div');
        bar.className = 'decoration-bar';
        bar.setAttribute('role', 'toolbar');
        bar.setAttribute('aria-label', 'Decorations');
        bar.style.cssText = 'display:flex;gap:.5rem;flex-wrap:wrap;align-items:center;justify-content:center;padding:.7rem 1rem;margin:.6rem auto;background:rgba(248,241,231,.92);border:1px solid rgba(107,79,59,.1);border-radius:999px;backdrop-filter:blur(10px);max-width:max-content;box-shadow:0 4px 16px rgba(0,0,0,.06)';

        const label = document.createElement('span');
        label.textContent = 'Decorate';
        label.style.cssText = "font-family:var(--heading-font);font-size:.82rem;font-weight:600;letter-spacing:.07em;text-transform:uppercase;color:var(--text-muted);margin-right:.2rem";
        bar.appendChild(label);

        const buttons = [
            { label:'Sticky', type:'sticky' },
            { label:'Sticker', type:'sticker' },
            { label:'Paper', type:'paper' },
            { label:'Flower', type:'flower' },
            { label:'Image', type:'image' },
            { label:'+ Page', type:'newpage' }
        ];
        // Hidden file input for image upload
        let fileInput = document.getElementById('memorium-image-input');
        if (!fileInput) {
            fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = 'memorium-image-input';
            fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);
            fileInput.addEventListener('change', async () => {
                const file = fileInput.files[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) { alert('Image too large. Max 5 MB'); fileInput.value=''; return; }
                if (!['image/jpeg','image/jpg','image/png','image/webp','image/gif'].includes(file.type)) { alert('Unsupported image type'); fileInput.value=''; return; }
                // Use API if available
                if (window.MemoriumAPI && window.MemoriumAPI.isAuthed()) {
                    const state = window.MemoriumNotebook ? window.MemoriumNotebook.getState() : null;
                    const cur = state ? state.pages[state.currentPageIndex] : null;
                    const journalId = localStorage.getItem('memorium-current-journal');
                    // Need pageId - try to get from state
                    if (cur && cur._apiId) {
                        try {
                            const res = await window.MemoriumAPI.uploadImage(cur._apiId, file, { x: 30, y: 30 });
                            // Add to local state for immediate display
                            if (cur) {
                                if (!cur.images) cur.images = [];
                                cur.images.push({ _apiId: res.data._id, id: res.data._id, filename: res.data.filename, url: res.data.url, x: res.data.position.x, y: res.data.position.y, rotation: res.data.rotation });
                                try { localStorage.setItem('memorium-state-v2', JSON.stringify(state)); } catch {}
                                renderImages();
                            }
                        } catch (e) { alert(e.message || 'Upload failed'); }
                    } else {
                        alert('Please open a journal first');
                    }
                } else {
                    // Fallback local preview (no backend)
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const deco = addDecoration('paper', { text: file.name });
                        // Replace paper text with image preview local
                        if (deco) {
                            deco.type = 'image-local';
                            deco.src = ev.target.result;
                            renderDecorations();
                            renderImages();
                        }
                    };
                    reader.readAsDataURL(file);
                }
                fileInput.value = '';
            });
        }
        buttons.forEach(b=>{
            const btn = document.createElement('button');
            btn.type='button'; btn.textContent=b.label;
            btn.dataset.deco = b.type;
            btn.style.cssText = 'padding:.4rem .85rem;border-radius:999px;border:1px solid rgba(107,79,59,.15);background:var(--paper);font-family:var(--heading-font);font-size:.82rem;cursor:pointer;transition:all .15s';
            btn.addEventListener('click', ()=>{
                if (b.type==='newpage') createPage();
                else if (b.type==='image') fileInput.click();
                else addDecoration(b.type);
            });
            btn.addEventListener('mouseenter', ()=>btn.style.transform='translateY(-1px)');
            btn.addEventListener('mouseleave', ()=>btn.style.transform='');
            bar.appendChild(btn);
        });

        // insert after ambient bar or before notebook
        const ambientBar = document.querySelector('.ambient-bar');
        const themeBar = document.querySelector('.theme-bar');
        const anchor = ambientBar || themeBar;
        if (anchor && anchor.nextSibling) anchor.parentNode.insertBefore(bar, anchor.nextSibling);
        else notebookEl.parentNode.insertBefore(bar, notebookEl);
        decorationBar = bar;
    }

    function renderPageElements() {
        notebookEl = document.querySelector('.notebook');
        if (!notebookEl) return;
        leftPageEl = document.querySelector('.notebook-page--left');
        rightPageEl = document.querySelector('.notebook-page--right');
        if (!leftPageEl || !rightPageEl) return;

        // map writing areas
        state.pages.forEach(p=>{
            const el = p.id === state.pages[0].id ? leftPageEl : (p.id === state.pages[1]?.id ? rightPageEl : null);
            // Fallback: if more than 2 pages, both map to current visible pages - we handle via renderCurrentPage swapping content, so we only need two DOM slots
            // Instead map by position: left slot holds first page of spread, right holds second - for simplicity map directly if exists in DOM
            let domEl = document.querySelector(`.notebook-page[data-page="${p.id}"]`);
            if (!domEl) {
                // reuse first/last slot if new page beyond initial two - will be rendered via renderCurrentPage swapping
                domEl = null;
            }
            // Ensure writingAreas map uses current DOM slots for simplicity
        });
        // Simpler: just map the two visible slots
        const leftArea = leftPageEl.querySelector('.page-writing-area');
        const rightArea = rightPageEl.querySelector('.page-writing-area');
        // right page in original has no writing area, only decoration area; we support both
        if (leftArea) writingAreas[state.pages[0].id] = leftArea;
        // if right has writing area, map it, else create one hidden for persistence of decoration page content
        if (rightArea) {
            // if state has only 2 pages, right page id is 13
            if (state.pages[1]) writingAreas[state.pages[1].id] = rightArea;
        } else {
            // create a hidden writing area for right page to store content if user types on decoration page? not needed
            // But ensure we have an entry for page 13 to persist decorations layer text? we skip
        }
        // For new pages beyond 2, we will reuse the same DOM elements and swap content, so writingAreas will be reassigned in renderCurrentPage
        // Create nav controls
        navPrev = document.createElement('button');
        navPrev.type='button';
        navPrev.className = 'notebook-nav nav-prev';
        navPrev.textContent = '◀ Prev';
        navPrev.setAttribute('aria-label','Previous page');
        navPrev.style.cssText = 'padding:.55rem 1rem;border-radius:999px;border:1px solid rgba(107,79,59,.18);background:var(--paper);font-family:var(--heading-font);font-size:.88rem;cursor:pointer;transition:all .2s';
        navNext = document.createElement('button');
        navNext.type='button';
        navNext.className = 'notebook-nav nav-next';
        navNext.textContent = 'Next ▶';
        navNext.setAttribute('aria-label','Next page');
        navNext.style.cssText = navPrev.style.cssText;

        // container
        const navContainer = document.createElement('div');
        navContainer.className = 'notebook-nav-container';
        navContainer.style.cssText = 'display:flex;gap:1rem;justify-content:center;align-items:center;margin:1rem auto;width:max-content';
        navContainer.appendChild(navPrev);
        // page indicator
        const indicator = document.createElement('span');
        indicator.id = 'page-indicator';
        indicator.style.cssText = 'font-family:var(--heading-font);font-size:.9rem;color:var(--text-muted);min-width:70px;text-align:center';
        navContainer.appendChild(indicator);
        navContainer.appendChild(navNext);
        // insert after notebook
        notebookEl.parentNode.insertBefore(navContainer, notebookEl.nextSibling);

        // style for turn animation
        if (!document.getElementById('memorium-turn-style')) {
            const s = document.createElement('style');
            s.id = 'memorium-turn-style';
            s.textContent = '.notebook.turn-next .notebook-page--right{animation: pageTurnNext .42s ease} .notebook.turn-prev .notebook-page--left{animation: pageTurnPrev .42s ease} @keyframes pageTurnNext{0%{transform: rotateY(0)} 50%{transform: rotateY(-12deg) translateX(-6px)} 100%{transform: rotateY(0)}} @keyframes pageTurnPrev{0%{transform: rotateY(0)} 50%{transform: rotateY(12deg) translateX(6px)} 100%{transform: rotateY(0)}} .notebook-page{transform-origin: center} @media(max-width:768px){.notebook-nav-container{flex-wrap:wrap}}';
            document.head.appendChild(s);
        }
    }

    function setupEventListeners() {
        if (navPrev) {
            navPrev.addEventListener('click', previousPage);
            navPrev.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); previousPage(); }});
        }
        if (navNext) {
            navNext.addEventListener('click', nextPage);
            navNext.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); nextPage(); }});
        }
        // keyboard
        document.addEventListener('keydown', e=>{
            const t = document.activeElement;
            if (t && (t.tagName==='TEXTAREA' || t.tagName==='INPUT' || t.tagName==='SELECT' || t.isContentEditable)) {
                // allow arrow navigation when not editing? but skip if contenteditable focused to allow cursor movement
                if (t.isContentEditable) return;
            }
            if (e.key==='ArrowLeft') { e.preventDefault(); previousPage(); }
            if (e.key==='ArrowRight') { e.preventDefault(); nextPage(); }
        });
        // save on input (not just blur) for better persistence
        Object.values(writingAreas).forEach(area=>{
            if (!area) return;
            area.addEventListener('input', debounce(savePage, 400));
            area.addEventListener('blur', savePage);
        });
        // delegate input for future pages' areas (since we swap content, listeners remain on same DOM nodes - fine)
        // Also listen for clicks on notebook-page to focus writing
        // create decoration via dblclick on decoration area already handled in renderDecorations? we keep also for empty area
        const decArea = document.querySelector('.page-decoration-area');
        if (decArea) {
            decArea.addEventListener('dblclick', e=>{ e.preventDefault(); addDecoration('sticky'); });
        }
        // theme change listener
        document.addEventListener('memorium:themechange', e=>{
            const theme = e.detail && e.detail.theme;
            if (theme) applyThemeToCurrent(theme);
        });
        // also handle clicks on page nav hints
        const prevHint = document.querySelector('.notebook-nav-hint--prev');
        const nextHint = document.querySelector('.notebook-nav-hint--next');
        if (prevHint) prevHint.style.cursor='pointer', prevHint.addEventListener('click', previousPage);
        if (nextHint) nextHint.style.cursor='pointer', nextHint.addEventListener('click', nextPage);
    }

    function debounce(fn, ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }

    function init() {
        loadState();
        renderPageElements();
        ensureDecorationBar();
        // ensure theme/ambient bars are created (they self-init on DOMContentLoaded, but we call again if needed)
        if (window.MemoriumTheme && document.querySelector('.theme-bar')==null) {
            // theme.js will create it, but we trigger manually if needed
        }
        renderCurrentPage();
        updateNavButtons();
        renderNavigationHints();
        setupEventListeners();
        // update indicator text
        const upd = () => {
            const ind = document.getElementById('page-indicator');
            if (ind) ind.textContent = `Page ${state.currentPageIndex+1} / ${state.pages.length}`;
        };
        upd();
        // patch updateNavButtons to also update indicator
        const origUpd = updateNavButtons;
        updateNavButtons = function(){ origUpd(); upd(); };
        updateNavButtons();
    }

    // Expose required names globally for testing / reuse
    window.nextPage = nextPage;
    window.previousPage = previousPage;
    window.savePage = savePage;
    window.loadPage = loadPage;
    window.createPage = createPage;
    window.addDecoration = addDecoration;
    window.removeDecoration = removeDecoration;
    // also expose for internal reuse
    window.MemoriumNotebook = { nextPage, previousPage, savePage, loadPage, createPage, addDecoration, removeDecoration, getState: ()=>state, applyThemeToCurrent };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
