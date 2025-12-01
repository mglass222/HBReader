// Leaderboard module - leaderboard display and points calculation
import { state, POINTS_VALUES } from './state.js';
import { calculateLevelProgress, generateTierShield } from './xpSystem.js';

export function calculatePoints(difficulty) {
    return POINTS_VALUES[difficulty] || 0;
}

export function getLeaderboardPath(period) {
    const now = new Date();
    let periodKey;

    switch(period) {
        case 'monthly':
            periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            return `monthly-${periodKey}`;
        case 'weekly':
            const week = Math.ceil((now.getDate() + 6 - now.getDay()) / 7);
            periodKey = `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
            return `weekly-${periodKey}`;
        case 'daily':
            periodKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            return `daily-${periodKey}`;
        default:
            return 'allTime';
    }
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

        // Generate compact leaderboard table
        let tableHTML = `
            <table class="leaderboard-table" style="font-size: 0.9em;">
                <thead>
                    <tr>
                        <th style="width: 15%;">Rank</th>
                        <th style="width: 50%;">Player</th>
                        <th style="width: 35%;">Points</th>
                    </tr>
                </thead>
                <tbody>
        `;

        rankings.forEach((entry, index) => {
            const rank = index + 1;
            const isCurrentUser = state.currentUser && state.currentUser.emailVerified && entry.userId === state.currentUser.uid;
            const rankClass = rank === 1 ? 'top-1' : rank === 2 ? 'top-2' : rank === 3 ? 'top-3' : '';
            const rowClass = isCurrentUser ? 'current-user' : '';

            // Show tier shield based on XP
            const xp = entry.points || 0;
            const levelInfo = calculateLevelProgress(xp);
            const shield = generateTierShield(levelInfo.level, 'small');

            // For all-time leaderboard top 3, add medal indicator
            let medalIcon = '';
            if (period === 'allTime') {
                if (rank === 1) medalIcon = '🥇 ';
                else if (rank === 2) medalIcon = '🥈 ';
                else if (rank === 3) medalIcon = '🥉 ';
            }

            tableHTML += `
                <tr class="${rowClass}">
                    <td><span class="leaderboard-rank ${rankClass}">${medalIcon}${rank}</span></td>
                    <td class="leaderboard-username">
                        <span style="display: inline-flex; align-items: center; gap: 8px;">
                            ${shield}
                            <span>${entry.username}</span>
                        </span>
                    </td>
                    <td class="leaderboard-points">${entry.points} XP</td>
                </tr>
            `;
        });

        tableHTML += `
                </tbody>
            </table>
        `;

        content.innerHTML = tableHTML;
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

        // Only update leaderboards if user has a username
        if (state.userProfile.username) {
            // Update all leaderboards
            const periods = ['allTime', 'monthly', 'weekly', 'daily'];
            for (const period of periods) {
                const path = getLeaderboardPath(period);
                const leaderboardDocRef = doc(window.firebaseDb, 'leaderboards', path, 'rankings', state.currentUser.uid);

                await setDoc(leaderboardDocRef, {
                    username: state.userProfile.username,
                    avatar: state.userProfile.avatar || '👤',
                    points: totalPoints,
                    questionsAnswered: correctAnswers,
                    lastUpdated: Date.now()
                }, { merge: true });
            }
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
