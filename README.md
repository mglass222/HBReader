# History Bee Question Generator

An interactive web application for practicing National History Bee questions with a streaming text display (LLM-style).

## Features

- **12,000+ Questions**: Extracted from official History Bee PDFs (2014-2025)
- **5 Difficulty Levels**: Preliminary (9,652), Quarterfinals (196), Semifinals (365), Finals (1,764), Championships (85)
- **Interactive Answer Checking**: Press spacebar to pause and submit your answer
- **Streaming Display**: Questions appear character-by-character, simulating an LLM response
- **Adjustable Speed**: Control reading speed from Very Fast to Very Slow
- **Format Preservation**: Maintains original formatting (bold, italic, underline) from source PDFs
- **Smart Feedback**: Get immediate feedback on correct/incorrect answers
- **Clean Interface**: Modern, responsive design that works on all devices

## Usage

1. Visit the [live site](https://mglass222.github.io/National-History-Bee/)
2. Select your difficulty level (Preliminary through National Championships)
3. Adjust the reading speed to your preference
4. Click "Next Question" to start
5. Press **SPACE** while question is streaming to pause and answer
6. Or wait for the full question and click "Show Answer"

## Technical Details

### Extraction Process

Questions were extracted from PDF files using PyMuPDF (fitz), which preserves:
- **Bold text**: Typically used for answers and key terms
- **Italic text**: Used for book/movie titles and foreign terms
- **Underlined text**: Used for pronunciation guides

The extraction script (`extract_questions.py`):
1. Reads all PDF files in the directory
2. Categorizes questions by difficulty based on filename keywords:
   - "championship" → National Championships
   - "semifinal" → Semifinals
   - "quarterfinal" → Quarterfinals
   - "finals" → Finals
   - Everything else → Preliminary
3. Removes headers, page numbers, and metadata
4. Extracts question-answer pairs with HTML formatting
5. Saves to `questions.json` for fast loading

### Web Application

Built with vanilla HTML/CSS/JavaScript for maximum compatibility:
- **No dependencies**: Pure JavaScript, works offline
- **Fast loading**: Questions pre-processed and stored in JSON
- **Smooth streaming**: Configurable character-by-character display
- **Responsive design**: Works on desktop, tablet, and mobile

## Setup for Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/mglass222/National-History-Bee.git
   cd National-History-Bee
   ```

2. Serve the files (Python 3):
   ```bash
   python3 -m http.server 8000
   ```

3. Open `http://localhost:8000` in your browser

## Regenerating Questions

If you have additional PDF files:

1. Install dependencies:
   ```bash
   pip3 install pymupdf
   ```

2. Place PDF files in the project directory

3. Run the extraction script:
   ```bash
   python3 extract_questions.py
   ```

4. The script will update `questions.json` automatically

## GitHub Pages Deployment

This site is configured for GitHub Pages:

1. Push to the `main` branch
2. Enable GitHub Pages in repository settings
3. Select `main` branch and `/ (root)` as the source
4. Site is live at: https://mglass222.github.io/National-History-Bee/

## File Structure

```
.
├── index.html              # Main webpage
├── questions.json          # Extracted questions (12,062 total)
├── extract_questions.py    # PDF extraction script
├── README.md              # This file
└── *.pdf                  # Source PDF files (not included in repo)
```

## Data Source

Questions are from official National History Bee competitions (2014-2025). PDF files are not included in this repository due to size and copyright considerations.

## License

This project is for educational purposes. Question content is © International Academic Competitions.

## Contributing

Issues and pull requests welcome! Suggestions for improvements:
- Track which questions have been answered
- Add a practice mode with scoring
- Export practice session results
- Add statistics tracking (accuracy, speed, etc.)
- Add question bookmarking

## Credits

Built by Matthew for History Bee practice. Special thanks to the International Academic Competitions for creating these excellent questions.
