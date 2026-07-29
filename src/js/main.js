// Main entry point - imports all modules and makes functions globally available
import { state } from './state.js';

// Import auth module
import * as auth from './auth.js';

// Import settings module
import * as settings from './settings.js';

// Import filters module
import * as filters from './filters.js';

// Import questions module
import * as questions from './questions.js';

// Import game module
import * as game from './game.js';

// Import history module (session sidebar)
import * as history from './history.js';

// Import new page modules (split from pages.js)
import * as router from './router.js';
import * as dashboard from './dashboard.js';
import * as historyPage from './historyPage.js';
import * as leaderboard from './leaderboard.js';
import * as profile from './profile.js';
import * as xpSystem from './xpSystem.js';

// Wire up cross-module dependencies
// Auth dependencies
auth.deps.updateHistoryDisplay = history.updateHistoryDisplay;
auth.deps.updateStats = questions.updateStats;
auth.deps.loadUserProfile = profile.loadUserProfile;
auth.deps.updateProfileUI = profile.updateProfileUI;
auth.deps.loadUserHistory = history.loadUserHistory;
auth.deps.refreshDashboard = dashboard.refreshDashboard;
auth.deps.loadProfile = profile.loadProfile;
auth.deps.restoreHistoryStructure = historyPage.restoreHistoryPageStructure;
auth.deps.renderHistoryTable = historyPage.renderHistoryPageTable;
auth.deps.navigateTo = router.navigateTo;
auth.deps.saveHistoryItem = history.saveHistoryItem;
auth.deps.checkForRecoverableAccount = profile.checkForRecoverableAccount;
auth.deps.recoverAccountData = profile.recoverAccountData;

// Settings dependencies
settings.deps.showAnswerInput = game.showAnswerInput;

// Game dependencies
game.deps.addToHistory = history.addToHistory;
game.deps.updatePointsAndLeaderboard = profile.updatePointsAndLeaderboard;

// History dependencies
history.deps.updatePointsAndLeaderboard = profile.updatePointsAndLeaderboard;

// Router dependencies
router.deps.loadUserHistory = history.loadUserHistory;

// History Page dependencies
historyPage.deps.updateHistoryDisplay = history.updateHistoryDisplay;

// Leaderboard dependencies
leaderboard.deps.updateProfileUI = profile.updateProfileUI;

// Make functions globally available for HTML onclick handlers

// Auth
window.showAuthModal = auth.showAuthModal;
window.closeAuthModal = auth.closeAuthModal;
window.switchAuthTab = auth.switchAuthTab;
window.handleLogin = auth.handleLogin;
window.handleForgotPassword = auth.handleForgotPassword;
window.handleSignup = auth.handleSignup;
window.handleGoogleLogin = auth.handleGoogleLogin;
window.handleLogout = auth.handleLogout;
window.resendVerificationEmail = auth.resendVerificationEmail;
window.checkVerificationStatus = auth.checkVerificationStatus;
window.dismissVerificationBanner = auth.dismissVerificationBanner;

// Settings
window.toggleTheme = settings.toggleTheme;
window.toggleSettings = settings.toggleSettings;

// Filters
window.clearRegionFilter = filters.clearRegionFilter;
window.clearTimePeriodFilter = filters.clearTimePeriodFilter;
window.removeQuestionType = filters.removeQuestionType;
window.clearAllFilters = filters.clearAllFilters;

// Game
window.handleStart = game.handleStart;
window.handleNext = game.handleNext;
window.handlePauseResume = game.handlePauseResume;
window.showAnswerInput = game.showAnswerInput;
window.checkAnswer = game.checkAnswer;
window.revealAnswer = game.revealAnswer;

// Router
window.navigateTo = router.navigateTo;

// Dashboard
window.onTrendPeriodChange = dashboard.onTrendPeriodChange;
window.onDashboardQuestionSetChange = dashboard.onDashboardQuestionSetChange;

// History Page (full page table)
window.openQuestionDetail = historyPage.openQuestionDetail;
window.filterHistoryPage = historyPage.filterHistoryPage;
window.exportHistoryPage = historyPage.exportHistoryPage;
window.clearHistoryPage = historyPage.clearHistoryPage;

// Leaderboard
window.loadLeaderboard = leaderboard.loadLeaderboard;
window.calculateRetroactivePoints = leaderboard.calculateRetroactivePoints;

// Profile
window.changeUsername = profile.changeUsername;
window.saveProfile = profile.saveProfile;
window.loadUserProfile = profile.loadUserProfile;
window.dismissProfileWarning = profile.dismissProfileWarning;
window.deleteAccount = profile.deleteAccount;

// XP System
window.closeLevelUpNotification = xpSystem.closeLevelUpNotification;

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    // Set device type attribute for CSS targeting
    document.body.setAttribute('data-device', settings.detectDeviceType());

    // Initialize theme
    settings.initTheme();

    // Initialize font size
    settings.initFontSize();

    // Initialize sliders
    settings.initSliders();

    // Initialize answer tolerance
    settings.initAnswerTolerance();

    // Initialize settings event listeners
    settings.initSettingsEventListeners();

    // Initialize filter event listeners
    filters.initFilterEventListeners();

    // Initialize question event listeners
    questions.initQuestionEventListeners();

    // Initialize game event listeners
    game.initGameEventListeners();

    // Initialize dashboard event listeners
    dashboard.initDashboardEventListeners();

    // Initialize history page event listeners
    historyPage.initHistoryPageEventListeners();

    // Initialize difficulty display
    questions.updateDifficultyDisplay();

    // Load questions in the background - the Start button shows a loading
    // state, and non-practice routes don't need to wait for ~6MB of JSON.
    const questionSet = document.getElementById('questionSet').value;
    questions.loadQuestions(questionSet);

    // Initialize region filter state
    filters.updateRegionFilterState();

    // Handle initial route
    await router.handleRouteChange();

    // Listen for route changes
    window.addEventListener('hashchange', router.handleRouteChange);

    // Collapse settings by default on mobile
    if (window.innerWidth <= 768) {
        const settingsPanel = document.getElementById('settingsPanel');
        if (settingsPanel) {
            settingsPanel.classList.add('collapsed');
        }
    }
});

// Initialize Firebase Auth listener after window load
window.addEventListener('load', () => {
    auth.initAuthListener();
});

console.log('HBReader modules loaded successfully');
