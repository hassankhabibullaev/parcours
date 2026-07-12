# Parcours

**Parcours** is a French-learning PWA styled as a newspaper editor's desk. Four sections —
**Reading**, **Vocabulary**, **Conjugation** and **Profile** — share one local-first store of
the learner's progress (IndexedDB via Dexie). It is a single-page React app, installable to
the home screen, and works offline (only dictionary lookups and pronunciation need the
network).

This README is the onboarding map for someone (or some model) picking up the code cold:
what the app does, how it's organized, and which file to open next. Read a module's source
for the fine detail. The original product brief is in [OVERVIEW.md](OVERVIEW.md).

## Guest-first access model

The app is **usable without an account**: anyone can read articles, browse the conjugation
reference and do conjugation practice. An account is required only for actions that write
personal progress — **marking an article read, saving vocabulary, and the vocabulary
drills** — plus cross-device sync. When a guest triggers a gated action, an auth-required
modal explains what an account unlocks and offers the sign-in page; the guest can dismiss it
and keep browsing. See `components/AuthGate.tsx` (`useAuthGate().requireAuth(reason)` guards
each call site; drill pages a guest reaches by URL render an inline `GuestNotice`).

**Sign-in is one unified email + one-time-code form** (`pages/SignInPage.tsx`): enter an
email, receive a 6-digit code, type it in. A first-time email gets its account created on
verification; a known email logs in — there is no separate register screen and no password.

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

Pages Functions don't run under `vite dev`, so `vite.config.ts` mirrors three of them with
dev middleware: `devAccountApi` (in-memory OTP store; the code is returned in the response
and printed to the terminal), `devKudosApi` (no mail in dev — the note is printed to the
terminal) and `devTtsProxy` (pronunciation). Sync (`/api/sync`) is not mirrored, so it's a
no-op in dev. Keep the mirrors in step with the real Functions. The PWA manifest and
service worker are only emitted by `npm run build`.

## Deployment

- **GitHub** repo: `parcours`. **Hosting**: Cloudflare Pages project `parcours` →
  https://parcours.pages.dev.
- `wrangler.toml` holds the project name, `dist` output dir, and the `SYNC_KV` KV binding
  (the namespace `id` there is a binding identifier, not a secret).
- Deploy the built app with `wrangler pages deploy dist --project-name=parcours` (it also
  compiles `functions/`). Deploys run on the machine's current Node with wrangler 4.x.
- **Sign-in email delivery is LIVE through Resend.** Two Pages secrets drive it:
  `RESEND_API_KEY` (a sending-scoped key) and `OTP_FROM` (the sender, a verified-subdomain
  address like `Parcours <noreply@mail.example.com>`). Set/rotate either with
  `npx wrangler pages secret put <NAME> --project-name=parcours`, **then redeploy** so the
  Function picks it up. The email body is a branded HTML template (`otpEmailHtml()` in
  `functions/api/account.ts`) matching the app's newspaper-desk look, with a plain-text
  fallback. **If `RESEND_API_KEY` is ever missing or a send fails, the endpoint falls back to
  returning the code in the response (`devCode`) and the client shows it inline** — sign-in
  never breaks. The dev mirror in `vite.config.ts` always uses this inline path (no mail in
  dev). Confirm delivery after a deploy: `curl -s -X POST
  https://parcours.pages.dev/api/account -H 'Content-Type: application/json' -d
  '{"action":"request-code","email":"you@example.com"}'` → `{"ok":true}` with no `devCode`
  means the mail was accepted. The same two secrets also power **kudos**
  (`functions/api/kudos.ts`): Profile → Settings lets a signed-in learner email a short
  thank-you note to the developer's inbox.

## Project layout

```
articles_corpus.json         source data: 200 articles, 50 per level A1–B2 (root, never modified)
conjugation_verbs.json       source data: 100 verbs × 9 tenses (root, never modified)
scripts/build-lemmas.py      regenerates the lemma tables from the Lefff lexicon
index.html · vite.config.ts  meta/PWA tags · PWA manifest, dev API mirrors, port
wrangler.toml                Cloudflare Pages config + KV binding
functions/api/account.ts     email + OTP sign-in over KV (hashed codes, rate limits, Resend)
functions/api/kudos.ts       signed-in kudos → email relay to the developer (Resend)
functions/api/sync/[code].ts server-side sync merge (last-write-wins) over KV
functions/api/tts.ts          same-origin pronunciation proxy for Google TTS
public/icons/                app icons ("P" seal); public/lemmas-fr.txt (GENERATED, lazy-loaded)
src/
  main.tsx · App.tsx         bootstrap (router, SW reg, providers, migrations) · routes
  styles/global.css          the entire design system
  data/content.ts            typed exports of both datasets + TENSES metadata
  data/tenseGuide.ts         the Learn tab's grammar reference content (9 tense guides)
  data/expressions.ts        curated fixed expressions + glosses for phrase-aware taps
  data/lemmas.json           GENERATED bundled lemma core — do not hand-edit
  lib/                       the logic layer (see table)
  components/                Layout, AuthProvider, AuthGate, SectionTabs, icons, modals, drill chrome
  pages/                     one file per route
```

`src/lib/`:

| Concern | File |
|---|---|
| Shared IndexedDB store & schema | `db.ts` |
| Identity (email + OTP) + session + account wipe on logout | `auth.ts` (+ `components/AuthProvider.tsx`) |
| Guest gating (`requireAuth`, auth-required modal, `GuestNotice`) | `components/AuthGate.tsx` |
| User prefs: CEFR level (synced kv) + audio toggles (localStorage) | `settings.ts` |
| One-shot local data passes (gloss template, streak split) | `migrate.ts` |
| Article read/position write path | `articleProgress.ts` |
| Account sync client | `sync.ts` |
| Struggle-weighted draw (words + verbs, one algorithm) | `struggle.ts` |
| Lemma lookup, tokenizer, paragraph/sentence splitting | `lemmatize.ts` |
| Fixed-expression + reflexive-verb detection in sentences | `expressions.ts` (+ `data/expressions.ts`) |
| Online dictionary (Wiktionary + MyMemory) with cache + gloss template | `dictionary.ts` |
| Offline lemma search over bundled content | `dictionarySearch.ts` |
| Save a word to the lexicon (single write path) | `vocab.ts` |
| Practice drawing, grading, session sizing, streak/shelf progression | `practice.ts` |
| Conjugation session generator + pronoun display | `conjugation.ts` |
| Conjugation needs-work list (verb×tense mistakes → mastery) | `conjStruggles.ts` |
| Per-tense / per-mode color identities | `tenseThemes.ts` · `vocabThemes.ts` |
| Sound effects · confetti · French speech (TTS) | `sound.ts` · `confetti.ts` · `speech.ts` |

## Routes (`src/App.tsx`)

`/signin` is a full-screen route (no nav); everything else renders inside `Layout` (masthead
+ 5-tab bottom nav: Reading · Vocabulary · **Home** · Conjugation · Profile). There is **no
auth wall** — signed-out users land on the app; `SignInPage` redirects back to where they
came from on success (and if an already-signed-in user lands there).

Every section opens with its name as a page heading; the non-Home sections then follow one
layout template: **section name header → two tabs → content** (`components/SectionTabs.tsx`).
Reading shows a small "N articles" line for whatever the tab + level filter currently
displays (the tabs and filter chips themselves carry no counts).

| Path | Page |
|---|---|
| `/` | HomePage (read-next suggestion + vocab shortcut + practice quick-launch) |
| `/reading` · `/reading/:id` | article library (Not read/Read tabs + level filter) · article view |
| `/vocabulary` | Learn (word lookup + lexicon w/ All·Learning·Learned pills) / Practice (3 drills) tabs |
| `/vocabulary/learn` · `/vocabulary/practice` · `/vocabulary/remember` | the three vocab drills |
| `/conjugation` | Learn (tense rules + verb reference) / Practice (tense picker) tabs |
| `/conjugation/guide/:tense` | one tense's rules, endings, examples, live tables |
| `/conjugation/verb/:infinitive` | one verb's full conjugation across all 9 tenses |
| `/conjugation/:tense` | conjugation typing drill (`:tense` is a `TenseKey` or `mixed`) |
| `/profile` | Profile (email, stats, log out) / Settings (level + audio toggles + kudos) tabs |
| `/signin` | unified email + one-time-code sign-in |
| `/practice` · `/settings` | legacy redirects → `/conjugation?tab=practice` · `/profile` |

## Storage (`src/lib/db.ts`)

One Dexie database named **`redaction`**. Every record carries `updatedAt` (ms epoch) so
sync merges devices last-write-wins. Booleans are stored as `0 | 1` (IndexedDB can't index
booleans).

| Table | Holds |
|---|---|
| `savedWords` | the lexicon; keyed by `lemma`; per-exercise streaks drive learnt/learning |
| `articleProgress` | per-article read flag + scroll position |
| `practiceResults` | one row per finished drill round |
| `kv` | small key/value store (sync code, last-sync time, `userLevel`, `conjStruggles`, migration flags) |
| `lookupCache` | dictionary cache — never synced |
| `tombstones` | deletion records so sync can propagate removals |
| `drillStats` | per-item error-rate + last-seen for the struggle-weighted draw — device-local, never synced |

Logout clears every table (not `db.delete()`): the app stays mounted as a guest after
sign-out, so its live queries would block a whole-database delete — clearing wipes the same
data and updates those queries reactively.

`lib/migrate.ts` runs one-shot local passes at boot (kv-flagged): re-templating stored
translations and splitting the legacy single `streak` into the per-exercise counters.

## Content data (`src/data/content.ts`)

- **Articles**: 200 entries `{ id, cefr_level, title, title_en, word_count, content }` (50
  per level, A1–B2). The JSON is level-interleaved in file order, so `content.ts` sorts
  `articles` by CEFR level then id once. Single text block; paragraphs synthesized at render.
- **Verbs**: `verbs[infinitive][tenseKey]` → 8 forms (`je…elles`); `verbMeanings` → English;
  `TENSES` lists the 9 tense keys/labels. Some être-verb forms carry pipe-separated
  gender/number variants (`"es passé|es passée"`) — split on `|`, accept every variant,
  display joined with `/`.
- **Tense guides** (`src/data/tenseGuide.ts`): static teaching text per tense (usage,
  formation, endings, examples, traps); the example tables next to it render live from the
  verb dataset so the guide can't drift from what the drills grade.

## Modules (brief)

- **Auth & sync** — `auth.ts` implements the email + OTP flow against
  `functions/api/account.ts`: `request-code` stores a hashed 6-digit code in KV
  (`otp:<email>`, 10 min TTL, 5 attempts, per-IP and per-email rate limits) and emails it
  via Resend; `verify-code` checks it and creates `acct:<email>` on first use. The session
  (`{ email }`) lives in localStorage (`parcours-user`); sync is keyed by
  `deriveSyncCode(email)` — a SHA-256 hash, so the raw address never hits a URL/server.
  Legacy `{ username }` sessions from the password era are kept signed in under the same
  identifier (same sync bucket); old `acct:<username>` records are orphaned — a legacy user
  who logs out must sign in with email and starts a fresh bucket. `sync.ts` pushes the
  device's full state, the Function merges it last-write-wins, and applies the result.
  Two invariants: tombstones must round-trip with their `key` field, and `syncNow()` never
  rejects (`{ ok:false, error }`) so the UI can't stick. `Layout` auto-syncs on
  load/refocus (no-op until a first sync sets `lastSyncAt`).
- **Reading** — `ReadingPage` (Not read/Read tabs + a per-CEFR-level filter chip row; the
  default chip follows the Profile → Settings level) and `ArticlePage` (tappable word
  tokens, **one tap**, no drag selection; tap → `WordModal` lookup/save; drop cap,
  saved-lemma highlighting, scroll-progress, typewriter headline, optional read-aloud
  headline). A tap inside a **recognised fixed expression picks up the whole phrase**
  (« grâce à » → "thanks to", « a besoin d'eau » → avoir besoin de, « s'est passé » →
  se passer) — see the Expressions module below. Progress writes go through
  `articleProgress.ts` and are skipped for guests.
- **Vocabulary** — two tabs. **Learn**: the word lookup (offline lemma search; each result
  shows its short translation inline and opens the article-style `WordModal` with an
  add action) and the lexicon (All/Learning/Learned pill filters; tapping a word opens the
  same modal fed from its stored content, no add action; the first-line translation is
  inline-editable). A learning word's row carries five progress dots — one per required
  consecutive correct answer: 3 green (Word Match) + 2 blue (Fill in the Blank), lit from
  the per-exercise streaks. **Practice**: the three drills. Translations follow **one template per
  part of speech** (`normalizeGloss` in `dictionary.ts`: verbs always "to …", qualifiers
  stripped, first sense only), applied at fetch time and to stored words by migration.
- **Practice rules** (`practice.ts`) — every drill needs **5 words** in its pool.
  Word Match & Remember?: 5 words/session, `sessions = min(6, floor(pool/5))`.
  Fill in the Blank: 1 word/session, `sessions = clamp(pool, 5, 10)`; a wrong answer allows
  retrying without showing the solution (separate « Reveal answer » button; the English
  hint button reads « Show hint in English »). A fully-correct session **auto-advances**
  after a short pause with every control frozen. Words graduate at **3 consecutive correct
  in Word Match/Remember? or 2 in Fill in the Blank** (independent counters; hitting either
  promotes); one miss is forgiven, **two consecutive misses** reset that exercise's streak
  (and demote a learnt word). Manual mark-learnt/unlearnt aligns both counters. Draws are
  struggle-weighted (`struggle.ts`): each answer updates a `drillStats` row (EWMA error
  rate + last-seen), and the draw favours high-error, not-recently-seen items.
- **Conjugation** — two tabs. **Learn**: a **needs-work list** (see below), then nine tense
  guides (`/conjugation/guide/:tense`) and a searchable list of all 100 drilled verbs, each
  opening its complete conjugation (`/conjugation/verb/:infinitive`). **Practice**: the tense
  picker → typing drill (10 exercises × 3 prompts, struggle-weighted verb draw,
  accent-tolerant grading, auto-advance on all-correct). A **wrong answer's correction is
  blurred** and only un-blurs on tap (`conj-field__tag--blur` → « Reveal »), so the learner
  gets a beat to recall it from memory rather than being handed the answer; an accent slip
  (graded correct) still shows its corrected form outright in green.
- **Needs-work list** (`lib/conjStruggles.ts`) — every verb×tense pair missed in the typing
  drill, shown at the top of Conjugation → Learn with a tense badge and progress dots, kept
  until the learner gets that pair right **3 consecutive trials** (`CONJ_MASTERY_STREAK`; a
  row links to the verb's full conjugation to study the flagged tense). One exercise is one
  trial per pair — the pair counts correct only when every prompt for it was right first try
  (accent slips count as correct, matching the drill's score); a miss resets the streak and
  re-adds it. Stored as one JSON blob in the **synced `kv`** store (key `conjStruggles`), so
  it rides the existing last-write-wins kv sync with no schema or server change. The drill
  records it from `check()` on the first attempt, alongside the per-verb struggle stat.
- **Profile** — two tabs. **Profile**: email, progress stats, Log Out (guests get a
  sign-in card). **Settings** (`lib/settings.ts`): the **current level** (empty by default;
  when set it drives Home's read-next suggestion and Reading's default filter — exact-level
  match, falling back to all levels when that level is exhausted; stored in synced kv) plus
  three audio toggles (sound effects · read titles aloud · pronounce looked-up words —
  the latter two device-local in localStorage), and a **kudos card**: a signed-in learner
  can email a short thank-you note (≤280 chars) to the developer via `/api/kudos`
  (`src/lib/kudos.ts`; the Function checks the email has an account, rate-limits, and
  relays through the same Resend setup as the sign-in codes — guests see the sign-in
  prompt instead).
- **Expressions** (`lib/expressions.ts` + `data/expressions.ts`) — fixed-phrase detection
  so taps translate phrases in context, not words in isolation. Two detectors run per
  sentence: (1) a curated list (~190 locutions with hand-written template-conform glosses,
  tuned against the corpus's n-grams) matched greedily leftmost-longest — an expression
  token matches a word's surface **or its lemma** (infinitives match conjugated forms:
  « ont besoin de » → avoir besoin de; elisions match through ELISIONS: « bien qu' » →
  bien que), and a **final** de/à also accepts its contractions (« près du sol », « grâce
  aux »; final only — « du nouveau modèle » must not read as de nouveau); (2) a generic
  reflexive rule: « se/s' + verb » (and « s'est + participle ») becomes the reflexive
  infinitive (« se trouve » → se trouver "to be located"), gated on a verb-shaped lemma
  (-er/-ir/-re/-oir) so pronouns (« s'il », « s'y ») stay out. Matches never cross
  punctuation. The curated gloss renders instantly (offline too) as the modal's first
  line via `lookup(term, { gloss })`; Wiktionary still fills the definition lines, and
  the phrase saves/highlights/drills exactly like a word (`display` = the surface span,
  so Fill in the Blank blanks the whole phrase). ~2.2k matches across the 200 articles
  (~11/article). A tap outside any expression still looks up the single word.
- **Lemmatizer** (`lib/lemmatize.ts` + `scripts/build-lemmas.py`) — the surface-form → base-form
  map. `lemmaOf()` is a synchronous `Map` lookup (self-fallback, never invents a word),
  seeded by a bundled core (`data/lemmas.json`) and augmented by the full Lefff lexicon
  (`public/lemmas-fr.txt`, ~400k lines, fetched once and cached in Cache Storage). Each line is
  `form⇥flags⇥default⇥noun⇥adj`: `flags` are the form's readings — n(oun) a(djective) and the
  verb readings f(inite) p(ast participle) g(present participle) i(nfinitive); `default` is the
  context-free lemma (verb-preferred); `noun`/`adj` are the lemmas to use when context says the
  word is nominal/adjectival (present only when they differ from the default). **`lemmatizeTokens()`
  is a left-to-right noun-phrase state machine** — not just a determiner check — that reads each
  homograph the way its position demands: determiners/prepositions/numbers open a noun phrase whose
  words read nominally (`le livre`→livre, `en marche`→marche), the closed prenominal-adjective set
  stays adjectival before the head (`la belle porte`→porte) and post-head adjectives resolve as
  adjectives (`la porte ouverte`→ouvert); a word the phrase can't absorb is the clause verb again
  (`la marche rapide fatigue`→fatiguer); subject/object clitics force a verb (`je livre`→livrer,
  `il la ferme`→fermer); être/copulas put the next word in attribute position — adjective
  (`il est ferme`→ferme), noun (`il est guide`→guide), or an être-verb/reflexive participle
  (`elle est passée`→passer, `s'est formée`→former); after avoir a participle is the compound past
  (`a marché`→marcher) and a non-participle noun reading is a noun (`on a cours`); a capitalized
  mid-sentence word (or a sentence-initial name before a finite verb) is a proper noun
  (`Marie porte`→porter). Closed classes (determiners, pronouns, prepositions, être/avoir forms) are
  curated TS sets; the open classes come from the lexicon flags. ~20% of corpus tokens get a
  context lemma different from the bare default. **Gotcha:** changing the `lemmas-fr.txt` format
  requires bumping `LEXICON_CACHE` in `lemmatize.ts` (now `v3`), or returning users keep the stale
  cached file; regenerate the tables with `python3 scripts/build-lemmas.py`.
- **Pronunciation** (`speech.ts` + `functions/api/tts.ts`) — plays Google Translate's French
  voice through our own same-origin proxy, decoded and played via the shared Web Audio
  `AudioContext` (**not** an `<audio>` element — avoids the iOS Now-Playing/Dynamic-Island
  hijack and survives backgrounding). Offline/dev falls back to `speechSynthesis`.

## Conventions (don't re-litigate silently)

1. Root JSON data files are the user's originals — never modify them.
2. No topic filters/tags — out of scope. Corpus is A1–B2 only (no C1/C2).
3. The dictionary (word lookups) is online; the lemmatizer fetches its lexicon once, then
   works offline from Cache Storage.
4. Vocabulary is exactly three drills (under Vocabulary → Practice); the lexicon is
   displayed by lemma; the only manual-add path is the word lookup on the Learn tab.
5. Conjugation practice is typing only. Reading is one tap, no drag selection — but a tap
   inside a recognised fixed expression (data/expressions.ts) looks up the whole phrase.
6. Practice draws are struggle-weighted (words and verbs), one shared algorithm; `drillStats`
   is device-local (never synced).
7. Sign-in is **email + one-time code** — one form for new and existing accounts, no
   passwords; the email hash is the sync key. Reading and conjugation are open to guests;
   everything that writes personal progress is gated behind `requireAuth`
   (`components/AuthGate.tsx`). Codes are emailed via Resend (live); if a key is missing or a
   send fails the server returns the code in the response (shown inline) so sign-in still
   works.
8. First-line translations follow one template per part of speech (verbs "to …"); apply it
   wherever translations are produced or stored (`normalizeGloss`), never ad hoc.
9. Session sizing and streak thresholds live in `practice.ts` as named constants — drills
   read them, they never hardcode counts.
10. A neutral `confirmTock` (not the celebratory `successChime`) acknowledges save-type
    actions (marking an article read, saving a word); drills keep the chimes/fanfare.
11. Renamed to Parcours, but the IndexedDB name stays `redaction`.
12. Zoom is disabled app-wide (viewport meta + gesture/wheel/key guards in `main.tsx`).
