#!/usr/bin/env python3
"""Build src/data/lemmas.json — a surface-form -> lemma map for the app.

Coverage comes from two sources:
  1. Every conjugated form in conjugation_verbs.json (participles for the
     compound tenses), mapped to the infinitive.
  2. Every word in articles_corpus.json, lemmatized in context by spaCy's
     French model, with a majority vote when the same surface form gets
     different lemmas in different contexts. Corpus votes win over the verb
     table because they are context-aware (e.g. "porte" the noun vs "porter").

Identity mappings (form == lemma) are dropped; the runtime falls back to the
word itself.

Usage:
    <python-with-spacy> scripts/build-lemmas.py
Requires: pip install spacy && python -m spacy download fr_core_news_sm
"""

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

import spacy

ROOT = Path(__file__).resolve().parent.parent
WORD_RE = re.compile(r"[a-zà-öø-ÿœæ]+(?:-[a-zà-öø-ÿœæ]+)*")

articles = json.loads((ROOT / "articles_corpus.json").read_text())
verb_data = json.loads((ROOT / "conjugation_verbs.json").read_text())

lemmas: dict[str, str] = {}

# 1. Verb table: exact form -> infinitive (last token catches participles in
#    compound tenses like "ai parlé").
for infinitive, tenses in verb_data["verbs"].items():
    for forms in tenses.values():
        for form in forms:
            last = form.split()[-1].lower()
            if last != infinitive:
                lemmas[last] = infinitive

# 2. Corpus: context-aware lemmas with a majority vote per surface form.
nlp = spacy.load("fr_core_news_sm")
votes: dict[str, Counter] = defaultdict(Counter)
texts = [t for a in articles for t in (a["title"], a["content"])]
for doc in nlp.pipe(texts):
    for tok in doc:
        form = tok.text.lower()
        lemma = tok.lemma_.lower()
        if WORD_RE.fullmatch(form) and WORD_RE.fullmatch(lemma):
            votes[form][lemma] += 1

for form, counter in votes.items():
    lemma = counter.most_common(1)[0][0]
    if lemma != form:
        lemmas[form] = lemma
    elif form in lemmas:
        # Corpus says this form is its own lemma; drop the verb-table guess.
        del lemmas[form]

out = ROOT / "src" / "data" / "lemmas.json"
out.write_text(
    json.dumps(lemmas, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"
)
print(f"{len(lemmas)} form->lemma entries -> {out}")
