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

## Recent Updates (June 2026)

A large fix-and-improvement pass landed in June 2026. Full details with file references
are in `docs/CODE_REVIEW_2026-06-12.md`. Highlights:

- **Answer checking rewritten** (`src/js/answerChecker.js`): "do not accept" / "prompt on"
  clauses are now respected, single letters and word fragments are rejected, surnames
  still count, and accented answers match their unaccented spellings. Covered by unit tests.
- **XP integrity**: re-buzzing after an answer reveal no longer re-awards XP; weekly
  leaderboards use real ISO weeks (`src/js/leaderboardPeriods.js`); daily/weekly/monthly
  boards now track XP earned *within* the period instead of lifetime totals.
- **Visible feedback**: "+N XP" appears with each correct answer, your XP total and a
  rank/progress card show on the practice page, and any failure to save progress shows
  a toast instead of failing silently.
- **Mobile settings drawer**: settings are now usable below 1024px (previously hidden).
- **Accessibility pass**: WCAG AA contrast across both themes, keyboard focus outlines,
  screen-reader announcements for answers, labeled filters, landmarks, Escape-to-close
  on the login dialog.
- **Security hardening**: Firestore rules cap leaderboard points at your profile total,
  lock account-recovery documents to their owner, and the local editor server rejects
  cross-origin save requests.
- **Server-authoritative scoring scaffold** (`functions/`): a Cloud Function that scores
  answers server-side, deployable in a safe "shadow mode". See the Blaze section below.
- **Question editor** extracted into `src/styles/question-editor.css` +
  `src/js/questionEditor.js`, with an unsaved-changes warning.

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

### Running the tests

The answer checker and leaderboard period keys have unit tests (no dependencies
beyond Node 18+):

```bash
npm test
```

### Running the question editor

```bash
python3 scripts/editor_server.py \
  --questions src/assets/nat_hist_bee_questions.json \
  --metadata src/assets/nat_hist_bee_question_metadata.json
# then open http://127.0.0.1:8765/question_editor.html
```

The server binds to localhost only, creates backups in `backup/` before every save,
and rejects cross-origin or non-JSON save requests.

## Firebase Deployment & Blaze Setup

### One-time tooling

```bash
npm install -g firebase-tools
firebase login
```

### Deploying security rules and hosting

The June 2026 changes to `firestore.rules` and `firebase.json` only take effect once
deployed. Deploy them together (the app code and rules depend on each other —
in particular the account-recovery document ID format):

```bash
firebase deploy --only firestore:rules,hosting
```

What this picks up:
- **Rules**: leaderboard points capped at profile `totalPoints`; account-recovery
  documents writable only at the owner's own email ID.
- **Hosting**: development files (editor, scripts, docs, tests, rules) are excluded
  from the deployed site, and caching headers are set (HTML no-cache, JS/CSS 1 hour,
  question JSON 24 hours).

> **Note:** these exclusions and headers apply to **Firebase Hosting** only. The
> current live site is GitHub Pages, which serves the whole repository as-is —
> including the editor and scripts. If you stay on GitHub Pages, consider moving to
> Firebase Hosting (`firebase deploy --only hosting` and update the README link) to
> get the ignore list and caching behavior.

### Setting up the Blaze plan (required only for Cloud Functions)

Blaze is Firebase's pay-as-you-go billing plan. It is required **only** to deploy the
server-side scoring function in `functions/` — everything else (rules, hosting, the
whole client app) works on the free Spark plan. Blaze includes the same free monthly
quotas as Spark (2M function invocations/month), so at this app's scale the expected
bill is $0 or a few cents for container storage.

1. Open the [Firebase console](https://console.firebase.google.com) and select the
   `hbreader-928fa` project.
2. Click the ⚙️ gear next to "Project Overview" → **Usage and billing** → **Details & settings**
   → **Modify plan** (or the "Upgrade" button in the left sidebar footer).
3. Choose **Blaze (Pay as you go)** and either link an existing Google Cloud billing
   account or create one (requires a credit card).
4. **Set a budget alert** (strongly recommended — Blaze has no hard spending cap):
   during the upgrade flow you'll be offered "Set a billing budget"; enter e.g. $5.
   You'll get an email if usage ever approaches it. (You can also do this later in
   the [Google Cloud console](https://console.cloud.google.com/billing) under
   Budgets & alerts.)
5. That's it — no code changes needed for the upgrade itself.

### Deploying the server-side scoring function

The function (`functions/scoreHistoryEntry`) recomputes XP on the server whenever a
history entry is created, so a modified browser client can't forge points. It ships
with **SHADOW_MODE on by default**: it only *logs* what it would award and writes
nothing, so it is safe to deploy while the current client-side scoring is still live.

```bash
cd functions && npm ci && cd ..
firebase deploy --only functions
```

Then watch its decisions alongside real gameplay:

```bash
firebase functions:log --only scoreHistoryEntry
```

When the logged awards consistently match what the client awards, follow
`docs/SERVER_SCORING_MIGRATION.md` to complete the cutover (client changes, rules
tightening, and flipping `SHADOW_MODE` off). **Do not** disable shadow mode while the
client still writes XP itself — that would double-award points.

### Running the Firestore rules tests

`tests/firestore-rules/` contains 18 tests for the security rules. They need the
Firestore emulator, which requires Java:

```bash
brew install openjdk@17
npm install -D firebase-tools @firebase/rules-unit-testing
npx firebase emulators:exec --only firestore --project demo-hbreader \
  "node --test tests/firestore-rules/"
```

See `tests/firestore-rules/README.md` for details. Run these before any future
change to `firestore.rules`.

## Scripts

| Script | Purpose |
|--------|---------|
| `extract_questions.py` | Extract questions from PDF files |
| `classify_questions.py` | Classify questions by region, time period, and type |
| `check_questions.py` | Validate question JSON, metadata, duplicates, and allowed HTML |
| `cleanup_questions.py` | Clean answer text, check duplicates, and remove duplicates |
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
   python scripts/extract_questions.py --input ./data --output ./src/assets/new_questions.json
   ```

4. Classify the questions:
   ```bash
   python scripts/classify_questions.py --questions ./src/assets/new_questions.json --metadata ./src/assets/new_question_metadata.json
   ```

5. Clean or check the questions:
   ```bash
   python scripts/cleanup_questions.py check --file ./src/assets/new_questions.json
   python scripts/check_questions.py --questions ./src/assets/new_questions.json --metadata ./src/assets/new_question_metadata.json
   ```

## File Structure

```
.
├── index.html                  # Main webpage
├── question_editor.html        # Question editor interface (local dev only)
├── scripts/                    # Utility scripts
│   ├── extract_questions.py    # PDF extraction script
│   ├── classify_questions.py   # Question classification script
│   ├── cleanup_questions.py    # Answer cleaning & deduplication
│   ├── check_questions.py      # Question/metadata validation
│   └── editor_server.py        # Editor server (localhost-only)
├── src/
│   ├── js/                     # App modules (ES modules)
│   │   ├── answerChecker.js    # Pure answer-matching logic (unit-tested)
│   │   ├── leaderboardPeriods.js # ISO-week period keys (unit-tested)
│   │   ├── ui.js               # Toasts + XP feedback
│   │   ├── questionEditor.js   # Question editor logic
│   │   └── ...                 # game, router, profile, history, etc.
│   ├── styles/                 # main.css, question-editor.css
│   └── assets/                 # JSON data files used by the app
├── functions/                  # Cloud Functions (server-side scoring; Blaze plan)
├── tests/                      # Unit tests (npm test) + firestore-rules/ (emulator)
├── docs/                       # Code review + server-scoring migration plan
├── data/                       # Source files (not in git)
├── backup/                     # Backup files (not in git)
├── firebase.json               # Firebase configuration (hosting ignore list, headers)
├── firestore.rules             # Firestore security rules
├── firestore.indexes.json      # Firestore indexes
└── README.md                   # This file
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
