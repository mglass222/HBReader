// Leaderboard period keys - pure logic, no DOM access (unit-tested in tests/leaderboardPeriods.test.js)

// ISO-8601 week: weeks start Monday; week 1 contains the year's first Thursday.
export function getISOWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return { year: d.getUTCFullYear(), week };
}

export function getLeaderboardPath(period, now = new Date()) {
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
