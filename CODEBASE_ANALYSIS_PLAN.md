# HBReader Codebase Analysis And Improvement Plan

Generated: 2026-04-27

## Implementation Progress

Initial fix pass completed on 2026-04-27:

- Replaced deny-all Firestore rules with scoped user/profile/history, leaderboard, and account-recovery rules.
- Persisted default profile documents for new verified users.
- Reworked account recovery to use an `accountRecovery` lookup document instead of scanning every user.
- Added sanitized rendering helpers and applied them to high-risk answer, leaderboard, filter, tooltip, and history-detail paths.
- Routed the full history page through `historyPage.js` instead of the legacy session-history renderer.
- Updated the question editor to use canonical answer types and require an answer type before saving.
- Hardened the local editor server to bind to `127.0.0.1`, restrict CORS, keep paths inside the repo, and create backups before writes.
- Added `scripts/check_questions.py` and `scripts/ERROR_PATTERNS.md`.
- Disabled empty difficulty options by deriving counts from the loaded question-set data.

Important remaining work:

- Move XP and leaderboard scoring to a trusted backend path; the current rules constrain client writes but cannot make client-side scoring authoritative.
- Validate Firestore rules with the emulator or a Firebase-authenticated dry run.
- Finish inline-handler and large-template cleanup.
- Add browser smoke tests and dedicated Firestore rules tests.
- Create a production-only hosting directory so development files are not deployed.

## Scope Reviewed

This review covered the static web app, Firebase configuration, question data assets, local question editor, and Python data scripts.

Files and areas inspected:

- App shell and Firebase bootstrap: `index.html`
- Main JavaScript modules: `src/js/*.js`
- Styling: `src/styles/main.css`
- Question data and metadata: `src/assets/*.json`
- Firebase config and rules: `firebase.json`, `firestore.rules`, `.firebaserc`
- Local editor and scripts: `question_editor.html`, `scripts/*.py`
- Project documentation: `README.md`, `CLAUDE.md`

Validation run during review:

- All `src/js/*.js` files pass `node --check`.
- All `scripts/*.py` files pass `python3 -m py_compile`.
- All four JSON asset files parse successfully.
- Data consistency checks found:
  - `nat_hist_bee`: 5,988 questions, 5,988 metadata entries, no duplicate IDs, no missing metadata, no empty question/answer fields, no duplicate normalized question text.
  - `us_hist_bee`: 1,891 questions, 1,891 metadata entries, no duplicate IDs, no missing metadata, no empty question/answer fields, no duplicate normalized question text.
  - `nat_hist_bee` has 5 metadata entries with blank `answer_type`.

## Executive Summary

The question assets are in good shape, but the application had several production-blocking issues around Firebase persistence, leaderboard integrity, DOM rendering safety, and duplicated page rendering. The most urgent problem found during review was that `firestore.rules` denied every Firestore read and write even though authentication, profile, history, XP, and leaderboard flows all depend on Firestore.

The next largest risk is trust placement. XP and leaderboard values are currently calculated and written by the browser. If Firestore rules are opened enough for the app to work, a malicious client can likely inflate XP or write unsafe leaderboard/profile data unless writes are constrained or moved server-side.

The code also uses widespread `innerHTML` interpolation with user-controlled and Firestore-controlled values. That creates XSS exposure, especially through usernames, history documents, and answer display. There are also route/history bugs caused by two competing history modules and DOM structures.

## Priority Findings

### P0: Firestore Was Fully Disabled At Review Time

Evidence:

- `firestore.rules:5-6` denies all reads and writes:

```js
match /{document=**} {
  allow read, write: if false;
}
```

Impact:

- Sign-in can succeed through Firebase Auth, but profile loading/saving, history persistence, XP updates, account recovery, and leaderboard reads/writes cannot work against deployed Firestore.
- Several app paths catch errors and continue, so users may not realize progress is not being saved.

Recommended direction:

- Replace the deny-all rule with least-privilege rules for user-owned profile/history documents and public leaderboard reads.
- Do not simply allow broad client writes to leaderboard documents. That would make XP fraud and stored XSS much easier.

Fix plan:

1. Define the intended Firestore data model:
   - `users/{uid}/profile/data`
   - `users/{uid}/history/{historyId}`
   - `leaderboards/{period}/rankings/{uid}`
   - Optional recovery index, described in the account recovery section.
2. Add security rules:
   - Authenticated users may read/write only their own profile and history.
   - Public users may read leaderboard rankings.
   - Only the owning user may write their leaderboard row if keeping client-side writes temporarily.
   - Validate field names, types, string lengths, and numeric ranges.
3. Add Firestore indexes for actual queries:
   - `users/{uid}/history` ordered by `timestamp`.
   - Leaderboard rankings ordered by `points`.
4. Test with Firebase emulator:
   - Logged-out users cannot write history/profile.
   - User A cannot read/write User B history/profile.
   - Public leaderboard read works.
   - Invalid profile fields and oversized strings are rejected.

Acceptance criteria:

- A verified user can save and reload profile/history.
- An unauthenticated user cannot write anything.
- A user cannot write another user's data.
- The leaderboard can be read publicly but cannot be arbitrarily overwritten by another UID.

### P0: Leaderboard And XP Are Client-Trusted

Evidence:

- `src/js/profile.js:205-246` increments profile XP and writes leaderboard rows from the browser.
- `src/js/leaderboard.js:121-183` recalculates and writes leaderboard rows from browser history.
- `src/js/history.js:25-31` saves history, then updates points in a separate non-transactional step.

Impact:

- If rules are opened for these writes, a modified browser client can send arbitrary XP, levels, usernames, and leaderboard values.
- History save and XP update can drift apart. A history document may be saved even if profile/leaderboard updates fail.
- Repeatedly answering the same easy question can farm XP unless repeat behavior is intentional.

Recommended direction:

- Make history writes the source of truth.
- Move XP and leaderboard updates to a trusted backend path, preferably Cloud Functions or an equivalent server process.

Fix plan:

1. Decide the scoring contract:
   - Whether repeated attempts on the same question should grant XP.
   - Whether only first correct attempt counts.
   - Whether skipped/incorrect attempts affect streaks.
2. Add a backend scoring path:
   - Trigger on creation of `users/{uid}/history/{historyId}`.
   - Recompute or increment profile totals from server-side validated history.
   - Update leaderboard rows server-side.
3. Temporarily, if Cloud Functions are deferred:
   - Use stricter Firestore rules with `request.auth.uid == uid`.
   - Validate leaderboard document fields and numeric bounds.
   - Treat this as a short-term mitigation, not final security.
4. Update client code:
   - `history.js` writes only history.
   - Remove direct leaderboard writes from `profile.js` and `leaderboard.js`, or guard them behind admin/server-only tooling.
5. Add tests:
   - Duplicate history document does not double-award XP if repeats are not allowed.
   - Incorrect/skipped answers do not add XP.
   - Leaderboard totals match profile totals.

Acceptance criteria:

- XP cannot be increased by editing browser JavaScript and calling Firestore directly.
- Recomputing XP from history produces the same profile and leaderboard totals.
- A failed leaderboard update cannot leave profile/history inconsistent.

### P0: Stored And Reflected XSS Risk From `innerHTML`

Evidence:

- `src/js/game.js:335-343` injects `userAnswer` directly into `answerText.innerHTML`.
- `src/js/leaderboard.js:94-103` injects `entry.username` from Firestore into `innerHTML`.
- `src/js/historyPage.js:62-78` builds rows via interpolated HTML.
- `src/js/historyPage.js:142-180` writes question/answer/category values into a new window with `document.write`.
- `src/js/history.js:121-127` places question and answer HTML directly into tooltip `innerHTML`.
- `question_editor.html:848-849` previews editor text via `innerHTML`.

Impact:

- A malicious username or tampered Firestore history document can execute script in other users' browsers once Firestore reads are enabled.
- User answer display can execute locally if the answer includes HTML.
- The app intentionally preserves limited HTML formatting in questions, so a blanket `textContent` conversion would break formatting. The right fix is a sanitizer/renderer with a small allowlist.

Recommended direction:

- Introduce one shared rendering helper for trusted question markup and one helper for plain text.
- Allow only `strong`, `em`, `u`, `br`, and possibly safe pronunciation spans if needed.
- Never insert user-controlled strings with `innerHTML`; use `textContent`.

Fix plan:

1. Create `src/js/dom.js` or `src/js/rendering.js`:
   - `setText(el, value)`
   - `appendText(parent, value)`
   - `sanitizeQuestionHtml(html)`
   - `setQuestionHtml(el, html)`
2. Replace high-risk display paths first:
   - `game.js` user answer display.
   - `leaderboard.js` usernames.
   - `historyPage.js` table rows and detail window.
   - `history.js` tooltips.
   - `filters.js` filter tag labels.
3. For question/answer content:
   - Parse HTML through `DOMParser`.
   - Strip all non-allowlisted tags and attributes.
   - Output sanitized fragments.
4. For the editor:
   - Keep preview HTML support, but use the same sanitizer.
   - Reject saves containing stripped/disallowed tags unless the user confirms.
5. Add tests:
   - Username `<img onerror=alert(1)>` renders as text.
   - User answer `<script>alert(1)</script>` renders as text.
   - Question formatting with `<strong>`, `<em>`, `<u>` still displays.

Acceptance criteria:

- No user-controlled or Firestore-controlled value reaches `innerHTML` unsanitized.
- Existing question formatting still renders.
- Basic XSS payload tests fail safely.

### P1: New Users Can Lose XP Because Profile Docs Are Not Created

Evidence:

- `src/js/profile.js:15-41` creates an in-memory default profile when Firestore has no profile doc, but does not persist it.
- `src/js/profile.js:178-213` uses `updateDoc` for streak/XP. `updateDoc` fails when the profile document does not exist.

Impact:

- A newly verified user who answers questions before saving a profile may have history saved but XP updates fail.
- Errors are logged, but the user receives no clear recovery path.

Fix plan:

1. Persist a default profile immediately after first verified login:
   - Use `setDoc(profileDocRef, defaultProfile, { merge: true })`.
2. Replace profile XP/streak `updateDoc` calls with backend scoring or `setDoc(..., { merge: true })` as a temporary mitigation.
3. Add user-facing failure handling:
   - If history saves but profile update fails, show a non-blocking warning.
   - Offer "recalculate XP" only after the underlying write path is safe.
4. Add regression tests:
   - New verified user answers a correct question.
   - Profile document exists afterwards.
   - XP and history both persist.

Acceptance criteria:

- New users earn XP without first visiting the profile page.
- Profile update failures do not silently disappear.

### P1: History Page Uses The Wrong Rendering Module

Evidence:

- `index.html:374-408` defines the full "Question History" page with `historyPage` controls.
- `src/js/main.js` exposes `historyPage` functions globally.
- `src/js/router.js:3-4` imports `renderHistoryTable` and `restoreHistoryStructure` from `history.js`.
- `src/js/router.js:84-93` renders the history route with `history.renderHistoryTable`, not `historyPage.renderHistoryPageTable`.
- `history.js` also expects an element `#historyItems` (`src/js/history.js:78-80`), but no such element exists in `index.html`.

Impact:

- The history route can show stale or mismatched UI.
- If the unauthenticated message replaces the page, the restore path rebuilds a different legacy structure.
- Session-history code appears orphaned and increases maintenance cost.

Fix plan:

1. Decide whether the session-history sidebar is still a product feature.
2. If not:
   - Remove or archive `history.js` UI rendering functions that target `#historyItems`.
   - Keep persistence functions in a renamed module such as `historyStore.js`.
3. Update router:
   - Import `renderHistoryPageTable` and `restoreHistoryPageStructure` from `historyPage.js`.
   - Use `historyPage` functions for the `#history` route.
4. Split responsibilities:
   - `historyStore.js`: save/load/clear/export history data.
   - `historyPage.js`: page rendering and filters.
5. Add route tests:
   - Logged-out `#history` shows login message.
   - After login, `#history` restores the full history controls.
   - Search/filter/export controls still work after route changes.

Acceptance criteria:

- There is one canonical history page renderer.
- No active module targets missing DOM nodes.

### P1: Answer Checking Is Too Permissive For XP

Evidence:

- `src/js/game.js:282-285` marks an answer correct if either normalized answer includes the other.
- `src/js/game.js:288-305` also allows Levenshtein similarity at the configured tolerance.
- `index.html:172-179` warns that no XP is earned below 80 percent tolerance, but 80 percent plus substring matching can still be generous.

Impact:

- Short partial strings can be accepted for long answers.
- Users can earn XP with weak answers if they discover forgiving substrings.
- Leaderboard integrity suffers even without malicious Firestore writes.

Fix plan:

1. Define answer acceptance rules:
   - Exact normalized match.
   - Accepted aliases from explicit answer annotations.
   - Optional fuzzy match only when answer length is above a minimum and edit distance is small.
   - No one-way substring match unless the substring is an explicit alias.
2. Improve parsing of acceptable answers:
   - Extract bolded primary answers.
   - Parse "accept" and "or" clauses carefully.
   - Strip pronunciation notes and explanatory parentheticals.
3. Add an answer-checking test suite with real examples:
   - Correct aliases.
   - Common misspellings.
   - Too-short partial strings.
   - Long answers with shared words.
4. Show matched alias/debug information only in test mode or dev tooling.

Acceptance criteria:

- Short arbitrary substrings are not accepted.
- Legitimate aliases and minor typos are still accepted.
- XP awarding uses the same tested answer checker.

### P1: Local Question Editor Can Corrupt Metadata Categories

Evidence:

- Runtime answer types use 13 values in `src/js/state.js:72-85`.
- The editor answer-type dropdown exposes only 6 legacy values in `question_editor.html:511-519`.
- Setting a select value not present in its options yields no selected option; saving can blank or replace valid `answer_type`.

Impact:

- Editing a question can unintentionally erase valid metadata.
- Dashboard/filter charts depend on canonical answer types, so corrupted metadata affects user-facing analytics.

Fix plan:

1. Define shared metadata constants for:
   - Regions.
   - Time periods.
   - Answer types.
   - Subject themes.
2. Generate both app filters and editor options from the same source.
3. Add editor validation:
   - Do not save if answer type is blank unless explicitly allowed.
   - Warn when existing metadata contains unknown values.
4. Add a data validation script:
   - Fail if metadata values are not in the canonical lists.

Acceptance criteria:

- Editor option lists exactly match app constants.
- Saving a question preserves valid existing metadata.
- CI/data validation catches unknown or blank answer types.

### P1: Hosted App Exposes Development Files

Evidence:

- `firebase.json:8-14` uses `"public": "."` and ignores only `firebase.json`, dotfiles, and `node_modules`.
- This means `question_editor.html`, `scripts/*.py`, `CLAUDE.md`, Firestore config files, and other repo-root files are candidates for static hosting.
- `README.md:21` points to GitHub Pages, which also serves from the repo surface depending on Pages configuration.

Impact:

- Development-only pages and scripts become public web artifacts.
- The question editor cannot save remotely because it posts to localhost, but publishing it is confusing and unnecessary.
- Public exposure increases the chance that internal notes or future scripts leak.

Fix plan:

1. Create a dedicated deploy directory, for example `public/`.
2. Move/copy only runtime assets into it:
   - `index.html`
   - `favicon.svg`
   - `src/js`
   - `src/styles`
   - `src/assets`
3. Exclude dev-only files:
   - `question_editor.html`
   - `scripts/`
   - `CLAUDE.md`
   - Firestore rules/index files
   - Source PDF/data folders
4. Update `firebase.json` hosting public path.
5. Update GitHub Pages docs/config to match the actual hosting target.

Acceptance criteria:

- Production hosting serves only files required by the app.
- The editor is available only in local development.

### P2: Dynamic Markup And Inline Handlers Make The App Hard To Maintain

Evidence:

- `index.html:41-52`, `index.html:119-123`, and many other nodes use inline `onclick`.
- `src/js/main.js:52-126` exports many functions onto `window`.
- `src/js/dashboard.js:580-739`, `src/js/history.js:369-426`, and `src/js/historyPage.js:282-330` rebuild large page fragments as strings.
- `question_editor.html:7-525` inlines all CSS and `question_editor.html:531-977` inlines all JavaScript, despite project guidance in `CLAUDE.md`.

Impact:

- Harder to test.
- More XSS-prone.
- Route restore paths duplicate HTML and event wiring.
- Future feature changes require edits in multiple markup copies.

Fix plan:

1. Remove inline event handlers from `index.html`.
2. Add event listeners during module initialization using stable IDs or `data-action` attributes.
3. Replace large template strings with DOM-builder helpers or small render functions.
4. Split the editor:
   - `question_editor.html`
   - `src/styles/question-editor.css`
   - `src/js/questionEditor.js`
5. Keep `window.*` exports only for a short compatibility period, then remove them.

Acceptance criteria:

- No production UI interaction depends on inline HTML handlers.
- Route restoration and initial page rendering share the same renderer.
- Editor code follows the same file separation rules as the main app.

### P2: Missing Automated Test And Validation Harness

Evidence:

- No `package.json`, test framework, lint config, or browser smoke test exists.
- `CLAUDE.md:11-27` requests an error-checking script and `scripts/ERROR_PATTERNS.md`, but neither exists.
- README references scripts that are not present (`README.md:70-75`).

Impact:

- Bugs in routing, answer checking, metadata, and rendering can regress silently.
- Data pipeline issues are found manually instead of being blocked before commit/deploy.

Fix plan:

1. Add minimal Node tooling:
   - `package.json`
   - ESLint or Biome
   - Prettier or formatter choice
   - Vitest for pure functions
   - Playwright for browser smoke tests
2. Extract pure functions for testability:
   - Answer normalization/checking.
   - Leaderboard period key generation.
   - Metadata validation.
   - History filtering.
3. Add `scripts/check-questions.js` or `scripts/check_questions.py`:
   - JSON parse validation.
   - Duplicate IDs.
   - Duplicate normalized question text.
   - Missing metadata.
   - Unknown metadata categories.
   - Blank answer types.
   - Disallowed HTML tags/attributes.
4. Add `scripts/ERROR_PATTERNS.md`.
5. Add a smoke test:
   - Load app.
   - Start a question.
   - Buzz.
   - Submit answer.
   - Switch question sets.
   - Navigate dashboard/history/profile/leaderboard.

Acceptance criteria:

- `npm test` or equivalent validates core logic.
- Data validation can be run before deploying updated question assets.
- Browser smoke test catches broken routes and missing DOM nodes.

### P2: Question Set Counts And Difficulty Options Are Hardcoded

Evidence:

- `index.html:145-148` hardcodes National History Bee difficulty counts.
- The US set has 0 quarterfinals, but the dropdown still offers Quarterfinals.
- `README.md:7-8` describes only the National History Bee counts even though the app also supports US History Bee.

Impact:

- Selecting US History Bee + Quarterfinals yields no questions.
- Counts can drift whenever assets are regenerated.

Fix plan:

1. Derive category counts from loaded JSON.
2. Update difficulty dropdown labels after each question-set load.
3. Disable or hide empty categories.
4. Update README with both question sets and generated counts.
5. Add data validation output that can update documentation or a checked-in manifest.

Acceptance criteria:

- Difficulty labels always match the selected question set.
- Empty categories cannot be accidentally selected unless deliberately exposed as disabled.

### P2: Performance And Caching Need A Deployment Strategy

Evidence:

- Initial National History Bee load fetches about 5.7 MB of JSON (`questions` plus `metadata`).
- US History Bee assets add about 2.0 MB.
- `index.html:6-8` includes no-cache meta tags.
- There is no hashed asset build, manifest, or Firebase cache-header strategy.

Impact:

- Mobile users may experience slow first load.
- If no-cache headers are applied by the host, repeat visits may not benefit from caching.
- Without hashed filenames, aggressive caching risks stale question data.

Fix plan:

1. Decide whether to keep no-build static hosting or add a small build step.
2. Add an asset manifest with versioned JSON filenames, or configure conservative cache headers:
   - HTML: short/no cache.
   - JS/CSS/assets with content hashes: long immutable cache.
   - Unhashed JSON: shorter cache plus explicit version query string.
3. Consider splitting question assets by set and difficulty:
   - `nat_hist_bee/preliminary.json`
   - `nat_hist_bee/finals.json`
   - Matching metadata partitions.
4. Lazy-load metadata only when filters/dashboard/history need it, or load a compact metadata index first.
5. Add loading and fetch-error UI.

Acceptance criteria:

- Initial practice load fetches only the selected set/category or a clearly justified bundle.
- Repeat loads are cached safely.
- Failed asset fetches show a useful user message.

### P2: Local Editor Server Is Over-Permissive For A File-Writing Tool

Evidence:

- `scripts/editor_server.py:29-35` allows CORS from `*`.
- `scripts/editor_server.py:185` binds to all interfaces with `("", PORT)`.
- `scripts/editor_server.py:70-72` computes backup data but does not create backups.
- The editor posts to a hard-coded localhost URL in `question_editor.html:886`.

Impact:

- If the server is running on a shared network, other local/network pages can post changes to it.
- Mistaken edits write directly to the canonical JSON files with no automatic backup.

Fix plan:

1. Bind to `127.0.0.1` by default.
2. Restrict CORS to `http://localhost:{PORT}` and `http://127.0.0.1:{PORT}`.
3. Add actual backups before writing:
   - `backup/questions_<timestamp>.json`
   - `backup/metadata_<timestamp>.json`
4. Validate file paths stay inside the repo or explicit allowlist.
5. Add a dry-run or diff endpoint before save.
6. Use relative `/save` from the editor when served by the editor server.

Acceptance criteria:

- Save creates backups.
- Remote origins cannot write to the local editor server.
- Invalid file paths are rejected.

### P3: CSS And UI State Cleanup

Evidence:

- `src/styles/main.css:310-312` and `src/styles/main.css:1280-1282` reference `--warning-yellow`, which is not defined.
- `src/styles/main.css:1881` references `--accent-color`, which is not defined.
- CSS includes styles for `historyItems`/session history that are not present in the current app shell.

Impact:

- Some states may render with invalid or fallback colors.
- Dead styles make layout work harder to reason about.

Fix plan:

1. Define missing variables or replace them with existing variables.
2. Remove CSS for deleted DOM/features after resolving history-module ownership.
3. Add a simple style audit:
   - Search for `var(--` references.
   - Compare against variables defined in `:root`.
4. Review mobile layouts after cleanup.

Acceptance criteria:

- No CSS custom property references are undefined.
- Removed/dead UI code has no orphaned CSS.

## Recommended Implementation Sequence

### Phase 1: Make Persistence Correct And Safe

Files likely touched:

- `firestore.rules`
- `firestore.indexes.json`
- `src/js/history.js`
- `src/js/profile.js`
- `src/js/leaderboard.js`
- Optional new backend/functions directory

Tasks:

1. Decide final server-authoritative XP model.
2. Add least-privilege Firestore rules.
3. Persist default profiles on first verified login.
4. Stop trusting arbitrary client leaderboard writes.
5. Add emulator tests for rules and persistence.

Risk:

- This is the highest-impact work because it changes the persistence contract.
- It should be done before opening Firestore rules in production.

### Phase 2: Fix XSS-Prone Rendering

Files likely touched:

- New `src/js/rendering.js`
- `src/js/game.js`
- `src/js/leaderboard.js`
- `src/js/history.js`
- `src/js/historyPage.js`
- `src/js/filters.js`
- `question_editor.html` or new editor JS file

Tasks:

1. Add shared text and sanitized question-markup render helpers.
2. Replace unsafe `innerHTML` paths for user and Firestore data.
3. Keep allowlisted formatting for official question content.
4. Add XSS regression tests.

Risk:

- Sanitizer mistakes can break question formatting. Test with representative formatted questions before deploying.

### Phase 3: Unify Routing And History UI

Files likely touched:

- `src/js/router.js`
- `src/js/history.js`
- `src/js/historyPage.js`
- `src/js/main.js`
- `index.html`
- `src/styles/main.css`

Tasks:

1. Split history persistence from history page rendering.
2. Make the router use only `historyPage` for the full history route.
3. Remove or restore the missing session-history UI intentionally.
4. Add route smoke tests.

Risk:

- Existing users' stored history documents should remain compatible.

### Phase 4: Repair Editor And Data Pipeline

Files likely touched:

- `question_editor.html`
- New `src/js/questionEditor.js`
- New `src/styles/question-editor.css`
- `scripts/editor_server.py`
- New `scripts/check-questions.*`
- New `scripts/ERROR_PATTERNS.md`
- `README.md`

Tasks:

1. Use shared metadata constants.
2. Fix answer-type dropdown mismatch.
3. Add data validation script required by project instructions.
4. Make editor server safer and backup-before-write.
5. Update README script documentation.

Risk:

- Editor changes can accidentally modify large JSON formatting; preserve current JSON formatting style or accept a one-time mechanical reformat.

### Phase 5: Add Tooling, Tests, And Deployment Hygiene

Files likely touched:

- `package.json`
- Test files
- `firebase.json`
- Deployment docs
- Optional `public/` or build output config

Tasks:

1. Add lint/test scripts.
2. Add browser smoke tests.
3. Create a production public directory or explicit deploy ignore list.
4. Set caching strategy for HTML, JS/CSS, and JSON.
5. Update docs for Firebase vs GitHub Pages deployment.

Risk:

- Introducing a build step changes the local development workflow. Keep it minimal if static hosting simplicity is important.

## Suggested First Fix PR

Best first PR scope:

1. Add Firestore rules and emulator tests.
2. Persist default profile docs with `setDoc(..., { merge: true })`.
3. Add explicit error UI for failed history/profile saves.

Why first:

- It addresses the current production blocker.
- It reduces silent data loss.
- It establishes the data access contract before other UI and security work builds on it.

Second PR:

1. Add render/sanitize helpers.
2. Fix leaderboard username and answer display XSS.
3. Add XSS regression tests.

Third PR:

1. Unify history page routing.
2. Remove or restore session-history UI.
3. Add route smoke tests.

## Notes On Things That Look Good

- The main question/metadata assets are internally consistent.
- ES modules are already split by feature, which gives a good base for further cleanup.
- Basic syntax checks pass for JavaScript and Python.
- The app avoids framework complexity, so focused cleanup can significantly improve safety without a rewrite.
