# HBReader Code Review — 2026-06-12

Consolidated findings from a three-track review (security, correctness, UI/UX) of the
current working tree, including the uncommitted fix pass from the April plan
(`CODEBASE_ANALYSIS_PLAN.md`).

## Implementation status (fix pass, same day)

Implemented and verified (unit tests in `tests/`, browser smoke test):
H1-H5, H7, M1-M11 except as noted, plus: recovery-doc rules lockdown, editor-server
CSRF/Origin/body-size guards, leaderboard `points <= profile.totalPoints` rule,
verification-banner logout fix, missing XP/score/stats feedback elements, mobile
settings drawer, toasts for persistence failures, loading state on Start, dynamic
difficulty counts in initial HTML, `prefers-reduced-motion` for new animations.
New modules: `src/js/answerChecker.js`, `src/js/leaderboardPeriods.js`, `src/js/ui.js`
(+ `package.json` with `npm test` via `node --test`).

Round 2 (2026-06-13) — remaining items implemented:
- **Accessibility/contrast pass**: all flagged WCAG failures fixed via token changes
  (`--primary-blue` #2c6cb0, `--text-tertiary` #767676/#9e9e9e, darker success/error,
  `--btn-primary-bg` shared across themes so white button text stays >= 4.5:1,
  `--header-text`, dark header #1f1f1f instead of white); active nav tab uses dark
  bold text + blue underline; medal/tier colors darkened on light with dark-theme
  overrides; `:focus-visible` outlines; `aria-live` on the answer area; labels/
  aria-labels on all filters and the answer input; `<header>`/`<main>` landmarks;
  auth modal `role="dialog"` + Escape-to-close + focus on open; `aria-current="page"`
  + `document.title` per route; broader `prefers-reduced-motion`.
- **Router**: rewritten as a data-driven route table (`ROUTES` map).
- **Dead code removed**: legacy history-table renderer/export/clear in `history.js`
  (kept persistence + null-guarded session-strip hooks), feedback modal,
  `promptForUsername`, related `window.*` exports.
- **Editor extracted**: `question_editor.html` (1083 → 143 lines) →
  `src/styles/question-editor.css` + `src/js/questionEditor.js` (ES module), plus a
  `beforeunload` unsaved-changes guard. Verified in-browser: 5,988 questions render.
- **Hosting hygiene**: `firebase.json` ignore list now excludes the editor, scripts,
  docs, tests, functions, rules files, and project docs from deploys; caching headers
  added (HTML no-cache, JS/CSS 1h, question assets 24h); no-cache meta tags removed.
- **Server-authoritative scoring scaffold**: `functions/` with a
  `scoreHistoryEntry` Firestore trigger (SHADOW_MODE=true by default — logs, no
  writes; safe to deploy alongside the current client). Period-key/level-threshold
  parity with the client verified programmatically (1,492 date comparisons).
  Migration plan: `docs/SERVER_SCORING_MIGRATION.md`. Requires Blaze plan to deploy.
- **Rules tests scaffold**: `tests/firestore-rules/` (18 tests,
  @firebase/rules-unit-testing). NOT run locally — requires Java + firebase-tools;
  see `tests/firestore-rules/README.md`.

Still open: actually running the rules tests (Java install), deploying
rules/functions, the server-scoring cutover per the migration doc, history-table
pagination/card layout on mobile, splitting question JSON per difficulty.

Notes: account-recovery doc IDs changed from URI-encoded to raw lowercased emails so
rules can bind the ID to `request.auth.token.email.lower()`; reads fall back to the
legacy encoded ID. Period leaderboards now accumulate per-period XP deltas; existing
period docs retain their old lifetime totals until their period rolls over.

## Status of previously planned fixes — verified

| April finding | Status |
|---|---|
| Deny-all Firestore rules | **Fixed.** Granular per-collection rules; cross-user writes blocked; email verification enforced server-side (`verified()` checks `email_verified` token). |
| innerHTML XSS | **Largely fixed.** All user/Firestore-controlled data goes through `textContent`, `escapeHtml`, or the `rendering.js` sanitizer. The sanitizer itself is robust (rebuilds a fresh DOM allowing only `strong/em/u/br`, copies no attributes — not vulnerable to mutation XSS). |
| Router used wrong history module | **Fixed.** `router.js:4` now imports from `historyPage.js`. |
| Profile doc not created for new users | **Fixed.** `profile.js:42-47` persists a default profile via `setDoc(..., {merge:true})`. |
| Hardcoded difficulty counts | **Fixed** at runtime (`questions.js:42-66` derives counts from data, disables empty options). Stale hardcoded counts remain in `index.html:145-148` as initial text. |
| Editor server over-permissive | **Mostly fixed.** Binds 127.0.0.1, restricted CORS, correct path containment via `Path.relative_to`, backups before write. Residual CSRF gap (below). |

---

## High-severity bugs (gameplay correctness / data integrity)

### H1. Answer checker accepts explicitly rejected answers — `game.js:233`
`extractAcceptableAnswers` uses `/accept\s+([^;)]+)/gi`, which also matches inside
"do **not accept** or prompt on Russia". Verified against data: **203 answers** in
nat_hist_bee contain "do not accept". For `<strong>Soviet Union</strong> (… do not
accept or prompt on Russia)`, typing "russia" is scored **correct**.
**Fix:** strip `do not accept …` / `prompt on …` clauses before extraction; require a
negative lookbehind on `accept`.

### H2. Substring match with no minimum length — `game.js:294-296, 307-318`
`normalizedAcceptable.includes(normalizedUser)` means a 1-character answer ("u" for
"Soviet Union") is correct. The fallback at 307-318 normalizes the entire answer field
including parentheticals, so any word appearing anywhere in the answer line (including
rejected alternatives) passes.
**Fix:** require minimum user-answer length (≥3 chars or ≥ half the target), drop the
whole-field fallback.

### H3. XP farming: re-buzz after reveal re-awards XP — `game.js:505-511, 363`
The Space handler and the always-visible Buzz button only check
`state.currentQuestion && !state.answerInputShown`; after grading, `answerInputShown`
resets to false, so Space+Enter on a revealed question re-runs `addToHistory` +
`updatePointsAndLeaderboard` indefinitely — unlimited XP and duplicate history rows.
**Fix:** guard on `state.currentSection === 'question'` in the keydown handler and at
the top of `showAnswerInput`/`checkAnswer`.

### H4. Weekly leaderboard key is week-of-month — `leaderboard.js:18`, duplicated `profile.js:401`
`Math.ceil((now.getDate() + 6 - now.getDay()) / 7)` yields 1–6, so week 2 of June and
week 2 of July both write to `weekly-2026-W02`. Weekly boards merge across months and
never reset on real week boundaries.
**Fix:** ISO week number in one shared helper (also used by `deleteAccount`).

### H5. Question IDs collide across question sets — `historyPage.js:58,137`, `history.js:178`, `dashboard.js:99,263`
Both sets use bare IDs (`P0…`, `S0…`) with **1,891 overlapping IDs**. Metadata lookups
are `state.questionMetadata[entry.id]` with no set qualifier, and only the currently
loaded set is in memory. History/dashboard stats attribute wrong region/time/type to
entries from the other set; `openQuestionDetail` can open a **different question
entirely**.
**Fix:** key metadata by `${questionSet}:${id}`; pass row index or `id+timestamp` to
the detail view.

### H6 (security). XP/leaderboard values remain client-authored — `firestore.rules:105,170-172`, `profile.js:215-251`
Rules validate type and range only. Any authenticated user can `setDoc` their own
profile `totalPoints: 10000000` and matching leaderboard row from the browser console
and top every board. Range caps bound, but do not eliminate, the original risk.
**Fix:** move scoring to a Cloud Function triggered on history-doc creation; until
then, at minimum require leaderboard `points <= get(profile).totalPoints` in rules.

### H7 (UX, but effectively a broken feature). Settings panel unreachable below 1024px — `main.css:899-906`, `settings.js:113-126`
`.settings-panel { display: none }` is unconditional at `max-width: 1024px`, and
`toggleSettings()` only toggles `.collapsed`. On tablets/phones, difficulty, speed,
filters, and the theme toggle are completely inaccessible.
**Fix:** mobile drawer/overlay, or scope the hide to `:not(.mobile-open)`.

---

## Medium-severity findings

### Security
- **Account-recovery DoS** — `firestore.rules:228`: `update` on `accountRecovery/{id}`
  never checks `resource.data` (existing doc) ownership, so any verified user can
  clobber any other user's recovery doc, silently blocking that user's recovery.
  Fix: require `resource.data.oldUserId == request.auth.uid` on update (or make docs
  write-once) and bind the doc ID to `recoveryEmailNormalized`.
- **Editor server CSRF** — `editor_server.py:49-69`: CORS headers don't stop a
  cross-origin "simple" POST (`Content-Type: text/plain`) from executing `/save`.
  A malicious page visited while the server runs can blind-tamper question files.
  Fix: reject requests without a localhost `Origin` and require
  `Content-Type: application/json`; cap `Content-Length`.
- `profile.recoveryEmail` can be arbitrary when not deleting (loose invariant,
  `firestore.rules:21-26,115-120`); leaderboard reads fully public (likely intended —
  usernames are harvestable); no CSP (precluded by inline handlers).

### Correctness
- **Period leaderboards store all-time totals** — `profile.js:243-250`,
  `leaderboard.js:183-189`: every period doc gets lifetime `totalPoints`, so "Today"
  ranks by all-time XP. Fix: per-period `increment(xpEarned)`.
- **Pause→Resume drops end-of-question callback** — `game.js:401-407` duplicates
  `streamText` minus the `showAnswerInput` callback; after any pause the answer input
  never auto-appears. Fix: make `streamText` resumable, delete `resumeQuestion`.
- **Silent persistence failures** — `history.js:47-49`, `profile.js:51-53,253-255`,
  `questions.js:19-21`, `filters.js:10-12`: all save/load failures are
  `console.error` only. If `loadUserProfile` fails, all subsequent XP awards silently
  no-op (`profile.js:169` guard). Fix: toast/banner on save failure, retry on load.
- **Streaks not persisted on some correct-answer paths** — `profile.js:199-208`:
  correct answer with tolerance < 80 (or unknown difficulty) updates streak in memory
  only; reverts on reload.
- **Question-set switch race** — `questions.js:12-22,68-84`: two rapid set changes run
  un-cancelled fetch chains; last-to-resolve wins regardless of selection. Fix:
  sequence token or AbortController.
- **`clearHistoryPage` clears local state before remote delete** —
  `historyPage.js:244-287`: if Firestore deletion fails, UI says cleared but data
  returns on reload. Also skips `emailVerified` check.
- **Unguarded `meta.regions[0]`** — `historyPage.js:59-60,227-228`: one metadata row
  without `regions` throws and blanks the whole History page. Fix: `meta?.regions?.[0] ?? 'N/A'`.
- **Full history re-downloaded every tab switch** — `router.js:55-57,90-92`: each
  Dashboard/History navigation re-reads the entire Firestore collection. Fix: cache
  with a dirty flag.
- **~6MB JSON fetched serially, blocking all routes** — `main.js:166-173`,
  `questions.js:12-16`: questions then metadata awaited sequentially before
  `handleRouteChange()`, so even #leaderboard waits on practice data; no in-memory
  cache when switching sets back. Fix: `Promise.all`, don't block routing, memoize.
- **Accents deleted, not folded** — `game.js:255`: "José Martí" → "jos mart".
  Fix: `normalize('NFD').replace(/[̀-ͯ]/g, '')` first.
- **`saveProfile` clobbers counters** — `profile.js:590-603`: writes
  `totalPoints`/`questionsAnswered` from stale memory, undoing concurrent
  `increment()`s. Fix: omit counter fields from the profile-form save.

### UX
- **Dead feedback hooks**: `#xpDisplayContainer` (`xpSystem.js:217`), `#pointsDisplay`
  (`profile.js:58-68`), `#stats` (`questions.js:25`), `#historyItems` (`history.js:80`)
  exist nowhere in `index.html`. Users see **no XP gained, no running score, no
  session history** after answering — the biggest feedback gap in the practice flow.
- **Verification banner "Close" button can log the user out** — `index.html:61` →
  `checkVerificationStatus()` calls `handleLogout()` if still unverified. Rename and
  add a true dismiss.
- **No loading indicator** for the ~6MB startup fetch; early Start click →
  `alert('No questions available…')`. Failure leaves stale hardcoded counts forever.
- **~30 `alert()`/`confirm()` call sites**; a toast component already exists in
  `question_editor.html:1068` — port it.
- **History empty state** says "No questions match your filters" for brand-new users
  (`historyPage.js:21`).

---

## Accessibility (WCAG estimates from actual hex values)

Failures (AA, 4.5:1 normal / 3:1 large+UI):
- Nav tabs #666 on #d3d3d3 header: 3.8:1; active tab #4a90e2 on #d3d3d3: 2.2:1.
- Dark mode header flips to **white** (`main.css:52`); tabs #a0a0a0 on white: 2.6:1 —
  entire dark-mode header fails.
- White on #4a90e2 (primary buttons, buzz, filter tags): 3.3:1; dark-mode #5ba3f5: 2.6:1.
- `--text-tertiary` #999 on white: 2.9:1 (placeholders, hints, axis labels).
- Gold rank "1" #FFD700 on white: **1.4:1**; silver: 1.8:1. Level-up button white on
  gold (`xpSystem.js:198`): ~1.3:1, effectively invisible.
- Buzz marker `(#)` #4a90e2 on #f5f5f5: 3.0:1.

Other:
- **Zero ARIA attributes** in the app; modals are plain divs (no `role="dialog"`,
  focus trap, or Escape).
- Streamed question text rewrites `innerHTML` every 10ms with no `aria-live`; results
  never announced.
- No `:focus-visible` styles anywhere; inputs do `outline: none`.
- No heading on the practice page; site title is a clickable `div`; no landmarks.
- History search and filter selects have no labels (`index.html:382-400`).
- Keyboard shortcuts (Space/S/N/P/E) work but are hover-tooltip-only discoverable; no
  focus reset or `document.title` update on route change.
- No `prefers-reduced-motion` support.
- Column resizing is mouse-only with a 10px hit area (`historyPage.js:100-116`).
- Mobile buzz button gated on UA sniffing (`settings.js:90-99`), not viewport/touch.

## Responsive / layout

- **Action bar overflows on phones** — `main.css:401-414`: five fixed-position
  buttons need ~390px; a 375px viewport pushes Buzz off-screen. No <480px rule.
- History table truncates ("Cult" for "Cultural History") instead of reflowing; card
  layout under 480px would be better. `isMobile` computed once per render
  (`historyPage.js:18`), so rotation leaves the wrong layout.
- No pagination/virtualization on the history table; search re-renders all rows per
  keystroke with no debounce (`historyPage.js:344`).
- All media queries are desktop-first `max-width` overrides; many mobile fixes are
  double-gated behind `body[data-device="mobile"]`, so narrow desktop windows get the
  broken desktop layout.
- Question detail uses `window.open` + `document.write` — popup-blocker-prone, always
  light-themed. Use an in-app modal/drawer.

## Visual polish

- No undefined CSS variables found (April's `--warning-yellow`/`--accent-color`
  concern is resolved); but many hardcoded hexes bypass tokens
  (`main.css:553,968-970,1290,1546-1547`, `index.html:177`).
- Typography is an ad-hoc pile of ems (0.7–2.5em, some nested); define a type scale.
- Border radii 3/4/6/8/10/12/16px with no system; three competing button styles.
- Dark-mode white header is a jarring inversion; use a dark surface (#1f1f1f).
- Buzz marker can split an HTML entity mid-stream (tags are skipped whole, entities
  are not — `game.js:74-88`).

## Cleanup / dead code

- `history.js` is mostly dead: `#historyItems` exists nowhere; `renderHistoryTable`,
  `restoreHistoryStructure`, `getFilteredHistory`, `initSessionHistoryResizing`
  unreachable. The dead `filterHistory` writes into `#historyTableWrapper` — the same
  ID historyPage uses — and would stomp the real page if ever invoked. Keep only
  `addToHistory`/`saveHistoryItem`/`loadUserHistory` (rename `historyStore.js`).
- Dead feedback modal (`index.html:594`, `game.js:467-475,559-564` — the
  `window.onclick` also clobbers other handlers). Dead `promptForUsername`
  (`profile.js:106-121`, infinite re-prompt if cancelled). Dead `window.revealAnswer`.
- Duplicated constants that drift: answer-type names/colors (dashboard.js:133-164 vs
  state.js, with differing abbreviations), `difficultyNames` (dashboard.js:548 vs
  imported), question-set display names hardcoded in 5 places, region/time/type
  option lists duplicated in index.html and dead history.js code.
- Trend chart buckets by UTC (`toISOString`) while filters use local midnight
  (`dashboard.js:246-249` vs `197`) — evening practice lands on the wrong day.
- `question_editor.html`: ~530 lines inline CSS + ~545 lines inline JS, violating
  CLAUDE.md's own file-separation rule. Otherwise the most polished UX in the repo —
  extract, and port its toast pattern to the main app. Gaps: no unsaved-changes
  guard, fixed 400px sidebar.
- `index.html` still has ~25 inline `onclick` handlers and ~15 inline styles (all
  resolve to real exports — no broken references — but they preclude a CSP).

## Architecture / tooling (unchanged from April plan, still open)

- No package.json, linter, tests, or CI. Highest-value first tests: answer checker
  (H1/H2 cases), leaderboard period keys (H4), Firestore rules via emulator.
- `firebase.json` hosting still serves the repo root (`"public": "."`), exposing the
  editor, scripts, and docs.
- No-cache meta tags force full ~6MB re-download every visit; split questions per
  difficulty and/or set cache headers; merge metadata into question objects.
- Router is positional (`navTabs[0..4]`) with three divergent copies of the
  history-page markup (index.html / historyPage.js restore / dead history.js).
  A data-driven route table would remove ~100 lines.

## Suggested order of attack

1. **Gameplay integrity** (H1–H3): fix answer extraction, minimum-length matching,
   and the re-buzz XP exploit. Add the first unit tests here.
2. **Data model** (H4, H5, M-period-boards): shared ISO-week helper; set-qualified
   metadata keys; per-period leaderboard deltas. (Consider a one-time backfill or
   accept historical drift.)
3. **Mobile settings drawer + practice feedback** (H7, dead XP hooks): restore the
   XP/score displays and make settings reachable on mobile — the two biggest felt
   improvements.
4. **Surface persistence failures** (toasts) and fix the recovery-doc update rule +
   editor CSRF.
5. **Accessibility pass**: contrast tokens, focus-visible, aria-live on the reader,
   labeled filters, dialog semantics.
6. **Longer term**: server-authoritative scoring (Cloud Function on history create),
   hosting public/ directory, asset splitting/caching, router/data-driven cleanup,
   editor extraction.
