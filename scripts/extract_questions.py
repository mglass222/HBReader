#!/usr/bin/env python3
"""
Extract History Bee questions from PDF files and save to JSON with formatting.

Usage:
    python extract_questions.py [--input DIR] [--output FILE]

Options:
    --input, -i   Directory containing PDF files (default: current directory)
    --output, -o  Output JSON file (default: questions.json in input directory)
"""

import argparse
import json
import re
from pathlib import Path
import fitz  # PyMuPDF


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

def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(
        description='Extract History Bee questions from PDF files',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python extract_questions.py --input /path/to/pdfs --output nat_hist_bee_questions.json
  python extract_questions.py -i ./pdfs -o us_hist_bee_questions.json
"""
    )
    parser.add_argument('--input', '-i', required=True,
                        help='Directory containing PDF files')
    parser.add_argument('--output', '-o', required=True,
                        help='Output JSON file')
    return parser.parse_args()


def main():
    """Main extraction function."""
    args = parse_args()

    pdf_dir = Path(args.input)
    output_file = Path(args.output)

    all_pdf_files = sorted(pdf_dir.glob('*.pdf'))

    # Filter out answer key files
    pdf_files = [f for f in all_pdf_files if 'answer' not in f.name.lower() and 'key' not in f.name.lower()]
    skipped = len(all_pdf_files) - len(pdf_files)

    print("=" * 50)
    print("Question Extraction Script")
    print("=" * 50)
    print(f"\nInput directory: {pdf_dir}")
    print(f"Output file: {output_file}")

    # All questions in a flat list
    all_questions = []

    print(f"Found {len(all_pdf_files)} PDF files ({skipped} answer keys skipped)\n")

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

        # Add source filename to each question
        for q in questions:
            q['source_file'] = pdf_file.name

        all_questions.extend(questions)

        print(f"  Extracted {len(questions)} questions")

    # Save to JSON (flat list)
    output = {
        'questions': all_questions,
        'metadata': {
            'total': len(all_questions)
        }
    }

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*50}")
    print(f"Total questions extracted: {len(all_questions):,}")
    print(f"{'='*50}")
    print(f"\nSaved to {output_file}")

if __name__ == '__main__':
    main()
