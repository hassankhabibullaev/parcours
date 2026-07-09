#!/usr/bin/env python3
"""Build the app's French form -> lemma tables from the Lefff lexicon.

Two artifacts are produced:

  1. src/data/lemmas.json  — a small BUNDLED core (every conjugated form of the
     100 drill verbs -> its infinitive). Ships in the JS bundle so common verbs
     lemmatize instantly, before the full lexicon has loaded.

  2. public/lemmas-fr.txt  — the FULL lexicon: one "form<TAB>lemma" line per
     non-trivial mapping drawn from the Lefff (Lexique des Formes Fléchies du
     Français, LGPL-LR). ~350k entries; lazy-loaded and cached at runtime.

Only non-identity mappings are stored — a form absent from the tables lemmatises
to itself, which is already correct for adverbs, masculine-singular nouns and
adjectives, infinitives, etc. When a form has several possible lemmas we prefer a
verb infinitive (so « est »→être, « suis »→être, « irai »→aller and participles
like « abandonnée »→abandonner resolve usefully), breaking ties on the shortest
lemma. Context-free, this cannot disambiguate true homographs (« livre » the book
vs. « livrer »), which is the small residual error.

Usage:
    python3 scripts/build-lemmas.py [path/to/lefff-3.4.mlex]

If no path is given the Lefff is downloaded from the node-lefff mirror to
scripts/.cache/ (needs network once; cached thereafter).
"""

import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / ".cache"
LEFFF_URL = "https://raw.githubusercontent.com/Poyoman39/node-lefff/main/src/lefff-3.4.mlex/lefff-3.4.mlex"

# A "word" for our purposes: letters, with internal hyphens/apostrophes.
WORD = re.compile(r"^[a-zà-öø-ÿœæ]+(?:['-][a-zà-öø-ÿœæ]+)*$")


def lefff_path() -> Path:
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    CACHE.mkdir(exist_ok=True)
    local = CACHE / "lefff-3.4.mlex"
    if not local.exists():
        print(f"Downloading Lefff → {local} …")
        urllib.request.urlretrieve(LEFFF_URL, local)
    return local


def drilled_verb_forms() -> set[str]:
    """Every surface form produced by the 100 drilled verbs."""
    verb_data = json.loads((ROOT / "conjugation_verbs.json").read_text())
    forms: set[str] = set()
    for tenses in verb_data["verbs"].values():
        for row in tenses.values():
            for form in row:
                for variant in form.split("|"):
                    # Compound tenses store "ai parlé" — the last token inflects.
                    last = variant.split()[-1].lower()
                    if WORD.match(last):
                        forms.add(last)
    return forms


def parse_lefff(mlex: Path) -> dict[str, dict[str, bool]]:
    """form -> {candidate lemma -> is_verb}."""
    lemmas_of: dict[str, dict[str, bool]] = {}
    with mlex.open(encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            form, cat, lemma = parts[0].lower(), parts[1], parts[2].lower()
            if not WORD.match(form) or not WORD.match(lemma):
                continue
            entry = lemmas_of.setdefault(form, {})
            entry[lemma] = entry.get(lemma, False) or cat.startswith("v")
    return lemmas_of


def build_full_lexicon(
    lemmas_of: dict[str, dict[str, bool]],
) -> tuple[dict[str, str], dict[str, str]]:
    """Pick one lemma per surface form, plus a noun override for homographs.

    The PRIMARY table prefers a verb infinitive — this maps the ultra-common
    function words the right way (« est »→être, « a »→avoir, « suis »→être,
    « irai »→aller) and connects participles to their verb (« abandonnée »→
    abandonner); ties break on the shortest lemma. A form with no non-identity
    candidate is omitted and lemmatises to itself at runtime, which is already
    correct for adverbs, base nouns and adjectives.

    The verb preference is right when the form is actually used as a verb, but
    wrong for the noun/adjective reading of a verb/noun HOMOGRAPH (« le livre »
    the book, not livrer). For those forms we also record the best non-verb
    lemma; the runtime picks it when local context (a preceding determiner) says
    the word is a noun. Only recorded when the form has both a verb reading and a
    distinct non-verb reading, so it stays a targeted override, not a second
    guess for every word."""
    table: dict[str, str] = {}
    homograph_noun: dict[str, str] = {}
    for form, cands in lemmas_of.items():
        others = [l for l in cands if l != form]
        if not others:
            continue
        primary = min(others, key=lambda l: (0 if cands[l] else 1, len(l), l))
        table[form] = primary

        # A verb/noun homograph: a verb reading (the primary) alongside a
        # distinct non-verb reading. Prefer the form itself when it's one of the
        # non-verb lemmas — that's meaning-safe (« cours »→cours, « porte »→
        # porte), never flipping to an unrelated shorter noun (« cours »→cour);
        # otherwise take the shortest, which reduces a plural to its singular
        # (« livres »→livre). Skip when it would equal the primary.
        if not cands[primary]:
            continue  # primary is already a noun/adj — no verb bias to correct
        nonverbs = [l for l in cands if not cands[l]]
        if not nonverbs:
            continue
        noun = form if form in nonverbs else min(nonverbs, key=lambda l: (len(l), l))
        if noun != primary:
            homograph_noun[form] = noun
    return table, homograph_noun


def main() -> None:
    lemmas_of = parse_lefff(lefff_path())
    full, homograph_noun = build_full_lexicon(lemmas_of)

    # The bundled core is a slice of the full table (drilled-verb forms only) so
    # the two never disagree — it just makes common verbs lemmatise instantly,
    # before the full lexicon has finished loading.
    core = {form: full[form] for form in drilled_verb_forms() if form in full}

    core_out = ROOT / "src" / "data" / "lemmas.json"
    core_out.write_text(
        json.dumps(core, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        + "\n"
    )

    # Each line is "form<TAB>lemma"; a verb/noun homograph adds a third column,
    # "form<TAB>verblemma<TAB>nounlemma", read by the context-aware runtime.
    full_out = ROOT / "public" / "lemmas-fr.txt"
    lines = []
    for form, lemma in sorted(full.items()):
        noun = homograph_noun.get(form)
        lines.append(f"{form}\t{lemma}\t{noun}" if noun else f"{form}\t{lemma}")
    full_out.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"core (bundled):  {len(core):>7,} entries → {core_out.relative_to(ROOT)}")
    print(f"full (lazy):     {len(full):>7,} entries → {full_out.relative_to(ROOT)}")
    print(f"  homographs:    {len(homograph_noun):>7,} with a noun override")
    print(f"full size:       {full_out.stat().st_size / 1024:.0f} KB raw")


if __name__ == "__main__":
    main()
