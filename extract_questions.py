#!/usr/bin/env python3
"""
Extract History Bee questions from PDF files and save to JSON with formatting.
"""

import json
import re
from pathlib import Path
import fitz  # PyMuPDF

def get_difficulty_level(filename):
    """Determine difficulty level based on filename."""
    filename_lower = filename.lower()

    if 'semifinal' in filename_lower:
        return 'semifinals'
    elif 'quarterfinal' in filename_lower:
        return 'quarterfinals'
    elif 'finals' in filename_lower or 'championship' in filename_lower:
        return 'finals'
    else:
        return 'preliminary'

def get_text_with_formatting(page):
    """Extract text from page with formatting information (bold, italic, underline)."""
    blocks = page.get_text("dict")["blocks"]
    formatted_text = []

    for block in blocks:
        if "lines" in block:
            for line in block["lines"]:
                line_text = []
                for span in line["spans"]:
                    text = span["text"]
                    font = span["font"].lower()
                    flags = span["flags"]

                    # Detect formatting based on font flags
                    # flags & 2^4 (16) = bold
                    # flags & 2^1 (2) = italic
                    is_bold = flags & 16
                    is_italic = flags & 2

                    # Apply HTML tags
                    if is_bold and is_italic:
                        text = f"<strong><em>{text}</em></strong>"
                    elif is_bold:
                        text = f"<strong>{text}</strong>"
                    elif is_italic:
                        text = f"<em>{text}</em>"

                    line_text.append(text)

                formatted_text.append(" ".join(line_text))

    return "\n".join(formatted_text)

def clean_text(text):
    """Remove headers, page numbers, and other metadata."""
    lines = text.split('\n')
    cleaned_lines = []

    skip_patterns = [
        r'^\d{4}-\d{2}.*History Bee',  # Headers like "2021-22 A-Set History Bee"
        r'^Bee Round \d+\s*$',  # "Bee Round 1"
        r'^Bee Finals\s*$',  # "Bee Finals"
        r'^Page \d+',  # Page numbers
        r'^Regulation Tossups\s*$',  # Section headers
        r'^Extra Questions\s*$',  # Section headers
        r'^\s*$',  # Empty lines
    ]

    for line in lines:
        line_stripped = line.strip()
        # Skip if line matches any skip pattern
        if any(re.match(pattern, line_stripped) for pattern in skip_patterns):
            continue
        if line_stripped:  # Only add non-empty lines
            cleaned_lines.append(line)

    return '\n'.join(cleaned_lines)

def extract_questions_from_text(text):
    """Extract individual questions and answers from cleaned text."""
    questions = []

    # Pattern to match question numbers: (1), (2), etc.
    # More flexible pattern to handle formatting tags
    question_pattern = r'\((\d+)\)'

    # Split text by question numbers
    parts = re.split(question_pattern, text)

    # Process pairs of (number, content)
    for i in range(1, len(parts), 2):
        if i + 1 >= len(parts):
            break

        q_num = parts[i]
        content = parts[i + 1].strip()

        # Split into question and answer
        # Look for ANSWER: (which might be wrapped in formatting tags)
        answer_match = re.search(r'<strong>ANSWER:</strong>\s*(.+?)(?=\(\d+\)|$)', content, re.DOTALL)
        if not answer_match:
            answer_match = re.search(r'ANSWER:\s*(.+?)(?=\(\d+\)|$)', content, re.DOTALL)

        if answer_match:
            answer_start = answer_match.start()
            question_text = content[:answer_start].strip()
            answer_text = answer_match.group(1).strip()

            # Clean up extra whitespace
            question_text = re.sub(r'\s+', ' ', question_text)
            answer_text = re.sub(r'\s+', ' ', answer_text)

            questions.append({
                'number': int(q_num),
                'question': question_text,
                'answer': answer_text
            })

    return questions

def extract_from_pdf(pdf_path):
    """Extract text from a PDF file with formatting."""
    try:
        doc = fitz.open(pdf_path)
        all_text = []

        for page_num in range(len(doc)):
            page = doc[page_num]
            page_text = get_text_with_formatting(page)
            all_text.append(page_text)

        doc.close()
        return '\n'.join(all_text)
    except Exception as e:
        print(f"Error reading {pdf_path}: {e}")
        return None

def main():
    """Main extraction function."""
    pdf_dir = Path('/Users/matthew/Documents/Code/Python/IAC Website/NatHistBee')
    pdf_files = sorted(pdf_dir.glob('*.pdf'))

    # Initialize question categories
    questions_by_difficulty = {
        'preliminary': [],
        'quarterfinals': [],
        'semifinals': [],
        'finals': []
    }

    print(f"Found {len(pdf_files)} PDF files\n")

    for pdf_file in pdf_files:
        print(f"Processing {pdf_file.name}...")

        # Extract text from PDF
        text = extract_from_pdf(pdf_file)
        if not text:
            continue

        # Clean text
        cleaned_text = clean_text(text)

        # Extract questions
        questions = extract_questions_from_text(cleaned_text)

        # Categorize by difficulty level
        difficulty = get_difficulty_level(pdf_file.name)
        questions_by_difficulty[difficulty].extend(questions)

        print(f"  Extracted {len(questions)} questions ({difficulty})")

    # Calculate totals
    total_questions = sum(len(q) for q in questions_by_difficulty.values())

    # Save to JSON
    output = {
        **questions_by_difficulty,
        'metadata': {
            'total_preliminary': len(questions_by_difficulty['preliminary']),
            'total_quarterfinals': len(questions_by_difficulty['quarterfinals']),
            'total_semifinals': len(questions_by_difficulty['semifinals']),
            'total_finals': len(questions_by_difficulty['finals']),
            'total': total_questions
        }
    }

    output_file = pdf_dir / 'questions.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*50}")
    print(f"Questions by difficulty level:")
    print(f"  Preliminary:    {len(questions_by_difficulty['preliminary']):,}")
    print(f"  Quarterfinals:  {len(questions_by_difficulty['quarterfinals']):,}")
    print(f"  Semifinals:     {len(questions_by_difficulty['semifinals']):,}")
    print(f"  Finals:         {len(questions_by_difficulty['finals']):,}")
    print(f"{'='*50}")
    print(f"Grand total: {total_questions:,}")
    print(f"{'='*50}")
    print(f"\nSaved to {output_file}")

if __name__ == '__main__':
    main()
