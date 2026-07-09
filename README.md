# Parcours

**Parcours** is a French-learning PWA styled as a newspaper editor's desk. Three tools —
**Reading**, **Vocabulary**, and **Practice** (vocabulary drills + verb conjugation) — share
one local-first store of the learner's progress (IndexedDB via Dexie). It is a single-page
React app, installable to the home screen, and works offline (only dictionary lookups and
pronunciation need the network).

This README is the onboarding map for someone (or some model) picking up the code cold:
what the app does, how it's organized, and which file to open next. Read a module's source
for the fine detail. The original product brief is in [OVERVIEW.md](OVERVIEW.md).

## Guest-first access model

The app is **usable without an account**: anyone can read articles and do conjugation
practice. An account (username + password) is required only for actions that write personal
progress — **marking an article read, saving vocabulary, and the vocabulary drills** — plus
cross-device sync. When a guest triggers a gated action, an auth-required modal explains
what an account unlocks and offers the sign-in page; the guest can dismiss it and keep
browsing. See `components/AuthGate.tsx` (`useAuthGate().requireAuth(reason)` guards each
call site; drill pages a guest reaches by URL render an inline `GuestNotice`).

The app was renamed from « Rédaction » to « Parcours »; the IndexedDB database deliberately
keeps the old name `redaction` so existing local progress is never orphaned.

## Stack & commands

Vite + React 19 + TypeScript (strict), react-router v7, Dexie (IndexedDB),
`vite-plugin-pwa` (Workbox precache, `autoUpdate`), no CSS framework. Cloudflare Pages hosts
the app; Pages Functions (backed by Workers KV) provide the account, sync, and TTS backends.

```sh
npm install
npm run dev       # dev server on :5173 (Pages Functions are mirrored — see below)
npm run build     # tsc typecheck + production build + service worker
```

Pages Functions don't run under `vite dev`, so `vite.config.ts` mirrors two of them with
dev middleware: `devAccountApi` (in-memory account store) and `devTtsProxy` (pronunciation).
Sync (`/api/sync`) is not mirrored, so it's a no-op in dev. Keep the mirrors in step with
the real Functions. The PWA manifest and service worker are only emitted by `npm run build`.

## Deployment

- **GitHub** repo: `parcours`. **Hosting**: Cloudflare Pages project `parcours` →
  https://parcours.pages.dev.
- `wrangler.toml` holds the project name, `dist` output dir, and the `SYNC_KV` KV binding
  (the namespace `id` there is a binding identifier, not a secret).
- Deploy the built app with `wrangler pages deploy dist --project-name=parcours` (it also
  compiles `functions/`). Deploys run on the machine's current Node with wrangler 4.x.

## Project layout

```
articles_corpus.json         source data: 200 articles, 50 per level A1–B2 (root, never modified)
conjugation_verbs.json       source data: 100 verbs × 9 tenses (root, never modified)
scripts/build-lemmas.py      regenerates the lemma tables from the Lefff lexicon
index.html · vite.config.ts  meta/PWA tags · PWA manifest, dev API mirrors, port
wrangler.toml                Cloudflare Pages config + KV binding
functions/api/account.ts     username+password signup/login over KV (PBKDF2 + per-IP rate limit)
functions/api/sync/[code].ts server-side sync merge (last-write-wins) over KV
functions/api/tts.ts          same-origin pronunciation proxy for Google TTS
public/icons/                app icons ("P" seal); public/lemmas-fr.txt (GENERATED, lazy-loaded)
src/
  main.tsx · App.tsx         bootstrap (router, SW reg, providers) · routes
  styles/global.css          the entire design system
  data/content.ts            typed exports of both datasets + TENSES metadata
  data/lemmas.json           GENERATED bundled lemma core — do not hand-edit
  lib/                       the logic layer (see table)
  components/                Layout, AuthProvider, AuthGate, icons, modals, drill chrome
  pages/                     one file per route
```

`src/lib/`:

| Concern | File |
|---|---|
| Shared IndexedDB store & schema | `db.ts` |
| Identity (username/password) + session + account wipe on logout | `auth.ts` (+ `components/AuthProvider.tsx`) |
| Guest gating (`requireAuth`, auth-required modal, `GuestNotice`) | `components/AuthGate.tsx` |
| Article read/position write path | `articleProgress.ts` |
| Account sync client | `sync.ts` |
| Struggle-weighted draw (words + verbs, one algorithm) | `struggle.ts` |
| Lemma lookup, tokenizer, paragraph/sentence splitting | `lemmatize.ts` |
| Online dictionary (Wiktionary + MyMemory) with cache | `dictionary.ts` |
| Offline lemma search over bundled content | `dictionarySearch.ts` |
| Save a word to the lexicon (single write path) | `vocab.ts` |
| Practice drawing, grading, streak/shelf progression | `practice.ts` |
| Conjugation session generator | `conjugation.ts` |
| Per-tense / per-mode color identities | `tenseThemes.ts` · `vocabThemes.ts` |
| Sound effects · confetti · French speech (TTS) | `sound.ts` · `confetti.ts` · `speech.ts` |

## Routes (`src/App.tsx`)

`/signin` is a full-screen route (no nav); everything else renders inside `Layout` (masthead
+ 5-tab bottom nav: Reading · Vocabulary · **Home** · Practice · Settings). There is **no
auth wall** — signed-out users land on the app; `SignInPage` redirects back to where they
came from on success (and if an already-signed-in user lands there).

| Path | Page |
|---|---|
| `/` | HomePage (greeting + read-next + vocab shortcut + practice quick-launch) |
| `/reading` · `/reading/:id` | article library (Not read/Read tabs + level filter) · article view |
| `/vocabulary` | lexicon (Learning/Learned tabs) + dictionary search |
| `/practice` | Practice hub — Vocabulary / Conjugation tabs (`?tab=conjugation`) |
| `/vocabulary/learn` · `/vocabulary/practice` · `/vocabulary/remember` | the three vocab drills |
| `/conjugation/:tense` | conjugation typing drill (`:tense` is a `TenseKey` or `mixed`) |
| `/signin` | sign-in / sign-up page |
| `/settings` | account (or guest sign-in card), progress summary, sound toggle, Log Out |

## Storage (`src/lib/db.ts`)

One Dexie database named **`redaction`**. Every record carries `updatedAt` (ms epoch) so
sync merges devices last-write-wins. Booleans are stored as `0 | 1` (IndexedDB can't index
booleans).

| Table | Holds |
|---|---|
| `savedWords` | the lexicon; keyed by `lemma`; `streak` drives learnt/learning |
| `articleProgress` | per-article read flag + scroll position |
| `practiceResults` | one row per finished drill round |
| `kv` | small key/value store (sync code, last-sync time, account name) |
| `lookupCache` | dictionary cache — never synced |
| `tombstones` | deletion records so sync can propagate removals |
| `drillStats` | per-item error-rate + last-seen for the struggle-weighted draw — device-local, never synced |

Logout clears every table (not `db.delete()`): the app stays mounted as a guest after
sign-out, so its live queries would block a whole-database delete — clearing wipes the same
data and updates those queries reactively.

## Content data (`src/data/content.ts`)

- **Articles**: 200 entries `{ id, cefr_level, title, title_en, word_count, content }` (50
  per level, A1–B2). The JSON is level-interleaved in file order, so `content.ts` sorts
  `articles` by CEFR level then id once. Single text block; paragraphs synthesized at render.
- **Verbs**: `verbs[infinitive][tenseKey]` → 8 forms (`je…elles`); `verbMeanings` → English;
  `TENSES` lists the 9 tense keys/labels. Some être-verb forms carry pipe-separated
  gender/number variants (`"es passé|es passée"`) — split on `|`, accept every variant,
  display joined with `/`.

## Modules (brief)

- **Auth & sync** — `auth.ts` verifies credentials against `functions/api/account.ts`
  (PBKDF2 hash in KV at `acct:<username>`), stores `{ name, username }` in localStorage
  (`parcours-user`), and points sync at `deriveSyncCode(username)` — a SHA-256 hash, so the
  raw name never hits a URL/server. `sync.ts` pushes the device's full state, the Function
  merges it into that KV bucket last-write-wins, and applies the result. Two invariants:
  tombstones must round-trip with their `key` field, and `syncNow()` never rejects
  (`{ ok:false, error }`) so the UI can't stick. `Layout` auto-syncs on load/refocus (no-op
  until a first sync sets `lastSyncAt`).
- **Reading** — `ReadingPage` (Not read/Read tabs + a per-CEFR-level filter chip row) and
  `ArticlePage` (tappable word tokens, **one word per tap**; tap → `WordModal` lookup/save;
  drop cap, saved-lemma highlighting, scroll-progress, typewriter headline). Progress writes
  go through `articleProgress.ts` and are skipped for guests.
- **Vocabulary / Practice** — `VocabularyPage` (Learning/Learned tabs + offline dictionary
  search, the only manual-add path). `PracticeHubPage` has Vocabulary (`VocabDrills`: Word
  Match / Fill in the Blank / Remember?) and Conjugation (`ConjugationPicker`) tabs. Drills
  draw items **struggle-weighted** (`struggle.ts`): each answer updates a `drillStats` row
  (EWMA error rate + last-seen), and the draw favours high-error, not-recently-seen items.
- **Lemmatization** (`lemmatize.ts` + `scripts/build-lemmas.py`) — surface form → dictionary
  lemma. `lemmaOf()` is a synchronous `Map` lookup (self-fallback, never invents a word),
  seeded by a bundled core (`data/lemmas.json`) and augmented by the full Lefff lexicon
  (`public/lemmas-fr.txt`, ~350k lines, fetched once and cached in Cache Storage).
  `lemmatizeTokens()` disambiguates verb/noun homographs with a two-word context window
  (`le livre`→livre, `je livre`→livrer). **Gotcha:** changing the `lemmas-fr.txt` format
  requires bumping `LEXICON_CACHE` in `lemmatize.ts`, or returning users keep the stale
  cached file.
- **Pronunciation** (`speech.ts` + `functions/api/tts.ts`) — plays Google Translate's French
  voice through our own same-origin proxy, decoded and played via the shared Web Audio
  `AudioContext` (**not** an `<audio>` element — avoids the iOS Now-Playing/Dynamic-Island
  hijack and survives backgrounding). Offline/dev falls back to `speechSynthesis`.

## Conventions (don't re-litigate silently)

1. Root JSON data files are the user's originals — never modify them.
2. No topic filters/tags — out of scope. Corpus is A1–B2 only (no C1/C2).
3. The dictionary (word lookups) is online; the lemmatizer fetches its lexicon once, then
   works offline from Cache Storage.
4. Vocabulary is exactly three drills (under Practice); the lexicon is displayed by lemma;
   the only manual-add path is the offline dictionary search.
5. Conjugation is typing only. Reading is one word per tap (no multi-word selection).
6. Practice draws are struggle-weighted (words and verbs), one shared algorithm; `drillStats`
   is device-local (never synced).
7. Sign-in is a username + password account (backend-verified via KV); the username hash is
   the sync key. Reading and conjugation are open to guests; everything that writes personal
   progress is gated behind `requireAuth` (`components/AuthGate.tsx`).
8. A neutral `confirmTock` (not the celebratory `successChime`) acknowledges save-type
   actions (marking an article read, saving a word); drills keep the chimes/fanfare.
9. Renamed to Parcours, but the IndexedDB name stays `redaction`.
10. Zoom is disabled app-wide (viewport meta + gesture/wheel/key guards in `main.tsx`).
