# HBReader Cloud Functions

Server-authoritative XP scoring. A Firestore trigger (`scoreHistoryEntry`)
fires when a history doc is created at `users/{uid}/history/{historyId}`;
for correct, XP-eligible answers it awards XP to the profile and updates the
leaderboards in one idempotent transaction.

**SHADOW_MODE defaults to `true`** (log only, no writes). Do not set it to
`false` until the client stops awarding XP itself - see
`docs/SERVER_SCORING_MIGRATION.md`.

## One-time setup

The repo's `firebase.json` does not yet declare a functions source. Add:

```json
"functions": { "source": "functions" }
```

(Not done here because `firebase.json` is being modified by parallel work.)

## Install

```bash
cd functions
npm ci   # or: npm install (generates package-lock.json on first run)
```

Requires Node 20 locally to match the deployed runtime (`engines.node`).

## Emulate locally

From the repo root (requires `firebase-tools` and Java 11+ for the
Firestore emulator - `brew install openjdk@17`):

```bash
npm i -g firebase-tools           # or use npx firebase-tools
firebase emulators:start --only functions,firestore
```

Then create a doc at `users/<uid>/history/<id>` in the emulator UI with
`{ id: "P1", status: "correct", timestamp: <ms>, ... }` and watch the
function log its shadow-mode decision.

To test live mode in the emulator, create `functions/.env` with:

```
SHADOW_MODE=false
```

## Deploy

```bash
firebase deploy --only functions
```

Notes:

- Cloud Functions require the **Blaze (pay-as-you-go) plan** on the
  Firebase project.
- On first deploy you may be prompted for the `SHADOW_MODE` parameter
  value; accept the default `true`.
- To go live later: set `SHADOW_MODE=false` in `functions/.env` (or the
  param prompt) and redeploy - but ONLY together with the client change
  that removes client-side XP increments, otherwise XP is double-awarded.
