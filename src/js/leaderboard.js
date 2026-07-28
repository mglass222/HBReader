// Leaderboard module - leaderboard display and points calculation
import { state, POINTS_VALUES } from './state.js';
import { calculateLevelProgress, generateTierShield } from './xpSystem.js';
import { getLeaderboardPath } from './leaderboardPeriods.js';

export { getLeaderboardPath };

export function calculatePoints(difficulty) {
    return POINTS_VALUES[difficulty] || 0;
}

// Leaderboard Display
export async function loadLeaderboard() {
    // Load all leaderboards in parallel
    await Promise.all([
        displayLeaderboard('allTime', 'leaderboardAllTime'),
        displayLeaderboard('monthly', 'leaderboardMonthly'),
        displayLeaderboard('weekly', 'leaderboardWeekly'),
        displayLeaderboard('daily', 'leaderboardDaily')
    ]);
}

export async function displayLeaderboard(period, containerId) {
    const content = document.getElementById(containerId);

    content.innerHTML = '<div class="leaderboard-empty" style="padding: 20px; font-size: 0.9em;">Loading...</div>';

    try {
        const { collection, getDocs, query, orderBy, limit } = window.firebaseDbFunctions;
        const path = getLeaderboardPath(period);
        const leaderboardCollectionRef = collection(window.firebaseDb, 'leaderboards', path, 'rankings');
        const q = query(leaderboardCollectionRef, orderBy('points', 'desc'), limit(10));
        const querySnapshot = await getDocs(q);

        const rankings = [];
        querySnapshot.forEach((doc) => {
            rankings.push({ userId: doc.id, ...doc.data() });
        });

        if (rankings.length === 0) {
            content.innerHTML = '<div class="leaderboard-empty" style="padding: 20px; font-size: 0.9em;">No rankings yet</div>';
            return;
        }

        const table = document.createElement('table');
        table.className = 'leaderboard-table';
        table.style.fontSize = '0.9em';

        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        [
            ['Rank', '15%'],
            ['Player', '50%'],
            ['Points', '35%']
        ].forEach(([label, width]) => {
            const th = document.createElement('th');
            th.style.width = width;
            th.textContent = label;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);

        const tbody = document.createElement('tbody');

        rankings.forEach((entry, index) => {
            const rank = index + 1;
            const isCurrentUser = state.currentUser && state.currentUser.emailVerified && entry.userId === state.currentUser.uid;
            const rankClass = rank === 1 ? 'top-1' : rank === 2 ? 'top-2' : rank === 3 ? 'top-3' : '';

            // Tier shield: prefer the stored all-time level. Period boards hold
            // per-period point deltas, so deriving the tier from entry.points
            // would show e.g. a Bronze shield for a Grandmaster's quiet week.
            const xp = entry.points || 0;
            const level = typeof entry.level === 'number'
                ? entry.level
                : calculateLevelProgress(xp).level; // legacy docs without level
            const shield = generateTierShield(level, 'small');

            // For all-time leaderboard top 3, add medal indicator
            let medalIcon = '';
            if (period === 'allTime') {
                if (rank === 1) medalIcon = '🥇 ';
                else if (rank === 2) medalIcon = '🥈 ';
                else if (rank === 3) medalIcon = '🥉 ';
            }

            const row = document.createElement('tr');
            if (isCurrentUser) {
                row.className = 'current-user';
            }

            const rankCell = document.createElement('td');
            const rankSpan = document.createElement('span');
            rankSpan.className = `leaderboard-rank ${rankClass}`.trim();
            rankSpan.textContent = `${medalIcon}${rank}`;
            rankCell.appendChild(rankSpan);

            const playerCell = document.createElement('td');
            playerCell.className = 'leaderboard-username';
            const playerWrapper = document.createElement('span');
            playerWrapper.style.display = 'inline-flex';
            playerWrapper.style.alignItems = 'center';
            playerWrapper.style.gap = '8px';
            const shieldWrapper = document.createElement('span');
            shieldWrapper.innerHTML = shield;
            const username = document.createElement('span');
            username.textContent = entry.username || 'Unknown';
            playerWrapper.append(shieldWrapper, username);
            playerCell.appendChild(playerWrapper);

            const pointsCell = document.createElement('td');
            pointsCell.className = 'leaderboard-points';
            pointsCell.textContent = `${entry.points || 0} XP`;

            row.append(rankCell, playerCell, pointsCell);
            tbody.appendChild(row);
        });

        table.append(thead, tbody);
        content.replaceChildren(table);
    } catch (error) {
        console.error(`Error loading ${period} leaderboard:`, error);
        content.innerHTML = `<div class="leaderboard-empty" style="padding: 20px; font-size: 0.9em;">Error loading</div>`;
    }
}

// Retroactive Points Calculation
export async function calculateRetroactivePoints() {
    if (!state.currentUser || !state.currentUser.emailVerified || !state.userProfile) {
        alert('Please log in to calculate retroactive points.');
        return;
    }

    if (!confirm('This will recalculate all your points based on your question history. This may take a moment. Continue?')) {
        return;
    }

    try {
        let totalPoints = 0;
        let correctAnswers = 0;

        // Calculate points from history
        state.questionHistory.forEach(entry => {
            if (entry.status === 'correct') {
                const points = calculatePoints(entry.id.charAt(0));
                totalPoints += points;
                correctAnswers++;
            }
        });

        // Update profile
        const { doc, setDoc, updateDoc } = window.firebaseDbFunctions;
        const profileDocRef = doc(window.firebaseDb, 'users', state.currentUser.uid, 'profile', 'data');
        await updateDoc(profileDocRef, {
            totalPoints: totalPoints,
            questionsAnswered: correctAnswers
        });

        state.userProfile.totalPoints = totalPoints;
        state.userProfile.questionsAnswered = correctAnswers;

        // Only update the all-time leaderboard if user has a username.
        // Period boards (daily/weekly/monthly) hold per-period deltas and
        // cannot be reconstructed from totals, so they are left untouched.
        if (state.userProfile.username) {
            const path = getLeaderboardPath('allTime');
            const leaderboardDocRef = doc(window.firebaseDb, 'leaderboards', path, 'rankings', state.currentUser.uid);

            await setDoc(leaderboardDocRef, {
                username: state.userProfile.username,
                avatar: state.userProfile.avatar || '👤',
                points: totalPoints,
                questionsAnswered: correctAnswers,
                lastUpdated: Date.now()
            }, { merge: true });
        }

        alert(`Retroactive points calculated! Total: ${totalPoints} points from ${correctAnswers} correct answers.`);

        // Refresh leaderboard if on that page
        if (window.location.hash.includes('leaderboard')) {
            await loadLeaderboard();
        }

        return { totalPoints, correctAnswers };
    } catch (error) {
        console.error('Error calculating retroactive points:', error);
        alert('Error calculating points. Please try again.');
    }
}
