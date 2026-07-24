#!/usr/bin/env python3
"""
Regenerates the Books content (Reading → Books) from Project Gutenberg
plain-text sources.

One shared pipeline for every book: download the .txt (cached in
scripts/.cache/books/), strip the Gutenberg boilerplate, find the chapter
headings (per-book heading style), harvest mixed-case chapter titles from
the book's own table of contents where it has one, clean the text
(unwrap hard line breaks into real paragraphs, drop illustration tags,
footnote markers and decorative rules, normalise dialogue dashes), split
over-long chapters into parts at paragraph boundaries, and emit:

  public/books/<id>.json     one file per book — metadata + chapter texts
                             (lazy-fetched by the app, cached in Cache
                             Storage; NOT precached by the service worker)
  src/data/bookCatalog.json  bundled catalog — book + chapter metadata
                             only, so lists render without fetching text

Usage: python3 scripts/build-books.py
"""

from __future__ import annotations

import json
import math
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / ".cache" / "books"
OUT_BOOKS = ROOT / "public" / "books"
OUT_CATALOG = ROOT / "src" / "data" / "bookCatalog.json"

# A chapter longer than MAX_CHAPTER_WORDS is split into parts of roughly
# PART_TARGET_WORDS at paragraph boundaries, so one sitting stays readable
# and "where I left off" is a chapter, not a scroll offset.
MAX_CHAPTER_WORDS = 2600
PART_TARGET_WORDS = 1800

ROMAN_RE = re.compile(r"^[IVXLC]+$")
WORD_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿŒœÆæ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿŒœÆæ]+)*")

ROMAN_VALUES = [(50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]


def roman(n: int) -> str:
    out = []
    for value, symbol in ROMAN_VALUES:
        while n >= value:
            out.append(symbol)
            n -= value
    return "".join(out)


def download(gid: int) -> str:
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / f"pg{gid}.txt"
    if not path.exists() or path.stat().st_size == 0:
        url = f"https://www.gutenberg.org/cache/epub/{gid}/pg{gid}.txt"
        print(f"  downloading {url}")
        with urllib.request.urlopen(url) as res:
            path.write_bytes(res.read())
    return path.read_text(encoding="utf-8")


def strip_gutenberg(text: str) -> list[str]:
    """The text between the *** START/END *** markers, as \n-normalised lines."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    start = next(i for i, l in enumerate(lines) if l.startswith("*** START"))
    end = next(i for i, l in enumerate(lines) if l.startswith("*** END"))
    return lines[start + 1 : end]


def is_caps(line: str) -> bool:
    """A display line set entirely in capitals (chapter-title blocks)."""
    s = line.strip()
    return bool(s) and any(c.isalpha() for c in s) and s == s.upper()


def word_count(text: str) -> int:
    return len(WORD_RE.findall(text))


DROP_LINE_RE = re.compile(r"^\s*(-{4,}|\*(\s+\*)+|FIN DE LA .+)\s*$")


def clean_paragraphs(lines: list[str]) -> list[str]:
    """Body lines → clean display paragraphs (hard wraps unwrapped)."""
    text = "\n".join(lines)
    # Illustration tags (captions can wrap across lines) and footnote markers.
    text = re.sub(r"\[Illustration[^\]]*\]", "", text)
    text = re.sub(r"\[\d+\]", "", text)
    # _italics_ markup and decorative rules / part-end stamps.
    text = text.replace("_", "")
    kept = [l for l in text.split("\n") if not DROP_LINE_RE.match(l)]
    paragraphs: list[str] = []
    current: list[str] = []
    for line in kept:
        if line.strip():
            current.append(line.strip())
        elif current:
            paragraphs.append(" ".join(current))
            current = []
    if current:
        paragraphs.append(" ".join(current))
    out = []
    for p in paragraphs:
        p = p.replace(" ", " ")
        # ASCII double-hyphen dialogue/aside dashes → em dash (« -- Entre, papa. »).
        p = re.sub(r"(?<!-)--(?!-)", "—", p)
        p = re.sub(r"\s+", " ", p).strip()
        if p:
            out.append(p)
    return out


class Chapter:
    def __init__(self, label: str, title: str | None, section: str | None, lines: list[str]):
        self.label = label
        self.title = title
        self.section = section
        self.lines = lines


def strip_title_block(lines: list[str]) -> list[str]:
    """Drop the ALL-CAPS chapter-title block that repeats under a numeral."""
    i = 0
    while i < len(lines) and not lines[i].strip():
        i += 1
    while i < len(lines) and is_caps(lines[i]):
        i += 1
    return lines[i:]


def cut_at(lines: list[str], pattern: str) -> list[str]:
    """Truncate at the first line matching `pattern` (end matter, notes)."""
    rx = re.compile(pattern)
    for i, l in enumerate(lines):
        if rx.match(l):
            return lines[:i]
    return lines


def split_bare_numerals(lines: list[str], heading_rx: re.Pattern[str]) -> list[tuple[str, list[str]]]:
    """
    Split on standalone heading lines. A heading whose next non-blank line is
    itself a heading is a table-of-contents entry, not a chapter — skipped
    (this also skips everything before the first real chapter). Returns
    (heading text, body lines) pairs.
    """
    def next_nonblank(i: int) -> str:
        for j in range(i + 1, len(lines)):
            if lines[j].strip():
                return lines[j].strip()
        return ""

    chapters: list[tuple[str, list[str]]] = []
    body: list[str] | None = None
    for i, line in enumerate(lines):
        s = line.strip()
        if heading_rx.match(s) and not heading_rx.match(next_nonblank(i)):
            body = []
            chapters.append((s, body))
        elif body is not None:
            body.append(line)
    return chapters


# ——— Per-book table-of-contents title harvesters (mixed-case titles) ———


def toc_titles_tour(lines: list[str]) -> list[str]:
    """46541: end TOC —  `   I.—Dans lequel …            1` with wrapped
    continuation lines; page-number column stripped."""
    # The numeral column is right-aligned: « I.— » sits deeper than « XVIII.— »
    # (up to 8 spaces); continuation lines are indented further still (13).
    entry_rx = re.compile(r"^\s{0,8}([IVXL]+)\.—(.*)$")
    titles: list[str] = []
    in_toc = False
    for line in lines:
        if "TABLE DES MATIÈRES" in line:
            in_toc = True
            continue
        if not in_toc:
            continue
        if re.match(r"^\s*(Corrections\.|Paris\.)", line):
            break
        m = entry_rx.match(line)
        chunk = None
        if m:
            titles.append("")
            chunk = m.group(2)
        elif titles and line.strip():
            chunk = line
        if chunk is not None:
            chunk = re.sub(r"\s{2,}\d+\s*$", "", chunk).strip()
            titles[-1] = f"{titles[-1]} {chunk}".strip()
    return [re.sub(r"\s+", " ", t).rstrip(".") for t in titles]


def toc_titles_fantome(lines: list[str]) -> dict[str, str]:
    """62215: top TOC — `I. Est-ce le fantôme?` with flush-left continuation
    lines; also the AVANT-PROPOS entry. Keyed by numeral (or AVANT-PROPOS)."""
    entry_rx = re.compile(r"^([IVX]+|AVANT-PROPOS)\.\s+(.*)$")
    titles: dict[str, str] = {}
    key: str | None = None
    in_toc = False
    for line in lines:
        s = line.strip()
        if "TABLE DES MATIÈRES" in line:
            in_toc = True
            continue
        if in_toc and s == "AVANT-PROPOS":
            break  # the body starts — TOC is done
        if not in_toc:
            continue
        m = entry_rx.match(s)
        if m:
            key = m.group(1)
            titles[key] = m.group(2)
        elif key and s and s != "ÉPILOGUE":
            titles[key] = f"{titles[key]} {s}"
    return {k: re.sub(r"\s+", " ", v).strip().rstrip(".") for k, v in titles.items()}


def toc_titles_vingt(lines: list[str]) -> list[list[str]]:
    """5097: one single-line TOC per part — `   I    Un écueil fuyant`."""
    parts: list[list[str]] = []
    entry_rx = re.compile(r"^\s+([IVX]+)\s{2,}(\S.*?)\s*$")
    current: list[str] | None = None
    for line in lines:
        if re.match(r"^\s*(PREMIÈRE|DEUXIÈME) PARTIE\s*$", line) and current is None or (
            "TABLE DES MATIÈRES" in line
        ):
            if "TABLE DES MATIÈRES" in line:
                current = []
                parts.append(current)
            continue
        m = entry_rx.match(line)
        if current is not None and m:
            current.append(m.group(2).replace("_", "").strip())
    return parts


def toc_titles_lupin(lines: list[str]) -> list[str]:
    """32854: end TOC — plain mixed-case story titles, one per line."""
    titles: list[str] = []
    in_toc = False
    for line in lines:
        s = line.strip()
        if "TABLE DES MATIÈRES" in s:
            in_toc = True
            continue
        if in_toc and s and s != "------":
            titles.append(s)
    return titles


# ——— Per-book parsers (shared engine + the book's heading style) ———


def parse_tour(lines: list[str]) -> list[Chapter]:
    titles = toc_titles_tour(lines)
    body = cut_at(lines, r"^FIN$")
    raw = split_bare_numerals(body, ROMAN_RE)
    assert len(raw) == 37, f"tour-du-monde: expected 37 chapters, got {len(raw)}"
    assert len(titles) == 37, f"tour-du-monde: expected 37 TOC titles, got {len(titles)}"
    return [
        Chapter(f"Chapitre {roman(i + 1)}", titles[i], None, strip_title_block(b))
        for i, (_, b) in enumerate(raw)
    ]


def parse_lupin(lines: list[str]) -> list[Chapter]:
    titles = toc_titles_lupin(lines)
    assert len(titles) == 9, f"arsene-lupin: expected 9 TOC titles, got {len(titles)}"
    folded = {t.casefold(): t for t in titles}
    body = cut_at(lines, r"^FIN$")
    chapters: list[Chapter] = []
    current: list[str] | None = None
    i = 0
    while i < len(body):
        if re.match(r"^-{4,}\s*$", body[i]):
            j = i + 1
            while j < len(body) and not body[j].strip():
                j += 1
            heading = body[j].strip() if j < len(body) else ""
            # Only a separator followed by one of the book's own story titles
            # opens a story — the front-matter separators (dedication, the
            # Claretie preface) don't match and stay dropped.
            if heading.casefold() in folded:
                current = []
                # A story collection: the story's own title IS the label the
                # reader navigates by (there are no « Chapitre N » here).
                chapters.append(Chapter(folded[heading.casefold()], None, None, current))
                i = j + 1
                continue
        if current is not None:
            current.append(body[i])
        i += 1
    assert len(chapters) == 9, f"arsene-lupin: expected 9 stories, got {len(chapters)}"
    return chapters


def parse_colomba(lines: list[str]) -> list[Chapter]:
    body = cut_at(lines, r"^\[1\]\s")  # the endnotes block
    raw = split_bare_numerals(body, ROMAN_RE)
    # The source has a typo (a second « VIII » where XIII belongs) — labels
    # come from the sequence, so the numbering stays correct.
    assert len(raw) == 21, f"colomba: expected 21 chapters, got {len(raw)}"
    return [Chapter(f"Chapitre {roman(i + 1)}", None, None, b) for i, (_, b) in enumerate(raw)]


def parse_fantome(lines: list[str]) -> list[Chapter]:
    titles = toc_titles_fantome(lines)
    heading_rx = re.compile(r"^([IVX]+|AVANT-PROPOS|ÉPILOGUE)$")
    raw = split_bare_numerals(lines, heading_rx)
    assert len(raw) == 29, f"fantome-opera: expected 29 sections, got {len(raw)}"
    chapters: list[Chapter] = []
    number = 0
    for heading, body in raw:
        if heading == "AVANT-PROPOS":
            label, title = "Avant-propos", titles.get("AVANT-PROPOS")
        elif heading == "ÉPILOGUE":
            label, title = "Épilogue", None
        else:
            number += 1
            label, title = f"Chapitre {roman(number)}", titles.get(heading)
        chapters.append(Chapter(label, title, None, strip_title_block(body)))
    assert number == 27, f"fantome-opera: expected 27 numbered chapters, got {number}"
    return chapters


def parse_une_vie(lines: list[str]) -> list[Chapter]:
    heading_rx = re.compile(r"^-- ?([IVX]+) ?--$")
    chapters: list[Chapter] = []
    current: list[str] | None = None
    for line in lines:
        if heading_rx.match(line.strip()):
            current = []
            chapters.append(Chapter(f"Chapitre {roman(len(chapters) + 1)}", None, None, current))
        elif current is not None:
            current.append(line)
    assert len(chapters) == 14, f"une-vie: expected 14 chapters, got {len(chapters)}"
    return chapters


def parse_vingt(lines: list[str]) -> list[Chapter]:
    toc = toc_titles_vingt(lines)
    assert [len(p) for p in toc] == [24, 23], f"vingt-mille-lieues: TOC {[len(p) for p in toc]}"
    part_rx = re.compile(r"^(PREMIÈRE|DEUXIÈME) PARTIE$")
    sections = {"PREMIÈRE": "Première partie", "DEUXIÈME": "Deuxième partie"}
    chapters: list[Chapter] = []
    section: str | None = None
    per_part: dict[str, int] = {}
    current: list[str] | None = None
    for line in lines:
        s = line.strip()
        m = part_rx.match(s)
        if m:
            # A part label closes the open chapter; everything until the next
            # chapter numeral (the part's TOC page, half-titles) is dropped.
            section = sections[m.group(1)]
            current = None
        elif ROMAN_RE.match(s) and section is not None:
            n = per_part.get(section, 0) + 1
            per_part[section] = n
            part_index = 0 if section == "Première partie" else 1
            title = toc[part_index][n - 1] if n <= len(toc[part_index]) else None
            current = []
            chapters.append(Chapter(f"Chapitre {roman(n)}", title, section, current))
        elif current is not None:
            current.append(line)
    counts = [per_part.get("Première partie", 0), per_part.get("Deuxième partie", 0)]
    assert counts == [24, 23], f"vingt-mille-lieues: chapters per part {counts}"
    return [
        Chapter(c.label, c.title, c.section, strip_title_block(c.lines)) for c in chapters
    ]


BOOKS = [
    {
        "id": "tour-du-monde",
        "gutenbergId": 46541,
        "title": "Le Tour du monde en quatre-vingts jours",
        "author": "Jules Verne",
        "level": "B1",
        "parse": parse_tour,
    },
    {
        "id": "arsene-lupin",
        "gutenbergId": 32854,
        "title": "Arsène Lupin, gentleman-cambrioleur",
        "author": "Maurice Leblanc",
        "level": "B1",
        "parse": parse_lupin,
    },
    {
        # The task brief pointed at gutenberg.org/ebooks/61230, but that id is
        # an unrelated English geology text — 16239 is the French Colomba.
        "id": "colomba",
        "gutenbergId": 16239,
        "title": "Colomba",
        "author": "Prosper Mérimée",
        "level": "B1",
        "parse": parse_colomba,
    },
    {
        "id": "fantome-opera",
        "gutenbergId": 62215,
        "title": "Le Fantôme de l'Opéra",
        "author": "Gaston Leroux",
        "level": "B2",
        "parse": parse_fantome,
    },
    {
        "id": "une-vie",
        "gutenbergId": 17457,
        "title": "Une vie",
        "author": "Guy de Maupassant",
        "level": "B2",
        "parse": parse_une_vie,
    },
    {
        "id": "vingt-mille-lieues",
        "gutenbergId": 5097,
        "title": "Vingt mille lieues sous les mers",
        "author": "Jules Verne",
        "level": "B2",
        "parse": parse_vingt,
    },
]


def split_parts(paragraphs: list[str], words: int) -> list[list[str]]:
    """Split an over-long chapter into balanced parts at paragraph boundaries."""
    if words <= MAX_CHAPTER_WORDS:
        return [paragraphs]
    count = math.ceil(words / PART_TARGET_WORDS)
    parts: list[list[str]] = []
    done = 0
    current: list[str] = []
    for p in paragraphs:
        current.append(p)
        done += word_count(p)
        # Cut once this part reaches its share of the remaining text.
        if len(parts) < count - 1 and done >= words * (len(parts) + 1) / count:
            parts.append(current)
            current = []
    if current:
        parts.append(current)
    return parts


def build_book(cfg: dict) -> tuple[dict, dict]:
    lines = strip_gutenberg(download(cfg["gutenbergId"]))
    chapters = cfg["parse"](lines)

    emitted = []
    for chapter in chapters:
        paragraphs = clean_paragraphs(chapter.lines)
        words = word_count(" ".join(paragraphs))
        assert words >= 150, f"{cfg['id']}: suspiciously short chapter {chapter.label} ({words} words)"
        pieces = split_parts(paragraphs, words)
        for k, piece in enumerate(pieces):
            emitted.append(
                {
                    "label": chapter.label,
                    "title": chapter.title,
                    "section": chapter.section,
                    "part": [k + 1, len(pieces)] if len(pieces) > 1 else None,
                    "words": word_count(" ".join(piece)),
                    "content": "\n\n".join(piece),
                }
            )

    meta = {
        "id": cfg["id"],
        "gutenbergId": cfg["gutenbergId"],
        "title": cfg["title"],
        "author": cfg["author"],
        "level": cfg["level"],
        "words": sum(c["words"] for c in emitted),
        "chapters": [{k: c[k] for k in ("label", "title", "section", "part", "words")} for c in emitted],
    }
    content = {**meta, "chapters": emitted}
    return meta, content


def main() -> None:
    OUT_BOOKS.mkdir(parents=True, exist_ok=True)
    catalog = []
    for cfg in BOOKS:
        meta, content = build_book(cfg)
        out = OUT_BOOKS / f"{cfg['id']}.json"
        out.write_text(json.dumps(content, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        catalog.append(meta)
        source_chapters = len({(c["label"], c["section"]) for c in meta["chapters"]})
        print(
            f"  {cfg['id']}: {source_chapters} chapters → {len(meta['chapters'])} readings, "
            f"{meta['words']:,} words, {out.stat().st_size // 1024} KB"
        )
    OUT_CATALOG.write_text(
        json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print(f"  catalog: {OUT_CATALOG.stat().st_size // 1024} KB")


if __name__ == "__main__":
    sys.exit(main())
