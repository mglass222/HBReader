// Authentication module
import { state } from './state.js';

// Forward declarations for functions from other modules
// These will be set by main.js to avoid circular imports
export const deps = {
    updateHistoryDisplay: null,
    updateStats: null,
    loadUserProfile: null,
    loadUserHistory: null,
    refreshDashboard: null,
    loadProfile: null,
    restoreHistoryStructure: null,
    renderHistoryTable: null,
    navigateTo: null,
    saveHistoryItem: null,
    checkForRecoverableAccount: null,
    recoverAccountData: null
};

export function showAuthModal() {
    document.getElementById('authModal').classList.add('show');
}

export function closeAuthModal() {
    document.getElementById('authModal').classList.remove('show');
    document.getElementById('loginForm').reset();
    document.getElementById('signupForm').reset();
    const loginError = document.getElementById('loginError');
    loginError.classList.remove('show');
    loginError.style.color = '';
    document.getElementById('signupError').classList.remove('show');
}

export function switchAuthTab(tab) {
    const loginTab = document.querySelector('.auth-tab:first-child');
    const signupTab = document.querySelector('.auth-tab:last-child');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    if (tab === 'login') {
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
        loginForm.classList.add('active');
        signupForm.classList.remove('active');
    } else {
        signupTab.classList.add('active');
        loginTab.classList.remove('active');
        signupForm.classList.add('active');
        loginForm.classList.remove('active');
    }

    const loginError = document.getElementById('loginError');
    loginError.classList.remove('show');
    loginError.style.color = '';
    document.getElementById('signupError').classList.remove('show');
}

export function getAuthErrorMessage(errorCode) {
    const errorMessages = {
        'auth/email-already-in-use': 'This email is already registered',
        'auth/invalid-email': 'Invalid email address',
        'auth/user-not-found': 'No account found with this email',
        'auth/wrong-password': 'Incorrect password',
        'auth/weak-password': 'Password should be at least 6 characters',
        'auth/too-many-requests': 'Too many attempts. Please try again later',
        'auth/invalid-credential': 'Invalid email or password',
        'auth/popup-closed-by-user': 'Sign-in cancelled',
        'auth/popup-blocked': 'Popup was blocked. Please allow popups for this site',
        'auth/cancelled-popup-request': 'Sign-in cancelled',
        'auth/operation-not-allowed': 'This sign-in method is not enabled. Please contact support.',
        'auth/unauthorized-domain': 'This domain is not authorized for OAuth operations',
        'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method',
        'auth/auth-domain-config-required': 'Configuration error. Please contact support.',
        'auth/credential-already-in-use': 'This credential is already associated with a different account',
        'auth/operation-not-supported-in-this-environment': 'This operation is not supported in this environment'
    };
    return errorMessages[errorCode] || `An error occurred (${errorCode || 'unknown'}). Please try again.`;
}

export async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    try {
        const { signInWithEmailAndPassword } = window.firebaseAuthFunctions;
        await signInWithEmailAndPassword(window.firebaseAuth, email, password);
        closeAuthModal();
    } catch (error) {
        errorDiv.textContent = getAuthErrorMessage(error.code);
        errorDiv.classList.add('show');
    }
}

export async function handleForgotPassword(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const errorDiv = document.getElementById('loginError');

    if (!email) {
        errorDiv.textContent = 'Please enter your email address first';
        errorDiv.classList.add('show');
        return;
    }

    try {
        const { sendPasswordResetEmail } = window.firebaseAuthFunctions;
        await sendPasswordResetEmail(window.firebaseAuth, email);
        errorDiv.textContent = 'Password reset email sent! Check your inbox.';
        errorDiv.classList.add('show');
        errorDiv.style.color = 'var(--success-green)';
    } catch (error) {
        errorDiv.style.color = '';
        errorDiv.textContent = getAuthErrorMessage(error.code);
        errorDiv.classList.add('show');
    }
}

export async function handleSignup(event) {
    event.preventDefault();
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const passwordConfirm = document.getElementById('signupPasswordConfirm').value;
    const errorDiv = document.getElementById('signupError');

    if (password !== passwordConfirm) {
        errorDiv.textContent = 'Passwords do not match';
        errorDiv.classList.add('show');
        return;
    }

    try {
        const { createUserWithEmailAndPassword, sendEmailVerification } = window.firebaseAuthFunctions;
        const userCredential = await createUserWithEmailAndPassword(window.firebaseAuth, email, password);
        await sendEmailVerification(userCredential.user);
        closeAuthModal();
    } catch (error) {
        errorDiv.textContent = getAuthErrorMessage(error.code);
        errorDiv.classList.add('show');
    }
}

export async function handleGoogleLogin() {
    try {
        const { GoogleAuthProvider, signInWithPopup } = window.firebaseAuthFunctions;
        const provider = new GoogleAuthProvider();
        await signInWithPopup(window.firebaseAuth, provider);
        closeAuthModal();
    } catch (error) {
        console.error('Google login error:', error);
        const activeForm = document.querySelector('.auth-form.active');
        const errorDiv = activeForm.querySelector('.auth-error');
        errorDiv.textContent = getAuthErrorMessage(error.code);
        errorDiv.classList.add('show');
    }
}

export async function handleLogout() {
    try {
        const { signOut } = window.firebaseAuthFunctions;
        await signOut(window.firebaseAuth);
        state.questionHistory = [];
        state.sessionHistory = [];
        if (deps.updateHistoryDisplay) deps.updateHistoryDisplay();
        state.questionsPracticed = 0;
        if (deps.updateStats) deps.updateStats();
    } catch (error) {
        console.error('Logout error:', error);
        alert('Error signing out. Please try again.');
    }
}

export async function updateUserUI(user) {
    const userAuthDiv = document.getElementById('userAuth');
    const navTabs = document.getElementById('navTabs');
    const verificationBanner = document.getElementById('verificationBanner');

    if (user) {
        state.currentUser = user;

        if (user.emailVerified) {
            userAuthDiv.innerHTML = `
                <div class="user-profile">
                    <span id="headerLevelBadge" style="display: none;"></span>
                    <span class="user-display-name" id="headerDisplayName">${user.email}</span>
                    <button class="btn-logout" onclick="handleLogout()">Logout</button>
                </div>
            `;
            navTabs.classList.add('show');
            verificationBanner.classList.remove('show');

            if (deps.loadUserProfile) await deps.loadUserProfile();

            // Check for recoverable account data (from previously deleted account)
            if (deps.checkForRecoverableAccount && deps.recoverAccountData) {
                // Only check if user doesn't have profile data yet (new account)
                if (!state.userProfile || !state.userProfile.username) {
                    const recoverable = await deps.checkForRecoverableAccount(user.email);
                    if (recoverable) {
                        const shouldRecover = confirm(
                            `We found data from a previous account associated with ${user.email}.\n\n` +
                            `Username: ${recoverable.profileData.username || 'Not set'}\n` +
                            `Total XP: ${recoverable.profileData.totalPoints || 0}\n` +
                            `Questions Answered: ${recoverable.profileData.questionsAnswered || 0}\n\n` +
                            `Would you like to recover this data?`
                        );
                        if (shouldRecover) {
                            const success = await deps.recoverAccountData(recoverable.oldUserId, user.uid);
                            if (success) {
                                alert('Your account data has been recovered successfully!');
                                // Reload profile with recovered data
                                if (deps.loadUserProfile) await deps.loadUserProfile();
                            } else {
                                alert('There was an error recovering your data. Please contact support.');
                            }
                        }
                    }
                }
            }

            if (deps.loadUserHistory) await deps.loadUserHistory();

            if (window.location.hash === '#dashboard' && deps.refreshDashboard) {
                deps.refreshDashboard();
            }
            if (window.location.hash === '#profile' && deps.loadProfile) {
                await deps.loadProfile();
            }
            if (window.location.hash === '#history') {
                let historyTableWrapper = document.getElementById('historyTableWrapper');
                if (!historyTableWrapper && deps.restoreHistoryStructure) {
                    deps.restoreHistoryStructure();
                }
                if (deps.renderHistoryTable) deps.renderHistoryTable(state.questionHistory);
            }
        } else {
            userAuthDiv.innerHTML = `
                <button class="btn-login" onclick="showAuthModal()">Login / Sign Up</button>
            `;
            navTabs.classList.add('show');
            verificationBanner.classList.add('show');
            if (window.location.hash === '#dashboard' && deps.navigateTo) {
                deps.navigateTo('practice');
            }
        }
    } else {
        state.currentUser = null;
        userAuthDiv.innerHTML = `
            <button class="btn-login" onclick="showAuthModal()">Login / Sign Up</button>
        `;
        navTabs.classList.add('show');
        verificationBanner.classList.remove('show');
        if (window.location.hash === '#dashboard' && deps.navigateTo) {
            deps.navigateTo('practice');
        }
    }
}

export async function resendVerificationEmail() {
    if (!state.currentUser) return;

    try {
        const { sendEmailVerification } = window.firebaseAuthFunctions;
        await sendEmailVerification(state.currentUser);
        alert('Verification email sent! Please check your inbox.');
    } catch (error) {
        console.error('Error sending verification email:', error);
        if (error.code === 'auth/too-many-requests') {
            alert('Too many requests. Please wait a few minutes before trying again.');
        } else {
            alert('Error sending verification email. Please try again later.');
        }
    }
}

export async function checkVerificationStatus() {
    if (!state.currentUser) return;

    try {
        await state.currentUser.reload();

        if (state.currentUser.emailVerified) {
            if (state.questionHistory.length > 0 && deps.saveHistoryItem) {
                for (const entry of state.questionHistory) {
                    await deps.saveHistoryItem(entry);
                }
            }
            updateUserUI(state.currentUser);
        } else {
            alert('Please verify your email to save progress');
            await handleLogout();
        }
    } catch (error) {
        console.error('Error checking verification status:', error);
        alert('Error checking verification status. Please try again.');
    }
}

export function initAuthListener() {
    const { onAuthStateChanged } = window.firebaseAuthFunctions;
    onAuthStateChanged(window.firebaseAuth, (user) => {
        updateUserUI(user);
    });
}
