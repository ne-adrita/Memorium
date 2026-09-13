# Memorium — The Living Journal

A vintage leather diary on the web. Plain HTML/CSS/JavaScript frontend, Node.js + Express backend, MongoDB Atlas, JWT auth, and secure image uploads.

> Design preserved: vintage leather aesthetic, paper texture, Cormorant Garamond + Lora, `#6B4F3B` / `#C9A227` / `#F8F1E7`, coffee stains, torn paper, sticky notes, responsive notebook.

---

## 1. Architecture

```
Frontend (plain HTML/CSS/JS)  --->  Backend (Node.js/Express)  --->  MongoDB Atlas
  static hosting (or served                hosted on Render/Railway
  by backend when SERVE_FRONTEND=true)      (Node.js free tier)
```

- **Frontend root:** `frontend/` — contains `index.html`, `journal.html`, `bookshelf.html`, `login.html`, `register.html`, `js/`, `css/`, `components/notebook/`, `assets/`
- **Backend:** `backend/server.js` — Express API on `process.env.PORT` (default 3000), binds to `0.0.0.0` for cloud hosting
- **Database:** MongoDB Atlas (already provisioned), accessed via `MONGO_URI`
- **Auth:** JWT (`JWT_SECRET`, `JWT_EXPIRES_IN`) + bcryptjs
- **Images:** `multer` disk storage to `backend/uploads/images/` — **ephemeral** on most free hosts

Two deployment options (pick one):

- **A) Separate hosting (recommended):** Backend on Render/Railway, frontend on Netlify/Vercel.
- **B) Single service:** Backend serves frontend static files (`SERVE_FRONTEND=true`).

---

## 2. Requirements

- Node.js 18+
- MongoDB Atlas cluster (Network Access must allow your backend IP — or `Allow from Anywhere` for Render free tier)
- No paid services required

---

## 3. Environment Variables

Create `backend/.env` (never commit it). See `backend/.env.example` for placeholders:

```
NODE_ENV=development
PORT=3000
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
JWT_SECRET=replace-with-a-strong-random-secret-at-least-32-chars
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:5500,http://localhost:3000
# SERVE_FRONTEND=true   # uncomment if backend should also serve frontend
```

| Variable | Required | Description |
|---|---|---|
| `PORT` | No (default 3000, cloud uses 10000) | Backend port; must be `process.env.PORT` in production |
| `MONGO_URI` | Yes | MongoDB Atlas connection string |
| `JWT_SECRET` | Yes | Strong random string (32+ chars) |
| `JWT_EXPIRES_IN` | No | e.g. `7d` |
| `FRONTEND_URL` | Production yes | Comma-separated allowed origins for CORS. Example: `https://your-frontend.netlify.app` |
| `NODE_ENV` | No | `production` hides stack traces and tightens error messages |
| `SERVE_FRONTEND` | No | `true` makes backend serve `frontend/` static files |

**Never** put real values in `.env.example` or `README.md`.

---

## 4. Run Locally (Development)

```bash
# Backend
cd backend
npm install
cp .env.example .env   # then edit .env with real MONGO_URI and JWT_SECRET
npm run dev            # nodemon on port 3000
# health: http://localhost:3000/api/health

# Frontend — open via file or simple server
cd ../frontend
# Option 1: VS Code Live Server on http://localhost:5500
# Option 2: npx serve .
# Ensure js/config.js points to http://localhost:3000 (default for localhost)
open index.html
```

Local dev needs no `FRONTEND_URL` change — localhost origins are automatically allowed by CORS.

---

## 5. Run Production Server Locally (Pre-deploy Check)

```bash
cd backend
NODE_ENV=production PORT=3000 npm start
# or
NODE_ENV=production PORT=3000 FRONTEND_URL=http://localhost:5500 npm start

# Test
curl http://localhost:3000/api/health
# Should return { success:true, db:"connected" }

# Test frontend served by backend (single-service mode)
SERVE_FRONTEND=true NODE_ENV=production PORT=3000 npm start
# Then open http://localhost:3000/ — frontend is now served by backend (no separate static host needed)
```

---

## 6. Backend Deployment (Render — Free)

### Option: Dashboard (simplest)

1. Push repo to GitHub (do not include `.env` or `uploads/`).
2. Render -> New Web Service -> Connect repo
3. **Root Directory:** `backend`
4. **Build Command:** `npm install`
5. **Start Command:** `npm start`
6. **Plan:** Free
7. Add Environment Variables (Render dashboard -> Environment):
   - `NODE_ENV=production`
   - `MONGO_URI` = your Atlas string (no spaces after `=`)
   - `JWT_SECRET` = strong random (e.g. `openssl rand -hex 32`)
   - `JWT_EXPIRES_IN=7d`
   - `FRONTEND_URL=https://your-frontend.netlify.app`  (or `https://your-backend.onrender.com` if using SERVE_FRONTEND)
   - `PORT=10000` (Render injects this automatically; optional)
8. Deploy. Health check path: `/api/health`.

### Option: Blueprint (`render.yaml`)

This repo includes `render.yaml` at root. Render can use it as Blueprint:

```yaml
services:
  - type: web
    name: memorium-api
    env: node
    plan: free
    rootDir: backend
    buildCommand: npm install
    startCommand: npm start
    healthCheckPath: /api/health
```

Set `MONGO_URI`, `JWT_SECRET`, `FRONTEND_URL` as **sync: false** (you fill them in Render UI).

### MongoDB Atlas Network Access

Atlas -> Network Access -> Allow Access from Anywhere (`0.0.0.0/0`) **or** add Render outbound IPs. Free Render IPs change, so `Allow Anywhere` is simplest (secured by strong MONGO_URI + user password).

---

## 7. Frontend Deployment

### Config — Must Set Backend URL

Edit `frontend/js/config.js` before deploying if frontend and backend are on different origins:

```js
// For separate hosting, set to your backend:
window.__MEMORIUM_API_URL = 'https://your-backend.onrender.com';
```

Ways to set it without editing the file:

- Inject a `<script>window.__MEMORIUM_API_URL="https://your-backend.onrender.com"</script>` **before** `js/config.js` in HTML, or
- Use Netlify Snippet Injection / Vercel env handling.

If `SERVE_FRONTEND=true` (single-service), you can leave `config.js` as-is — it will default to `window.location.origin` (same origin as backend).

Local dev defaults to `http://localhost:3000` when on `localhost`.

### Netlify (static, free)

1. Netlify -> Add new site -> Import from GitHub
2. **Base directory:** `frontend`
3. **Build command:** *(empty — plain HTML, no build)*
4. **Publish directory:** `frontend` (or `/` if base is already `frontend`)
5. Add a snippet or edit `js/config.js` to set `window.__MEMORIUM_API_URL` to your backend URL
6. Deploy. Set `FRONTEND_URL` on backend to your Netlify URL (e.g. `https://your-site.netlify.app`)

`frontend/_redirects` is included for SPA fallback (`/* -> /index.html 200`) — optional.

### Vercel (alternative)

Same as Netlify: import repo, set **Root Directory** to `frontend`, no build step.

### Single-service (backend serves frontend)

No separate frontend deploy needed:

```bash
# On backend host, set:
SERVE_FRONTEND=true
FRONTEND_URL=https://your-backend.onrender.com
NODE_ENV=production
```

Backend will serve `frontend/` via `express.static` with proper 404 handling (`/uploads` stays protected).

---

## 8. CORS

- Backend `server.js` reads `FRONTEND_URL` (comma-separated).
- Allows listed origins + any `http://localhost:*` / `http://127.0.0.1:*` for local dev.
- If `FRONTEND_URL` not set in production, CORS warns and currently allows all (to avoid breaking first deploy) — **set it in production**.
- Do **not** use `origin: "*"` with credentials in production.

Example production:

```
FRONTEND_URL=https://memorium.netlify.app
# or multiple:
FRONTEND_URL=https://memorium.netlify.app,https://memorium.vercel.app
```

---

## 9. Image Storage — Important Limitation

- Step 9 stores uploads on local filesystem: `backend/uploads/images/` via `multer.diskStorage`
- Filenames are sanitized: random hex + timestamp, MIME-checked (`jpeg/png/webp/gif`), 5 MB limit
- Images are **NOT** served as static files (`backend/uploads` is never `express.static`); they are served only through authenticated route `GET /api/images/:id` with ownership check (page -> journal -> owner)
- **Ephemeral filesystem:** Render free, Railway, Vercel, Netlify Functions, etc. have ephemeral or read-only filesystems. **Uploaded files will be lost on restart/redeploy.**
- Documented, not hidden: this keeps local dev working, but production persistence requires future object storage (Cloudinary/S3). Architecture is ready — replace `multer.diskStorage` + `fs` calls with a cloud adapter, gated by env vars, no other code change required.
- Cleanup is implemented: deleting a page or journal also deletes associated image files (best-effort `fs.unlinkSync`) and DB records.

If you need persistent images in production now, add Cloudinary/S3 and set credentials via env vars (not included by default to avoid requiring paid setup).

---

## 10. API Endpoints (protected unless noted)

- `GET /api/health` — public, no auth
- `POST /api/auth/register` / `POST /api/auth/login` — public
- `GET /api/auth/me` — JWT required
- `GET/POST /api/journals`, `GET/PUT/DELETE /api/journals/:id`
- `GET/POST /api/journals/:journalId/pages`, `GET/PUT/DELETE /api/pages/:id`
- `GET/POST /api/pages/:pageId/decorations`, `PUT/DELETE /api/decorations/:id`
- `POST /api/pages/:pageId/images` (multipart `image`), `GET /api/pages/:pageId/images`, `GET/PUT/DELETE /api/images/:id` — all JWT + ownership

All error responses are production-safe: generic `Internal server error` for 500, no stack traces, no MONGO_URI/JWT leakage, correct status codes 400/401/403/404/413/415/500.

---

## 11. Security Notes

- `.env` and `uploads/` are gitignored (root and `backend/.gitignore`)
- Secrets never in source or `render.yaml` — set via host env vars
- JWT required for all journal/page/decoration/image routes; `x-user-id` bypass removed
- Ownership checks on every page/journal/decoration/image access
- Upload MIME validation + 5 MB limit + safe random filenames
- `backend/uploads` not exposed as static; only `GET /api/images/:id` with auth
- CORS restricted via `FRONTEND_URL`
- Error middleware strips Mongo/JWT details in production

---

## 12. How to Redeploy

- Backend (Render): push to `main` triggers auto-deploy, or Manual Deploy in dashboard.
- Frontend (Netlify): push triggers deploy; ensure `js/config.js` backend URL is still correct.

---

## 13. Troubleshooting

- `MONGO_URI is not defined` -> set `MONGO_URI` in backend env, no leading space after `=`
- `JWT_SECRET is not configured` -> set strong `JWT_SECRET` in backend env
- CORS error in browser -> check `FRONTEND_URL` on backend matches your frontend origin exactly (no trailing slash needed; `https://` required)
- `Image file not found` after restart -> expected on ephemeral hosts (see Image Storage section)
- Frontend shows localhost API error -> edit `frontend/js/config.js` and redeploy

