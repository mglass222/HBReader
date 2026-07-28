# Firestore Rules Tests

Unit tests for `firestore.rules` using `@firebase/rules-unit-testing` v3 and
the built-in `node:test` runner. They run against the local Firestore
emulator - nothing touches the real project.

## Requirements

- **Java 11+** (the Firestore emulator is a JVM app):

  ```bash
  brew install openjdk@17
  # if java isn't on PATH afterwards:
  sudo ln -sfn /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk \
    /Library/Java/JavaVirtualMachines/openjdk-17.jdk
  ```

- **firebase-tools** and the testing libraries (dev deps):

  ```bash
  npm i -D firebase-tools @firebase/rules-unit-testing firebase
  ```

  (`firebase` is a peer dependency of `@firebase/rules-unit-testing`; the
  tests import `firebase/firestore` for the modular `doc`/`getDoc`/`setDoc`
  helpers.)

## Run

From the repo root:

```bash
npx firebase emulators:exec --only firestore --project demo-hbreader \
  "node --test tests/firestore-rules/"
```

`emulators:exec` boots the Firestore emulator, runs the command, and shuts
the emulator down. The `demo-` project prefix tells firebase-tools this is
an offline demo project, so no login or real project is needed. The test
harness auto-discovers the emulator via the `FIRESTORE_EMULATOR_HOST` env
var that `emulators:exec` sets.

Notes:

- The repo's `package.json` has `"type": "module"`, so the test file is
  written as ESM (`import` syntax) - do not convert it to `require()`.
- The rules file is loaded from `../../firestore.rules` relative to the
  test file, so the command works from any working directory.
- Each test starts from a clean slate (`clearFirestore()` in `beforeEach`);
  fixtures are seeded with `withSecurityRulesDisabled` where a test needs
  pre-existing docs (e.g. the leaderboard points-cap check reads the
  profile's `totalPoints` via `get()` in the rules).

## What is covered

- Unauthenticated users cannot read/write profiles or history.
- A verified user cannot write another user's profile, history, or
  leaderboard row.
- An authenticated but unverified (`email_verified=false`) user cannot
  write their own profile.
- Leaderboard `points` greater than the profile's `totalPoints` are
  rejected; `points <= totalPoints` are accepted.
- `accountRecovery` docs can only be created at the caller's own
  lowercased email; valid fields required.
- Anyone (unauthenticated) can read leaderboard rankings for valid period
  IDs; invalid period IDs are rejected.
- History entries with an invalid `status` or an oversized `question`
  (>12000 chars) are rejected; a valid entry is accepted.
