#!/usr/bin/env python3
"""
Remove duplicate questions from questions.json while keeping first occurrence.
Keeps parsing errors but removes duplicates of them.
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

def remove_duplicates():
    """Remove duplicate questions from the database, keeping first occurrence."""

    # Load questions
    print("Loading questions.json...")
    with open('questions.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Track questions we've seen
    seen_questions = set()

    # Difficulty levels
    difficulty_levels = ['preliminary', 'quarterfinals', 'semifinals', 'finals']

    # Statistics
    original_counts = {}
    deduplicated_counts = {}
    removed_counts = {}

    # Process each difficulty level
    for difficulty in difficulty_levels:
        if difficulty not in data:
            continue

        questions = data[difficulty]
        original_counts[difficulty] = len(questions)

        print(f"\nProcessing {difficulty}: {len(questions)} questions...")

        deduplicated_questions = []
        removed = 0

        for q in questions:
            normalized = normalize_question(q['question'])

            if normalized not in seen_questions:
                # First time seeing this question - keep it
                seen_questions.add(normalized)
                deduplicated_questions.append(q)
            else:
                # Duplicate - skip it
                removed += 1

        data[difficulty] = deduplicated_questions
        deduplicated_counts[difficulty] = len(deduplicated_questions)
        removed_counts[difficulty] = removed

        print(f"  Kept: {len(deduplicated_questions)}")
        print(f"  Removed: {removed} duplicates")

    # Update metadata
    data['metadata'] = {
        'total_preliminary': deduplicated_counts.get('preliminary', 0),
        'total_quarterfinals': deduplicated_counts.get('quarterfinals', 0),
        'total_semifinals': deduplicated_counts.get('semifinals', 0),
        'total_finals': deduplicated_counts.get('finals', 0),
        'total': sum(deduplicated_counts.values())
    }

    # Save deduplicated data
    print("\nSaving deduplicated questions to questions.json...")
    with open('questions.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    # Print summary
    print(f"\n{'='*80}")
    print(f"DEDUPLICATION COMPLETE")
    print(f"{'='*80}")
    print(f"\n{'Difficulty':<20} {'Original':<12} {'After':<12} {'Removed':<12}")
    print(f"{'-'*80}")

    total_original = 0
    total_after = 0
    total_removed = 0

    for difficulty in difficulty_levels:
        if difficulty in original_counts:
            orig = original_counts[difficulty]
            after = deduplicated_counts[difficulty]
            removed = removed_counts[difficulty]

            total_original += orig
            total_after += after
            total_removed += removed

            print(f"{difficulty.capitalize():<20} {orig:<12,} {after:<12,} {removed:<12,}")

    print(f"{'-'*80}")
    print(f"{'TOTAL':<20} {total_original:<12,} {total_after:<12,} {total_removed:<12,}")
    print(f"{'='*80}")
    print(f"\nReduction: {(total_removed/total_original)*100:.1f}%")
    print(f"\nUpdated questions.json saved successfully!")
    print(f"{'='*80}\n")

if __name__ == '__main__':
    # Confirm before proceeding
    print("="*80)
    print("DUPLICATE REMOVAL TOOL")
    print("="*80)
    print("\nThis will remove duplicate questions from questions.json.")
    print("The FIRST occurrence of each question will be kept.")
    print("All subsequent duplicates will be removed.")
    print("\nA backup will NOT be created automatically.")
    print("You may want to: cp questions.json questions.json.backup")
    print("="*80)

    response = input("\nProceed with deduplication? (yes/no): ").strip().lower()

    if response in ['yes', 'y']:
        remove_duplicates()
    else:
        print("\nOperation cancelled.")
