#!/usr/bin/env python3
"""
Fix extraction/OCR artifacts in History Bee question JSON.

Guided by source PDF conventions (A-Set Bee Semifinals + IHB Bowl Round 1):

KEEP (intentional packet formatting):
  - Power marks (+) and (*)
  - Bold through the power portion of tossups
  - Answer-line bold on the required stem only (e.g. Saud + i, Mali + an)
  - Italics for titles/foreign terms
  - Packet giveaway wording ("For the point(s)", "For ten points")

FIX (extraction artifacts from PDF span joining / encoding):
  - False spaces between spans (Saud i, Maurya n, doughboy s, Meng zi)
  - Fragmented adjacent <strong>/<em>/<u> tags from per-span extraction
  - Leading/trailing spaces inside formatting tags
  - Spaces before punctuation
  - Ligatures (fi/fl/ff), soft hyphens
  - Broken diaeresis (G¨unter → Günter)
  - offthe → off the
  - Trailing DRAFT labels
  - Hyphen + line-break spaces (ninety- year → ninety-year)

Usage:
    python scripts/fix_ocr_artifacts.py              # fix both default datasets
    python scripts/fix_ocr_artifacts.py --dry-run    # report only
    python scripts/fix_ocr_artifacts.py --file PATH
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


DEFAULT_FILES = [
    Path("src/assets/nat_hist_bee_questions.json"),
    Path("src/assets/us_hist_bee_questions.json"),
]

DIFFICULTIES = ["preliminary", "quarterfinals", "semifinals", "finals"]

LIGATURE_MAP = str.maketrans(
    {
        "ﬁ": "fi",
        "ﬂ": "fl",
        "ﬀ": "ff",
        "ﬃ": "ffi",
        "ﬄ": "ffl",
        "\u00ad": "",  # soft hyphen
    }
)

UMLAUT = {
    "a": "ä",
    "e": "ë",
    "i": "ï",
    "o": "ö",
    "u": "ü",
    "y": "ÿ",
    "A": "Ä",
    "E": "Ë",
    "I": "Ï",
    "O": "Ö",
    "U": "Ü",
    "Y": "Ÿ",
}

# Morphological / span-split suffixes after </strong> — not full English words.
ATTACH_SUFFIXES = (
    r"ians|ian|ese|ish|ing|ment|tion|sion|ness|ship|hood|"
    r"ics|ists|ism|ist|ers|ors|ary|ory|ive|ous|"
    r"ns|zi|ya|us|na|al|an|ed|er|ly|th|st|s|n|i|y|d"
)

# Plain-text "Placea n Empire" residual splits
AN_CONTINUATIONS = (
    r"Empire|Peninsula|War|Republic|Dynasty|Genocide|Railroad|"
    r"Culture|calendar|calendars|Emergency|Americans|descent|"
    r"civilization|Civil|people|Campaign|Revolution|Rite|"
    r"Gulf|Sea|Ocean|Desert|Plateau|Confederacy|language"
)


# Spacing acute from PDF export (´ E / ´c / ´ı → É / ć / í)
ACUTE = {
    "a": "á",
    "e": "é",
    "i": "í",
    "ı": "í",  # dotless i
    "o": "ó",
    "u": "ú",
    "y": "ý",
    "c": "ć",
    "s": "ś",
    "n": "ń",
    "z": "ź",
    "l": "ĺ",
    "r": "ŕ",
    "A": "Á",
    "E": "É",
    "I": "Í",
    "O": "Ó",
    "U": "Ú",
    "Y": "Ý",
    "C": "Ć",
    "S": "Ś",
    "N": "Ń",
    "Z": "Ź",
}


def fix_diaeresis(text: str) -> str:
    # G¨unter / Tannh¨auser, and spaced forms: ¨ Ogedei, ¨ Osterreich, FP ¨ O
    text = re.sub(
        r"¨\s*([aeiouyAEIOUY])",
        lambda m: UMLAUT.get(m.group(1), m.group(1)),
        text,
    )
    text = re.sub(
        r"([aeiouyAEIOUY])¨",
        lambda m: UMLAUT.get(m.group(1), m.group(1)),
        text,
    )
    # Dotless-i with diaeresis leftovers (e.g. Toarip¨ı)
    text = text.replace("¨ı", "i").replace("¨I", "I")
    # Acute accents from PDF export: ´ Evian, Bol´ıvar, Solidarno´s´c, Mladi´c
    text = re.sub(
        r"´\s*([A-Za-zı])",
        lambda m: ACUTE.get(m.group(1), m.group(1)),
        text,
    )
    # Cedilla leftovers: Buíça / François-style
    text = (
        text.replace("¸c", "ç")
        .replace("¸C", "Ç")
        .replace("c¸", "ç")
        .replace("C¸", "Ç")
        .replace("¸ois", "çois")
        .replace("¸Ois", "Çois")
    )
    # Odd multi-char exports (e.g. Gu´ëı → Guéi)
    text = text.replace("´ëı", "éi").replace("´ëi", "éi").replace("´ëI", "éI")
    return text


def clean_field(text: str) -> str:
    """Apply artifact fixes to one question or answer string."""
    if not text:
        return text

    # 1. Ligatures / soft hyphens
    text = text.translate(LIGATURE_MAP)

    # 2. Broken diaeresis from PDF text export
    text = fix_diaeresis(text)

    # 3. Trim whitespace inside formatting tags
    for tag in ("strong", "em", "u"):
        text = re.sub(rf"<{tag}>\s+", f"<{tag}>", text, flags=re.I)
        text = re.sub(rf"\s+</{tag}>", f"</{tag}>", text, flags=re.I)

    # 4. Single-letter <strong>o</strong> f → of (before merge)
    text = re.sub(r"<strong>[Oo]</strong>\s*f\b", "of", text)
    text = re.sub(r"\bo\s+f\b", "of", text)

    # 5. Merge adjacent identical formatting tags (power bold continuum)
    #    <strong>A</strong> <strong>B</strong> → <strong>A B</strong>
    for tag in ("strong", "em", "u"):
        prev = None
        while prev != text:
            prev = text
            text = re.sub(rf"</{tag}>\s*<{tag}>", " ", text, flags=re.I)

    # 6. Residual of split after merge: Republic o</strong> f → Republic of</strong>
    text = re.sub(r"([Oo])</strong>\s*f\b", r"of</strong>", text)

    # 7. Reattach morphological suffixes split after </strong>
    #    <strong>Saud</strong>i  <strong>Maurya</strong>n  <strong>doughboy</strong>s
    text = re.sub(
        rf"</strong>\s+({ATTACH_SUFFIXES})\b",
        r"</strong>\1",
        text,
        flags=re.I,
    )

    # 8. Plain-text place-name "X n" splits (tag-free residual)
    text = re.sub(
        rf"\b([A-Za-z]{{2,}}a)\s+n\b(?=\s+(?:{AN_CONTINUATIONS})\b)",
        r"\1n",
        text,
    )
    text = re.sub(r"\bSaud\s+i\b", "Saudi", text)
    text = re.sub(r"\bMeng\s+zi\b", "Mengzi", text)
    text = re.sub(r"\bU\s+Kingdom\b", "United Kingdom", text)

    # 9. Space before punctuation (including after closing tags)
    text = re.sub(r"\s+([,;:)\]])", r"\1", text)
    text = re.sub(r">\s+([,;:.)\]])", r">\1", text)
    # Period after word (not after single-letter abbrev handled loosely)
    text = re.sub(r"(?<=[A-Za-z0-9\"”'])\s+\.(?=\s|$|[\"”'])", ".", text)

    # 10. offthe
    text = re.sub(r"\boffthe\b", "off the", text)
    text = re.sub(r"\bOffthe\b", "Off the", text)

    # 11. Trailing DRAFT packet status
    text = re.sub(r"\s+DRAFT\s*$", "", text)

    # 12. Hyphenated line-break leftovers
    text = re.sub(r"([A-Za-z])-\s+([a-z])", r"\1-\2", text)

    # 13. Empty formatting tags
    text = re.sub(r"<(strong|em|u)>\s*</\1>", "", text, flags=re.I)

    # 14. Collapse runs of spaces
    text = re.sub(r"[ \t]{2,}", " ", text)

    return text.strip()


def clean_dataset(data: dict) -> tuple[dict, int, list]:
    """Return cleaned data, number of field changes, and sample change records."""
    changes = 0
    samples = []
    for diff in DIFFICULTIES:
        questions = data.get(diff)
        if not isinstance(questions, list):
            continue
        for q in questions:
            if not isinstance(q, dict):
                continue
            for field in ("question", "answer"):
                old = q.get(field)
                if not isinstance(old, str):
                    continue
                new = clean_field(old)
                if new != old:
                    changes += 1
                    if len(samples) < 30:
                        samples.append(
                            {
                                "id": q.get("id"),
                                "field": field,
                                "old": old[:160],
                                "new": new[:160],
                            }
                        )
                    q[field] = new
    return data, changes, samples


def power_mark_counts(data: dict) -> tuple[int, int]:
    plus = star = 0
    for diff in DIFFICULTIES:
        for q in data.get(diff, []) or []:
            if not isinstance(q, dict):
                continue
            t = q.get("question") or ""
            plus += t.count("(+)")
            star += t.count("(*)")
    return plus, star


def process_file(path: Path, dry_run: bool) -> int:
    print(f"\n{'=' * 60}")
    print(f"{'DRY RUN ' if dry_run else ''}Processing {path}")
    print("=" * 60)

    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    before_plus, before_star = power_mark_counts(data)
    cleaned, changes, samples = clean_dataset(data)
    after_plus, after_star = power_mark_counts(cleaned)

    print(f"Fields changed: {changes}")
    print(f"Power marks (+) before/after: {before_plus}/{after_plus}")
    print(f"Power marks (*) before/after: {before_star}/{after_star}")

    if before_plus != after_plus or before_star != after_star:
        print("ERROR: power mark counts changed — aborting write for this file")
        return 1

    if samples:
        print("\nSample changes:")
        for s in samples[:12]:
            print(f"  {s['id']} [{s['field']}]")
            print(f"    - {s['old']}")
            print(f"    + {s['new']}")

    if not dry_run and changes:
        with path.open("w", encoding="utf-8") as handle:
            json.dump(cleaned, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        print(f"\nWrote {path}")
    elif dry_run:
        print("\nDry run — no files written")
    else:
        print("\nNo changes needed")

    return 0


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--file",
        "-f",
        action="append",
        type=Path,
        help="Question JSON file (repeatable). Default: both Bee datasets.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report changes without writing files",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    files = args.file or DEFAULT_FILES
    status = 0
    for path in files:
        if not path.exists():
            print(f"File not found: {path}", file=sys.stderr)
            status = 1
            continue
        status = process_file(path, args.dry_run) or status
    return status


if __name__ == "__main__":
    raise SystemExit(main())
