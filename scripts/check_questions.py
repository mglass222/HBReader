#!/usr/bin/env python3
"""
Validate HBReader question and metadata JSON files.

By default this checks the shipped National History Bee and US History Bee
datasets. Use --questions and --metadata to validate a specific pair.
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path


DEFAULT_PAIRS = [
    (
        Path("src/assets/nat_hist_bee_questions.json"),
        Path("src/assets/nat_hist_bee_question_metadata.json"),
    ),
    (
        Path("src/assets/us_hist_bee_questions.json"),
        Path("src/assets/us_hist_bee_question_metadata.json"),
    ),
]

DIFFICULTIES = ["preliminary", "quarterfinals", "semifinals", "finals"]

REGIONS = {
    "United States",
    "Europe",
    "Asia",
    "Latin America & Caribbean",
    "Americas (Pre-Columbian)",
    "Africa",
    "Middle East & North Africa",
    "Global/Multi-Regional",
}

TIME_PERIODS = {
    "Ancient World (pre-500 CE)",
    "Medieval Era (500-1450)",
    "Early Modern (1450-1750)",
    "Age of Revolutions (1750-1850)",
    "Industrial & Imperial Age (1850-1914)",
    "World Wars & Interwar (1914-1945)",
    "Contemporary Era (1945-present)",
}

ANSWER_TYPES = {
    "People & Biography",
    "Events (Wars, Battles, Revolutions)",
    "Political History & Diplomacy",
    "Economic History & Trade",
    "Social History & Daily Life",
    "Cultural History (Art, Literature, Music)",
    "Religion & Mythology",
    "Science, Technology & Innovation",
    "Geography & Environment",
    "Places, Cities & Civilizations",
    "Groups, Organizations & Institutions",
    "Documents, Laws & Treaties",
    "Ideas, Ideologies & Philosophies",
}

SUBJECT_THEMES = {
    "Political & Governmental",
    "Military & Conflict",
    "Social Movements & Culture",
    "Economic & Trade",
    "Religion & Philosophy",
    "Science & Technology",
    "Arts & Literature",
}

ALLOWED_TAGS = {"strong", "em", "u", "br"}


class QuestionHtmlParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() not in ALLOWED_TAGS:
            self.errors.append(f"disallowed tag <{tag}>")
        if attrs:
            self.errors.append(f"attributes are not allowed on <{tag}>")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)


def load_json(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalize_question(text):
    text = re.sub(r"<[^>]+>", "", text or "")
    return " ".join(text.lower().split())


def validate_html(value):
    parser = QuestionHtmlParser()
    parser.feed(value or "")
    parser.close()
    return parser.errors


def validate_pair(questions_path, metadata_path, strict=False):
    errors = []
    warnings = []

    questions_data = load_json(questions_path)
    metadata_data = load_json(metadata_path)
    metadata = metadata_data.get("categories", {})

    ids = []
    normalized_questions = defaultdict(list)
    total_questions = 0

    for difficulty in DIFFICULTIES:
        questions = questions_data.get(difficulty, [])
        if not isinstance(questions, list):
            errors.append(f"{questions_path}: {difficulty} must be a list")
            continue

        for index, question in enumerate(questions):
            total_questions += 1
            qid = question.get("id")
            if not qid:
                errors.append(f"{questions_path}: missing id at {difficulty}[{index}]")
                continue

            ids.append(qid)
            if not question.get("question"):
                errors.append(f"{questions_path}: {qid} has an empty question")
            if not question.get("answer"):
                errors.append(f"{questions_path}: {qid} has an empty answer")

            normalized_questions[normalize_question(question.get("question"))].append(qid)

            for field in ("question", "answer"):
                for html_error in validate_html(question.get(field, "")):
                    errors.append(f"{questions_path}: {qid} {field}: {html_error}")

    duplicate_ids = sorted({qid for qid in ids if ids.count(qid) > 1})
    for qid in duplicate_ids:
        errors.append(f"{questions_path}: duplicate id {qid}")

    for normalized, qids in normalized_questions.items():
        if normalized and len(qids) > 1:
            errors.append(f"{questions_path}: duplicate question text in {', '.join(qids)}")

    id_set = set(ids)
    metadata_ids = set(metadata.keys())
    for qid in sorted(id_set - metadata_ids):
        errors.append(f"{metadata_path}: missing metadata for {qid}")
    for qid in sorted(metadata_ids - id_set):
        errors.append(f"{metadata_path}: metadata without question for {qid}")

    for qid, meta in metadata.items():
        regions = meta.get("regions", [])
        periods = meta.get("time_periods", [])
        themes = meta.get("subject_themes", [])
        answer_type = meta.get("answer_type", "")

        if not isinstance(regions, list):
            errors.append(f"{metadata_path}: {qid} regions must be a list")
            regions = []
        if not isinstance(periods, list):
            errors.append(f"{metadata_path}: {qid} time_periods must be a list")
            periods = []
        if not isinstance(themes, list):
            errors.append(f"{metadata_path}: {qid} subject_themes must be a list")
            themes = []

        for region in regions:
            if region not in REGIONS:
                errors.append(f"{metadata_path}: {qid} has unknown region {region!r}")
        for period in periods:
            if period not in TIME_PERIODS:
                errors.append(f"{metadata_path}: {qid} has unknown time period {period!r}")
        for theme in themes:
            if theme not in SUBJECT_THEMES:
                errors.append(f"{metadata_path}: {qid} has unknown subject theme {theme!r}")

        if not answer_type:
            message = f"{metadata_path}: {qid} has blank answer_type"
            if strict:
                errors.append(message)
            else:
                warnings.append(message)
        elif answer_type not in ANSWER_TYPES:
            errors.append(f"{metadata_path}: {qid} has unknown answer_type {answer_type!r}")

    print(f"{questions_path}: {total_questions:,} questions checked")
    print(f"{metadata_path}: {len(metadata):,} metadata entries checked")
    return errors, warnings


def parse_args():
    parser = argparse.ArgumentParser(description="Validate HBReader question assets")
    parser.add_argument("--questions", help="Questions JSON file")
    parser.add_argument("--metadata", help="Metadata JSON file")
    parser.add_argument("--strict", action="store_true", help="Treat warnings as errors")
    return parser.parse_args()


def main():
    args = parse_args()

    if bool(args.questions) != bool(args.metadata):
        print("Error: --questions and --metadata must be provided together", file=sys.stderr)
        return 2

    pairs = [(Path(args.questions), Path(args.metadata))] if args.questions else DEFAULT_PAIRS
    all_errors = []
    all_warnings = []

    for questions_path, metadata_path in pairs:
        errors, warnings = validate_pair(questions_path, metadata_path, strict=args.strict)
        all_errors.extend(errors)
        all_warnings.extend(warnings)

    if all_warnings:
        print("\nWarnings:")
        for warning in all_warnings:
            print(f"  - {warning}")

    if all_errors:
        print("\nErrors:")
        for error in all_errors:
            print(f"  - {error}")
        return 1

    print("\nQuestion validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
