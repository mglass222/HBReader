/**
 * HBReader Cloud Functions - server-authoritative XP scoring.
 *
 * Trigger: a new document in users/{userId}/history/{historyId}.
 * When the answer was correct (and XP-eligible), the function - not the
 * client - awards XP: it increments the user's profile totals, recomputes
 * level/tier, and updates the leaderboard documents, all inside a single
 * Firestore transaction with an idempotency guard.
 *
 * Callable: recalculateXP - self-service server-side recompute of a user's
 * XP from their full history (replaces the old client-side recalculation,
 * which wrote counter fields directly and would break once rules lock them).
 *
 * IMPORTANT - DOUBLE-AWARD HAZARD:
 * The shipped client (src/js/profile.js updatePointsAndLeaderboard) still
 * increments totalPoints/questionsAnswered and writes leaderboard docs
 * itself. Deploying this function in live mode while that client code is
 * still active would award XP TWICE per question. SHADOW_MODE therefore
 * defaults to true (log only, no writes). Flip it to false only when the
 * client change that removes client-side XP increments ships.
 * See docs/SERVER_SCORING_MIGRATION.md for the full rollout plan.
 *
 * ANSWER-TOLERANCE GATING:
 * The client only awards XP when the user's answer tolerance setting is
 * >= 80% (see updatePointsAndLeaderboard). That setting lives in
 * localStorage and is unknown to the server, so the client must write an
 * `xpEligible` boolean on each history doc. This function honors it:
 *   - xpEligible === false  -> no XP, ever.
 *   - xpEligible === true or absent -> XP is awarded for correct answers.
 * (Absent is treated as eligible so that legacy history docs written
 * before the client change still behave like today's client default.)
 */

'use strict';

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineBoolean } = require('firebase-functions/params');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, FieldPath } = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

/**
 * SHADOW_MODE (default: true).
 * In shadow mode the function logs the XP it WOULD award but performs no
 * writes. Set the env/param SHADOW_MODE=false (e.g. via functions/.env or
 * `firebase deploy` param prompt) to go live - but only together with the
 * client change that stops client-side XP increments.
 */
const SHADOW_MODE = defineBoolean('SHADOW_MODE', {
  default: true,
  description:
    'Log-only mode: compute XP but write nothing. Must stay true until the client stops awarding XP itself.'
});

// ---------------------------------------------------------------------------
// XP values - ported from src/js/state.js POINTS_VALUES.
// Keyed on the first character of the question id (its round prefix).
// ---------------------------------------------------------------------------
const POINTS_VALUES = {
  P: 10, // Preliminary
  Q: 20, // Quarterfinals
  S: 30, // Semifinals
  F: 50  // Finals
};

// ---------------------------------------------------------------------------
// Level thresholds - ported verbatim from src/js/xpSystem.js.
// getXPForLevel(level) returns the cumulative XP needed to REACH that level.
// ---------------------------------------------------------------------------
function getXPForLevel(level) {
  if (level <= 0) return 0;
  if (level <= 10) return level * 100;
  if (level <= 20) return 1000 + (level - 10) * 200;
  if (level <= 30) return 3000 + (level - 20) * 400;
  if (level <= 40) return 7000 + (level - 30) * 600;
  if (level <= 50) return 13000 + (level - 40) * 800;
  if (level <= 60) return 21000 + (level - 50) * 1000;
  if (level <= 70) return 31000 + (level - 60) * 1500;
  if (level <= 80) return 46000 + (level - 70) * 2000;
  if (level <= 90) return 66000 + (level - 80) * 3000;
  return 96000 + (level - 90) * 5000;
}

// Ported verbatim from src/js/xpSystem.js getLevelFromXP.
function getLevelFromXP(xp) {
  if (xp < 0) return 1;
  for (let level = 1; level <= 100; level++) {
    if (xp < getXPForLevel(level)) return Math.max(1, level - 1);
  }
  return 100;
}

// ---------------------------------------------------------------------------
// Tier mapping - ported from src/js/state.js RANK_CONFIG.tiers.
// Colors are presentation-only and intentionally omitted server-side.
// ---------------------------------------------------------------------------
const TIERS = [
  { name: 'Bronze', minLevel: 1, maxLevel: 10 },
  { name: 'Silver', minLevel: 11, maxLevel: 20 },
  { name: 'Gold', minLevel: 21, maxLevel: 35 },
  { name: 'Platinum', minLevel: 36, maxLevel: 50 },
  { name: 'Diamond', minLevel: 51, maxLevel: 70 },
  { name: 'Master', minLevel: 71, maxLevel: 85 },
  { name: 'Grandmaster', minLevel: 86, maxLevel: 100 }
];

// Ported from src/js/xpSystem.js getTierForLevel.
function getTierForLevel(level) {
  for (const tier of TIERS) {
    if (level >= tier.minLevel && level <= tier.maxLevel) return tier;
  }
  return TIERS[0];
}

// ---------------------------------------------------------------------------
// Leaderboard period keys - ported verbatim from src/js/leaderboardPeriods.js.
// The client and the server MUST produce identical keys or per-period boards
// would fork. Caveat: these use local-time Date accessors; Cloud Functions
// gen2 containers run in UTC, while clients use their own timezone. Around
// midnight a client and the server can disagree on the daily/weekly/monthly
// bucket. That skew already exists between clients in different timezones
// today; once the server is the only writer (post-migration) keys become
// consistently UTC-based.
// ---------------------------------------------------------------------------

// ISO-8601 week: weeks start Monday; week 1 contains the year's first Thursday.
function getISOWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function getLeaderboardPath(period, now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  switch (period) {
    case 'monthly':
      return `monthly-${year}-${month}`;
    case 'weekly': {
      const iso = getISOWeek(now);
      return `weekly-${iso.year}-W${String(iso.week).padStart(2, '0')}`;
    }
    case 'daily':
      return `daily-${year}-${month}-${day}`;
    default:
      return 'allTime';
  }
}

// ---------------------------------------------------------------------------
// Trigger: score a newly created history entry.
//
// History docs are written by the client (src/js/history.js saveHistoryItem)
// to users/{uid}/history/{questionId_timestamp} with fields:
//   { id, question, answer, status: correct|incorrect|skipped,
//     timestamp, questionSet, [xpEligible] }
//
// Idempotency: Firestore triggers are at-least-once, so a retry could
// re-deliver the same create event. Two guards, both written inside the same
// transaction as the award:
//   1. `scoredAt` on the history doc itself (cheap fast path above).
//   2. A `scoredHistory/{userId}_{historyId}` ledger doc. The scoredAt marker
//      alone is NOT sufficient: clients may delete their own history docs, and
//      deleting + re-creating a doc re-fires this trigger with no marker,
//      allowing unlimited re-awards. The ledger lives in a collection the
//      rules deny to clients, so it survives history deletion.
// ---------------------------------------------------------------------------
exports.scoreHistoryEntry = onDocumentCreated(
  'users/{userId}/history/{historyId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const entry = snap.data();
    const { userId, historyId } = event.params;

    // Only correct answers earn XP.
    if (entry.status !== 'correct') return;

    // Tolerance gating is client-known only (localStorage answerTolerance).
    // The client should write xpEligible=false when tolerance < 80%; honor it.
    if (entry.xpEligible === false) {
      logger.info('Skipping XP: history entry marked xpEligible=false', {
        userId, historyId
      });
      return;
    }

    // Fast path for redeliveries (authoritative check repeats in the txn).
    if (entry.scoredAt) return;

    const prefix = String(entry.id ?? '').charAt(0);
    const xp = POINTS_VALUES[prefix];
    if (!xp) {
      logger.warn('Skipping XP: unknown question id prefix', {
        userId, historyId, id: entry.id
      });
      return;
    }

    // Bucket period leaderboards by when the question was answered, not when
    // the function happened to run (matters for retries near a period edge).
    const answeredAt =
      typeof entry.timestamp === 'number' && entry.timestamp > 0
        ? new Date(entry.timestamp)
        : new Date();

    if (SHADOW_MODE.value()) {
      logger.info('SHADOW_MODE: would award XP (no writes performed)', {
        userId,
        historyId,
        xp,
        prefix,
        periods: {
          monthly: getLeaderboardPath('monthly', answeredAt),
          weekly: getLeaderboardPath('weekly', answeredAt),
          daily: getLeaderboardPath('daily', answeredAt)
        }
      });
      return;
    }

    const historyRef = snap.ref;
    const profileRef = db.doc(`users/${userId}/profile/data`);
    const scoredLedgerRef = db.doc(`scoredHistory/${userId}_${historyId}`);

    await db.runTransaction(async (tx) => {
      // All reads must precede writes in an admin-SDK transaction.
      const [historySnap, profileSnap, ledgerSnap] = await Promise.all([
        tx.get(historyRef),
        tx.get(profileRef),
        tx.get(scoredLedgerRef)
      ]);

      // Doc deleted between trigger and transaction - nothing to score.
      if (!historySnap.exists) return;
      // Idempotency guards: already scored by a previous delivery (marker on
      // the doc), or already scored under this history ID at any point in the
      // past (ledger survives delete + recreate of the history doc).
      if (historySnap.get('scoredAt')) return;
      if (ledgerSnap.exists) return;

      const profile = profileSnap.exists ? profileSnap.data() : {};
      const newTotalPoints = (profile.totalPoints || 0) + xp;
      const newQuestionsAnswered = (profile.questionsAnswered || 0) + 1;
      const level = getLevelFromXP(newTotalPoints);
      const tier = getTierForLevel(level).name;
      const now = Date.now();

      // 1) Profile totals (server-authoritative).
      tx.set(
        profileRef,
        { totalPoints: newTotalPoints, questionsAnswered: newQuestionsAnswered },
        { merge: true }
      );

      // 2) Mark the history entry as scored - inside the same transaction,
      //    so the award and the markers commit (or fail) atomically. The
      //    ledger doc blocks re-award even if the history doc is later
      //    deleted and re-created by the client.
      tx.set(historyRef, { scoredAt: now, xpAwarded: xp }, { merge: true });
      tx.set(scoredLedgerRef, { userId, historyId, xpAwarded: xp, scoredAt: now });

      // 3) Leaderboards - only for users with a username, mirroring the
      //    client behavior (boards key display on username).
      if (profile.username) {
        const commonFields = {
          username: profile.username,
          level,
          tier,
          lastUpdated: now
        };
        if (profile.avatar) commonFields.avatar = profile.avatar;

        // All-time board stores lifetime totals.
        tx.set(
          db.doc(`leaderboards/${getLeaderboardPath('allTime')}/rankings/${userId}`),
          {
            ...commonFields,
            points: newTotalPoints,
            questionsAnswered: newQuestionsAnswered
          },
          { merge: true }
        );

        // Period boards accumulate only the XP earned within the period.
        for (const period of ['monthly', 'weekly', 'daily']) {
          const key = getLeaderboardPath(period, answeredAt);
          tx.set(
            db.doc(`leaderboards/${key}/rankings/${userId}`),
            {
              ...commonFields,
              points: FieldValue.increment(xp),
              questionsAnswered: FieldValue.increment(1)
            },
            { merge: true }
          );
        }
      } else {
        logger.info('Profile has no username; skipped leaderboard writes', {
          userId, historyId
        });
      }
    });

    logger.info('Awarded XP', { userId, historyId, xp });
  }
);

// ---------------------------------------------------------------------------
// Batched writes (Firestore batches cap at 500; chunk generously below that).
// ---------------------------------------------------------------------------
async function commitInBatches(ops) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + 450)) {
      batch.set(op.ref, op.data, op.options);
    }
    await batch.commit();
  }
}

async function commitDeletes(refs) {
  for (let i = 0; i < refs.length; i += 450) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 450)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
}

// ---------------------------------------------------------------------------
// Callable: recalculate a user's XP from their full history.
//
// Replaces the old client-side calculateRetroactivePoints, which wrote
// totalPoints/leaderboard rows directly and would break once the rules lock
// those fields down (migration step 5). The Admin SDK bypasses rules, so this
// works before AND after the scoring cutover.
//
// Semantics match scoreHistoryEntry exactly: count entries with
// status === 'correct' and xpEligible !== false, XP from the id prefix.
// Counted-but-unscored docs are stamped (scoredAt + scoredHistory ledger) so
// the create trigger never awards them again - running this pre-cutover
// doubles as the per-user backfill for go-live.
//
// Throttled to once per hour per user via recalcThrottle/{uid} (a collection
// the rules deny to clients), since each run reads the user's full history.
// ---------------------------------------------------------------------------
const RECALC_MIN_INTERVAL_MS = 60 * 60 * 1000;

exports.recalculateXP = onCall({ timeoutSeconds: 120 }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  if (request.auth.token.email_verified !== true) {
    throw new HttpsError('permission-denied', 'Verify your email before recalculating XP.');
  }

  const uid = request.auth.uid;
  const throttleRef = db.doc(`recalcThrottle/${uid}`);
  const now = Date.now();

  const throttleSnap = await throttleRef.get();
  const lastRecalc = throttleSnap.exists ? throttleSnap.data().lastRecalcAt : 0;
  if (typeof lastRecalc === 'number' && now - lastRecalc < RECALC_MIN_INTERVAL_MS) {
    const minutesLeft = Math.ceil((RECALC_MIN_INTERVAL_MS - (now - lastRecalc)) / 60000);
    throw new HttpsError(
      'resource-exhausted',
      `Recalculation is limited to once per hour. Try again in about ${minutesLeft} minutes.`
    );
  }
  // Claim the slot up front so concurrent calls can't both run; released on failure.
  await throttleRef.set({ lastRecalcAt: now });

  try {
    const [profileSnap, historySnap] = await Promise.all([
      db.doc(`users/${uid}/profile/data`).get(),
      db.collection(`users/${uid}/history`).get()
    ]);
    const profile = profileSnap.exists ? profileSnap.data() : {};

    let totalPoints = 0;
    let counted = 0;
    const periodBuckets = {}; // periodKey -> { points, questions }
    const stampOps = [];

    for (const docSnap of historySnap.docs) {
      const entry = docSnap.data();
      if (entry.status !== 'correct') continue;
      if (entry.xpEligible === false) continue;
      const xp = POINTS_VALUES[String(entry.id ?? '').charAt(0)];
      if (!xp) continue;

      totalPoints += xp;
      counted++;

      const answeredAt =
        typeof entry.timestamp === 'number' && entry.timestamp > 0
          ? new Date(entry.timestamp)
          : null;
      if (answeredAt) {
        for (const period of ['monthly', 'weekly', 'daily']) {
          const key = getLeaderboardPath(period, answeredAt);
          if (!periodBuckets[key]) periodBuckets[key] = { points: 0, questions: 0 };
          periodBuckets[key].points += xp;
          periodBuckets[key].questions += 1;
        }
      }

      // Mark counted-but-unscored docs so the create trigger skips them later.
      if (!entry.scoredAt) {
        stampOps.push(
          { ref: docSnap.ref, data: { scoredAt: now, xpAwarded: xp }, options: { merge: true } },
          {
            ref: db.doc(`scoredHistory/${uid}_${docSnap.id}`),
            data: { userId: uid, historyId: docSnap.id, xpAwarded: xp, scoredAt: now }
          }
        );
      }
    }

    const level = getLevelFromXP(totalPoints);
    const tier = getTierForLevel(level).name;

    // Profile totals (server-authoritative); streaks and identity fields
    // are left untouched.
    await db.doc(`users/${uid}/profile/data`).set(
      { totalPoints, questionsAnswered: counted },
      { merge: true }
    );

    // Leaderboards - only for users with a username, mirroring the trigger.
    // All-time holds lifetime totals; period docs hold per-period sums
    // rebuilt from history timestamps (same bucketing as the trigger).
    const leaderboardOps = [];
    if (profile.username) {
      const commonFields = { username: profile.username, level, tier, lastUpdated: now };
      if (profile.avatar) commonFields.avatar = profile.avatar;

      leaderboardOps.push({
        ref: db.doc(`leaderboards/allTime/rankings/${uid}`),
        data: { ...commonFields, points: totalPoints, questionsAnswered: counted },
        options: { merge: true }
      });
      for (const [key, bucket] of Object.entries(periodBuckets)) {
        leaderboardOps.push({
          ref: db.doc(`leaderboards/${key}/rankings/${uid}`),
          data: { ...commonFields, points: bucket.points, questionsAnswered: bucket.questions },
          options: { merge: true }
        });
      }
    }

    await commitInBatches([...leaderboardOps, ...stampOps]);

    // Prune ranking rows the recomputed history no longer supports (e.g.
    // forged or since-deleted entries). Users without a username shouldn't
    // appear on any board, so every row of theirs is pruned.
    const rankingsSnap = await db
      .collectionGroup('rankings')
      .where(FieldPath.documentId(), '==', uid)
      .get();
    const validPeriods = profile.username
      ? new Set(['allTime', ...Object.keys(periodBuckets)])
      : new Set();
    const staleRefs = rankingsSnap.docs
      .filter((d) => !validPeriods.has(d.ref.parent.parent.id))
      .map((d) => d.ref);
    await commitDeletes(staleRefs);

    logger.info('Recalculated XP', {
      uid,
      totalPoints,
      counted,
      periods: Object.keys(periodBuckets).length,
      prunedRows: staleRefs.length
    });
    return { totalPoints, questionsAnswered: counted, counted };
  } catch (error) {
    // Release the throttle slot so the user can retry.
    await throttleRef.delete().catch(() => {});
    if (error instanceof HttpsError) throw error;
    logger.error('recalculateXP failed', { uid, error: String(error) });
    throw new HttpsError('internal', 'Recalculation failed. Please try again later.');
  }
});

// Exported for potential reuse/tests (e.g. an emulator-driven unit test).
exports._internal = {
  POINTS_VALUES,
  getXPForLevel,
  getLevelFromXP,
  getTierForLevel,
  getISOWeek,
  getLeaderboardPath
};
