# Parcours

**Parcours** is a French-learning PWA styled as a newspaper editor's desk. Its tools —
**Reading**, **Vocabulary**, and **Practice** (vocabulary drills + conjugation) — share
one local-first store of the learner's progress. It is a single-page React app,
installable to the home screen, and works offline (only dictionary lookups and
pronunciation need network). Sign-in is email-only and password-less: the email is the
key that ties progress to a cloud bucket, so the same address restores and syncs progress
on any device. Progress lives in IndexedDB on the device and mirrors to the cloud bucket.

The original product brief is in [OVERVIEW.md](OVERVIEW.md). The app was renamed from
« Rédaction » to « Parcours »; the IndexedDB database deliberately keeps the old name
`redaction` so existing local progress is never orphaned.

This README is the onboarding map: what the app is, how it's organized, and where each
piece lives. Read a module's source for the fine detail — the pointers below tell you
which file to open.

---

## Stack & commands

Vite + React 19 + TypeScript (strict), react-router v7, Dexie (IndexedDB),
`vite-plugin-pwa` (Workbox precache, `autoUpdate`), no CSS framework. Cloudflare Pages
hosts the app; a Pages Function backs cross-device sync.

```sh
npm install
npm run dev       # dev server (default port 5173; Pages Functions do NOT run here)
npm run build     # tsc typecheck + production build + service worker
```

- `.claude/launch.json` defines the `redaction-dev` preview server.
- The PWA manifest and service worker are only emitted by `npm run build`.

## Deployment

- **GitHub**: the repo is `parcours`.
- **Hosting**: Cloudflare Pages project `parcours` → https://parcours.pages.dev.
  `wrangler.toml` holds the project name, the `dist` output dir, and the KV binding.
  Deploy the built app with `wrangler pages deploy` (it compiles `functions/` too).
- **Sync backend**: `functions/api/sync/[code].ts` is a Pages Function bound to a
  Workers KV namespace (`SYNC_KV`). It stores one bucket of progress per sync code.

Wrangler needs Node ≤ 22 (its `sharp` dependency fails to build on newer Node); the app
itself builds fine on current Node.

## Project layout

```
articles_corpus.json        source data: 100 articles (root, never modified)
conjugation_verbs.json      source data: 100 verbs × 9 tenses (root, never modified)
scripts/build-lemmas.py     regenerates the lemma tables from the Lefff lexicon (see Lemmatization)
index.html · vite.config.ts meta/PWA tags · PWA manifest, name, icons, theme
wrangler.toml               Cloudflare Pages config + KV binding for sync
functions/api/sync/[code].ts server-side sync merge (last-write-wins) over KV; the
                            code is a hash of the signed-in email (see Account sync)
functions/api/tts.ts        same-origin pronunciation proxy (see Pronunciation)
public/icons/               app icons ("P" seal, cream on red #B3362A); art is inset with
                            safe-area padding so OS corner masks never clip the frame, and
                            the browser icons carry baked-in rounded corners
src/
  main.tsx · App.tsx        bootstrap (router, SW registration) · all routes
  styles/global.css         the entire design system
  data/
    content.ts              typed exports of both datasets + TENSES metadata
    lemmas.json             GENERATED bundled lemma core (drilled-verb forms) — do not hand-edit
public/lemmas-fr.txt        GENERATED full form→lemma lexicon (~350k, lazy-loaded) — do not hand-edit
  lib/                      the logic layer (see below)
  components/               Layout, icons, modals, drill chrome, SyncModal
  pages/                    one file per route
```

Where things live in `src/lib/`:

| Concern | File |
|---|---|
| Shared IndexedDB store & schema | `db.ts` |
| Email-only identity + account sync wiring | `auth.ts` (+ `components/AuthProvider.tsx`) |
| Article read/position write path | `articleProgress.ts` |
| Account sync client | `sync.ts` |
| Struggle-weighted draw (words + verbs, one algorithm) | `struggle.ts` |
| Lemma lookup, tokenizer, paragraph/sentence splitting | `lemmatize.ts` |
| Online dictionary (Wiktionary + MyMemory) with cache | `dictionary.ts` |
| Offline lemma search over bundled content | `dictionarySearch.ts` |
| Save a word to the lexicon (single write path) | `vocab.ts` |
| Practice drawing, grading, streak/shelf progression | `practice.ts` |
| Conjugation session generator (verb selection + rules) | `conjugation.ts` |
| Per-tense / per-mode color identities | `tenseThemes.ts` · `vocabThemes.ts` |
| Sound effects · confetti · French speech (TTS) | `sound.ts` · `confetti.ts` · `speech.ts` |

## Routes (`src/App.tsx`)

When signed out, `App` renders the full-screen `SignInPage` (no nav) instead of the
routes below. Bottom nav: Reading · Vocabulary · **Home** (centre) · Practice · Settings.

| Path | Page |
|---|---|
| `/` | HomePage (greeting + Read-next + Vocabulary shortcut + practice quick-launch) |
| `/reading` · `/reading/:id` | article library (Read/Unread tabs) · article view |
| `/vocabulary` | lexicon (Learning/Learned tabs) + dictionary search |
| `/practice` | Practice hub — Vocabulary / Conjugation tabs (`?tab=conjugation`) |
| `/vocabulary/learn` · `/vocabulary/practice` · `/vocabulary/remember` | the three vocab drills |
| `/conjugation/:tense` | conjugation typing drill (`:tense` is a `TenseKey` or `mixed`) |
| `/settings` | account, progress summary, sound toggle, Log Out |

## Storage (`src/lib/db.ts`)

One Dexie database named **`redaction`**. Every record carries `updatedAt` (ms epoch)
so sync can merge devices last-write-wins. Booleans are stored as `0 | 1` (IndexedDB
can't index booleans).

| Table | Holds |
|---|---|
| `savedWords` | the lexicon; keyed by `lemma` for dedup/highlighting, `streak` drives learnt/learning |
| `articleProgress` | per-article read flag + scroll position |
| `practiceResults` | one row per finished drill round |
| `kv` | small key/value store (sync code, last-sync time, account name) |
| `lookupCache` | dictionary cache — never synced |
| `tombstones` | deletion records so sync can propagate removals |
| `drillStats` | per-item error-rate + last-seen for the struggle-weighted draw — device-local, never synced |

## Content data (`src/data/content.ts`)

- **Articles**: 100 entries `{ id, cefr_level, title, title_en, word_count, content }`
  (levels A1–B2). Single text block; paragraphs are synthesized at render time. No topic
  field — topics are out of scope.
- **Verbs**: `verbs[infinitive][tenseKey]` → 8 forms in `je, tu, il, elle, nous, vous,
  ils, elles` order; `verbMeanings[infinitive]` → short English; `TENSES` lists the 9
  tense keys/labels. Some être-verb forms carry pipe-separated gender/number variants
  (`"es passé|es passée"`) — split on `|`, accept every variant, display joined with `/`.

---

## Modules

**Sign-in (`pages/SignInPage.tsx` + `components/AuthProvider.tsx`)** — the app is gated:
`App` reads `useAuth()` and shows the full-screen sign-in (name + email, no password, no
verification) until a user exists. `AuthProvider` keeps the user in state, seeded from
localStorage (`parcours-user`), so the session persists indefinitely. `lib/auth.ts`
handles it: sign-in stores the identity, points sync at `deriveSyncCode(email)` (a
SHA-256 hash, so the raw email never hits a URL/the server) and pulls the bucket; sign-out
pushes a last sync, wipes the local DB (so nothing bleeds between accounts on a shared
device — the cloud keeps this account's data), and returns to the gate.

**Home (`pages/HomePage.tsx`)** — a greeting with the user's first name, a "Read next"
card for the first unread article, a one-line Vocabulary shortcut (word/learnt counts),
and four practice quick-launch tiles (Conjugation → mixed drill, Word Match, Fill in the
Blank, Remember?).

**Reading** — `pages/ReadingPage.tsx` has two tabs (**Unread** / **Read**) each with a
count, and a per-CEFR-level count row for the active tab (A1: 5, B2: 12 …). Read cards
render in a burgundy-tinted greyscale with a rubber-stamp label; every card has an
icon-only read/unread toggle (marking read replays the stamp + sink send-off), and the
list always opens scrolled to the top. `pages/ArticlePage.tsx` renders an article as
tappable word tokens — **exactly one word per tap**: native multi-word/sentence selection
is disabled (`user-select: none` on `.article-body`). Tap → `WordModal` lookup/save; plus
a drop cap, live highlighting of saved lemmas, scroll-progress tracking, and a typewriter
headline reveal. Progress writes go through `lib/articleProgress.ts`; lemmatization is
`lib/lemmatize.ts`; dictionary lookups are online (`lib/dictionary.ts`, cached).

**Vocabulary** — `pages/VocabularyPage.tsx` shows the lexicon in two tabs (**Learning** /
**Learned**, each with a count, driven by `streak`) plus an offline dictionary search
(`lib/dictionarySearch.ts`) as the only manual add path. The drills themselves live under
Practice now.

**Practice** — `pages/PracticeHubPage.tsx` is a two-tab hub (**Vocabulary** /
**Conjugation**, tab in `?tab=`). Vocabulary lists three drills (`components/VocabDrills.tsx`:
Word Match / Fill in the Blank / Remember?, on `lib/practice.ts`); Conjugation is the
tense picker (`components/ConjugationPicker.tsx`). `pages/ConjugationDrillPage.tsx` runs a
typing session (10 exercises × 3 prompts, `lib/conjugation.ts`); rows are one line, a
fully correct exercise auto-advances, results offer only the way back. Both the vocabulary
words and the conjugation verbs are chosen **struggle-weighted**, not at random
(`lib/struggle.ts`): each answer updates a per-item `drillStats` row (EWMA error rate +
last-seen), and the draw favours high-error, not-recently-seen items over a floor that
keeps everything in the running — one algorithm shared by both tools.

**Settings (`pages/SettingsPage.tsx`)** — account (name, email), a progress/stats summary,
the app-wide sound-effects toggle, and Log Out.

**Lemmatization (`lib/lemmatize.ts` + `scripts/build-lemmas.py`)** — surface form →
dictionary lemma, used to save/highlight words while reading and to seed the offline
dictionary search. `lemmaOf()` is a synchronous `Map` lookup (falls back to the word
itself, so it never invents a word). It is seeded by a small BUNDLED core
(`data/lemmas.json`, the drilled-verb forms — instant on first paint) and augmented by
the FULL lexicon, `public/lemmas-fr.txt` (~350k `form⇥lemma` lines derived from the
**Lefff**, *Lexique des Formes Fléchies du Français*, LGPL-LR). `loadLexicon()` fetches
that file once (kicked off in `main.tsx`), caches it in Cache Storage (`parcours-lexicon-v1`
— device-local, never synced, offline after first load), and notifies subscribers
(`onLexiconReady`) so the article view and dictionary index refresh. When a form has
several candidate lemmas the build prefers a verb infinitive then the shortest, which is
right for the common cases (`est`→être, `irai`→aller, `abandonnée`→abandonner) but can't
disambiguate true homographs (`livre`)  — the small residual error. Regenerate both
tables with `python3 scripts/build-lemmas.py` (downloads the Lefff to `scripts/.cache/`);
this replaced the old spaCy corpus-snapshot table, which was corpus-bounded and baked in
the small model's mistakes.

**Account sync (`lib/sync.ts` + `lib/auth.ts` + `functions/api/sync/[code].ts`)** — the
bucket code is `deriveSyncCode(email)` (a SHA-256 hash of the signed-in email), stored in
kv as `syncCode` at sign-in. `syncNow()` uploads the device's full state, the Function
merges it into that KV bucket (last-write-wins by `updatedAt`, deletions via `tombstones`),
and returns the merged state to apply locally. `Layout` auto-syncs on load and on refocus.
The email hash is the only secret — anyone who knows the exact email reaches that bucket
(acceptable: it's non-sensitive learning progress). Two hard-won invariants carried over
from the old device-sync: tombstones must round-trip with their `key` field (the client
table's primary key; the server re-derives it when serializing, healing older buckets),
and `syncNow()` never rejects — it reports `{ ok: false, error }` so the UI can't stick.
The former export/import (device-code) UI has been removed. In `npm run dev` the Pages
Function isn't served, so sync is a no-op there (like `/api/tts`).

## Design system (`src/styles/global.css`)

Newspaper aesthetic: cream paper (`--paper`), ink text (`--ink`), one accent — editor's
red (`--accent #B3362A`). System serif for text, system sans (`--sans`) for UI labels.
CEFR badge colors `--level-a1…c2`. Reusable classes: `.card`, `.btn--primary/accent/
ghost`, `.chip`, `.section-label`, `.text-input`, `.drill-*`, `.feedback--*`,
`.level-badge--*`, `.seg-tabs`/`.seg-tab` (the segmented tabs on Reading/Vocabulary/
Practice). The masthead is a **hide-on-scroll** header (`position: sticky`, top safe-area
respected): `Layout` toggles `.masthead--hidden` (slide up + fade) by scroll direction, so
it clears the Dynamic Island on the way down and drops back on scroll up. Layout is a 680px
column with a fixed bottom tab bar of five items, Home centred (`z-index: 40`, above page
content, below modals at 60). Read library cards are washed toward `--burgundy` via
`color-mix`. Conjugation and Vocabulary drills share one drill language (stage cards,
in-input feedback, HUD pills, results card) themed by `--tc`/`--tc-wash`/`--stripe`; all
animations respect `prefers-reduced-motion`.

Zoom is disabled app-wide (viewport meta + `touch-action` + wheel/key guards in
`main.tsx`). `Layout` delegates one click sound to every button/link (`lib/sound.ts`
`uiClick`; word tokens `.w` get the softer `wordTap`); elements that play their own
sounds opt out by class (`accent-key`, `match-tile`). `sound.ts` also owns the iOS
audio unlock: persistent gesture listeners resume the AudioContext (WebKit re-suspends
it as `interrupted` whenever the home-screen app is backgrounded) — don't make the
unlock a one-shot.

**Pronunciation (`speech.ts` + `functions/api/tts.ts`)** — the word-pronounce button
plays Google Translate's natural French voice through our OWN same-origin proxy
(`/api/tts`), never Google's URL directly (Google refuses the cross-origin request). The
clip is decoded and played through the shared Web Audio `AudioContext` (from `sound.ts`),
**not** an `<audio>` element. That is deliberate: an audible media element registers a Now
Playing session that hijacks the phone's media controls and pops the Dynamic Island — Web
Audio makes no such session, and it inherits the AudioContext's iOS unlock + foreground
resume, so pronunciation also survives backgrounding (it used to need a full app restart).
Once the context is unlocked a buffer can start from any async callback, so
fetch→decode→play works even for auto-pronounced words. Offline (or in `npm run dev`, where
Pages Functions don't run) it falls back to `speechSynthesis`, with fr-FR voices warmed at
load so the first utterance isn't the robotic default.

## Conventions (don't re-litigate silently)

1. Root JSON data files are the user's originals — never modify them.
2. No topic filters/tags — out of scope.
3. The dictionary (word lookups) is online; the lemmatizer fetches its lexicon once, then
   works offline from Cache Storage.
4. Vocabulary is exactly three drills (now under Practice); the lexicon is displayed by
   lemma; the only manual-add path is the offline dictionary search.
5. Conjugation is typing only.
6. Reading is one word per tap — no multi-word/sentence selection.
7. Practice draws are struggle-weighted (words and verbs), never uniform random — one
   shared algorithm in `lib/struggle.ts`; `drillStats` is device-local (never synced).
8. Sign-in is email-only, no password, no verification; the email is just the sync key.
9. Renamed to Parcours, but the IndexedDB name stays `redaction`.
