// Profile module - user profile management, points, and warnings
import { state } from './state.js';
import {
    getLevelFromXP,
    calculateLevelProgress,
    generateTierShield,
    renderLevelBadge,
    renderCompactLevelBadge,
    showLevelUpNotification,
    updateXPDisplay
} from './xpSystem.js';
import { calculatePoints, getLeaderboardPath, loadLeaderboard } from './leaderboard.js';

// Username Management
export async function loadUserProfile() {
    if (!state.currentUser || !state.currentUser.emailVerified) return;

    try {
        const { doc, getDoc } = window.firebaseDbFunctions;
        const profileDocRef = doc(window.firebaseDb, 'users', state.currentUser.uid, 'profile', 'data');
        const profileDoc = await getDoc(profileDocRef);

        if (profileDoc.exists()) {
            state.userProfile = profileDoc.data();
        } else {
            // Create empty default profile
            state.userProfile = {
                username: null,
                firstName: null,
                lastName: null,
                state: null,
                school: null,
                totalPoints: 0,
                questionsAnswered: 0,
                currentStreak: 0,
                bestStreak: 0,
                createdAt: Date.now()
            };
        }

        // Update UI with profile info
        updateProfileUI();
    } catch (error) {
        console.error('Error loading profile:', error);
    }
}

export function updateProfileUI() {
    const accountSettings = document.getElementById('accountSettings');
    const pointsDisplay = document.getElementById('pointsDisplay');
    const pointsText = document.getElementById('pointsText');

    // Header elements
    const headerLevelBadge = document.getElementById('headerLevelBadge');
    const headerDisplayName = document.getElementById('headerDisplayName');

    if (state.userProfile) {
        if (accountSettings) accountSettings.style.display = 'block';
        if (pointsDisplay) pointsDisplay.style.display = 'block';
        if (pointsText) pointsText.textContent = state.userProfile.totalPoints || 0;

        // Update header with username if set
        if (headerDisplayName) {
            headerDisplayName.textContent = state.userProfile.username || (state.currentUser ? state.currentUser.email : '');
        }

        // Update header with level badge
        if (headerLevelBadge) {
            const xp = state.userProfile.totalPoints || 0;
            headerLevelBadge.innerHTML = renderCompactLevelBadge(xp);
            headerLevelBadge.style.display = 'inline-flex';
        }

        // Update XP display in settings panel if it exists
        const xpDisplayContainer = document.getElementById('xpDisplayContainer');
        if (xpDisplayContainer) {
            updateXPDisplay();
        }

        // Update profile rank display if visible
        const rankDisplay = document.getElementById('profileRankDisplay');
        if (rankDisplay) {
            const xp = state.userProfile.totalPoints || 0;
            rankDisplay.innerHTML = renderLevelBadge(xp, true);
        }
    } else {
        if (accountSettings) accountSettings.style.display = 'none';
        if (pointsDisplay) pointsDisplay.style.display = 'none';
        if (headerLevelBadge) {
            headerLevelBadge.style.display = 'none';
        }
    }

    // Check if we should show profile warning
    checkAndShowProfileWarning();
}

export async function promptForUsername() {
    const username = prompt('Welcome! Please choose a username for the leaderboard (3-20 characters, alphanumeric and underscores only):');

    if (!username) {
        setTimeout(promptForUsername, 2000);
        return;
    }

    if (!isValidUsername(username)) {
        alert('Invalid username. Please use 3-20 characters, alphanumeric and underscores only.');
        setTimeout(promptForUsername, 1000);
        return;
    }

    await saveUsername(username);
}

export function isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

export async function saveUsername(username) {
    if (!state.currentUser || !state.currentUser.emailVerified) return;

    try {
        const { doc, setDoc } = window.firebaseDbFunctions;
        const profileDocRef = doc(window.firebaseDb, 'users', state.currentUser.uid, 'profile', 'data');

        state.userProfile = {
            username: username,
            firstName: null,
            lastName: null,
            totalPoints: 0,
            questionsAnswered: 0,
            createdAt: Date.now()
        };

        await setDoc(profileDocRef, state.userProfile);
        updateProfileUI();
        alert('Username saved successfully!');
    } catch (error) {
        console.error('Error saving username:', error);
        alert('Error saving username. Please try again.');
    }
}

export async function changeUsername() {
    if (!state.currentUser || !state.currentUser.emailVerified) {
        alert('Please log in to change your username.');
        return;
    }

    const newUsername = prompt('Enter new username (3-20 characters, alphanumeric and underscores only):', state.userProfile?.username || '');

    if (!newUsername) return;

    if (!isValidUsername(newUsername)) {
        alert('Invalid username. Please use 3-20 characters, alphanumeric and underscores only.');
        return;
    }

    await saveUsername(newUsername);
}

// Update Points and Leaderboards
export async function updatePointsAndLeaderboard(difficulty, isCorrect) {
    if (!state.currentUser || !state.currentUser.emailVerified || !state.userProfile) return;

    // Track streak regardless of correct/incorrect
    const previousLevel = getLevelFromXP(state.userProfile.totalPoints || 0);

    if (isCorrect) {
        // Increment streak
        state.userProfile.currentStreak = (state.userProfile.currentStreak || 0) + 1;
        state.userProfile.bestStreak = Math.max(state.userProfile.bestStreak || 0, state.userProfile.currentStreak);
    } else {
        // Reset streak on incorrect/skip
        state.userProfile.currentStreak = 0;
    }

    if (!isCorrect) {
        // Update streak in database even for incorrect answers
        try {
            const { doc, updateDoc } = window.firebaseDbFunctions;
            const profileDocRef = doc(window.firebaseDb, 'users', state.currentUser.uid, 'profile', 'data');
            await updateDoc(profileDocRef, {
                currentStreak: state.userProfile.currentStreak,
                bestStreak: state.userProfile.bestStreak
            });
        } catch (error) {
            console.error('Error updating streak:', error);
        }
        updateProfileUI();
        return;
    }

    // Calculate XP with streak multiplier (only if tolerance >= 80%)
    const currentTolerance = parseInt(localStorage.getItem('answerTolerance') || '80');
    if (currentTolerance < 80) {
        // No XP earned when tolerance is below 80%
        updateProfileUI();
        return;
    }

    const xpEarned = calculatePoints(difficulty);
    if (xpEarned === 0) return;

    try {
        const { doc, setDoc, updateDoc, increment } = window.firebaseDbFunctions;

        // Update user profile
        const profileDocRef = doc(window.firebaseDb, 'users', state.currentUser.uid, 'profile', 'data');
        await updateDoc(profileDocRef, {
            totalPoints: increment(xpEarned),
            questionsAnswered: increment(1)
        });

        // Update state.userProfile in memory
        state.userProfile.totalPoints = (state.userProfile.totalPoints || 0) + xpEarned;
        state.userProfile.questionsAnswered = (state.userProfile.questionsAnswered || 0) + 1;

        // Check for level up
        const newLevel = getLevelFromXP(state.userProfile.totalPoints);
        if (newLevel > previousLevel) {
            showLevelUpNotification(newLevel);
        }

        // Update UI
        updateProfileUI();

        // Only update leaderboards if user has a username
        if (state.userProfile.username) {
            const levelInfo = calculateLevelProgress(state.userProfile.totalPoints);

            // Update all leaderboards
            const periods = ['allTime', 'monthly', 'weekly', 'daily'];
            for (const period of periods) {
                const path = getLeaderboardPath(period);
                const leaderboardDocRef = doc(window.firebaseDb, 'leaderboards', path, 'rankings', state.currentUser.uid);

                await setDoc(leaderboardDocRef, {
                    username: state.userProfile.username,
                    points: state.userProfile.totalPoints,
                    questionsAnswered: state.userProfile.questionsAnswered,
                    level: levelInfo.level,
                    tier: levelInfo.tier.name,
                    lastUpdated: Date.now()
                }, { merge: true });
            }
        }
    } catch (error) {
        console.error('Error updating points:', error);
    }
}

// Profile Warning Banner
export function showProfileWarning() {
    if (state.profileWarningDismissed) return;
    if (!state.currentUser || !state.currentUser.emailVerified) return;
    if (state.userProfile && state.userProfile.username) return; // Has username, no warning needed

    const banner = document.getElementById('profileWarningBanner');
    if (banner) {
        banner.style.display = 'flex';
    }
}

export function hideProfileWarning() {
    const banner = document.getElementById('profileWarningBanner');
    if (banner) {
        banner.style.display = 'none';
    }
}

export function dismissProfileWarning() {
    state.profileWarningDismissed = true;
    hideProfileWarning();
}

export function checkAndShowProfileWarning() {
    // Check if we should show or hide the warning
    if (state.currentUser && state.currentUser.emailVerified) {
        if (state.userProfile && state.userProfile.username) {
            // User has username, hide the warning
            hideProfileWarning();
        } else if (!state.profileWarningDismissed) {
            // User doesn't have username and hasn't dismissed, show warning
            showProfileWarning();
        }
    } else {
        // Not logged in or not verified, hide warning
        hideProfileWarning();
    }
}

// Profile Page Functions
export async function loadProfile() {
    const profileLoginMessage = document.getElementById('profileLoginMessage');
    const profileFormContainer = document.getElementById('profileFormContainer');

    // Check if user is logged in and verified
    if (!state.currentUser || !state.currentUser.emailVerified) {
        // Show login message, hide form
        if (profileLoginMessage) profileLoginMessage.style.display = 'block';
        if (profileFormContainer) profileFormContainer.style.display = 'none';
        return;
    }

    // User is logged in - hide message, show form
    if (profileLoginMessage) profileLoginMessage.style.display = 'none';
    if (profileFormContainer) profileFormContainer.style.display = 'block';

    // Load profile data and populate form
    if (state.userProfile) {
        const usernameInput = document.getElementById('profileUsername');
        const firstNameInput = document.getElementById('profileFirstName');
        const lastNameInput = document.getElementById('profileLastName');
        const stateSelect = document.getElementById('profileState');
        const schoolInput = document.getElementById('profileSchool');
        const pointsDisplay = document.getElementById('profilePoints');
        const questionsDisplay = document.getElementById('profileQuestionsAnswered');
        const currentStreakDisplay = document.getElementById('profileCurrentStreak');
        const bestStreakDisplay = document.getElementById('profileBestStreak');
        const rankDisplay = document.getElementById('profileRankDisplay');

        if (usernameInput) usernameInput.value = state.userProfile.username || '';
        if (firstNameInput) firstNameInput.value = state.userProfile.firstName || '';
        if (lastNameInput) lastNameInput.value = state.userProfile.lastName || '';
        if (stateSelect) stateSelect.value = state.userProfile.state || '';
        if (schoolInput) schoolInput.value = state.userProfile.school || '';
        if (pointsDisplay) pointsDisplay.textContent = state.userProfile.totalPoints || 0;
        if (questionsDisplay) questionsDisplay.textContent = state.userProfile.questionsAnswered || 0;
        if (currentStreakDisplay) currentStreakDisplay.textContent = state.userProfile.currentStreak || 0;
        if (bestStreakDisplay) bestStreakDisplay.textContent = state.userProfile.bestStreak || 0;

        // Display rank with shield
        if (rankDisplay) {
            const xp = state.userProfile.totalPoints || 0;
            rankDisplay.innerHTML = renderLevelBadge(xp, true);
        }
    }
}

// Delete Account - removes leaderboard data but preserves profile/history for potential recovery
export async function deleteAccount() {
    if (!state.currentUser || !state.currentUser.emailVerified) {
        alert('Please log in to delete your account.');
        return;
    }

    // Multiple confirmations for safety
    if (!confirm('Are you sure you want to delete your account?\n\nYour leaderboard rankings will be removed.\n\nYour profile and history data will be preserved - if you create a new account with the same email, you can recover your data.')) {
        return;
    }

    const confirmText = prompt('To confirm deletion, please type "DELETE" (all caps):');
    if (confirmText !== 'DELETE') {
        alert('Account deletion cancelled.');
        return;
    }

    try {
        const { doc, deleteDoc, updateDoc } = window.firebaseDbFunctions;
        const { deleteUser } = window.firebaseAuthFunctions;
        const userId = state.currentUser.uid;
        const userEmail = state.currentUser.email;

        // Show loading state
        const deleteBtn = document.querySelector('.btn-danger');
        if (deleteBtn) {
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';
        }

        // 1. Mark profile as orphaned (account deleted) but preserve data
        const profileDocRef = doc(window.firebaseDb, 'users', userId, 'profile', 'data');
        await updateDoc(profileDocRef, {
            accountDeleted: true,
            deletedAt: Date.now(),
            recoveryEmail: userEmail.toLowerCase()
        });

        // 2. Delete leaderboard entries (all periods)
        const leaderboardPeriods = ['allTime'];

        // Add current monthly, weekly, daily periods
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const week = Math.ceil((now.getDate() + 6 - now.getDay()) / 7);
        const weekKey = `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
        const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        leaderboardPeriods.push(`monthly-${monthKey}`, `weekly-${weekKey}`, `daily-${dayKey}`);

        for (const period of leaderboardPeriods) {
            try {
                const leaderboardDocRef = doc(window.firebaseDb, 'leaderboards', period, 'rankings', userId);
                await deleteDoc(leaderboardDocRef);
            } catch (err) {
                // Ignore errors for leaderboard entries that don't exist
                console.log(`No leaderboard entry for period ${period}`);
            }
        }

        // 3. Delete Firebase Auth account
        await deleteUser(state.currentUser);

        // Clear local state
        state.currentUser = null;
        state.userProfile = null;
        state.questionHistory = [];
        state.sessionHistory = [];

        alert('Your account has been deleted.\n\nYour profile and history have been preserved. Create a new account with the same email to recover your data.');

        // Redirect to practice page
        window.location.hash = 'practice';
        window.location.reload();

    } catch (error) {
        console.error('Error deleting account:', error);

        // Reset button state
        const deleteBtn = document.querySelector('.btn-danger');
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Delete Account';
        }

        // Handle re-authentication requirement
        if (error.code === 'auth/requires-recent-login') {
            alert('For security reasons, please log out and log back in, then try deleting your account again.');
        } else {
            alert('Error deleting account: ' + error.message);
        }
    }
}

// Check for orphaned account data that can be recovered
export async function checkForRecoverableAccount(email) {
    if (!email) return null;

    try {
        const { collection, query, where, getDocs } = window.firebaseDbFunctions;

        // Search for orphaned profiles with matching recovery email
        const usersRef = collection(window.firebaseDb, 'users');
        const usersSnapshot = await getDocs(usersRef);

        for (const userDoc of usersSnapshot.docs) {
            const profileRef = collection(window.firebaseDb, 'users', userDoc.id, 'profile');
            const profileSnapshot = await getDocs(profileRef);

            for (const profileDoc of profileSnapshot.docs) {
                const profileData = profileDoc.data();
                if (profileData.accountDeleted &&
                    profileData.recoveryEmail === email.toLowerCase()) {
                    return {
                        oldUserId: userDoc.id,
                        profileData: profileData
                    };
                }
            }
        }

        return null;
    } catch (error) {
        console.error('Error checking for recoverable account:', error);
        return null;
    }
}

// Recover/migrate orphaned account data to new account
export async function recoverAccountData(oldUserId, newUserId) {
    try {
        const { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } = window.firebaseDbFunctions;

        // 1. Get old profile data
        const oldProfileRef = doc(window.firebaseDb, 'users', oldUserId, 'profile', 'data');
        const oldProfileDoc = await getDoc(oldProfileRef);

        if (!oldProfileDoc.exists()) {
            throw new Error('Old profile not found');
        }

        const oldProfileData = oldProfileDoc.data();

        // 2. Copy profile to new user (remove deletion markers)
        const newProfileRef = doc(window.firebaseDb, 'users', newUserId, 'profile', 'data');
        const newProfileData = { ...oldProfileData };
        delete newProfileData.accountDeleted;
        delete newProfileData.deletedAt;
        delete newProfileData.recoveryEmail;
        newProfileData.recoveredAt = Date.now();
        newProfileData.previousUserId = oldUserId;

        await setDoc(newProfileRef, newProfileData);

        // 3. Copy history documents
        const oldHistoryRef = collection(window.firebaseDb, 'users', oldUserId, 'history');
        const historySnapshot = await getDocs(oldHistoryRef);

        if (!historySnapshot.empty) {
            const batch = writeBatch(window.firebaseDb);

            historySnapshot.forEach((historyDoc) => {
                const newHistoryDocRef = doc(window.firebaseDb, 'users', newUserId, 'history', historyDoc.id);
                batch.set(newHistoryDocRef, historyDoc.data());
            });

            await batch.commit();

            // Delete old history documents
            const deleteBatch = writeBatch(window.firebaseDb);
            historySnapshot.forEach((historyDoc) => {
                deleteBatch.delete(historyDoc.ref);
            });
            await deleteBatch.commit();
        }

        // 4. Delete old profile
        await deleteDoc(oldProfileRef);

        // 5. Update state with recovered profile
        state.userProfile = newProfileData;

        return true;
    } catch (error) {
        console.error('Error recovering account data:', error);
        return false;
    }
}

export async function saveProfile() {
    if (!state.currentUser || !state.currentUser.emailVerified) {
        alert('Please log in to save your profile.');
        return;
    }

    const username = document.getElementById('profileUsername').value.trim();
    const firstName = document.getElementById('profileFirstName').value.trim();
    const lastName = document.getElementById('profileLastName').value.trim();
    const profileState = document.getElementById('profileState').value;
    const school = document.getElementById('profileSchool').value.trim();

    // Validate username
    if (username && !isValidUsername(username)) {
        alert('Invalid username. Please use 3-20 characters, alphanumeric and underscores only.');
        return;
    }

    try {
        const { doc, setDoc } = window.firebaseDbFunctions;
        const profileDocRef = doc(window.firebaseDb, 'users', state.currentUser.uid, 'profile', 'data');

        // Update state.userProfile object
        state.userProfile = {
            username: username || null,
            firstName: firstName || null,
            lastName: lastName || null,
            state: profileState || null,
            school: school || null,
            totalPoints: state.userProfile?.totalPoints || 0,
            questionsAnswered: state.userProfile?.questionsAnswered || 0,
            currentStreak: state.userProfile?.currentStreak || 0,
            bestStreak: state.userProfile?.bestStreak || 0,
            createdAt: state.userProfile?.createdAt || Date.now()
        };

        await setDoc(profileDocRef, state.userProfile);
        updateProfileUI();
        alert('Profile saved successfully!');
    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Error saving profile. Please try again.');
    }
}
