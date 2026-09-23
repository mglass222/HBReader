#!/usr/bin/env python3
"""
Strip PDF page-header residue that extraction left at the end of answer lines.

Examples (see scripts/ERROR_PATTERNS.md):
    "<strong>Indonesia</strong> Bee Final Round"          -> "<strong>Indonesia</strong>"
    "<strong>Fronde</strong> Bee Final Round - Varsity"   -> "<strong>Fronde</strong>"
    "<strong>Lincoln Memorial</strong> Round 1"           -> "<strong>Lincoln Memorial</strong>"

This residue is not just cosmetic: the answer checker treats the unbolded
primary answer as an acceptable answer, so "bee" or "round" could score.

Usage:
    python3 scripts/strip_header_residue.py            # fix both Bee datasets
    python3 scripts/strip_header_residue.py --dry-run  # report only

A timestamped copy of each modified file is written to backup/ first.
"""

import argparse
import json
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

DEFAULT_FILES = [
    REPO_ROOT / "src/assets/nat_hist_bee_questions.json",
    REPO_ROOT / "src/assets/us_hist_bee_questions.json",
]

DIFFICULTIES = ["preliminary", "quarterfinals", "semifinals", "finals"]

# Trailing header text only; anchored at end of the answer line.
HEADER_RESIDUE_PATTERNS = [
    # National History Bee finals: "Bee Final Round", "Bee Final Round - JV"
    re.compile(r"\s*(?:History\s+)?Bee\s+Finals?\s+Round(?:\s*-\s*(?:JV|Varsity|Middle School))?\s*$", re.I),
    # US History Bee packets: "Round 1", "Round 12"
    re.compile(r"\s+Round\s+\d+\s*$"),
]


def strip_residue(answer):
    """Return the answer with trailing header residue removed."""
    cleaned = answer
    for pattern in HEADER_RESIDUE_PATTERNS:
        cleaned = pattern.sub("", cleaned)
    return cleaned


def process_file(path, dry_run):
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    changes = []
    for difficulty in DIFFICULTIES:
        for question in data.get(difficulty, []):
            original = question.get("answer", "")
            cleaned = strip_residue(original)
            if cleaned != original:
                changes.append((question.get("id"), original, cleaned))
                question["answer"] = cleaned

    print(f"{path.relative_to(REPO_ROOT)}: {len(changes)} answer(s) with header residue")
    for qid, original, cleaned in changes[:5]:
        print(f"  {qid}: ...{original[-60:]!r}")
        print(f"  {' ' * len(qid)}  -> ...{cleaned[-60:]!r}")
    if len(changes) > 5:
        print(f"  ... and {len(changes) - 5} more")

    if changes and not dry_run:
        backup_dir = REPO_ROOT / "backup"
        backup_dir.mkdir(exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_path = backup_dir / f"{path.stem}.{stamp}.pre-header-strip.json"
        shutil.copy2(path, backup_path)
        print(f"  backup: {backup_path.relative_to(REPO_ROOT)}")

        with path.open("w", encoding="utf-8") as handle:
            json.dump(data, handle, indent=2, ensure_ascii=False)
            handle.write("\n")

    return len(changes)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("files", nargs="*", type=Path, help="question JSON files (default: both Bee datasets)")
    parser.add_argument("--dry-run", action="store_true", help="report changes without writing")
    args = parser.parse_args()

    files = [path.resolve() for path in args.files] or DEFAULT_FILES
    total = sum(process_file(path, args.dry_run) for path in files)
    print(f"{'Would fix' if args.dry_run else 'Fixed'} {total} answer(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
