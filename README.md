# Parcours

**Parcours** is a French-learning PWA styled as a newspaper editor's desk. Three tools —
**Reading**, **Vocabulary**, and **Conjugation** — share one local-first store of the
learner's progress. It is a single-page React app, installable to the home screen,
fully offline for app + content (only dictionary lookups need network, and those are
cached once seen). No accounts; progress lives in IndexedDB on the device.

The original product brief is in [OVERVIEW.md](OVERVIEW.md). The app was renamed from
« Rédaction » to « Parcours »; the IndexedDB database deliberately keeps the old name
`redaction` so existing local progress is never orphaned.

**This README is the onboarding document.** Each module section below states where the
code lives, the data it owns, how it behaves, and its gotchas — enough to work on one
module without reading the rest of the source.

---

## Stack & commands

- Vite + React 19 + TypeScript (strict), react-router v7, Dexie (IndexedDB),
  `vite-plugin-pwa` (Workbox precache, `autoUpdate`), no CSS framework.

```sh
npm install
npm run dev       # dev server (default port 5173)
npm run build     # tsc typecheck + production build + service worker
```

- `.claude/launch.json` defines the `redaction-dev` preview server config.
- The PWA manifest is only emitted by `npm run build` (not served in dev).
- Seeded test data may exist in a dev browser's IndexedDB (chat/maison/livre/eau/pain…);
  it is not part of the app.

## File map

```
articles_corpus.json        source data: 100 articles (root, never modified)
conjugation_verbs.json      source data: 100 verbs × 9 tenses (root, never modified)
scripts/build-lemmas.py     regenerates src/data/lemmas.json (spaCy, see Reading)
index.html                  meta/PWA tags; app title
vite.config.ts              PWA manifest (name, icons, theme)
public/icons/               app icons ("P" seal, cream on red #B3362A)
src/
  main.tsx                  bootstrap: BrowserRouter, service-worker registration
  App.tsx                   all routes (flat list, one Layout wrapper)
  styles/global.css         entire design system (see below)
  data/
    content.ts              typed exports of both JSON datasets + TENSES metadata
    lemmas.json             GENERATED form→lemma table (4.5k entries) — do not hand-edit
  lib/
    db.ts                   Dexie schema — the shared store (see Storage)
    lemmatize.ts            lemma lookup, tokenizer, sentence/paragraph splitting
    dictionary.ts           online dictionary (Wiktionary + MyMemory) with cache
    dictionarySearch.ts     offline lemma index over all bundled content (see Vocabulary)
    vocab.ts                saveWord() — the single write path into the lexicon
    practice.ts             shuffle, word drawing, accent-tolerant grading, recordRound,
                            recordWordResult (auto-move between learning shelves)
    conjugation.ts          conjugation session generator (all randomization rules)
    tenseThemes.ts          per-tense color identities + family grouping (Conjugation UI)
    vocabThemes.ts          per-mode color identities for the Vocabulary drills
    sound.ts                Web Audio SFX for all practice drills (no assets, offline)
    confetti.ts             canvas confetti burst for the drill results screens
    speech.ts               speakFrench(): Google-Translate TTS online (natural female
                            voice), best local fr voice via Web Speech as fallback
    deviceCode.ts           memorable device code (word-word-NN), stored in kv
  components/
    Layout.tsx              masthead (P logo + burgundy wordmark) + bottom tab bar + <Outlet/>
    icons.tsx               inline SVG icon set (tabs + lexicon/speaker actions)
    WordModal.tsx           word details modal (used by Reading)
    MatchBoard.tsx          one match-pairs board (used by Learn / Remember?)
    DrillHeader.tsx         back-link + title header (gate & results screens)
    DrillTopline.tsx        compact one-line header for active drill sessions
    DrillResults.tsx        shared end-of-session card (score gradient, review
                            list, confetti + fanfare) — used by all four drills
    SoundPill.tsx           the speaker HUD toggle, flat SVG icon (localStorage-persisted)
  pages/
    HomePage.tsx            dashboard ("The Desk")
    ReadingPage.tsx         article library
    ArticlePage.tsx         reading view (tap-to-lookup, progress)
    VocabularyPage.tsx      lexicon + dictionary search + practice launcher
    MatchSessionPage.tsx    5-exercise match sessions (Learn / Remember?)
    PracticePage.tsx        drill: type the French (Practice)
    ConjugationPage.tsx     tense picker
    ConjugationDrillPage.tsx  typing drill sessions
```

## Routes

| Path | Page |
|---|---|
| `/` | HomePage (dashboard) |
| `/reading` | ReadingPage (library) |
| `/reading/:id` | ArticlePage |
| `/vocabulary` | VocabularyPage (lexicon + launcher) |
| `/vocabulary/learn` · `/practice` · `/remember` | the three practice modes |
| `/conjugation` | ConjugationPage (tense picker) |
| `/conjugation/:tense` | ConjugationDrillPage — `:tense` is a `TenseKey` or `mixed` |

## Design system (`src/styles/global.css`)

Newspaper aesthetic: cream paper (`--paper #F5F0E6`), ink text (`--ink #211D16`), one
accent — editor's red (`--accent #B3362A`). System serif stack for text (no font
downloads → works offline), system sans (`--sans`) for UI labels. CEFR level badge
colors are `--level-a1 … --level-c2`. Reusable classes: `.card`, `.btn--primary/accent/
ghost`, `.chip`/`.chip--active`, `.section-label`, `.text-input`, `.drill-progress`,
`.drill-actions`, `.feedback--correct/accents/wrong`, `.level-badge--A1…`. Layout is a
680px-max column with a fixed bottom tab bar (`--tabbar-height`, safe-area padded).
The Conjugation module has per-tense color identities (family-grouped hues in
`lib/tenseThemes.ts`) and the Vocabulary module per-mode ones (`lib/vocabThemes.ts`),
both applied via the same `--tc`/`--tc-wash`/`--stripe` CSS vars set inline — the two
modules share one drill design language (stage cards, in-input feedback, HUD pills,
results card). All drill animations respect `prefers-reduced-motion`.

---

## Storage (`src/lib/db.ts`) — the shared memory

One Dexie database named **`redaction`** (see rename note above), schema version 2.
Every record carries `updatedAt` (ms epoch) so a future device-sync can merge with
last-write-wins. Boolean flags are stored as `0 | 1` (IndexedDB can't index booleans).

| Table | Primary key | Indexed | Record |
|---|---|---|---|
| `savedWords` | `id` (uuid) | `lemma`, `learned`, `addedAt` | `{ id, lemma, display, translation, definition, sentence, articleId, learned: 0\|1, streak?, addedAt, updatedAt }` — `streak` (not indexed, absent on old records → read as 0) counts consecutive correct practice answers and drives the automatic learned/learning moves |
| `articleProgress` | `articleId` | `read`, `lastOpenedAt` | `{ articleId, read: 0\|1, position: 0..1, lastOpenedAt, updatedAt }` |
| `practiceResults` | `id` (uuid) | `tool`, `finishedAt` | `{ id, tool: 'vocabulary'\|'conjugation', mode, tense: string\|null, score, total, finishedAt, updatedAt }` |
| `kv` | `key` | — | `{ key, value, updatedAt }` — holds `deviceCode` |
| `lookupCache` | `term` | — | `{ term, translation, definition, updatedAt }` — dictionary cache, never synced |

Conventions:
- `savedWords.lemma` is the identity of a lexicon entry — deduplication, highlighting,
  and drill answers all key on it. For multi-word phrases, `lemma` is the lowercased
  phrase itself. `display` is what the learner actually saw/typed.
- Deletion is a hard `delete()` (no tombstones yet — a known gap for future sync).
- Reads in pages use `useLiveQuery` (dexie-react-hooks) so all stats update live.

## Content data (`src/data/content.ts`)

Typed wrappers over the two root JSON files (bundled into the app, hence offline):

- **Articles**: 100 entries `{ id, cefr_level, title, title_en, word_count, content }`.
  Levels present: A1×20, A2×30, B1×40, B2×10 (no C1/C2). 174–383 words each, single
  text block (no paragraphs — paragraphs are synthesized at render time). `content.ts`
  adds `readingMinutes = max(1, round(word_count/150))`. **No topic field — topics were
  removed from the product scope entirely; do not add topic logic.**
- **Verbs**: `verbs[infinitive][tenseKey]` → array of **8 forms** in pronoun-column
  order `je, tu, il, elle, nous, vous, ils, elles`; `verbMeanings[infinitive]` → short
  English. 9 tense keys, exported as `TENSES: { key, label, labelEn }[]`:
  `present, imparfait, passeCompose, plusQueParfait, futur, futurAnterieur,
  conditionnel, conditionnelPasse, subjonctif`.
- **Gotcha**: 176 of 7,200 verb forms contain pipe-separated gender/number variants for
  être-verbs (e.g. `"es passé|es passée"`). Any consumer must `split('|')` and accept
  every variant as correct; display them joined with `" / "`.

---

## Module: Home dashboard (`pages/HomePage.tsx`)

Live stats via `useLiveQuery`: words saved (`savedWords.count()`), articles read
(`articleProgress.where('read').equals(1).count()`), practice rounds
(`practiceResults.count()`). "À la une" card = most recent `articleProgress` by
`lastOpenedAt` → links to `/reading/:id`; empty-state CTA otherwise. Shows the device
code from `deviceCode.ts` (generated once, persisted in `kv`). Device *linking* is not
implemented (see Sync status).

## Module: Reading

**Library (`pages/ReadingPage.tsx`)** — all 100 articles as cards with level badge,
word count, reading minutes; filter chips: CEFR levels + **Read** (read articles only).
Read state / "In progress" (position > 0.02) stamps come from `articleProgress`. Read
articles sink to the bottom of the list (unread always first; stable sort keeps corpus
order within each group) and their cards are muted (`.article-card--read`: flat
background, lower opacity) while staying fully tappable. Arriving from "Mark as read"
(router state `justRead`), the article's card plays a **send-off**: it holds its old
spot while it fades to the read look and the "Read ✓" stamp punches in, then (~1s)
sinks/collapses away and settles into the read group (~1.6s); the state is cleared
via `history.replaceState` so back/refresh don't replay it.

**Article view (`pages/ArticlePage.tsx`)**
- Renders `buildParagraphs(content)` from `lemmatize.ts`: text → sentences (split on
  `[.!?…]` + space) → grouped into ~340-char paragraphs → each sentence tokenized.
  Every word token is a `<button class="w">`; punctuation/whitespace are plain spans.
- Tap a word → `WordModal` opens with `{ display: tapped form, term: lemmaOf(form),
  sentence, articleId }`.
- Text selection (drag/long-press, must contain a space) → `WordModal` for the phrase
  (term = lowercased phrase).
- **Drop cap**: the article's first letter renders as a burgundy newspaper drop cap
  (`.dropcap`, floated, `--burgundy`) — its own tappable button that looks up the full
  first word. An elision opener (« L'or ») keeps the apostrophe inside the cap.
- **Highlighting**: `savedLemmas` = live Set of all `savedWords.lemma`; a token gets
  `.w--saved` when `lemmaOf(token)` is in the set — this is what makes *all inflected
  forms* of a saved word highlight.
- **Progress**: on mount, upserts `lastOpenedAt`; scroll position (0..1 of document)
  saved throttled (1s) and on unmount; restored on reopen unless the article is marked
  read. The article ends in a single **full-width** "Mark as read" button (the "Back
  to the library" button was removed): it saves and navigates back to the library with
  `state: { justRead }` to trigger the card send-off animation there; "Mark as unread"
  stays on the page.

**Lemmatization (`lib/lemmatize.ts` + `data/lemmas.json`)**
- `lemmas.json` is **generated at build time** by `scripts/build-lemmas.py`: spaCy
  `fr_core_news_sm` lemmatizes the whole corpus in context (majority vote per surface
  form), merged with the conjugation table (participles → infinitive; corpus votes win
  on conflict). Identity mappings are omitted; runtime falls back to the word itself.
  Regenerate **only if the corpus changes**: needs `pip install "spacy<3.8"` (system
  Python is 3.9) + `python -m spacy download fr_core_news_sm`.
- `lemmaOf(word)`: lowercase → elision prefixes map directly (`l'→le, j'→je, qu'→que`…)
  → table lookup → identity fallback.
- Tokenizer splits elisions (`l'étoile` → `l'` + `étoile`, separately tappable) but
  keeps non-elision apostrophe words whole (`aujourd'hui`) and hyphenated words whole.

**Dictionary (`lib/dictionary.ts`)** — online by design (decision: offline not
required). `lookup(term)`:
1. `lookupCache` hit → return (this is why seen words work offline).
2. Else, in parallel: English **Wiktionary REST**
   (`en.wiktionary.org/api/rest_v1/page/definition/{term}`, French section, max 3
   POS-tagged definitions, HTML stripped) + **MyMemory** translation
   (`api.mymemory.translated.net`, handles phrases).
3. Short gloss preference: first Wiktionary definition if ≤ 40 chars ("to eat" beats
   machine-translated "eating"), else MyMemory, else first definition.
4. Cache if anything was found. Both fetches fail-soft; UI shows "Could not reach the
   dictionary."
- Gotchas: MyMemory is slow sometimes (seconds) and rate-limited (~1000 word lookups
  /day/IP anonymous). Wiktionary needs no key and allows CORS.

**WordModal (`components/WordModal.tsx`)** — centered dialog over a blurred, darkened
backdrop (tap outside or Esc closes; the article underneath keeps its scroll position).
While the lookup is in flight, only the headline shows; everything below it (including
the save button) renders as shimmering **skeleton blocks** (`.skeleton--*`) that mirror
the final layout — real content appears only once the fetch resolves.
Shows, in this order and nothing else (by decision): the **base form** as the headline
(with a flat SVG speaker icon — `SpeakerIcon` in `icons.tsx` → `speech.ts`), the main
translation, **additional translations** (the definition lines with POS tags stripped,
deduped against the main translation; smaller secondary text), and the source sentence.
The tapped surface form is not displayed but is still saved as `display`, and the
stored `definition` keeps its full `(pos) …` lines — only the modal's rendering strips
them. **Save to Vocabulary** → `vocab.ts saveWord()` then closes the modal immediately;
if the lemma is already saved the button shows "In your vocabulary ✓" (live query).

## Module: Vocabulary

**Lemma normalization (by decision)** — the lexicon is keyed **and displayed** by
`lemma` everywhere: the list, match tiles, speech, and dictionary-search results all
show the base form. `display` still stores the surface form the learner met
(« mangeons ») because the Practice drill grades against it and blanks it out of the
saved sentence; it is never shown in the lexicon list. Dedup by lemma (in `saveWord`)
means one entry per base form, whatever inflection was saved.

**Lexicon (`pages/VocabularyPage.tsx`)** — the page opens with three colorful drill
launcher cards (per-mode identities from `lib/vocabThemes.ts`: Learn green, Practice
blue, Remember? gold) that share the tense-card look (same CSS rules, comma-joined
selectors). Below, the lexicon is split into two collapsible groups with count pills:
**Still Learning (n)** (red) and **Learnt (n)** (green), newest-first within each.
One compact row per word: lemma + translation, progress dots (learning words only —
filled dots = `streak`, promotion at 3), and three flat icon buttons (`icons.tsx`) —
🔊 listen, mark learnt (circled check) / back to learning (return arrow), delete
(trash, confirm dialog). The manual learnt toggle also aligns `streak` (3 or 0) so
dots and auto-progression agree. The old free-text add form, lexicon search bar and
shelf chips are gone (by decision) — the single search bar is the dictionary search.

**Automatic learning groups** — `practice.ts recordWordResult(word, correct)` runs
after every practice answer (typed prompt, or one match board = one answer per word
on it): correct → `streak + 1`, promoted to learnt at `LEARNT_STREAK = 3`; wrong →
`streak = 0` **and** demoted back to Still Learning (also for learnt words missed in
Remember?).

**Dictionary search (`lib/dictionarySearch.ts`)** — real-time, fully offline search of
the app's own dictionary: every lemma reachable from bundled content (article corpus
tokens through `lemmaOf`, all `lemmas.json` surface forms, the 100 verb infinitives).
Index is lazy-built on first keystroke (lemma → folded form strings); ranking is exact
form > prefix > substring (substring only from 3 chars), 8 results max. Searching an
inflected form finds its lemma (« étaient » → être). Each result shows the lemma, an
offline gloss when it's one of the 100 drilled verbs (`verbMeanings`), and either an
add button or "In your vocabulary ✓". Adding fetches the translation online via
`lookup()` (fail-soft) and saves with `display = lemma`, `sentence: ''`.

**Practice framework (`lib/practice.ts`)** — shared by all drills:
- `drawPracticeWords(limit, { learned?: 0|1, requireTranslation? })`: fresh shuffle
  every call; all three modes pass `requireTranslation: true`.
- `gradeAnswer(input, accepted: string[])` → `'correct' | 'accents' | 'wrong'`:
  case/whitespace-normalized exact match → correct; accent/ligature-folded match →
  `'accents'` (counts as a point, but UI shows the accented form); else wrong.
- `recordRound(tool, mode, score, total, tense?)` → appends to `practiceResults`.

**Exactly three practice modes (by decision — flashcards removed entirely):**

| Mode | Route | Session | Notes |
|---|---|---|---|
| Learn | `/vocabulary/learn` | 20 random Learning words → 5 match boards × 4 pairs | gated: needs 20 usable Learning words |
| Practice | `/vocabulary/practice` | 10 random Learning words, one typed prompt each — exercise type depends on the word's source (below) | accepts `display` (as met) or `lemma` (base form → warning); accent-tolerant |
| Remember? | `/vocabulary/remember` | up to 30 random Learned words → 5 match boards (6 pairs at 30+) | gated: needs 20 Learned words |

- **Practice exercise types by word source**: a word whose saved `sentence` still
  contains its `display` form (i.e. saved from an article) gets **fill-the-blank** —
  the sentence with a themed blank, English translation hidden behind a "Show
  translation" button; on grading the blank fills with the sentence's original
  occurrence (casing preserved). Everything else (dictionary-search adds have
  `sentence: ''`) gets **translate** — the EN translation typewriter-reveals as the
  prompt. Same single input, accent-key bar, in-input feedback as the conjugation
  drill.
- Learn and Remember? share `MatchSessionPage` + `MatchBoard`; a board is remounted
  (`key={round}`) per exercise; misses accumulate across the session; score = words
  never missed out of all words drawn. "Usable" means non-empty translation.
- **Spec note (Remember?)**: the brief asked for "20 words, 5 exercises of 6" — that's
  30 slots, impossible from 20. Resolution: gate at 20 Learned words, draw up to 30;
  with 30+ the session is exactly 5×6, with 20–29 boards split as evenly as possible.
- Practice grading: `display` match → correct; else `lemma` match → correct **with a
  base-form warning** («here it was *fait*»); else wrong (answer shown with base form).
- Gate messages render in the drill page itself; the launcher cards stay tappable.
- **Gotcha (StrictMode draw race)**: the mount effects in `PracticePage` and
  `MatchSessionPage` cancel their word draw on cleanup. StrictMode double-runs the
  effect in dev; without cancellation a stale draw resolving late swaps `words` under
  a mounted board while the tiles keep the old draw — and `recordWordResult` would
  write progress for words the learner never saw.

All three drills wear the conjugation drill's chrome: `DrillTopline` (back + title +
✓/✕ pill + `SoundPill`), gradient progress bar, `conj-stage` card with stripe/wash,
SFX (`sound.ts` — tap clicks, match ding, chime/buzz, fanfare), and all end in the
shared `DrillResults` card (confetti included) + `recordRound('vocabulary',
'learn' | 'practice' | 'remember', …)`.

- **Gotcha (MatchBoard)**: game state (selections, matched, missed) lives in **refs**,
  with React state only mirroring for display — two taps can land faster than a state
  commit and stale-closure state misjudged pairs. Don't "simplify" it back to state.

## Module: Conjugation

Typing-only (by decision). The UI was overhauled (2026-07) after the older Parcours
"Le Conjugueur" trainer, adapted to this design system — same logic, richer feel.

**Tense identity (`lib/tenseThemes.ts`)** — every tense has a color, family-grouped:
present green, past trio reds (light→dark), future pair blues, conditional pair
mauves, subjunctive gold; the mixed drill is a five-stop rainbow gradient. Cards,
badges, row tags, focus rings, progress fill and review chips all reuse these.

**Picker (`pages/ConjugationPage.tsx`)**: the full-width rainbow **"Mixed drill" card
opens the page** (the default/primary mode, by decision), followed by tense cards
grouped in family rows (labeled dash + hairline), each card with a color stripe, pale
wash, English hint ("I had done") and staggered entrance. Routes unchanged:
`/conjugation/:tense`.

**Session generator (`lib/conjugation.ts` — all randomization rules live here):**
- A session = **10 exercises**; each exercise = **one verb × 3 typed prompts**
  (reduced from 4 so a whole exercise fits on screen — see drill layout below).
- Verbs: `shuffle(verbList).slice(0, 10)` — never repeats within a session.
- Tenses: mixed mode → 3 *distinct* tenses per exercise, dealt from a running shuffled
  deck of all 9 that refills when empty — so a session spreads all 9 tenses almost
  evenly (each 3–4 times: 30 slots / 9 tenses). Specific-tense mode → all 3 prompts
  use that tense.
- Pronouns: 9-pronoun pool (`je, tu, il, elle, on, nous, vous, ils, elles`; **on uses
  the il column, slot 2**). Each exercise picks 3 from 3 *distinct* person×number
  categories, always **all three persons** and **both numbers** (2 sg + 1 pl or
  1 sg + 2 pl — 6 valid person-layouts in `PERSON_COMBOS`). Across the session, layout
  and pronoun choices are cost-ranked by usage so far (least-used wins, random
  tie-break) — balanced, "curated" feel.
- `ConjugationPrompt = { tense, pronoun, slot, answers: string[] }` — `answers` is the
  dataset form `split('|')` (être-verb gender variants; see Content data gotcha).
- `pronounDisplay(pronoun, tense, answers[0])`: elides je → `j'` before vowel/h; the
  subjunctive prompts as `que je / que j' / qu'il / que tu …`.

**Drill page (`pages/ConjugationDrillPage.tsx`)**
- **No-scroll layout (by decision)**: an active exercise fits a 375×667 viewport with
  zero vertical scrolling. Achieved by: the compact `DrillTopline` (back + title +
  live score pill `✓ n` + `SoundPill` on one line, replacing DrillHeader + HUD row),
  3 prompts, tightened stage paddings, exercise position in the stage counter
  (`N° n/10`), trimmed page padding (`.page:has(.conj-drill)`), and — on ≤560px —
  a single flexed accent-key row (label hidden) and the two-column prompt rows kept
  (96px lead) instead of stacking. Below the topline a thin progress bar carries the
  tense gradient. **There is no streak/strike counter (removed by decision).**
- The stage card carries the tense stripe + wash; the verb types itself in letter by
  letter (typewriter reveal, ~50ms/letter, skipped under reduced motion), then the
  first input is focused. **Check is disabled during the reveal and until all three
  inputs are filled.** In mixed mode each row shows its own colored tense tag and
  there is **no tense badge above the verb** (the "Mixte" badge was removed); the
  badge only appears in single-tense drills.
- All 3 inputs checked at once ("Check"); result state is baked into the input (green
  / amber / red border+tint), a ✓/✕ icon sits inside it, and the correct form(s)
  float in a tag above it (variants joined " / ") — no layout shift.
- **Correction gate (by decision)**: "Next" only appears when every input passes.
  Wrong inputs stay editable (correct/accents ones lock), focus jumps to the first
  wrong one, and the button reads "Check again" — it regrades *only* the still-wrong
  fields, so passed grades are kept. Score, the ✓ pill and the end-of-round review
  list count the **first attempt only**; corrections don't earn points.
- **Enter** in an input hops to the next *empty editable* input; only submits when all
  filled (after a fully-passed grading, Enter advances — the Next button takes focus).
- An accent-key bar (à é è ê î û ç) inserts at the caret of the focused input without
  stealing focus; it dims when no input is focused or the exercise is graded.
- SFX (`lib/sound.ts`, Web Audio, synthesized, now shared with Vocabulary):
  typewriter clacks on keystrokes and the verb reveal, chime on a clean exercise,
  match ding, buzz on any miss, fanfare at the end. Default on; the toggle persists
  in localStorage (key `conjugation-sfx`, kept from before the vocabulary drills
  adopted SFX) — device-local UI preference, deliberately not in the Dexie store.
- Inputs expose `data-tense` and `data-slot` (used by automated tests to compute
  expected answers from the dataset).
- Ends in the shared `DrillResults` card (gradient score, French headline, per-miss
  review list with your answer → correct form and per-tense item colors, confetti via
  `lib/confetti.ts`; `unit="form"`). `recordRound('conjugation', 'typing', score,
  30, mode)`.
- The tab-bar icon is a conjugation table (`ConjugationIcon` in `icons.tsx`); it
  replaced the fountain-pen nib, which read badly at 22px.

## Module: shell, PWA & misc

- **Layout** (`components/Layout.tsx`): masthead = the app icon (`/icons/icon-192.png`)
  as a small logo + "PARCOURS" in burgundy (`--burgundy`), no dateline (removed by
  decision), `<main class="page">`, bottom tab bar (Home / Reading / Vocabulary /
  Conjugation) with `NavLink` active states. Tab icons: house, open broadsheet,
  flashcards-with-letter-A, conjugation table (reading/vocabulary were redrawn
  2026-07-04 because the newspaper and notebook read too alike at 22px).
- **PWA** (`vite.config.ts`): `vite-plugin-pwa`, `registerType: 'autoUpdate'`; Workbox
  precaches *everything* including both JSON datasets (~200 KB gzipped total) — that is
  the offline story. Manifest: name/short_name "Parcours", theme `#F5F0E6`, icons
  192/512 + maskable + apple-touch. Icons were generated from SVG via macOS `qlmanage`
  (serif "P" on `#B3362A`, cream double border) — no checked-in SVG source.
- **Speech** (`lib/speech.ts`): online, words are spoken through Google Translate's
  free TTS endpoint (`translate_tts`, natural female French voice) played via an
  `Audio` element; offline or on any failure it falls back to `speechSynthesis` with
  a ranked preference for female/enhanced fr-FR voices (Amélie, Audrey, Denise…),
  rate 0.9. The endpoint is unofficial — if it ever breaks, the fallback still works.
  Feature-detected via `canSpeak()`; UI hides the speaker when unavailable.
- **Device code** (`lib/deviceCode.ts`): `word-word-NN` from a 32-word accent-free
  French list (~102k combinations — consider a third word before real sync).

## Sync status (ON HOLD)

Not implemented, deliberately: **no internet deployment for now** (user decision). The
desk code is generated and displayed on the dashboard; linking is unwired. Groundwork
already in place for a future last-write-wins sync: `updatedAt` on every record.
Known gaps to close when building it: word deletions need tombstones; the device code
needs more entropy; a small hosted key-value endpoint is required.

## Decisions log (do not re-litigate silently)

1. **No topic filters/tags** — removed from scope entirely.
2. **Dictionary/lemmatizer may require network** — offline-first not required for them.
3. **Vocabulary = exactly 3 practice modes** (Learn / Practice / Remember?) —
   flashcards were removed; the lexicon is displayed by lemma; the only manual-add
   path is the offline dictionary search.
4. **Conjugation = typing only**, with the session/randomization rules above.
5. **No deployment yet**; sync on hold.
6. **Renamed to Parcours**, but IndexedDB name stays `redaction`.
7. Root JSON data files are the user's originals — never modify them.
8. Nothing has been committed to git yet (repo initialized, user hasn't asked).
9. **Conjugation UI follows the old Parcours "Le Conjugueur" reference** (2026-07
   overhaul): tense color identities, typewriter verb reveal, Check gated on all
   fields filled, in-input feedback, accent-key bar, SFX on by default (with
   toggle), confetti results. The `data-tense`/`data-slot` test hooks were
   deliberately left untouched.
10. **Conjugation refinements (2026-07-04, user request)**: the streak/strike
    counter was removed entirely; exercises are 3 prompts (not 4) and an active
    exercise must fit on screen with no vertical scrolling (verified at 375×667);
    the Mixed drill card sits first on the picker as the primary mode; the nav icon
    is a conjugation table (the nib looked inappropriate).
11. **UI polish batch (2026-07-04, user request)**: masthead = app-icon logo +
    burgundy PARCOURS, dateline removed; first tab relabeled **Home**; reading &
    vocabulary tab icons redrawn to be distinct. WordModal shows layout-mirroring
    skeletons until the lookup resolves. Article view ends in one full-width "Mark
    as read" (back button removed) and the library plays the stamped→sinking card
    send-off; a **Read** chip joined the level filters. Pronunciation prefers Google
    Translate TTS (natural female voice) with Web Speech fallback. Conjugation:
    label "Conditionnel présent", no "Mixte" badge, SoundPill uses flat SVG
    speakers, and Next is gated until wrong answers are retyped (first attempt
    only is scored).
12. **Vocabulary progression & UX (2026-07-04, user request)**: the lexicon is two
    auto-managed groups — Still Learning / Learnt, with counts — driven by
    `streak` (3 correct answers in a row promotes; any miss demotes & resets; the
    manual toggle still exists and aligns `streak`). Practice exercise type depends
    on word source: article words → fill-the-blank with hidden revealable
    translation; manual adds → translate prompt. All vocabulary drills wear the
    conjugation design language (vocabThemes, DrillTopline/DrillResults/SoundPill,
    SFX, confetti); `RoundSummary` was deleted.

## Build-stage history

- Stage 1 — foundation: scaffold, PWA, design system, navigation, Dexie, dashboard.
- Stage 2 — Reading: library, article view, lemmatization, dictionary, highlighting.
- Stage 3 — Vocabulary: lexicon + three drills.
- Stage 4 — Conjugation: typing drill with curated randomization.
- Stage 5 — rebrand to Parcours done; device sync on hold (no deployment).
- Post-stage — Conjugation UI/UX overhaul (tense colors, typewriter feel, SFX,
  confetti) modeled on the old Parcours "Le Conjugueur"; logic unchanged.
- Post-stage 2 (2026-07-04) — Conjugation: streak removed, 3-prompt no-scroll
  exercises, mixed-first picker, new tab icon. Vocabulary: source-based practice
  exercises, automatic Still Learning / Learnt groups (`streak`), full adoption of
  the conjugation design language (shared DrillTopline/DrillResults/SoundPill).
- Post-stage 3 (2026-07-04) — polish batch across all modules: see decision 11
  (masthead logo, Home tab, distinct tab icons, WordModal skeletons, mark-as-read
  send-off + Read filter, Google-TTS pronunciation, conjugation correction gate).
