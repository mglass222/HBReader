# HBReader

An interactive web application for practicing National History Bee questions with streaming text display.

## Features

- **5,988 Questions**: Extracted from official History Bee PDFs (2014-2025)
- **4 Difficulty Levels**: Preliminary (3,573), Quarterfinals (196), Semifinals (365), Finals (1,854)
- **Question Filters**: Filter by region, time period, and answer type
- **Smart Classification**: Questions categorized by geographic region, historical era, and topic
- **User Accounts**: Track your progress with Firebase authentication
- **Leaderboard**: Compare your performance with other users
- **Streaming Display**: Questions appear character-by-character, simulating a buzzer-style experience
- **Adjustable Speed**: Control reading speed from Very Fast to Very Slow
- **Interactive Answer Checking**: Press spacebar to pause and submit your answer
- **Format Preservation**: Maintains original formatting (bold, italic, underline) from source PDFs
- **Responsive Design**: Works on desktop, tablet, and mobile

## Usage

1. Visit the [live site](https://mglass222.github.io/HBReader/)
2. Create an account or sign in (optional, for progress tracking)
3. Select your difficulty level
4. Use filters to focus on specific regions, time periods, or question types
5. Adjust the reading speed to your preference
6. Click "Next Question" to start
7. Press **SPACE** while question is streaming to pause and answer
8. Or wait for the full question and click "Show Answer"

## Question Categories

### Regions
- United States
- Europe
- Asia
- Latin America & Caribbean
- Americas (Pre-Columbian)
- Africa
- Middle East & North Africa
- Global/Multi-Regional

### Time Periods
- Ancient World (pre-500 CE)
- Medieval Era (500-1450)
- Early Modern (1450-1750)
- Age of Revolutions (1750-1850)
- Industrial & Imperial Age (1850-1914)
- World Wars & Interwar (1914-1945)
- Contemporary Era (1945-present)

## Setup for Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/mglass222/HBReader.git
   cd HBReader
   ```

2. Serve the files (Python 3):
   ```bash
   python -m http.server 8000
   ```

3. Open `http://localhost:8000` in your browser

## Scripts

| Script | Purpose |
|--------|---------|
| `extract_questions.py` | Extract questions from PDF files |
| `classify_questions.py` | Classify questions by region, time period, and type |
| `fix_classifications.py` | Fix any impossible classification combinations |
| `check_duplicates.py` | Check for duplicate questions |
| `remove_duplicates.py` | Remove duplicate questions |
| `editor_server.py` | Server for the question editor UI |

## Regenerating Questions

If you have additional PDF files:

1. Install dependencies:
   ```bash
   pip install pymupdf
   ```

2. Place PDF files in the project directory

3. Run the extraction script:
   ```bash
   python extract_questions.py
   ```

4. Classify the questions:
   ```bash
   python classify_questions.py
   ```

5. Fix any classification issues:
   ```bash
   python fix_classifications.py
   ```

## File Structure

```
.
├── index.html              # Main webpage
├── questions.json          # Extracted questions (5,988 total)
├── question_metadata.json  # Question classifications
├── question_editor.html    # Question editor interface
├── extract_questions.py    # PDF extraction script
├── classify_questions.py   # Question classification script
├── fix_classifications.py  # Classification fix script
├── check_duplicates.py     # Duplicate checker
├── remove_duplicates.py    # Duplicate remover
├── editor_server.py        # Editor server
├── firebase.json           # Firebase configuration
├── firestore.rules         # Firestore security rules
├── firestore.indexes.json  # Firestore indexes
└── README.md               # This file
```

## Technical Details

### Question Extraction

Questions are extracted from PDF files using PyMuPDF (fitz), which preserves:
- **Bold text**: Typically used for answers and key terms
- **Italic text**: Used for book/movie titles and foreign terms
- **Underlined text**: Used for pronunciation guides

### Classification System

Questions are automatically classified using keyword pattern matching:
- **Regions**: Detected based on geographic references (countries, cities, historical figures)
- **Time Periods**: Detected based on dates, historical figures, and era-specific events
- **Answer Types**: Categorized as people, events, documents, places, etc.

The classification system includes safeguards against impossible combinations (e.g., "United States" + "Ancient World").

### Web Application

- **Frontend**: HTML/CSS/JavaScript
- **Backend**: Firebase (Authentication, Firestore)
- **Hosting**: GitHub Pages

## Data Source

Questions are from official National History Bee competitions (2014-2025).

## License

This project is for educational purposes. Question content is © International Academic Competitions.

## Contributing

Issues and pull requests welcome!

## Credits

Built by Matthew for History Bee practice. Special thanks to the International Academic Competitions for creating these excellent questions.
