#!/usr/bin/env python3
"""Build the app's French form -> lemma tables from the Lefff lexicon.

Two artifacts are produced:

  1. src/data/lemmas.json  — a small BUNDLED core (every conjugated form of the
     100 drill verbs -> its infinitive). Ships in the JS bundle so common verbs
     lemmatize instantly, before the full lexicon has loaded.

  2. public/lemmas-fr.txt  — the FULL lexicon drawn from the Lefff (Lexique des
     Formes Fléchies du Français, LGPL-LR), lazy-loaded and cached at runtime.
     One line per form, tab-separated with empty trailing fields trimmed:

         form  flags  default  noun  adj

     `flags` says which readings the form has — n(oun), a(djective), and for
     verb readings f(inite), p(ast participle), g(present participle),
     i(nfinitive). `default` is the context-free lemma (empty = the form
     itself); `noun`/`adj` are the lemmas to prefer when sentence context says
     the word is used nominally/adjectivally, present only when they differ
     from the default. Forms with no non-identity lemma and no flags are
     omitted entirely — they lemmatise to themselves, which is already correct.

The DEFAULT lemma prefers a verb infinitive — this maps the ultra-common
function words the right way (« est »→être, « a »→avoir, « irai »→aller) and
connects participles to their verb (« abandonnée »→abandonner); ties break on
the shortest lemma. Context-free, this misreads the nominal side of verb/noun
homographs (« le livre » the book, not livrer) — which is exactly what the
noun/adj columns + the runtime's contextual rules (lib/lemmatize.ts) fix.

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

# Lefff morphology tags: UPPERCASE letters are mood/tense (lowercase are
# person/gender/number). We fold them into four verb-reading flags.
FINITE_MOODS = set("PFIJCSTY")  # indicative/subjunctive/conditional/imperative

# Only open/content categories contribute lemma candidates. Determiner,
# pronoun and clitic categories carry grammatical artifacts as lemmas
# (« il » → cln, « de » → un, « ça » → çaimp) that would pollute the default
# table; the runtime classifies those closed classes itself.
CONTENT_CATS = {
    "v", "auxAvoir", "auxEtre", "nc", "adj", "np", "adv", "prep", "csu", "coo",
}


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


def parse_lefff(mlex: Path):
    """Per form: {candidate lemma -> is_verb}, plus reading flags.

    `lemmas_of` mirrors the historical default-lemma computation (every
    category is a candidate; a lemma counts as verbal when any of its lines'
    categories starts with "v"). `flags_of` records which READINGS the form
    has — only open classes the runtime disambiguates (nc / adj / verbs
    incl. auxiliaries); function-word categories are curated in TypeScript.
    `noun_of` / `adj_of` collect the lemma candidates per reading.
    """
    lemmas_of: dict[str, dict[str, bool]] = {}
    flags_of: dict[str, set[str]] = {}
    noun_of: dict[str, dict[str, bool]] = {}
    adj_of: dict[str, dict[str, bool]] = {}
    # Verb infinitive -> masculine-singular past participle (« passer »→passé):
    # the dictionary form of a participial adjective, whose Lefff adj entries
    # carry the VERB as lemma (« passée adj passer Kfs »).
    kms: dict[str, str] = {}
    with mlex.open(encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) < 3:
                continue
            form, cat, lemma = parts[0].lower(), parts[1], parts[2].lower()
            morph = parts[3] if len(parts) > 3 else ""
            if not WORD.match(form) or not WORD.match(lemma):
                continue
            if cat not in CONTENT_CATS:
                continue
            entry = lemmas_of.setdefault(form, {})
            entry[lemma] = entry.get(lemma, False) or cat.startswith("v")
            flags = flags_of.setdefault(form, set())
            # Can this reading be singular (or number-invariant)? Plural-only
            # self-lemmas are Lefff quirks (« jours nc jours mp ») that would
            # otherwise beat the real singular (« jours nc jour mp »).
            sg = "p" not in morph or "s" in morph
            if cat == "nc":
                flags.add("n")
                seen = noun_of.setdefault(form, {})
                seen[lemma] = seen.get(lemma, False) or sg
            elif cat == "adj":
                flags.add("a")
                seen = adj_of.setdefault(form, {})
                seen[lemma] = seen.get(lemma, False) or sg
            elif cat in ("v", "auxAvoir", "auxEtre"):
                for ch in morph:
                    if ch == "K":
                        flags.add("p")
                    elif ch == "G":
                        flags.add("g")
                    elif ch == "W":
                        flags.add("i")
                    elif ch in FINITE_MOODS:
                        flags.add("f")
                if "K" in morph and "f" not in morph and "p" not in morph:
                    if lemma not in kms or len(form) < len(kms[lemma]):
                        kms[lemma] = form
    return lemmas_of, flags_of, noun_of, adj_of, kms


def pick_reading_lemma(form: str, cands: dict[str, bool]) -> str:
    """One lemma for a noun/adj reading: the form itself when it can be
    singular as its own lemma (meaning-safe: « cours »→cours never cour,
    « fois »→fois never foi), else the longest candidate the form extends
    (a plural reduces to its singular: « livres »→livre, « jours »→jour,
    « nouvelles »→nouvelle), else the shortest. A plural-only self-lemma
    (« jours nc jours mp », a Lefff quirk) never wins over an alternative."""
    if cands.get(form):
        return form
    pool = [l for l in cands if l != form] or [form]
    prefixes = [l for l in pool if form.startswith(l)]
    if prefixes:
        return max(prefixes, key=len)
    return min(pool, key=lambda l: (len(l), l))


def build_full_lexicon(lemmas_of: dict[str, dict[str, bool]]) -> dict[str, str]:
    """The context-free DEFAULT lemma per form (verb infinitive preferred,
    ties on shortest). A form with no non-identity candidate is omitted and
    lemmatises to itself at runtime."""
    table: dict[str, str] = {}
    for form, cands in lemmas_of.items():
        others = [l for l in cands if l != form]
        if not others:
            continue
        table[form] = min(others, key=lambda l: (0 if cands[l] else 1, len(l), l))
    return table


VERB_SHAPED = re.compile(r"(?:er|ir|re|oir)$")


def main() -> None:
    lemmas_of, flags_of, noun_of, adj_of, kms = parse_lefff(lefff_path())
    full = build_full_lexicon(lemmas_of)

    # The bundled core is a slice of the full table (drilled-verb forms only) so
    # the two never disagree — it just makes common verbs lemmatise instantly,
    # before the full lexicon has finished loading.
    core = {form: full[form] for form in drilled_verb_forms() if form in full}

    core_out = ROOT / "src" / "data" / "lemmas.json"
    core_out.write_text(
        json.dumps(core, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        + "\n"
    )

    # form \t flags \t default \t noun \t adj — trailing empties trimmed.
    full_out = ROOT / "public" / "lemmas-fr.txt"
    lines = []
    counts = {"noun": 0, "adj": 0, "flagged": 0}
    for form in sorted(set(full) | {f for f, fl in flags_of.items() if fl}):
        default = full.get(form, form)
        flags = "".join(c for c in "nafpgi" if c in flags_of.get(form, ()))
        noun = adj = ""
        if "n" in flags:
            picked = pick_reading_lemma(form, noun_of[form])
            # A plural-only self-pick with no alternative (« humains », whose
            # only nc entry is humains/mp) is no better than the default.
            if picked != default and (picked != form or noun_of[form][form]):
                noun = picked
        if "a" in flags:
            # A participial-adjective entry names the VERB (« passée adj
            # passer ») — swap in the verb's masc-sg participle (passé), the
            # adjective's actual dictionary form.
            cands: dict[str, bool] = {}
            for lem, sg in adj_of[form].items():
                if VERB_SHAPED.search(lem) and lem in kms:
                    lem = kms[lem]
                cands[lem] = cands.get(lem, False) or sg
            picked = pick_reading_lemma(form, cands)
            if picked != default and (picked != form or cands[form]):
                adj = picked
        cols = [form, flags, "" if default == form else default, noun, adj]
        while cols and cols[-1] == "":
            cols.pop()
        if len(cols) == 1:
            continue  # identity form with no flags — self-lemma at runtime
        lines.append("\t".join(cols))
        if flags:
            counts["flagged"] += 1
        counts["noun"] += bool(noun)
        counts["adj"] += bool(adj)
    full_out.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"core (bundled):  {len(core):>7,} entries → {core_out.relative_to(ROOT)}")
    print(f"full (lazy):     {len(lines):>7,} lines → {full_out.relative_to(ROOT)}")
    print(f"  flagged:       {counts['flagged']:>7,} with POS flags")
    print(f"  noun overrides:{counts['noun']:>7,}   adj overrides: {counts['adj']:>7,}")
    print(f"full size:       {full_out.stat().st_size / 1024:.0f} KB raw")


if __name__ == "__main__":
    main()
