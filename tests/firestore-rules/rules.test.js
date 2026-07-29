// Firestore security rules tests for HBReader (firestore.rules).
//
// Runs against the Firestore emulator via @firebase/rules-unit-testing v3.
// See tests/firestore-rules/README.md for setup (Java 11+, firebase-tools):
//   npx firebase emulators:exec --only firestore --project demo-hbreader \
//     "node --test tests/firestore-rules/"
//
// This file is ESM (the repo package.json sets "type": "module").

import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Resolve firestore.rules relative to this file so the tests work from any cwd.
const RULES_PATH = new URL('../../firestore.rules', import.meta.url);

const ALICE_UID = 'alice-uid';
const ALICE_EMAIL = 'Alice@Example.com'; // mixed case to exercise .lower()
const BOB_UID = 'bob-uid';

let testEnv;

/** Authenticated + email-verified context for Alice. */
const alice = () =>
  testEnv.authenticatedContext(ALICE_UID, {
    email: ALICE_EMAIL,
    email_verified: true
  });

/** Authenticated but UNverified context for Alice. */
const aliceUnverified = () =>
  testEnv.authenticatedContext(ALICE_UID, {
    email: ALICE_EMAIL,
    email_verified: false
  });

/** Unauthenticated context. */
const anon = () => testEnv.unauthenticatedContext();

const profilePath = (uid) => `users/${uid}/profile/data`;
const historyPath = (uid, id) => `users/${uid}/history/${id}`;
const rankingPath = (period, uid) => `leaderboards/${period}/rankings/${uid}`;

const validHistoryEntry = () => ({
  id: 'P12',
  question: 'Who was the first President of the United States?',
  answer: 'George Washington',
  status: 'correct',
  timestamp: Date.now(),
  questionSet: 'us_hist_bee'
});

const validRanking = (points = 100) => ({
  username: 'alice_w',
  points,
  questionsAnswered: 10,
  level: 2,
  tier: 'Bronze',
  lastUpdated: Date.now()
});

/** Seed a profile doc, bypassing rules. */
async function seedProfile(uid, data) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), profilePath(uid)), data);
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-hbreader',
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8')
    }
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// ---------------------------------------------------------------------------
// (a) Unauthenticated users cannot read or write profiles or history.
// ---------------------------------------------------------------------------

test('anon cannot read a profile', async () => {
  await seedProfile(ALICE_UID, { username: 'alice_w', totalPoints: 100 });
  await assertFails(getDoc(doc(anon().firestore(), profilePath(ALICE_UID))));
});

test('anon cannot write a profile', async () => {
  await assertFails(
    setDoc(doc(anon().firestore(), profilePath(ALICE_UID)), {
      username: 'hacker_1'
    })
  );
});

test('anon cannot read history', async () => {
  await assertFails(
    getDoc(doc(anon().firestore(), historyPath(ALICE_UID, 'P12_123')))
  );
});

test('anon cannot write history', async () => {
  await assertFails(
    setDoc(
      doc(anon().firestore(), historyPath(ALICE_UID, 'P12_123')),
      validHistoryEntry()
    )
  );
});

// ---------------------------------------------------------------------------
// (b) Verified user A cannot write user B's profile/history/leaderboard row.
// ---------------------------------------------------------------------------

test('alice cannot write bob profile', async () => {
  await assertFails(
    setDoc(doc(alice().firestore(), profilePath(BOB_UID)), {
      username: 'owned_lol'
    })
  );
});

test('alice cannot write bob history', async () => {
  await assertFails(
    setDoc(
      doc(alice().firestore(), historyPath(BOB_UID, 'P12_123')),
      validHistoryEntry()
    )
  );
});

test('alice cannot write bob leaderboard row', async () => {
  await seedProfile(BOB_UID, { username: 'bob_b', totalPoints: 1000 });
  await assertFails(
    setDoc(
      doc(alice().firestore(), rankingPath('allTime', BOB_UID)),
      validRanking(100)
    )
  );
});

// ---------------------------------------------------------------------------
// (c) Unverified (email_verified=false) user cannot write own profile.
// ---------------------------------------------------------------------------

test('unverified user cannot write own profile', async () => {
  await assertFails(
    setDoc(doc(aliceUnverified().firestore(), profilePath(ALICE_UID)), {
      username: 'alice_w'
    })
  );
});

test('verified user CAN write own valid profile (control)', async () => {
  await assertSucceeds(
    setDoc(doc(alice().firestore(), profilePath(ALICE_UID)), {
      username: 'alice_w',
      totalPoints: 0,
      questionsAnswered: 0
    })
  );
});

// ---------------------------------------------------------------------------
// (d) Leaderboard points are capped at profile totalPoints.
// ---------------------------------------------------------------------------

test('leaderboard write with points > profile totalPoints is rejected', async () => {
  await seedProfile(ALICE_UID, { username: 'alice_w', totalPoints: 100 });
  await assertFails(
    setDoc(
      doc(alice().firestore(), rankingPath('allTime', ALICE_UID)),
      validRanking(101)
    )
  );
});

test('leaderboard write with points <= profile totalPoints is accepted', async () => {
  await seedProfile(ALICE_UID, { username: 'alice_w', totalPoints: 100 });
  await assertSucceeds(
    setDoc(
      doc(alice().firestore(), rankingPath('allTime', ALICE_UID)),
      validRanking(100)
    )
  );
});

// ---------------------------------------------------------------------------
// (e) accountRecovery doc ID must be the caller's lowercased email.
// ---------------------------------------------------------------------------

const validRecoveryDoc = () => ({
  oldUserId: ALICE_UID,
  recoveryEmail: ALICE_EMAIL, // must equal request.auth.token.email exactly
  recoveryEmailNormalized: ALICE_EMAIL.toLowerCase(),
  createdAt: Date.now()
});

test('accountRecovery create at a different doc ID is rejected', async () => {
  await assertFails(
    setDoc(
      doc(alice().firestore(), 'accountRecovery/victim@example.com'),
      validRecoveryDoc()
    )
  );
});

test('accountRecovery create at own lowercased-email ID with valid fields is accepted', async () => {
  await assertSucceeds(
    setDoc(
      doc(alice().firestore(), `accountRecovery/${ALICE_EMAIL.toLowerCase()}`),
      validRecoveryDoc()
    )
  );
});

// ---------------------------------------------------------------------------
// (f) Public (unauthenticated) leaderboard reads of valid periods.
// ---------------------------------------------------------------------------

test('anon can read an allTime leaderboard ranking', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(
      doc(ctx.firestore(), rankingPath('allTime', ALICE_UID)),
      validRanking(100)
    );
  });
  await assertSucceeds(
    getDoc(doc(anon().firestore(), rankingPath('allTime', ALICE_UID)))
  );
});

test('anon can read a valid weekly-period leaderboard ranking', async () => {
  await assertSucceeds(
    getDoc(doc(anon().firestore(), rankingPath('weekly-2026-W24', ALICE_UID)))
  );
});

test('anon cannot read an invalid leaderboard period', async () => {
  await assertFails(
    getDoc(doc(anon().firestore(), rankingPath('bogus-period', ALICE_UID)))
  );
});

// ---------------------------------------------------------------------------
// (g) History entry validation: invalid status / oversized question rejected.
// ---------------------------------------------------------------------------

test('history entry with invalid status is rejected', async () => {
  await assertFails(
    setDoc(doc(alice().firestore(), historyPath(ALICE_UID, 'P12_123')), {
      ...validHistoryEntry(),
      status: 'maybe'
    })
  );
});

test('history entry with oversized question (>12000 chars) is rejected', async () => {
  await assertFails(
    setDoc(doc(alice().firestore(), historyPath(ALICE_UID, 'P12_123')), {
      ...validHistoryEntry(),
      question: 'x'.repeat(12001)
    })
  );
});

test('valid history entry is accepted (control)', async () => {
  await assertSucceeds(
    setDoc(
      doc(alice().firestore(), historyPath(ALICE_UID, 'P12_123')),
      validHistoryEntry()
    )
  );
});

test('history entry with xpEligible boolean is accepted', async () => {
  await assertSucceeds(
    setDoc(doc(alice().firestore(), historyPath(ALICE_UID, 'P12_123')), {
      ...validHistoryEntry(),
      xpEligible: false
    })
  );
});

test('history entry with non-boolean xpEligible is rejected', async () => {
  await assertFails(
    setDoc(doc(alice().firestore(), historyPath(ALICE_UID, 'P12_123')), {
      ...validHistoryEntry(),
      xpEligible: 'yes'
    })
  );
});

test('history entry with server-owned scoredAt marker is rejected', async () => {
  await assertFails(
    setDoc(doc(alice().firestore(), historyPath(ALICE_UID, 'P12_123')), {
      ...validHistoryEntry(),
      scoredAt: Date.now()
    })
  );
});
