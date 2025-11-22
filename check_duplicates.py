#!/usr/bin/env python3
"""
Check for duplicate questions in questions.json
"""

import json
from collections import defaultdict

def normalize_question(question_text):
    """Normalize question text for comparison by removing HTML tags and extra whitespace."""
    import re
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', question_text)
    # Convert to lowercase and normalize whitespace
    text = ' '.join(text.lower().split())
    return text

def find_duplicates():
    """Find duplicate questions in the questions database."""

    # Load questions
    with open('questions.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Track questions by normalized text
    question_tracker = defaultdict(list)

    # Difficulty levels
    difficulty_levels = ['preliminary', 'quarterfinals', 'semifinals', 'finals']

    total_questions = 0

    # Scan all questions
    for difficulty in difficulty_levels:
        if difficulty not in data:
            continue

        questions = data[difficulty]
        print(f"\nScanning {difficulty}: {len(questions)} questions...")

        for idx, q in enumerate(questions):
            total_questions += 1
            normalized = normalize_question(q['question'])
            question_tracker[normalized].append({
                'difficulty': difficulty,
                'index': idx,
                'original': q['question'],
                'answer': q['answer']
            })

    # Find duplicates
    duplicates = {k: v for k, v in question_tracker.items() if len(v) > 1}

    print(f"\n{'='*80}")
    print(f"DUPLICATE ANALYSIS RESULTS")
    print(f"{'='*80}")
    print(f"Total questions scanned: {total_questions:,}")
    print(f"Unique questions: {len(question_tracker):,}")
    print(f"Duplicate questions found: {len(duplicates):,}")
    print(f"{'='*80}\n")

    if duplicates:
        print(f"DUPLICATES FOUND:\n")

        # Sort by number of duplicates (most duplicates first)
        sorted_duplicates = sorted(duplicates.items(), key=lambda x: len(x[1]), reverse=True)

        for idx, (normalized_text, occurrences) in enumerate(sorted_duplicates, 1):
            print(f"\n--- Duplicate #{idx} (appears {len(occurrences)} times) ---")
            print(f"Question preview: {normalized_text[:150]}...")
            print(f"\nLocations:")

            for occ in occurrences:
                print(f"  - {occ['difficulty'].capitalize()}: index {occ['index']}")

            # Show first full occurrence
            print(f"\nFull question text:")
            print(f"  {occurrences[0]['original']}")
            print(f"\nAnswer:")
            print(f"  {occurrences[0]['answer']}")

            if idx >= 10:  # Limit output to first 10 duplicates
                remaining = len(sorted_duplicates) - 10
                if remaining > 0:
                    print(f"\n... and {remaining} more duplicate sets ...")
                break
    else:
        print("✅ No duplicates found! All questions are unique.")

    # Summary statistics
    print(f"\n{'='*80}")
    print(f"SUMMARY BY DIFFICULTY LEVEL")
    print(f"{'='*80}")

    for difficulty in difficulty_levels:
        if difficulty in data:
            count = len(data[difficulty])
            print(f"{difficulty.capitalize():20s}: {count:,} questions")

    print(f"{'='*80}\n")

if __name__ == '__main__':
    find_duplicates()
