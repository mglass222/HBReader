# Migration: Client-Authored XP -> Server-Authoritative Scoring

## Why

Today the client awards its own XP. `src/js/profile.js`
(`updatePointsAndLeaderboard`) increments `totalPoints` /
`questionsAnswered` on the profile and writes leaderboard docs directly.
The rules in `firestore.rules` validate shapes and cap leaderboard
`points` at the profile's `totalPoints` (via a `get()`), but the profile
totals themselves are still client-authored - a tampered client can grant
itself any score up to the rules' numeric ceilings.

The fix is the Cloud Function in `functions/index.js`
(`scoreHistoryEntry`): it triggers on history-doc creation
(`users/{uid}/history/{historyId}`), computes XP from the question id
prefix (P=10, Q=20, S=30, F=50), and transactionally updates the profile
and leaderboards. History docs become the single client-written source of
truth; everything derived from them is server-computed.

## CRITICAL: double-award hazard

If the function runs live while the shipped client still increments XP,
**every correct answer is awarded twice** (once by the client, once by the
function). Therefore:

- `SHADOW_MODE` in `functions/index.js` **defaults to `true`** - the
  function logs what it would award but writes nothing.
- The function may be deployed at any time in shadow mode.
- Flipping `SHADOW_MODE=false` and shipping the client change that removes
  client-side increments must happen **together** (same release window).
  Since the web client updates instantly on deploy, the safe order is:
  deploy the new client first, then flip the function live. The brief gap
  means a few answers earn no XP rather than double XP - the function can
  backfill them later from unscored history docs (`scoredAt` missing).

## Rollout order

1. **Add the functions source to `firebase.json`** (not done in this
   change because `firebase.json` is being edited in parallel):

   ```json
   "functions": { "source": "functions" }
   ```

2. **Deploy the function in shadow mode** (requires the Blaze plan):

   ```bash
   cd functions && npm ci && cd ..
   firebase deploy --only functions
   ```

   Watch logs (`firebase functions:log`) for a few days and verify the
   `SHADOW_MODE: would award XP` entries match the XP the client granted.

3. **Ship the client changes** (see next section).

4. **Go live**: set `SHADOW_MODE=false` in `functions/.env` and redeploy
   `firebase deploy --only functions`.

5. **Tighten the rules** (see "Rules changes" below) so clients can no
   longer write XP fields at all.

6. **Reconcile**: run a one-off admin script that recomputes each user's
   `totalPoints`/`questionsAnswered` from their history docs and fixes any
   drift from the cutover gap (see "Backfill" below).

## Client changes needed (step 3)

All in `src/js/profile.js` and `src/js/history.js`:

1. **`src/js/history.js` - `addToHistory()` / `saveHistoryItem()`**: add an
   `xpEligible` boolean to each history entry. The answer-tolerance gate
   lives only in client localStorage, so the server cannot derive it:

   ```js
   const currentTolerance = parseInt(localStorage.getItem('answerTolerance') || '80');
   historyEntry.xpEligible = status === 'correct' && currentTolerance >= 80;
   ```

   The function honors it: `xpEligible === false` means no XP; `true` or
   absent means eligible (absent keeps legacy docs working).

   **DONE (2026-07-28).** The client now writes `xpEligible` on every history
   entry, and `firestore.rules` `isValidHistoryEntry()` accepts it
   (`hasOnly` allowlist + `optionalBoolean`). Deploy the rules before or
   with this client version or history writes will be rejected.

2. **`src/js/profile.js` - `updatePointsAndLeaderboard()`**: remove the
   server-owned writes, keep the UX:
   - Stop writing `totalPoints: increment(...)` and
     `questionsAnswered: increment(1)` to the profile doc. Keep the
     `currentStreak`/`bestStreak` writes (streaks can remain
     client-authored, or be moved server-side later).
   - Delete the leaderboard `setDoc` calls (allTime + monthly/weekly/daily
     loop) entirely - the function now owns those docs.
   - Keep the optimistic UI (XP toast, level-up notification) by updating
     local `state.userProfile` only, or switch to an `onSnapshot` listener
     on the profile doc so the UI reflects the server-awarded values.

3. **`src/js/profile.js` - `calculateRetroactivePoints()`** (client-side
   backfill helper): do not use it post-migration - clients will no longer
   be allowed to write `totalPoints`. Use the admin backfill script
   instead (below). The function itself stays in the codebase per the
   project's script-preservation policy; just stop invoking it.

   **DONE (2026-07-28, partial):** `saveUsername()` no longer spreads the
   in-memory profile into its write (it was clobbering
   `totalPoints`/`questionsAnswered` from stale state); it now writes only
   `{username, createdAt}`, matching the `saveProfile()` pattern.

## Rules changes needed (step 5)

The Admin SDK used by Cloud Functions **bypasses security rules entirely**,
so the rules don't need any carve-out, service-account match, or custom
claim for the function. They can simply deny clients:

1. **Profile** (`users/{userId}/profile/data`): reject client writes that
   touch `totalPoints` or `questionsAnswered`, e.g. add to the owner-write
   condition:

   ```
   && !request.resource.data.diff(resource == null ? {} : resource.data)
        .affectedKeys().hasAny(['totalPoints', 'questionsAnswered'])
   ```

   (Or remove the two fields from the `isValidProfile()` allowlist if no
   legitimate client write path remains - watch out for profile-creation
   code that seeds them to 0.)

2. **Leaderboards** (`leaderboards/{period}/rankings/{userId}`): change
   `allow create, update` (and `delete`) to `if false` - only the Admin
   SDK writes these now. Keep the public `read`. The `get()`-based points
   cap becomes obsolete and is removed, which also saves a billed read per
   leaderboard write.

3. **History** (`users/{userId}/history/{historyId}`): add `'xpEligible'`
   to the `keys().hasOnly([...])` allowlist in `isValidHistoryEntry()` plus
   an `optionalBoolean('xpEligible')` check. **DONE (2026-07-28).** Also
   deny client writes to the server-owned `scoredAt`/`xpAwarded` markers
   (they are not in the allowlist, so `hasOnly` already rejects them;
   note this makes history docs effectively client-immutable once scored).

   **Delete + recreate (RESOLVED 2026-07-28):** deleting a scored history
   doc and re-creating it with the same ID used to re-trigger scoring with
   the `scoredAt` guard lost. The function now also writes a
   `scoredHistory/{userId}_{historyId}` ledger doc inside the award
   transaction and skips any history ID already in the ledger. The ledger
   collection is covered by the rules' deny-all catch-all (clients cannot
   touch it), so the guard survives history deletion. Client `delete` of
   history can therefore stay enabled for clear-history/recovery flows.

## Backfill / reconciliation (step 6)

`calculateRetroactivePoints()` exists client-side but is the wrong tool
once rules deny client XP writes. Instead, run a **one-off admin script**
(Node + `firebase-admin`, service-account credentials, run from a trusted
machine - it bypasses rules):

- For each user: read all `users/{uid}/history` docs; sum XP over docs with
  `status === 'correct'` and `xpEligible !== false` using the prefix table;
  set `totalPoints`/`questionsAnswered`; recompute level/tier; rewrite the
  `allTime` leaderboard row; stamp `scoredAt`/`xpAwarded` on each counted
  doc so the trigger's idempotency guard sees them as processed.
- Per-period boards (monthly/weekly/daily) can be rebuilt from history
  timestamps with the same `getLeaderboardPath` logic if desired, or left
  to start fresh from the cutover.

Keep the script in `/scripts/` per project policy (e.g.
`scripts/backfill_server_scores.mjs`) when it is written.

## Open caveats

- **Answer correctness is still client-graded**: the trigger trusts the
  client-written `status: 'correct'` and question-id prefix, so a scripted
  client can farm XP by writing fake history docs directly (no tampered app
  needed). This bounds forgery to per-question increments but does not
  eliminate it. Recommended before or shortly after cutover: enable
  **Firebase App Check** (also caps the cost-abuse vector - every forged
  history doc costs a function invocation plus a multi-write transaction).
  Full authority requires server-side answer verification against a
  question bank, which is a larger redesign.
- **Timezone**: `getLeaderboardPath` uses local-time accessors. Cloud
  Functions run in UTC; clients use their own zone. During the brief
  transition both writers exist, so a user near midnight could land in a
  different daily/weekly bucket than the function. Post-migration the keys
  are consistently UTC.
- **Streaks** (`currentStreak`/`bestStreak`) remain client-authored after
  this migration; they are cosmetic and rules-bounded, but could move into
  the same trigger later (the history doc stream contains everything
  needed).
- **Offline answers**: history docs created offline sync later and the
  trigger fires on sync - XP still arrives, bucketed by the entry's own
  `timestamp` (the function uses it for period keys).
