#!/usr/bin/env python3
"""
Master Cleanup Script for History Bee Questions

This script combines multiple cleanup operations:
1. Clean answer text - removes unwanted suffixes (Bee PlayoffRound, DRAFT, etc.)
2. Remove duplicate questions - keeps first occurrence of each question
3. Check for duplicates - reports duplicate questions without removing them

Usage:
    python cleanup_questions.py [command]

Commands:
    clean       - Clean answer text (remove unwanted suffixes)
    dedup       - Remove duplicate questions
    check       - Check for duplicates (report only)
    all         - Run all cleanup operations (clean + dedup)

If no command is provided, runs in interactive mode.
"""

import json
import re
import sys
from collections import defaultdict

QUESTIONS_FILE = "questions.json"

# =============================================================================
# ANSWER CLEANING
# =============================================================================

# Patterns to remove from answer strings
ANSWER_CLEANUP_PATTERNS = [
    r'\s*DRAFT\s*Bee\s*PlayoffRound\s*\d+\s*$',
    r'\s*Bee\s*PlayoffRound\s*\d+\s*$',
    r'\s*Round\s*\d+\s*<strong>Extra\s*Tossups</strong>\s*$',
    r'\s*DRAFT\s*$',
    r'\s*Bee\s*Round\s*\d+\s*$',
    r'\s*History\s*Bee\s*Round\s*\d+\s*$',
    r'\s*Extra\s*Tossups?\s*$',
]

def clean_answer(answer):
    """Remove unwanted suffixes from answer strings."""
    cleaned = answer
    for pattern in ANSWER_CLEANUP_PATTERNS:
        cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)
    return cleaned.strip()

def clean_answers():
    """Clean all answer texts in the questions file."""
    print("=" * 70)
    print("CLEANING ANSWER TEXT")
    print("=" * 70)

    # Load questions
    print(f"\nLoading {QUESTIONS_FILE}...")
    with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    changes = 0

    # Process all sections
    for section in data:
        if isinstance(data[section], list):
            for question in data[section]:
                if 'answer' in question:
                    original = question['answer']
                    cleaned = clean_answer(original)
                    if original != cleaned:
                        print(f"  {question.get('id', 'unknown')}: Cleaned answer")
                        question['answer'] = cleaned
                        changes += 1

    if changes > 0:
        # Save the cleaned data
        with open(QUESTIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"\nCleaned {changes} answers.")
        print(f"File saved!")
    else:
        print("\nNo answers needed cleaning.")

    print("=" * 70)
    return changes

# =============================================================================
# DUPLICATE HANDLING
# =============================================================================

def normalize_question(question_text):
    """Normalize question text for comparison by removing HTML tags and extra whitespace."""
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', question_text)
    # Convert to lowercase and normalize whitespace
    text = ' '.join(text.lower().split())
    return text

def check_duplicates(verbose=True):
    """Find duplicate questions in the database. Returns dict of duplicates."""
    if verbose:
        print("=" * 70)
        print("CHECKING FOR DUPLICATES")
        print("=" * 70)

    # Load questions
    with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Track questions by normalized text
    question_tracker = defaultdict(list)
    difficulty_levels = ['preliminary', 'quarterfinals', 'semifinals', 'finals']
    total_questions = 0

    # Scan all questions
    for difficulty in difficulty_levels:
        if difficulty not in data:
            continue

        questions = data[difficulty]
        if verbose:
            print(f"\nScanning {difficulty}: {len(questions)} questions...")

        for idx, q in enumerate(questions):
            if not isinstance(q, dict):
                continue
            total_questions += 1
            normalized = normalize_question(q.get('question', ''))
            question_tracker[normalized].append({
                'difficulty': difficulty,
                'index': idx,
                'id': q.get('id', 'unknown'),
                'original': q.get('question', ''),
                'answer': q.get('answer', '')
            })

    # Find duplicates
    duplicates = {k: v for k, v in question_tracker.items() if len(v) > 1}

    if verbose:
        print(f"\n{'='*70}")
        print(f"Total questions scanned: {total_questions:,}")
        print(f"Unique questions: {len(question_tracker):,}")
        print(f"Duplicate sets found: {len(duplicates):,}")
        print(f"{'='*70}")

        if duplicates:
            print(f"\nDUPLICATES FOUND:\n")
            sorted_duplicates = sorted(duplicates.items(), key=lambda x: len(x[1]), reverse=True)

            for idx, (normalized_text, occurrences) in enumerate(sorted_duplicates[:10], 1):
                print(f"\n--- Duplicate #{idx} (appears {len(occurrences)} times) ---")
                print(f"Question preview: {normalized_text[:100]}...")
                print(f"IDs: {', '.join(occ['id'] for occ in occurrences)}")

            if len(sorted_duplicates) > 10:
                print(f"\n... and {len(sorted_duplicates) - 10} more duplicate sets ...")
        else:
            print("\nNo duplicates found! All questions are unique.")

    return duplicates

def remove_duplicates():
    """Remove duplicate questions from the database, keeping first occurrence."""
    print("=" * 70)
    print("REMOVING DUPLICATES")
    print("=" * 70)

    # Load questions
    print(f"\nLoading {QUESTIONS_FILE}...")
    with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Track questions we've seen
    seen_questions = set()
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
        if not isinstance(questions, list):
            continue

        original_counts[difficulty] = len(questions)
        print(f"\nProcessing {difficulty}: {len(questions)} questions...")

        deduplicated_questions = []
        removed = 0

        for q in questions:
            if not isinstance(q, dict):
                continue
            normalized = normalize_question(q.get('question', ''))

            if normalized not in seen_questions:
                seen_questions.add(normalized)
                deduplicated_questions.append(q)
            else:
                removed += 1

        data[difficulty] = deduplicated_questions
        deduplicated_counts[difficulty] = len(deduplicated_questions)
        removed_counts[difficulty] = removed

        print(f"  Kept: {len(deduplicated_questions)}, Removed: {removed} duplicates")

    # Update metadata
    if 'metadata' in data:
        data['metadata'] = {
            'total_preliminary': deduplicated_counts.get('preliminary', 0),
            'total_quarterfinals': deduplicated_counts.get('quarterfinals', 0),
            'total_semifinals': deduplicated_counts.get('semifinals', 0),
            'total_finals': deduplicated_counts.get('finals', 0),
            'total': sum(deduplicated_counts.values())
        }

    # Calculate totals
    total_removed = sum(removed_counts.values())

    if total_removed > 0:
        # Save deduplicated data
        print(f"\nSaving to {QUESTIONS_FILE}...")
        with open(QUESTIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        print(f"\nRemoved {total_removed} duplicate questions.")
        print("File saved!")
    else:
        print("\nNo duplicates to remove.")

    print("=" * 70)
    return total_removed

# =============================================================================
# MAIN
# =============================================================================

def run_all():
    """Run all cleanup operations."""
    print("\n" + "=" * 70)
    print("RUNNING ALL CLEANUP OPERATIONS")
    print("=" * 70 + "\n")

    # Step 1: Clean answers
    answers_cleaned = clean_answers()

    # Step 2: Remove duplicates
    print()
    duplicates_removed = remove_duplicates()

    # Summary
    print("\n" + "=" * 70)
    print("CLEANUP COMPLETE")
    print("=" * 70)
    print(f"  Answers cleaned: {answers_cleaned}")
    print(f"  Duplicates removed: {duplicates_removed}")
    print("=" * 70)

def interactive_mode():
    """Run in interactive mode."""
    print("\n" + "=" * 70)
    print("HISTORY BEE QUESTIONS CLEANUP TOOL")
    print("=" * 70)
    print("\nAvailable commands:")
    print("  1. clean  - Clean answer text (remove unwanted suffixes)")
    print("  2. dedup  - Remove duplicate questions")
    print("  3. check  - Check for duplicates (report only)")
    print("  4. all    - Run all cleanup operations")
    print("  5. quit   - Exit")
    print()

    while True:
        choice = input("Enter command (1-5 or name): ").strip().lower()

        if choice in ['1', 'clean']:
            clean_answers()
        elif choice in ['2', 'dedup']:
            confirm = input("This will remove duplicates. Continue? (yes/no): ").strip().lower()
            if confirm in ['yes', 'y']:
                remove_duplicates()
            else:
                print("Operation cancelled.")
        elif choice in ['3', 'check']:
            check_duplicates()
        elif choice in ['4', 'all']:
            confirm = input("This will clean answers and remove duplicates. Continue? (yes/no): ").strip().lower()
            if confirm in ['yes', 'y']:
                run_all()
            else:
                print("Operation cancelled.")
        elif choice in ['5', 'quit', 'exit', 'q']:
            print("Goodbye!")
            break
        else:
            print("Unknown command. Please try again.")

        print()

def main():
    """Main entry point."""
    if len(sys.argv) > 1:
        command = sys.argv[1].lower()

        if command == 'clean':
            clean_answers()
        elif command == 'dedup':
            remove_duplicates()
        elif command == 'check':
            check_duplicates()
        elif command == 'all':
            run_all()
        elif command in ['help', '-h', '--help']:
            print(__doc__)
        else:
            print(f"Unknown command: {command}")
            print("Use 'python cleanup_questions.py help' for usage information.")
    else:
        interactive_mode()

if __name__ == '__main__':
    main()
