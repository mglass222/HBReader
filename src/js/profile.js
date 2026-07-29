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
import { calculatePoints, getLeaderboardPath } from './leaderboard.js';
import { showToast, showXPGain } from './ui.js';

function getDefaultProfile() {
    return {
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

// Document ID is the raw lowercased email so Firestore rules can verify
// it matches request.auth.token.email (prevents recovery-doc squatting).
function getRecoveryDocumentId(email) {
    return email.toLowerCase();
}

// Older recovery docs were stored under the URI-encoded email
function getLegacyRecoveryDocumentId(email) {
    return encodeURIComponent(email.toLowerCase());
}

// Username Management
export async function loadUserProfile() {
    if (!state.currentUser || !state.currentUser.emailVerified) return;

    try {
        const { doc, getDoc, setDoc } = window.firebaseDbFunctions;
        const profileDocRef = doc(window.firebaseDb, 'users', state.currentUser.uid, 'profile', 'data');
        const profileDoc = await getDoc(profileDocRef);

        if (profileDoc.exists()) {
            state.userProfile = profileDoc.data();
        } else {
            state.userProfile = getDefaultProfile();
            await setDoc(profileDocRef, state.userProfile, { merge: true });
        }

        // Update UI with profile info
        updateProfileUI();
    } catch (error) {
        console.error('Error loading profile:', error);
        showToast('Could not load your profile. XP earned now may not be saved - try reloading.', 'error', 8000);
    }
}

export function updateProfileUI() {
    const pointsDisplay = document.getElementById('pointsDisplay');
    const pointsText = document.getElementById('pointsText');

    // Header elements
    const headerLevelBadge = document.getElementById('headerLevelBadge');
    const headerDisplayName = document.getElementById('headerDisplayName');

    if (state.userProfile) {
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
        if (pointsDisplay) pointsDisplay.style.display = 'none';
        if (headerLevelBadge) {
            headerLevelBadge.style.display = 'none';
        }
        const xpDisplayContainer = document.getElementById('xpDisplayContainer');
        if (xpDisplayContainer) xpDisplayContainer.replaceChildren();
    }

    // Check if we should show profile warning
    checkAndShowProfileWarning();
}

export function isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,20}$/.test(username);
}

export async function saveUsername(username) {
    if (!state.currentUser || !state.currentUser.emailVerified) return;

    try {
        const { doc, setDoc } = window.firebaseDbFunctions;
        const profileDocRef = doc(window.firebaseDb, 'users', state.currentUser.uid, 'profile', 'data');

        // Write only identity fields. Counters (totalPoints, questionsAnswered,
        // streaks) are updated via increment() elsewhere; spreading the whole
        // in-memory profile here would clobber XP earned in another tab/device.
        const profileUpdate = {
            username: username,
            createdAt: state.userProfile?.createdAt || Date.now()
        };

        state.userProfile = {
            ...(state.userProfile || getDefaultProfile()),
            ...profileUpdate
        };

        await setDoc(profileDocRef, profileUpdate, { merge: true });
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

    const previousLevel = getLevelFromXP(state.userProfile.totalPoints || 0);

    // Track streak regardless of correct/incorrect
    if (isCorrect) {
        state.userProfile.currentStreak = (state.userProfile.currentStreak || 0) + 1;
        state.userProfile.bestStreak = Math.max(state.userProfile.bestStreak || 0, state.userProfile.currentStreak);
    } else {
        state.userProfile.currentStreak = 0;
    }

    // XP is only earned at >= 80% answer tolerance
    const currentTolerance = parseInt(localStorage.getItem('answerTolerance') || '80');
    const xpEarned = (isCorrect && currentTolerance >= 80) ? calculatePoints(difficulty) : 0;

    try {
        const { doc, setDoc, updateDoc, increment } = window.firebaseDbFunctions;

        // Persist streaks on every answer; add XP counters when earned
        const profileDocRef = doc(window.firebaseDb, 'users', state.currentUser.uid, 'profile', 'data');
        const profileUpdate = {
            currentStreak: state.userProfile.currentStreak,
            bestStreak: state.userProfile.bestStreak
        };
        if (xpEarned > 0) {
            profileUpdate.totalPoints = increment(xpEarned);
            profileUpdate.questionsAnswered = increment(1);
        }
        await updateDoc(profileDocRef, profileUpdate);

        if (xpEarned > 0) {
            state.userProfile.totalPoints = (state.userProfile.totalPoints || 0) + xpEarned;
            state.userProfile.questionsAnswered = (state.userProfile.questionsAnswered || 0) + 1;

            const newLevel = getLevelFromXP(state.userProfile.totalPoints);
            if (newLevel > previousLevel) {
                showLevelUpNotification(newLevel);
            }
            showXPGain(xpEarned);
        }

        updateProfileUI();

        // Only update leaderboards if user has a username and earned XP
        if (xpEarned > 0 && state.userProfile.username) {
            const levelInfo = calculateLevelProgress(state.userProfile.totalPoints);
            const commonFields = {
                username: state.userProfile.username,
                level: levelInfo.level,
                tier: levelInfo.tier.name,
                lastUpdated: Date.now()
            };

            // All-time board holds lifetime totals
            const allTimeRef = doc(window.firebaseDb, 'leaderboards', getLeaderboardPath('allTime'), 'rankings', state.currentUser.uid);
            await setDoc(allTimeRef, {
                ...commonFields,
                points: state.userProfile.totalPoints,
                questionsAnswered: state.userProfile.questionsAnswered
            }, { merge: true });

            // Period boards accumulate only XP earned within the period
            for (const period of ['monthly', 'weekly', 'daily']) {
                const path = getLeaderboardPath(period);
                const leaderboardDocRef = doc(window.firebaseDb, 'leaderboards', path, 'rankings', state.currentUser.uid);
                await setDoc(leaderboardDocRef, {
                    ...commonFields,
                    points: increment(xpEarned),
                    questionsAnswered: increment(1)
                }, { merge: true });
            }
        }
    } catch (error) {
        console.error('Error updating points:', error);
        showToast('Could not save your XP - check your connection.', 'error');
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
        const { doc, deleteDoc, setDoc } = window.firebaseDbFunctions;
        const { deleteUser } = window.firebaseAuthFunctions;
        const userId = state.currentUser.uid;
        const userEmail = state.currentUser.email;
        const recoveryDocId = getRecoveryDocumentId(userEmail);

        // Show loading state
        const deleteBtn = document.querySelector('.btn-danger');
        if (deleteBtn) {
            deleteBtn.disabled = true;
            deleteBtn.textContent = 'Deleting...';
        }

        // 1. Mark profile as orphaned (account deleted) but preserve data
        const profileDocRef = doc(window.firebaseDb, 'users', userId, 'profile', 'data');
        await setDoc(profileDocRef, {
            accountDeleted: true,
            deletedAt: Date.now(),
            recoveryEmail: userEmail,
            recoveryEmailNormalized: userEmail.toLowerCase()
        }, { merge: true });

        const recoveryDocRef = doc(window.firebaseDb, 'accountRecovery', recoveryDocId);
        await setDoc(recoveryDocRef, {
            oldUserId: userId,
            recoveryEmail: userEmail,
            recoveryEmailNormalized: userEmail.toLowerCase(),
            createdAt: Date.now()
        });

        // 2. Delete leaderboard entries (all current periods)
        const leaderboardPeriods = ['allTime', 'monthly', 'weekly', 'daily']
            .map(period => getLeaderboardPath(period));

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
        const { doc, getDoc } = window.firebaseDbFunctions;
        let recoveryDoc = await getDoc(doc(window.firebaseDb, 'accountRecovery', getRecoveryDocumentId(email)));

        // Fall back to the legacy URI-encoded document ID
        if (!recoveryDoc.exists()) {
            recoveryDoc = await getDoc(doc(window.firebaseDb, 'accountRecovery', getLegacyRecoveryDocumentId(email)));
        }

        if (!recoveryDoc.exists()) {
            return null;
        }

        const recoveryData = recoveryDoc.data();
        const oldUserId = recoveryData.oldUserId;
        if (!oldUserId) {
            return null;
        }

        const profileRef = doc(window.firebaseDb, 'users', oldUserId, 'profile', 'data');
        const profileDoc = await getDoc(profileRef);
        if (!profileDoc.exists()) {
            return null;
        }

        return {
            oldUserId,
            profileData: profileDoc.data()
        };
    } catch (error) {
        console.error('Error checking for recoverable account:', error);
        return null;
    }
}

// Recover/migrate orphaned account data to new account
export async function recoverAccountData(oldUserId, newUserId) {
    try {
        const { doc, getDoc, setDoc, deleteDoc, collection, getDocs, writeBatch } = window.firebaseDbFunctions;
        const recoveryDocRef = doc(window.firebaseDb, 'accountRecovery', getRecoveryDocumentId(state.currentUser.email));
        const legacyRecoveryDocRef = doc(window.firebaseDb, 'accountRecovery', getLegacyRecoveryDocumentId(state.currentUser.email));

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
            let copyBatch = writeBatch(window.firebaseDb);
            let copyCount = 0;
            for (const historyDoc of historySnapshot.docs) {
                const newHistoryDocRef = doc(window.firebaseDb, 'users', newUserId, 'history', historyDoc.id);
                copyBatch.set(newHistoryDocRef, historyDoc.data());
                copyCount++;

                if (copyCount === 450) {
                    await copyBatch.commit();
                    copyBatch = writeBatch(window.firebaseDb);
                    copyCount = 0;
                }
            }
            if (copyCount > 0) {
                await copyBatch.commit();
            }

            // Delete old history documents
            let deleteBatch = writeBatch(window.firebaseDb);
            let deleteCount = 0;
            for (const historyDoc of historySnapshot.docs) {
                deleteBatch.delete(historyDoc.ref);
                deleteCount++;

                if (deleteCount === 450) {
                    await deleteBatch.commit();
                    deleteBatch = writeBatch(window.firebaseDb);
                    deleteCount = 0;
                }
            }
            if (deleteCount > 0) {
                await deleteBatch.commit();
            }
        }

        // 4. Delete old profile and recovery markers (legacy ID may not exist)
        await deleteDoc(oldProfileRef);
        await deleteDoc(recoveryDocRef).catch(() => {});
        await deleteDoc(legacyRecoveryDocRef).catch(() => {});

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

        // Write only the identity fields. Counters (totalPoints etc.) are
        // updated via increment() elsewhere; writing them from memory here
        // would clobber XP earned from another tab or device.
        const profileUpdate = {
            username: username || null,
            firstName: firstName || null,
            lastName: lastName || null,
            state: profileState || null,
            school: school || null,
            createdAt: state.userProfile?.createdAt || Date.now()
        };

        state.userProfile = {
            ...(state.userProfile || getDefaultProfile()),
            ...profileUpdate
        };

        await setDoc(profileDocRef, profileUpdate, { merge: true });
        updateProfileUI();
        alert('Profile saved successfully!');
    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Error saving profile. Please try again.');
    }
}
