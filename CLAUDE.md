# CLAUDE.md - Project Instructions for Claude Code

## PDF Question Extraction

### Extraction Requirements
- **Maintain original formatting** when extracting questions from PDF files
- Preserve line breaks, indentation, numbering, and special characters
- Keep tables, lists, and hierarchical structures intact
- Retain any images or diagrams references

### Error-Checking Script
- **Create and maintain an error-checking script** (e.g., `scripts/check-questions.js` or `scripts/check-questions.py`)
- The script should check for:
  - Spelling errors
  - Formatting inconsistencies
  - Missing question numbers or answer choices
  - Broken references or links
  - Encoding issues or garbled characters
  - Duplicate questions
- **When new error types are discovered, update the script** to catch them automatically
- Log all errors with line numbers and suggested fixes
- The script should be runnable on any new batch of extracted questions

### Error Log
- Keep a running list of error patterns in `scripts/ERROR_PATTERNS.md`
- Document each new error type as it's discovered
- Include examples and the fix applied

---

## Core Principles

### Modern Conventions
- **Always use the most up-to-date conventions** and best practices when writing code
- Prefer modern syntax and APIs over legacy approaches
- If unsure about current best practices, search for the latest documentation
- Avoid deprecated methods, libraries, or patterns

### Script Preservation
- **Never delete scripts or utility files** that have been created during this project
- If a script needs modification, update it in place rather than replacing it
- Before removing any file, explicitly confirm with the user
- Keep a record of created utilities in the `/scripts` or `/utils` directory

### Code Style Preferences
- Use clear, descriptive variable and function names
- Include comments for complex logic
- Prefer modern ES6+ JavaScript syntax
- Use TypeScript when the project supports it

### File Separation & Modularity
- **Always create separate files** for CSS, JavaScript, HTML, and other languages
- **Never inline CSS or JavaScript** in HTML files (except minimal critical CSS if needed)
- **Break JavaScript into logical modules** based on functionality:
  - Group related functions into their own files
  - One component/class per file when possible
  - Create utility modules for shared helper functions
- **Organize CSS** by component or feature, not in one monolithic file
- Use ES6 `import`/`export` for JavaScript modules
- Name files descriptively to reflect their purpose (e.g., `auth.js`, `api-helpers.js`, `form-validation.js`)

## Web Development Defaults

### Frontend
- Default to semantic HTML5
- Use CSS custom properties (variables) for theming
- Prefer Flexbox/Grid over older layout methods
- Mobile-first responsive design approach

### JavaScript/TypeScript
- Use `const` by default, `let` when reassignment is needed
- Prefer async/await over raw promises
- Use optional chaining (`?.`) and nullish coalescing (`??`)
- Destructure objects and arrays when it improves readability

### File Organization
```
project/
├── .firebaserc           # Firebase project aliases (root)
├── firebase.json         # Firebase config (root)
├── firestore.rules       # Firestore security rules (root)
├── firestore.indexes.json
├── storage.rules         # Storage security rules (root)
├── scripts/              # Utility scripts (DO NOT DELETE)
├── data/                 # Large data files NOT used by the program
├── backup/               # All backup files
├── functions/            # Firebase Cloud Functions
├── src/
│   ├── components/
│   ├── styles/
│   ├── utils/
│   └── assets/           # Large JSON files and program assets
├── tests/
└── docs/
```

### Firebase
- **Keep all Firebase config files in the root directory** (firebase.json, .firebaserc, *.rules)
- This is the standard convention and where Firebase CLI expects them
- Cloud Functions go in `/functions/` with their own package.json

### Data File Placement
- **Large data files** that are not explicitly used by the program → `/data/`
- **Large JSON files** that are used by the program → `/src/assets/`
- **All backup files** → `/backup/`
- Keep the `/data/` folder for reference materials, exports, and generated datasets
- Add `/data/` and `/backup/` to `.gitignore` if files are too large for version control

## Workflow Preferences

### Before Starting Work
- Read existing code to understand patterns already in use
- Check for existing utility functions before creating new ones
- Review package.json for available dependencies

### During Development
- Make incremental changes and test frequently
- Explain significant architectural decisions
- Create helper scripts for repetitive tasks and **keep them**

### Testing
- Write tests alongside new functionality when a test framework exists
- Test edge cases and error conditions
- Verify changes don't break existing functionality

## Communication Style
- Be concise but thorough in explanations
- Show relevant code snippets when explaining changes
- Summarize what was done at the end of multi-step tasks
- Ask clarifying questions for ambiguous requirements

## Project-Specific Notes
<!-- Add project-specific conventions, API keys location, deployment notes, etc. -->

