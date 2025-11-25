#!/usr/bin/env python3
"""
Question Categorization Script with Checkpoint/Resume
Categorizes National History Bee questions using AI with automatic progress saving.
"""

import json
import os
from datetime import datetime
from typing import Dict, List, Any

# File paths
QUESTIONS_FILE = "questions.json"
METADATA_FILE = "question_metadata.json"
BATCH_SIZE = 50

# Category definitions
REGIONS = [
    "United States",
    "Europe",
    "Asia",
    "Latin America & Caribbean",
    "Africa",
    "Middle East & North Africa",
    "Global/Multi-Regional"
]

TIME_PERIODS = [
    "Ancient World (pre-500 CE)",
    "Medieval Era (500-1450)",
    "Early Modern (1450-1750)",
    "Age of Revolutions (1750-1850)",
    "Industrial & Imperial Age (1850-1914)",
    "World Wars & Interwar (1914-1945)",
    "Contemporary Era (1945-present)"
]

ANSWER_TYPES = [
    "People & Biography",
    "Events & Incidents",
    "Places & Geography",
    "Works & Documents",
    "Groups & Institutions",
    "Concepts & Ideas"
]

SUBJECT_THEMES = [
    "Political & Governmental",
    "Military & Conflict",
    "Social Movements & Culture",
    "Economic & Trade",
    "Religion & Philosophy",
    "Science & Technology",
    "Arts & Literature"
]


def load_questions() -> Dict[str, List[Dict]]:
    """Load questions from JSON file."""
    print(f"Loading questions from {QUESTIONS_FILE}...")
    with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_metadata() -> Dict[str, Any]:
    """Load existing metadata or create new structure."""
    if os.path.exists(METADATA_FILE):
        print(f"Found existing {METADATA_FILE}, loading progress...")
        with open(METADATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    else:
        print("No existing metadata found, starting fresh...")
        return {
            "_progress": {
                "last_updated": None,
                "total_questions": 0,
                "categorized": 0,
                "current_difficulty": None,
                "current_question": 0
            },
            "preliminary": {},
            "quarterfinals": {},
            "semifinals": {},
            "finals": {}
        }


def save_metadata(metadata: Dict[str, Any]):
    """Save metadata to file."""
    metadata["_progress"]["last_updated"] = datetime.now().isoformat()
    with open(METADATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
    print(f"✓ Progress saved: {metadata['_progress']['categorized']}/{metadata['_progress']['total_questions']} questions categorized")


def categorize_question(question_text: str, answer_text: str) -> Dict[str, Any]:
    """
    Categorize a single question using AI analysis.

    NOTE: This is a placeholder. For actual implementation, you would:
    1. Use Anthropic API to call Claude
    2. Provide the categorization schema
    3. Parse the response

    For now, returning a template structure.
    """
    # This will be replaced with actual AI categorization
    return {
        "regions": ["United States"],  # Placeholder
        "time_periods": ["Contemporary Era (1945-present)"],  # Placeholder
        "answer_type": "People & Biography",  # Placeholder
        "subject_themes": ["Political & Governmental"],  # Placeholder
        "needs_review": True  # Mark for manual review
    }


def process_batch(questions_batch: List[Dict], difficulty: str) -> Dict[str, Dict]:
    """Process a batch of questions and return their metadata."""
    batch_metadata = {}

    for q in questions_batch:
        q_num = str(q["number"])

        # Categorize the question
        metadata = categorize_question(q["question"], q["answer"])
        batch_metadata[q_num] = metadata

        print(f"  Categorized {difficulty} #{q_num}")

    return batch_metadata


def main():
    """Main categorization workflow with checkpoint/resume."""
    print("=" * 60)
    print("Question Categorization Script")
    print("=" * 60)

    # Load data
    questions = load_questions()
    metadata = load_metadata()

    # Count total questions
    total_questions = sum(len(questions[d]) for d in ["preliminary", "quarterfinals", "semifinals", "finals"])
    metadata["_progress"]["total_questions"] = total_questions
    print(f"\nTotal questions to categorize: {total_questions}")
    print(f"Already categorized: {metadata['_progress']['categorized']}")
    print()

    # Process each difficulty level
    for difficulty in ["preliminary", "quarterfinals", "semifinals", "finals"]:
        print(f"\n{'=' * 60}")
        print(f"Processing: {difficulty.upper()}")
        print(f"{'=' * 60}")

        questions_list = questions[difficulty]
        total_in_difficulty = len(questions_list)
        print(f"Total {difficulty} questions: {total_in_difficulty}")

        # Check which questions are already done
        already_done = set(metadata[difficulty].keys())
        questions_to_process = [q for q in questions_list if str(q["number"]) not in already_done]

        if not questions_to_process:
            print(f"✓ All {difficulty} questions already categorized, skipping...")
            continue

        print(f"Remaining to categorize: {len(questions_to_process)}")

        # Process in batches
        for i in range(0, len(questions_to_process), BATCH_SIZE):
            batch = questions_to_process[i:i + BATCH_SIZE]
            batch_num = i // BATCH_SIZE + 1
            total_batches = (len(questions_to_process) + BATCH_SIZE - 1) // BATCH_SIZE

            print(f"\nBatch {batch_num}/{total_batches} (questions {i+1}-{min(i+BATCH_SIZE, len(questions_to_process))})...")

            # Process batch
            batch_metadata = process_batch(batch, difficulty)

            # Update metadata
            metadata[difficulty].update(batch_metadata)
            metadata["_progress"]["categorized"] += len(batch_metadata)
            metadata["_progress"]["current_difficulty"] = difficulty
            metadata["_progress"]["current_question"] = i + len(batch)

            # Save checkpoint
            save_metadata(metadata)

    print("\n" + "=" * 60)
    print("✓ CATEGORIZATION COMPLETE!")
    print(f"Total questions categorized: {metadata['_progress']['categorized']}/{total_questions}")
    print(f"Metadata saved to: {METADATA_FILE}")
    print("=" * 60)


if __name__ == "__main__":
    main()
