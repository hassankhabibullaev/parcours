# Rédaction — General Feature Overview

Rédaction is a French-learning app built around a "newspaper editor's desk" concept. Three tools share one continuous memory of the learner's progress: Reading, Vocabulary, and Conjugation. Below is a general description of what each does. This is meant as a brief for rebuilding the app as a single cohesive product — the current build grew in phases and ended up with the conjugation trainer running as a separate embedded mini-app; the rebuild should make all three tools feel and behave as one unified app instead.

## Reading

A library of short French articles, filterable by CEFR level (A1–C2) and topic, each tagged with an estimated reading time. Opening an article gives a clean reading view where tapping any word looks it up — showing its dictionary base form, an English translation, the sentence it appeared in, and a spoken pronunciation — with an option to save the word (or a selected phrase) to a personal vocabulary list. Words already saved should be highlighted automatically everywhere they reappear, including other grammatical forms of the same word (this requires proper lemmatization — reducing an inflected word to its base/dictionary form — as a core capability, not tied to any particular word list or rule set). Articles can be marked as read, and reading progress is remembered per article.

## Vocabulary

A personal lexicon of every word or phrase the learner has saved, each showing its translation, definition and original sentence. Words can also be searched or added by hand directly. A practice section offers active-recall drills built from the saved words: flashcards, a matching game, multiple choice, and fill-in-the-blank — each ending with a score and the option to retry. Once user marks the word learned, those words should be excluded from the exercises.

## Conjugation

A verb-conjugation trainer covering the main French tenses/moods (present, past forms, future forms, conditional forms, subjunctive) plus a "mixed" mode that draws from all of them in one round. Learners pick a tense, then an answer style (typing the form, multiple choice, or matching pronouns to forms), and work through a short round of questions with a live score and streak. Answers should tolerate minor accent mistakes without marking them fully wrong, while still showing the correct accented form. Each round ends with a score summary and a review of anything missed, and results feed into the same shared progress as the other two tools.

## Shared progress & home dashboard

All progress (reading history, saved vocabulary, conjugation results) is stored locally on the device first, so the app works fully offline, and syncs across the learner's own devices without requiring an account — just a short, memorable code generated on first use that can be entered on another device to link them. A simple home dashboard shows overall stats (words saved, articles read, conjugation rounds completed), a shortcut back into whatever article was last being read, and the device-linking code. No authentication required. The progress should be tied to the device and it should allow link multiple devices using the code displayed.

## General expectations

The app should be installable as a standalone mobile app (add-to-home-screen) and remain usable offline once content has been loaded. It should feel like one coherent application throughout — consistent look, feel, and navigation across all three tools — rather than separate tools stitched together.

---

# Existing resources included

- **`articles_corpus.json`** — the existing library of ~100 French articles used by the Reading pillar. Each entry includes an id, CEFR level, title (with an English translation of the title), word count, and the full article text. This can be reused directly as the starting content library instead of writing new articles from scratch.
- **`conjugation_verbs.json`** — the existing verb conjugation dataset used by the Conjugation pillar: for each verb, its conjugated form across all tenses/moods, plus a short English meaning for the verb. This can be reused directly instead of re-collecting conjugation data.
