// Router module - navigation and route handling
import { state } from './state.js';
import { refreshDashboard } from './dashboard.js';
import { renderHistoryPageTable, restoreHistoryPageStructure } from './historyPage.js';
import { loadLeaderboard } from './leaderboard.js';
import { loadProfile, checkAndShowProfileWarning } from './profile.js';
import { ensureAllMetadataLoaded } from './filters.js';

// Forward declarations for cross-module dependencies
export const deps = {
    loadUserHistory: null
};

function isVerifiedUser() {
    return Boolean(state.currentUser && state.currentUser.emailVerified);
}

function renderLoginMessage(container, title, message) {
    container.innerHTML = `
        <div class="dashboard-header">
            <h1 class="dashboard-title">${title}</h1>
        </div>
        <div class="dashboard-card">
            <div class="card-body">
                <div class="leaderboard-empty">${message}</div>
            </div>
        </div>
    `;
}

async function loadHistoryOnce() {
    // History entries span both question sets, so both metadata files
    // are needed; history itself is cached after the first load.
    await ensureAllMetadataLoaded();
    if (deps.loadUserHistory && !state.historyLoaded) {
        await deps.loadUserHistory();
    }
}

// Route table: tabIndex matches the nav-tab order in index.html
const ROUTES = {
    practice: {
        containerId: 'practiceContainer',
        title: 'Practice',
        tabIndex: 0,
        onEnter: () => {
            checkAndShowProfileWarning();
        }
    },
    dashboard: {
        containerId: 'dashboardContainer',
        title: 'Dashboard',
        tabIndex: 1,
        onEnter: async (container) => {
            if (!isVerifiedUser()) {
                renderLoginMessage(container, 'Dashboard', 'Please log in and verify your email to view your dashboard');
                return;
            }
            await loadHistoryOnce();
            refreshDashboard();
        }
    },
    history: {
        containerId: 'historyContainer',
        title: 'History',
        tabIndex: 2,
        onEnter: async (container) => {
            if (!isVerifiedUser()) {
                renderLoginMessage(container, 'History', 'Please log in and verify your email to view your question history');
                return;
            }
            // Restore the structure in case it was replaced by a login message
            if (!document.getElementById('historyTableWrapper')) {
                restoreHistoryPageStructure();
            }
            await loadHistoryOnce();
            renderHistoryPageTable(state.questionHistory);
        }
    },
    leaderboard: {
        containerId: 'leaderboardContainer',
        title: 'Leaderboard',
        tabIndex: 3,
        onEnter: () => loadLeaderboard()
    },
    profile: {
        containerId: 'profileContainer',
        title: 'Profile',
        tabIndex: 4,
        onEnter: () => loadProfile()
    }
};

// Navigation
export function navigateTo(page) {
    window.location.hash = page;
}

// Hash-based Routing
export async function handleRouteChange() {
    const hash = window.location.hash.slice(1);
    const route = ROUTES[hash] || ROUTES.practice;

    // Show the active container, hide the rest
    Object.values(ROUTES).forEach(({ containerId }) => {
        document.getElementById(containerId)?.classList.toggle('active', containerId === route.containerId);
    });

    // Update tab highlight and aria-current
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach((tab, index) => {
        const isActive = index === route.tabIndex;
        tab.classList.toggle('active', isActive);
        if (isActive) {
            tab.setAttribute('aria-current', 'page');
        } else {
            tab.removeAttribute('aria-current');
        }
    });

    document.title = `HBReader – ${route.title}`;

    const container = document.getElementById(route.containerId);
    await route.onEnter?.(container);
}
