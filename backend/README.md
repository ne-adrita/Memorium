# Memorium — MongoDB Atlas Layer

Memorium uses **MongoDB Atlas** (not MySQL). Connection string is read from `process.env.MONGO_URI` via `backend/config/db.js`. No credentials are hard-coded or committed.

## Environment

```
PORT=3000
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>/<database>?retryWrites=true&w=majority
```

- `backend/.env` holds the real Atlas URI (ignored by git).
- `backend/.env.example` contains placeholders only.
- `.gitignore` (root & backend) ignores `.env` and `.env.*` but allows `!.env.example`.

`backend/config/db.js` trims `process.env.MONGO_URI` and connects with `mongoose.connect()`.

## Collections / Models

All models use Mongoose conventions, `ObjectId` references, `timestamps: true`, and validation.

### 1. User (`models/User.js`)

- `name` String required 2-50
- `email` String required unique, lowercase, trimmed, regex validated — **unique index**
- `passwordHash` String required `select:false`
- `avatar` String URL nullable
- `bio` String max 500
- `createdAt`/`updatedAt` auto
- Virtual `journals` → Journal

### 2. Journal (`models/Journal.js`)

- `owner` ObjectId → User required indexed
- `title` String required max 120 default "My Journal"
- `description` String max 500
- `cover` { `color` String, `texture` enum `leather|fabric|paper|linen` }
- `createdAt`/`updatedAt`
- Indexes: `{owner:1}`, `{owner:1, updatedAt:-1}`
- Virtual `pages` → Page

### 3. Page (`models/Page.js`)

- `journal` ObjectId → Journal required indexed
- `pageNumber` Number required min 1 — **ordering field**, compound unique `{journal:1, pageNumber:1}`
- `title` String max 200 (e.g., "Friday, February 14, 2026")
- `content` String HTML from `contenteditable`
- `theme` enum `parchment|vintage|aged|handwritten` default `parchment`
- `createdAt`/`updatedAt`
- Indexes: unique compound + `{journal:1, updatedAt:-1}`
- Virtual `decorations` → Decoration

### 4. Decoration (`models/Decoration.js`)

- `page` ObjectId → Page required indexed
- `type` enum `sticky|sticker|paper|flower|tape` required
- `position` { `x` Number, `y` Number } min 0
- `size` { `width`, `height` } nullable
- `rotation` Number -180..180 default 0
- `text` String (sticky/paper), `emoji` String (sticker/flower) — queryable
- `config` Mixed — flexible future frontend config (color, font, etc.)
- `createdAt`/`updatedAt`
- Indexes: `{page:1}`, `{page:1, type:1}`

### 5. JournalEntry

**Not created as separate model.** `Page.content` already stores entry body. `Page` is the entry. Creating a duplicate collection would violate “do not duplicate page content.” If richer entry metadata is needed later, `Page` can be extended.

### 6. Settings (`models/settingsModel.js`) — optional

- `user` ObjectId → User unique
- `theme` enum, `ambience` {grain,warmLight,soundEnabled,sound}
- Reserved for persisting `memorium-ambience`/`memorium-theme` without blocking core flow.

## Relationships

- User 1—N Journal (`Journal.owner`)
- Journal 1—N Page (`Page.journal`, ordered by `pageNumber`)
- Page 1—N Decoration (`Decoration.page`)
- All references are `ObjectId` with `ref` for `populate()`.

## Indexes Summary

- `User.email` unique
- `Journal` → `owner`, `owner+updatedAt`
- `Page` → `journal+pageNumber` unique, `journal+updatedAt`
- `Decoration` → `page`, `page+type`
- `Settings` → `user` unique

## Frontend / localStorage → MongoDB Mapping

Current frontend stores everything in `localStorage` (offline-first):

| Frontend key             | Frontend shape                                                                                                | MongoDB target                                                                                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memorium-state-v2`      | `{currentPageIndex, pages:[{id, title, theme, content, decorations:[{id,type,x,y,rot,text,emoji}]}], nextId}` | `Journal` + `Page` + `Decoration`. `pages[].id` (12,13) maps to `Page.pageNumber`; `pages[].content` (HTML) → `Page.content`; `pages[].theme` → `Page.theme`; `pages[].decorations[]` → `Decoration` docs per `Page` (`position:{x,y}`, `rotation:rot`, `text`/`emoji`/`config`) |
| `memorium-theme`         | `"parchment"` string                                                                                          | `Page.theme` per page (and `Settings.theme` global fallback)                                                                                                                                                                                                                     |
| `memorium-ambience`      | `{grain,warmLight,soundEnabled,sound}`                                                                        | `Settings.ambience` (user-level) or stays local until user prefs API exists                                                                                                                                                                                                      |
| `memorium-page-*` legacy | per-page HTML                                                                                                 | Migrated into `memorium-state-v2` then → `Page`                                                                                                                                                                                                                                  |

`currentPageIndex` and `nextId` are UI state only; ordering is `Page.pageNumber` in DB.

## Next Stage

Backend will use these models in routes/controllers/services (auth, journal CRUD, page CRUD, decoration CRUD) without touching frontend yet. Frontend `localStorage` remains active until API wiring.

## Validation

- `node --check` passes for all model files
- No hard-coded URI; `process.env.MONGO_URI` only
- `.env` ignored, `.env.example` uses placeholders
