# Memorium — The Living Journal

[![CI](https://github.com/ne-adrita/Memorium/actions/workflows/ci.yml/badge.svg)](https://github.com/ne-adrita/Memorium/actions/workflows/ci.yml)

A vintage leather diary on the web. Plain HTML/CSS/JavaScript frontend, Node.js + Express backend, MongoDB Atlas, JWT auth, and pluggable image storage (local for dev, Cloudinary for production).

> Vintage design: leather covers, paper textures, Cormorant Garamond + Lora + Caveat, muted material palette, coffee stains, torn paper, sticky notes, responsive notebook.

---

## 1. Project Overview

**Memorium** is a student-project diary that feels like a physical leather notebook. Each journal has themed covers, selectable paper, realistic pens, and pages that age with metadata, ambience, and decorations. The app preserves a bookshelf of journals, full-text search inside writings, and cloud persistence via JWT-protected APIs.

Purpose: preserve memories as a *living* journal — not a notes app — with tactile page interaction, sound, and writing realism while staying a clean web app (no frameworks, no canvas).

## 2. Main Features

- **Authentication** — register, login, logout, short-lived access token (15m) + httpOnly refresh token (7d, rotation), `GET /api/auth/me`.
- **Journals / Bookshelf** — create/list/get/update/delete journals, cover/theme, paper, pin to front, page count, preview snippet (first page stripped), effective `updatedAt` (journal or latest page), page preview lines.
- **Journal Pages** — CRUD under `Journal`, ordered by `pageNumber` (unique per journal), title/content/theme/paper/date/mood/weather/location, timestamps, HTML content from `contenteditable`.
- **Theme Family (11A)** — 6 families × 4 themes = 24 themes (`burgundy-journal` … `vintage-pink`, brown default `classic-leather`), legacy map `parchment/vintage/aged/handwritten/rose` → migrated, persisted to journal DB + localStorage.
- **Realistic Pens (11B)** — 9 pens (`classic-black-ink`, `royal-blue-ink`, `burgundy-fountain`, `forest-green-ink`, `graphite-pencil`, `soft-black-gel`, `golden-highlighter`, `rose-ink`, `typewriter-ink`), types `fountain/gel/pencil/highlighter`, sizes `fine/medium/bold`, styles `elegant/casual/neat/soft/bold/typewriter`, color/opacity/font/line-height per pen.
- **Functional Writing (11C)** — `contenteditable` preserved, `beforeinput` wraps inserted text in `span.pen-written` with inline styles + `data-pen` attributes, maintains cursor/selection.
- **Writing Details (11G)** — ink settling animation (`fresh-ink` → `ink-settled` 900ms), type-specific `text-shadow`/opacity (pencil graphite, fountain bleed, gel crisp, highlighter translucent).
- **Eraser + Highlighter (11H)** — eraser deletes selection, highlighter wraps selection with `highlight-yellow/pink/blue/green` (`rgba` translucent, padding+radius, `box-decoration-break:clone`), clear highlight unwraps; toolbar `writing-tools-bar` with toast feedback.
- **Paper Types (11F)** — 7 papers: Plain, Ruled, Dotted, Grid, Vintage, Handmade, Torn Edge (via `paperConfig.PAPERS`, `notebook.js` `paper-{id}` class + `paper-pattern` element, persisted per journal/page).
- **Diary Metadata (11I)** — optional per page: `date` (ISO), `mood` (`happy/calm/sad/angry/loved/tired`), `weather` (`sunny/rainy/cloudy/night`), `location` (120 chars stripped), vintage metadata bar, persisted via `memorium:metachange` → `PUT /api/pages/:id`.
- **Desk / Environment Ambience (11J)** — visual only: `data-ambience="day/sunset/night/candle"` on `body/notebook`, `grain`/`warmLight` toggles, desk pill bar; no sound coupling.
- **Sound System (11D)** — centralized `MemoriumSound`: ambience `rain/fireplace/birds/coffee`, interactions `page-flip` + per-pen `fountain/pencil/gel/highlighter-writing` (all map to `audio/*.mp3`), master/ambient/interaction volume, mute, no autoplay, per-file `disabledSounds` on error, writing loop 500ms debounce, tap-to-play only, persisted `memorium_sound_state`.
- **Physical Page Interaction (11E)** — notebook spread (2 slots, N pages virtual), `nextPage`/`previousPage`/`goToPage` with `turn-next`/`turn-prev` rotateY animation, lift/rotation/settle, swipe/keyboard, drag-to-turn disabled when dragging decorations.
- **Physical Decorations (11K)** — 8 types: `sticky`/`tape`/`paper`/`flower`/`sticker`/`stamp`/`bookmark`/`clip`; add/position (`x,y` 0..3000)/rotation (`-180..180`)/drag/delete; rendered in `page-decoration-layer` (absolute), `pointerdown` capture, `saveState` + `PUT /api/decorations/:id`.
- **Page Creation Experience (11L)** — overlay `pageCreateFade`, options for theme/paper/pen/mood/weather/date/location; `createPage` creates `pageNumber = nextId` with selected defaults, persists to API, reloads spread.
- **Bookshelf Experience (11M)** — wooden shelf UI, sorted `isPinned` first then `effectiveUpdatedAt` desc, pinned divider, page badge, last-updated relative, preview, covers via theme colors, open → `journal.html?journalId=`.
- **Search / Find (11N)** — client-side `MemoriumSearch`: caches `listJournals` + `listPages` per journal (1m TTL), case-insensitive partial match over `content` (stripped), `title`, `journal title` (first page only), `date` (ISO+display), `mood`, `weather`, `location`; snippet 95 chars highlighted via `buildHighlightedSnippet` (escaped), 30 results cap, keyboard nav, `openResult` in-place or `journal.html?journalId=&page=&pageId=`.
- **Save / Persistence** — debounced `savePage` (notebook 5s + journal.js 800ms) → `PUT /api/pages/:id` (content/theme/paper/mood/weather/date/location), `localStorage memorium-state-v2` backup, journal theme/paper persisted via `PUT /api/journals/:id`.
- **Image Uploads** — `multipart image` to `POST /api/pages/:pageId/images`, MIME `jpeg/png/webp/gif`, 5 MB limit, ownership-checked, stored via pluggable adapter (local or Cloudinary), `GET /api/images/:id` streams or redirects, `PUT` moves, `DELETE` cleans via adapter + fallback.

## 3. Technology Stack

- **Frontend** — Plain HTML5, CSS3 (variables, responsive, `contenteditable`), Vanilla JS (no framework, no bundler, no canvas). Libraries: Google Fonts (Cormorant Garamond, Lora, Caveat, Playfair Display).
- **Backend** — Node.js 18+, Express 4, Mongoose 8, `jsonwebtoken`, `bcryptjs`, `multer` (memoryStorage), `express-validator`, `express-rate-limit`, `cookie-parser`, `cors`, `dotenv`.
- **Database** — MongoDB Atlas (via `MONGO_URI`), `mongodb-memory-server` for tests.
- **Auth** — JWT access (15m) + refresh (7d, httpOnly cookie, hash stored), bcrypt 10 rounds.
- **Storage** — `backend/storage/localAdapter` (dev, `backend/uploads/images`) + `cloudinaryAdapter` (prod, `cloudinary` 1.41), selected by `STORAGE_DRIVER`.
- **Deployment** — Frontend: Netlify or Vercel (`frontend/_redirects`, `netlify.toml`, `vercel.json`) or single-service `SERVE_FRONTEND=true`. Backend: Render (`render.yaml`, `backend` rootDir, `npm install`/`npm start`, health `/api/health`). Database: MongoDB Atlas.
- **Testing** — Jest 29 + Supertest 6 + `mongodb-memory-server`, ESLint 8 + Prettier 3, `node --check`, `git diff --check`.

## 4. Architecture

```
                ┌─────────────────────────────┐
                │  Frontend (frontend/ )      │
                │  HTML / CSS / JS            │
                │  config.js → window.__MEMORIUM_API_URL │
                │  api.js (fetch + credentials)  │
                └──────────────┬──────────────┘
                               │ HTTPS (JWT Bearer + refresh cookie)
                               ▼
                ┌─────────────────────────────┐
                │  Backend (backend/server.js)│
                │  Express  ──trust proxy 1──  │
                │  ├ /api/auth (register/login/refresh/logout/me)
                │  ├ /api/journals + /api/journals/:journalId/pages
                │  ├ /api/pages + /api/decorations + /api/images │
                │  ├ middleware/authMiddleware, validate, rateLimiter, uploadMiddleware, errorMiddleware
                │  └ controllers → models → MongoDB Atlas
                └──────────────┬──────────────┘
                               │ Mongoose
                               ▼
                         MongoDB Atlas
                               │
                         Storage adapter
                      ┌────────┴────────┐
                 localAdapter      cloudinaryAdapter
              backend/uploads/      Cloudinary folder memorium/
```

- **Frontend → Backend** — `fetch` with `Authorization: Bearer <access>` + `credentials:"include"` for refresh cookie; 401 triggers single refresh retry.
- **Backend → DB** — `backend/config/db.js` reads trimmed `MONGO_URI`; `autoIndex:true`.
- **Storage** — `backend/storage/index` picks `STORAGE_DRIVER=local|cloudinary`; `imageController` calls `storage.upload(buffer,meta)` and `storage.delete(publicId)` (cloud + local fallback for legacy rows).

## 5. Folder Structure

```
frontend/
  index.html, journal.html, bookshelf.html, login.html, register.html, profile.html, settings.html
  _redirects
  js/
    config.js, api.js, auth.js, app.js, utils.js
    themeConfig.js, theme.js, paperConfig.js, paper.js, penConfig.js, pen.js
    ambient.js, sound.js, writing.js, search.js, journal.js, bookshelf.js, animation.js*, editor.js*, scrapbook.js*, settings.js
  css/
    variables.css, reset.css, style.css, animation.css, responsive.css, themes.css, journal.css, editor.css, papers.css, pens.css, bookshelf.css, search.css, auth.css
  components/notebook/
    notebook.js, notebook.html, notebook.css
  assets/backgrounds|covers|fonts|icons|images|papers|stickers
  audio/rain.mp3, fireplace.mp3, birds.mp3, coffee.mp3, page-flip.mp3, writing.mp3
backend/
  server.js, jest.config.js
  config/db.js, config/jwt.js
  middleware/authMiddleware.js, auth.js (alias), validate.js, rateLimiter.js, uploadMiddleware.js, errorMiddleware.js
  models/User.js, Journal.js, Page.js, Decoration.js, Image.js, RefreshToken.js, Settings.js, + alias files journalModel.js/pageModel.js/decorationModel.js/userModel.js/imageModel.js/settingsModel.js
  controllers/authController.js, journalController.js, pageController.js, decorationController.js, imageController.js, (empty) settingsController.js/uploadController.js/userController.js
  routes/authRoutes.js, journalRoutes.js, pageRoutes.js, decorationRoutes.js, imageRoutes.js, (empty) settingsRoutes.js/uploadRoutes.js/userRoutes.js
  services/journalService.js*, themeService.js*, uploadService.js* (empty placeholders)
  storage/localAdapter.js, cloudinaryAdapter.js, index.js
  uploads/images/
  tests/auth.test.js, journals.test.js, validation.test.js, images.test.js, refresh.test.js, rateLimit.test.js, storage.test.js, helpers.js, setup.js, env.setup.js
render.yaml, netlify.toml, vercel.json, package.json
backend/.env.example, backend/.env (ignored)
```

`*` empty 0-byte stubs retained conservatively — not imported, not breaking.

## 6. Installation (Local)

```bash
# clone
git clone <your-fork> Memorium
cd Memorium

# backend
cd backend
npm install
cp .env.example .env   # edit .env with real MONGO_URI and JWT_SECRET (see §7)
npm run dev            # nodemon on http://localhost:3000  (health http://localhost:3000/api/health)
# or
npm start

# frontend — static, no build
cd ../frontend
# Live Server (VS Code) on http://localhost:5500 or
npx serve .            # http://localhost:3000 if SERVE_FRONTEND=true
open index.html        # ensure js/config.js defaults to http://localhost:3000 on localhost
```

Package scripts (actual):
- Root: `npm run lint` (`eslint backend --ext .js && eslint frontend --ext .js`), `lint:fix`, `format`, `format:check`
- Backend: `npm start` (`node server.js`), `npm run dev` (`nodemon`), `npm test` (`jest --runInBand --forceExit --detectOpenHandles`), `test:coverage`, `lint`, `lint:fix`, `format`

## 7. Environment Variables

All from `backend/.env.example` (placeholders only):

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | No (`development`/`production`/`test`) | `production` hides 500 details, tightens CORS warning |
| `PORT` | No (default 3000, Render uses 10000) | Backend listen port, must be `process.env.PORT` |
| `MONGO_URI` | Yes | MongoDB Atlas SRV string `mongodb+srv://<user>:<pass>@<cluster>/...` |
| `JWT_SECRET` | Yes | 32+ char random, used to sign/verify JWT (`getSecret()` throws if missing) |
| `JWT_EXPIRES_IN` | No (default 7d) | Fallback legacy expiry |
| `JWT_ACCESS_EXPIRES_IN` | No (default 15m) | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | No (default 7d) | Refresh token TTL |
| `FRONTEND_URL` | Prod yes (dev optional) | Comma-separated CORS allowlist, e.g. `https://your-site.netlify.app,https://your-site.vercel.app` (localhost auto-allowed) |
| `SERVE_FRONTEND` | No | `true` → backend serves `frontend/` via `express.static` (single-service) |
| `STORAGE_DRIVER` | No (default `local`) | `local` (dev) or `cloudinary` (prod) |
| `CLOUDINARY_CLOUD_NAME` | If `cloudinary` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | If `cloudinary` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | If `cloudinary` | Cloudinary API secret |

Frontend has no env file; API URL is runtime `window.__MEMORIUM_API_URL` (see §9).

## 8. Database

- **MongoDB** via Mongoose. Connection trimmed (`uri.trim()`), `autoIndex:true`, fails fast if `MONGO_URI` missing.

**Models (actual):**

- **User** — `name` (2–50), `email` (unique, lowercase), `passwordHash` (`select:false`), `avatar`, `bio`, timestamps; virtual `journals`.
- **Journal** — `owner` (User ref, required), `title` (120, default `My Journal`), `description` (500), `cover{color, texture: leather/fabric/paper/linen}`, `themeId` (24+5 legacy enum, default `classic-leather`), `paper` (enum 7), `isPinned` Boolean; indexes `owner`, `owner+updatedAt`, `owner+isPinned+updatedAt`; virtual `pages`.
- **Page** — `journal` (Journal ref), `pageNumber` (≥1, unique per journal), `title` (200), `content` (HTML string, default `''`), `theme` (enum 24+5 legacy, default `classic-leather`), `paper` (enum 7), `date` Date/null, `mood` enum `happy/calm/sad/angry/loved/tired`/null, `weather` enum `sunny/rainy/cloudy/night`/null, `location` (120); indexes `journal+pageNumber` unique, `journal+updatedAt`; virtual `decorations`.
- **Decoration** — `page` (Page ref), `type` enum `sticky/tape/paper/flower/sticker/stamp/bookmark/clip`, `position{x,y}` 0..3000, `size{width,height}` 0..3000, `rotation` -180..180, `text` 1000, `emoji` 10, `config` Mixed; indexes `page`, `page+type`.
- **Image** — `page`, `user`, `originalName` 255, `filename`, `mimeType` enum `jpeg/png/webp/gif`, `size` 0..5 MB, `publicId` (filename or cloud `public_id`), `url` (path or `https://`), `path` legacy, `position{x,y}` 0..3000, `rotation` -180..180; indexes `page`, `user`, `page+createdAt`.
- **RefreshToken** — `user`, `tokenHash` (sha256), `expiresAt`, `revoked`.
- **Settings** — reserved `user` unique, `theme` (legacy 4), `ambience{grain,warmLight,sound,...}` — not yet used (frontend keeps prefs in localStorage).

**Ownership:** every Journal `owner` is `req.user.id` (from verified JWT). Page ownership via `Journal.findById(page.journal)`, Decoration/Image via `→Page→Journal`. All reads/updates/deletes check `owner.toString() !== req.user.id →403`.

## 9. Authentication

- **Register** `POST /api/auth/register` (rate-limited) → validate `name` 2–50 stripped, `email` normalized, `password` 6–128 → `bcrypt.hash(10)` → `User.create` → `generateAccessToken` (15m, `tokenType:access`) + `generateRefreshToken` (7d, `jti`), store `hashToken(refresh)` → `RefreshToken`, `Set-Cookie refreshToken httpOnly secure(prod) sameSite Lax 7d`.
- **Login** `POST /api/auth/login` → `select +passwordHash`, `bcrypt.compare`, same token pair + cookie.
- **Me** `GET /api/auth/me` → `authMiddleware` (`Bearer` required, rejects `tokenType:refresh`, decodes `userId`) → sanitized user (passwordHash deleted).
- **Refresh** `POST /api/auth/refresh` (cookie or body `refreshToken`) → verify `tokenType:refresh`, find stored hash not revoked/not expired → rotate (delete old, issue new pair, set cookie).
- **Logout** `POST /api/auth/logout` → delete stored hash or all for user, `clearCookie`.
- Middleware `authMiddleware.js` verifies via `jwt.verify(secret)`, handles `TokenExpiredError` → `Token expired`.
- Tests: 17 auth cases (register duplicate/case-insensitive, weak password, invalid email, login case-insensitive, wrong password, expired/malformed token, refresh rotation/revocation, access vs refresh misuse).

## 10. API

All `/api/*` except `/api/health` and `POST /api/auth/*` are JWT-protected (`router.use(authMiddleware)`). `GET /api/health` → `{success, message, db, uptime}`.

**Auth** — `POST /api/auth/register` (public, validation), `POST /api/auth/login` (public), `POST /api/auth/refresh`, `POST /api/auth/logout`, `GET /api/auth/me` (JWT)

**Journals** (`/api/journals`, `authMiddleware`):
- `GET /` — list own journals, enriched `pageCount` (aggregate), `previewText` (first page stripped 140 chars), `lastPageUpdatedAt`, `effectiveUpdatedAt` (max journal/page), sorted `isPinned -1, updatedAt -1`.
- `POST /` — `validateJournalCreate` → create with `owner=req.user.id`, `title` required, `paper` enum, `themeId` enum, `isPinned` bool, `cover` sanitized.
- `GET /:id` — 400 invalid ObjectId, 404 not found, 403 not owner.
- `PUT /:id` — `validateJournalUpdate`, same fields optional, cover sanitized.
- `DELETE /:id` — deletes journal + `Page deleteMany` + `Decoration deleteMany` + `Image` → `storage.delete` (cloud+local fallback) + `Image deleteMany`.

**Pages** (`/api/journals/:journalId/pages` and `/api/pages`, `validatePageCreate/Update`):
- `GET /api/journals/:journalId/pages` — need `journalId`, ownership check, sorted `pageNumber 1`.
- `POST /api/journals/:journalId/pages` — `pageNumber` int≥1 required, `title` 200 stripped, `content` 50000 sanitized (allow `p/span/br/div`, stripped `on*`/`javascript:`/`vbscript:`/`data:text/html`, style allowlist), `theme` 24+5 enum, `paper` 7 enum, `date` ISO, `mood` 6 enum, `weather` 4 enum, `location` 120 stripped; duplicate `pageNumber` →409.
- `GET /api/pages/:id` — ownership via page.
- `PUT /api/pages/:id` — partial update (only provided fields), validates same enums, `journal` move checks new journal ownership, `runValidators:true`, 409 on duplicate.
- `DELETE /api/pages/:id` — deletes page + decorations + images via storage.

**Decorations** (`/api/pages/:pageId/decorations` and `/api/decorations`):
- `GET /` — list per page ownership, sorted `createdAt`.
- `POST /` — `validateDecorationCreate` type 8 enum, `position{x,y}` 0..3000 required, `rotation` -180..180, `text` 1000 stripped, `emoji` 10 stripped, `config` object shallow-sanitized (keys `$`/`.`/`__proto__` dropped, values 500 chars/numbers/bool only, capped position/size).
- `GET /:id` / `PUT /:id` (`validateDecorationUpdate`) / `DELETE /:id` — owner via `Deco→Page→Journal`, `page` move checks ownership.

**Images** (`/api/pages/:pageId/images` and `/api/images`):
- `POST /api/pages/:pageId/images` — `upload.single('image')` (memory, 5 MB, MIME `jpeg/png/webp/gif`), ownership, `storage.upload(buffer,{originalName,mimeType,size})` → `Image create {publicId,url,filename}`, response `{_id,url:/api/images/:id}`.
- `GET /api/pages/:pageId/images` — list own, maps `url` to `/api/images/:id` + `remoteUrl` if https.
- `GET /api/images/:id` — owner check, if `url` https → `redirect(url)`, else stream `localAdapter.resolvePath(publicId)` or legacy path, 404 if missing.
- `PUT /api/images/:id` — update `position`/`rotation` bounded, owner.
- `DELETE /api/images/:id` — owner, `storage.delete(publicId)` + local `basename` fallback, DB delete.

**Search** — **client-side only** (`frontend/js/search.js`): fetches `listJournals` + `listPages` per journal (cached 1m), matches `content/title/journal/date/mood/weather/location` case-insensitive, snippet 95 chars, 30 cap; no server API.

## 11. Image Upload

- **Accepted** MIME `image/jpeg`, `image/jpg`, `image/png`, `image/webp`, `image/gif` (`uploadMiddleware` `fileFilter` + `Image` enum), ext fallback to `.jpg`.
- **Size** 5 MB (`limits.fileSize` → `LIMIT_FILE_SIZE` → 400 `Image too large. Max 5 MB`).
- **Ownership** — all image routes `authMiddleware` + `ensurePageOwnership`/`→Journal.owner` 403.
- **Local adapter** (`localAdapter.js`) — dev default, writes `backend/uploads/images/<hex>-<ts>.<ext>`, `delete` via `basename`, `resolvePath` for streaming; `UPLOAD_DIR` ensured.
- **Cloudinary adapter** (`cloudinaryAdapter.js`) — prod `STORAGE_DRIVER=cloudinary`, lazy `cloudinary.v2` config from `CLOUDINARY_*`, `upload_stream` → `{public_id: memorium/<hex>-<ts>, secure_url}`, `destroy` on delete; throws `Cloudinary not configured` if env missing (only on upload, not startup).
- **Delete** — page/journal delete best-effort `storage.delete` + `Image deleteMany` + local fallback for mixed legacy rows.
- **Production** — Render ephemeral filesystem, so set `STORAGE_DRIVER=cloudinary` + 3 Cloudinary vars; else local files lost on restart. Documented in `render.yaml` and `backend/.env.example`.

## 12. Theme / Paper / Pen / Writing

**Themes** (via `themeConfig.js` 24, `theme.js` manager): families `red/blue/green/purple/brown/pink` each 4, e.g. `burgundy-journal/rose-paper/scarlet-vintage/crimson-classic`, …, `classic-leather` (default), `blush`. Legacy → `LEGACY_MAP`. `applyTheme` sets CSS vars `--theme-*`, `data-theme`/`data-theme-family`, persists `localStorage membrum_theme` + per-journal cache + `PUT /api/journals/:id {themeId}` (`memorium:themechange`).

**Paper** (`paperConfig.js` 7): `plain` (default), `ruled` (horizontal lines), `dotted` (dot grid), `grid` (square), `vintage` (aged texture), `handmade` (organic fiber), `torn` (edge). `paper.js` toggles `notebook` class `paper-{id}` + child `.paper-pattern`, persists similarly via `paper-{id}` → journal/page.

**Pen** (`penConfig.js` 9): classic-black-ink (fountain #1A1A1E 0.98), royal-blue-ink (fountain #23406A), burgundy-fountain (#6B2342), forest-green-ink (#2D4A3E), graphite-pencil (#5A5A5E 0.78 caveat), soft-black-gel (#232326 0.99), golden-highlighter (#E0C350 0.38), rose-ink (#8B5A6E), typewriter-ink (#2F241F monospace). Sizes `fine 15px/medium 18px/bold 22px`, styles include `typewriter`.

**Writing** (`writing.js`, `pen.js`, `notebook.js` `page-writing-area[contenteditable]`): `beforeinput insertText` → `createPenSpan` with `pen-written pen-{type} pen-style-{style} fresh-ink` + inline `color/font-size/opacity/text-shadow`; `mergeAdjacentSpans` keeps HTML clean; paste stripped to plain text split on `\n` → `br`; autosave via `input` → `savePage` (journal.js 800ms + notebook 5s).

## 13. Sound System

- **Sounds** — `AMBIENT_SOUNDS rain/fireplace/birds/coffee` (`audio/*.mp3`), `INTERACTION_SOUNDS page-flip/writing + per-pen fountain/pencil/gel/highlighter-writing` (all existing files).
- **Behavior** — `loadState` restores `selectedAmbient/muted/volume` but *never* autoplays (`isAmbientPlaying` false, `pause()`); `playAmbient(id)` requires user tap, `loop:true`, `volume = master*ambient`, `disabledSounds` on `error` (file missing) → graceful disable, `stopAmbient` pauses. `playInteraction('page-flip')` one-shot, `handleWritingActivity` loops `writingAudio` with 500ms `WRITING_STOP_DELAY` debounce, per-pen sound via `MemoriumPen.getSelectedPen().writingSound`.
- **Controls** — `sound-system` panel (collapsed persisted), ambient choices toolbar, mute toggle, master/ambient/interaction sliders (0..1 step 0.05), `sound-status` live, `no autoplay` respected, failure logs warning without crashing diary.
- **Separation** — `sound.js` owns audio; `ambient.js` visual desk only (day/sunset/night/candle) and delegates sound clicks to `MemoriumSound`.

## 14. Deployment (Prepared, Not Yet Deployed)

**Frontend** (Netlify/Vercel):
- `frontend/` static, no build. `netlify.toml` (`publish="frontend"`, `command="echo 'No build required'"`, `/* → /index.html 200`) + `frontend/_redirects` same. `vercel.json` static `frontend/**`. Config `frontend/js/config.js` — production URL set via pre-`config.js` snippet: `<script>window.__MEMORIUM_API_URL="https://your-backend.onrender.com"</script>` (Netlify snippet injection or edit `config.js` line). Local `localhost` → `http://localhost:3000`, else `window.location.origin` for single-service `SERVE_FRONTEND=true`.
- **Publish dir**: `frontend`, **Build**: none, **Env**: none (runtime var only).

**Backend** (Render):
- `render.yaml` at root: `services memorium-api env node plan free rootDir backend buildCommand npm install startCommand npm start healthCheckPath /api/health envVars NODE_ENV=production, PORT=10000, MONGO_URI sync:false, JWT_SECRET sync:false, JWT_EXPIRES_IN 7d, FRONTEND_URL sync:false, STORAGE_DRIVER cloudinary, CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET sync:false`.
- Alternative dashboard: New Web Service → repo → `backend` → `npm install` → `npm start` → set same env vars. `server.js` handles `process.env.PORT`, `trust proxy 1`, `FRONTEND_URL` allowlist, `SERVE_FRONTEND` static.

**Database**: MongoDB Atlas — provisioned, `MONGO_URI` set on Render, `Allow from Anywhere` (0.0.0.0/0) for Render free tier.

**Images**: Cloudinary for prod persistence (as above). Set 3 vars + `STORAGE_DRIVER=cloudinary`; local dev stays `local` (no creds needed).

Prepared only — not claimed deployed; live Cloudinary not tested without credentials (see §15).

## 15. Testing

**Automated** (all from actual runs):
- `npm test` backend — **7 suites, 86 tests, 86 PASS** (auth 17, journals 7, validation 11, images 13, storage 18, refresh 14, rateLimit 5) via `mongodb-memory-server` (14–18s).
- `npm run lint` (root `eslint backend --ext .js && eslint frontend`) — **0 errors, 13 backend warnings + 18 frontend warnings** (all pre-existing unused vars/`prefer-const`).
- `node --check backend/server.js`, `validate.js`, `decorationController.js`, etc. — syntax ok.
- `git diff --check` — exit 0.
- **11R full regression** (`NODE_PATH=backend/node_modules node /tmp/regress_full.js`) — **140 checks, 0 fail**: register/login/refresh/logout, journals/bookshelf pin/preview, pages 24 themes + 7 papers + invalid 400, pen-written/highlight preserve, content 50k limit, moods 6 + weathers 4 + location/date, ambience modes, 8 decorations create/drag/delete, bookshelf pinned order, search escape, save/refresh + logout/login persist, authorization 403/401, image upload valid/invalid/oversized/ownership.

**Manual/Browser** — **NOT TESTED** in headless CI (darwin, no browser). Mobile swipe, sound autoplay block, console errors require real browser; statically verified no missing `script src`/`link css` except known `layout.css` (see §16). Marked `NOT TESTED` not `PASS`.

## 16. Security / Data Integrity

- **Password** — `bcryptjs 10`, `passwordHash select:false`, never returned (`toJSON` delete + `sanitizeUser`).
- **JWT** — env `JWT_SECRET`, `verifyToken` rejects refresh as access, payload minimal `userId`, `authMiddleware` 401 generic, `JWT_SECRET` never logged, `errorMiddleware` strips.
- **Ownership** — every journal/page/decoration/image fetch checks `owner →403`; list filters by owner; page move validates new journal owned; decoration page move validated; tests + manual 403 verified.
- **Validation** — `express-validator` for register/login/journal/page/decoration (enums, lengths, ints), `sanitizeContent` allowlist `p/span/br/div` + style allowlist + blocks `javascript:/vbscript:/data:text/html/on*/url()/expression`; decoration `text/emoji/config` stripped/capped, `position/size` bounded 0..3000, `cover` sanitized; `location` 120.
- **Upload** — MIME whitelist, 5 MB, random hex filename, `basename` traversal guard, `memoryStorage` (no tmp exec), ownership, delete via adapter + fallback.
- **Rate limiting** — `apiLimiter` 100/15m, `authLimiter` 5/15m (1000 in test), `keyGenerator` via `req.ip`/`trust proxy`, health `/api/health` skipped.
- **DB** — schemas enums/required/maxlength, indexes unique per journal, `sanitizeObject` middleware deletes `$`/`.`/`__proto__` keys recursively on `body/query/params`.
- **Secrets** — `.env` ignored (root+backend `.gitignore`), `.env.example` placeholders only, no hard-coded URI/secret, `.gitignore` covers `uploads/coverage/.DS_Store`.
- **Limitations honestly** — decoration `config` shallow-sanitized (nested objects ignored), upload not malware-scanned (MIME only), sound files not scanned, no image malware scan.

## 17. Known Limitations

- `frontend/index.html:69` references `css/layout.css` which does not exist (pre-existing) — 404 in browser but not blocking due to other styles. Left untouched per 11Q conservative.
- Browser-only tests not performed in CI: sound autoplay (must be tap-to-play), mobile swipe, physical page drag vs decoration drag edge cases, console errors — require real device.
- Decoration `config` is `Mixed` shallow (only top-level strings/numbers/booleans sanitized, nested objects/arrays dropped).
- Local filesystem uploads are ephemeral on Render free tier — must set `STORAGE_DRIVER=cloudinary` + creds for persistence.
- Cloudinary live upload/delete **NOT LIVE TESTED** (no credentials in CI) — adapter unit tests mock, manual `CLOUDINARY_*` missing → expected `Cloudinary not configured` error on upload (verified).
- `STORAGE_DRIVER` case-insensitive but only `local`/`cloudinary` supported.

## 18. Future Improvements (Not Implemented)

- Add real Cloudinary live integration test with test account.
- Add malware/virus scan or content-type sniffing beyond MIME.
- Add deep sanitization for nested `config` if decorations need richer config.
- Create missing `css/layout.css` or remove `<link>` to silence 404.
- Add E2E browser tests (Playwright) for sound/mobile/page-turn.
- Add `frontend/.env.example` documenting `window.__MEMORIUM_API_URL` injection for non-technical deployers.

---

## Validation After Docs
- `git diff --check` — **PASS** (exit 0)
- Markdown paths checked: `frontend/` files listed exist (`ls` verified), `backend/routes/*`, `backend/models/*`, `netlify.toml`, `vercel.json`, `render.yaml`, `frontend/_redirects`, `backend/.env.example` all present.
- Commands match `package.json` scripts (`npm start`, `npm run dev`, `npm test`, `npm run lint`).
- Env names match `server.js`/`db.js`/`jwt.js`/`storage/*` (`MONGO_URI`, `JWT_SECRET`, `FRONTEND_URL`, `STORAGE_DRIVER`, `CLOUDINARY_*`).
- API routes match `backend/routes/*.js` mounting in `server.js` (`/api/auth`, `/api/journals`, `/api/journals/:journalId/pages`, `/api/pages`, `/api/pages/:pageId/decorations`, `/api/decorations`, `/api/pages/:pageId/images`, `/api/images`).

*Application code not modified for docs — only `README.md` + `render.yaml`/`netlify.toml`/`vercel.json` deployment configs (11S).*
