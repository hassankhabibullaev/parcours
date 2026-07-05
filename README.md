# Parcours

**Parcours** is a French-learning PWA styled as a newspaper editor's desk. Three tools —
**Reading**, **Vocabulary**, and **Conjugation** — share one local-first store of the
learner's progress. It is a single-page React app, installable to the home screen, and
works offline (only dictionary lookups and pronunciation need network). No accounts:
progress lives in IndexedDB on the device and can optionally sync across devices by a
shared code.

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
scripts/build-lemmas.py     regenerates src/data/lemmas.json (spaCy; run only if the corpus changes)
index.html · vite.config.ts meta/PWA tags · PWA manifest, name, icons, theme
wrangler.toml               Cloudflare Pages config + KV binding for sync
functions/api/sync/[code].ts server-side sync merge (last-write-wins) over KV
public/icons/               app icons ("P" seal, cream on red #B3362A); art is inset with
                            safe-area padding so OS corner masks never clip the frame, and
                            the browser icons carry baked-in rounded corners
src/
  main.tsx · App.tsx        bootstrap (router, SW registration) · all routes
  styles/global.css         the entire design system
  data/
    content.ts              typed exports of both datasets + TENSES metadata
    lemmas.json             GENERATED form→lemma table — do not hand-edit
  lib/                      the logic layer (see below)
  components/               Layout, icons, modals, drill chrome, SyncModal
  pages/                    one file per route
```

Where things live in `src/lib/`:

| Concern | File |
|---|---|
| Shared IndexedDB store & schema | `db.ts` |
| Article read/position write path | `articleProgress.ts` |
| Cross-device sync client | `sync.ts` |
| Device / sync code generation | `deviceCode.ts` |
| Lemma lookup, tokenizer, paragraph/sentence splitting | `lemmatize.ts` |
| Online dictionary (Wiktionary + MyMemory) with cache | `dictionary.ts` |
| Offline lemma search over bundled content | `dictionarySearch.ts` |
| Save a word to the lexicon (single write path) | `vocab.ts` |
| Practice drawing, grading, streak/shelf progression | `practice.ts` |
| Conjugation session generator (randomization rules) | `conjugation.ts` |
| Per-tense / per-mode color identities | `tenseThemes.ts` · `vocabThemes.ts` |
| Sound effects · confetti · French speech (TTS) | `sound.ts` · `confetti.ts` · `speech.ts` |

## Routes (`src/App.tsx`)

| Path | Page |
|---|---|
| `/` | HomePage (dashboard + sync) |
| `/reading` · `/reading/:id` | article library · article view |
| `/vocabulary` | lexicon + dictionary search + practice launcher |
| `/vocabulary/learn` · `/practice` · `/remember` | the three practice modes |
| `/conjugation` · `/conjugation/:tense` | tense picker · typing drill (`:tense` is a `TenseKey` or `mixed`) |

## Storage (`src/lib/db.ts`)

One Dexie database named **`redaction`**. Every record carries `updatedAt` (ms epoch)
so sync can merge devices last-write-wins. Booleans are stored as `0 | 1` (IndexedDB
can't index booleans).

| Table | Holds |
|---|---|
| `savedWords` | the lexicon; keyed by `lemma` for dedup/highlighting, `streak` drives learnt/learning |
| `articleProgress` | per-article read flag + scroll position |
| `practiceResults` | one row per finished drill round |
| `kv` | small key/value store (device code, sync code, last-sync time) |
| `lookupCache` | dictionary cache — never synced |
| `tombstones` | deletion records so sync can propagate removals |

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

**Home (`pages/HomePage.tsx`)** — "Your progression" (articles/words/rounds with mini
progress bars, learnt count, and a practice-day streak), then an "À la une" card that
always offers the first unread article ("Read next"), then a one-line sync row whose
button opens `components/SyncModal.tsx` (Import from / Export to another device).

**Reading** — `pages/ReadingPage.tsx` is the filterable library (CEFR + read filters).
Unread articles sit on top; read ones sink below an "Already read" divider, rendered in
a burgundy-tinted greyscale with a rubber-stamp label, and every card has an icon-only
read/unread toggle (marking read replays the stamp + sink send-off). The list always
opens scrolled to the top. `pages/ArticlePage.tsx` renders an article as tappable word
tokens (tap → `WordModal` lookup/save), a drop cap, live highlighting of saved lemmas,
scroll-progress tracking, and a typewriter reveal of the headline (the conjugation
drill's animation, key clicks included). Progress writes go through `lib/articleProgress.ts`.
Lemmatization is `lib/lemmatize.ts` over the generated `data/lemmas.json`; dictionary
lookups are online (`lib/dictionary.ts`, cached after first use).

**Vocabulary** — `pages/VocabularyPage.tsx` shows the lexicon (auto-managed **Still
Learning** / **Learnt** groups driven by `streak`) plus an offline dictionary search
(`lib/dictionarySearch.ts`) as the only manual add path. Exactly three typing/matching
drills (Learn / Practice / Remember?), all built on `lib/practice.ts` and sharing the
conjugation drill's design language.

**Conjugation** — `pages/ConjugationPage.tsx` picks a tense (or the mixed drill);
`pages/ConjugationDrillPage.tsx` runs a typing session (10 exercises × 3 prompts) whose
randomization lives in `lib/conjugation.ts`. Typing only; per-tense colors from
`lib/tenseThemes.ts`. Each row is one line (tense chip · pronoun · input); a fully
correct exercise auto-advances after a short pause (inputs read-only, button disabled),
and the results page offers only the full-width way back — no Retry.

**Sync (`lib/sync.ts` + `functions/api/sync/[code].ts`)** — opt-in, code-based. Each
device generates a memorable code (`word-word-word-NN`, `lib/deviceCode.ts`); the
Home sync modal's Import flow links this device to another's code, Export shows this
device's code (publishing its state first so the code is immediately redeemable).
`syncNow()` uploads the device's full state, the Function merges it into the KV bucket
for that code (last-write-wins by `updatedAt`, deletions via `tombstones`), and returns
the merged state to apply locally. `Layout` auto-syncs on load and on refocus once
linked. The code is the only secret — anyone who knows it can read/write that bucket
(by design). Two hard-won invariants: tombstones must round-trip with their `key`
field (it is the client table's primary key; the server re-derives it when serializing,
which also heals buckets written before the fix), and `syncNow()` never rejects — it
reports `{ ok: false, error }` so the UI can't get stuck on "Syncing…". A failed
Import rolls the linked code back.

## Design system (`src/styles/global.css`)

Newspaper aesthetic: cream paper (`--paper`), ink text (`--ink`), one accent — editor's
red (`--accent #B3362A`). System serif for text, system sans (`--sans`) for UI labels.
CEFR badge colors `--level-a1…c2`. Reusable classes: `.card`, `.btn--primary/accent/
ghost`, `.chip`, `.section-label`, `.text-input`, `.drill-*`, `.feedback--*`,
`.level-badge--*`. The masthead is ink-colored with double-rule flourishes flanking the
wordmark. Layout is a 680px column with a fixed bottom tab bar (`z-index: 40`, above
all page content, below modals at 60). Read library cards are washed toward
`--burgundy` via `color-mix`. Conjugation and Vocabulary drills share one drill
language (stage cards, in-input feedback, HUD pills, results card) themed by
`--tc`/`--tc-wash`/`--stripe`; all animations respect `prefers-reduced-motion`.

Zoom is disabled app-wide (viewport meta + `touch-action` + wheel/key guards in
`main.tsx`). `Layout` delegates one click sound to every button/link (`lib/sound.ts`
`uiClick`; word tokens `.w` get the softer `wordTap`); elements that play their own
sounds opt out by class (`accent-key`, `match-tile`). `sound.ts` also owns the iOS
audio unlock: persistent gesture listeners resume the AudioContext (WebKit re-suspends
it as `interrupted` whenever the home-screen app is backgrounded) — don't make the
unlock a one-shot.

## Conventions (don't re-litigate silently)

1. Root JSON data files are the user's originals — never modify them.
2. No topic filters/tags — out of scope.
3. Dictionary and lemmatizer may use the network; offline-first isn't required for them.
4. Vocabulary is exactly three drills; the lexicon is displayed by lemma; the only
   manual-add path is the offline dictionary search.
5. Conjugation is typing only.
6. Renamed to Parcours, but the IndexedDB name stays `redaction`.
