import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getISOWeek, getLeaderboardPath } from '../src/js/leaderboardPeriods.js';

test('getISOWeek returns ISO week numbers', () => {
    // 2026-01-01 is a Thursday, so it belongs to ISO week 1 of 2026
    assert.deepEqual(getISOWeek(new Date(2026, 0, 1)), { year: 2026, week: 1 });
    // 2026-06-12 is a Friday in ISO week 24
    assert.deepEqual(getISOWeek(new Date(2026, 5, 12)), { year: 2026, week: 24 });
    // 2027-01-01 is a Friday, so it belongs to ISO week 53 of 2026
    assert.deepEqual(getISOWeek(new Date(2027, 0, 1)), { year: 2026, week: 53 });
});

test('getLeaderboardPath produces stable keys per period type', () => {
    const now = new Date(2026, 5, 12); // June 12, 2026
    assert.equal(getLeaderboardPath('allTime', now), 'allTime');
    assert.equal(getLeaderboardPath('monthly', now), 'monthly-2026-06');
    assert.equal(getLeaderboardPath('weekly', now), 'weekly-2026-W24');
    assert.equal(getLeaderboardPath('daily', now), 'daily-2026-06-12');
});

test('weekly keys differ across months (regression: week-of-month bug)', () => {
    // Second Friday of June vs second Friday of July 2026 used to both yield W02
    const june = getLeaderboardPath('weekly', new Date(2026, 5, 12));
    const july = getLeaderboardPath('weekly', new Date(2026, 6, 10));
    assert.notEqual(june, july);
});

test('weekly keys match the Firestore rules pattern weekly-YYYY-WNN', () => {
    const key = getLeaderboardPath('weekly', new Date(2026, 0, 1));
    assert.match(key, /^weekly-[0-9]{4}-W[0-9]{2}$/);
});

test('unknown period falls back to allTime', () => {
    assert.equal(getLeaderboardPath('bogus', new Date(2026, 5, 12)), 'allTime');
});
