// History module - question history persistence and session tracking.
// Page rendering lives in historyPage.js; this module owns saving/loading
// history data and the (currently unused) session-sidebar display hooks.
import { state } from './state.js';
import { updateStats } from './questions.js';
import { setSanitizedHtml } from './rendering.js';
import { showToast } from './ui.js';

// Forward declarations
export const deps = {
    updatePointsAndLeaderboard: null
};

export async function addToHistory(question, status) {
    const currentQuestionSet = document.getElementById('questionSet').value;
    const historyEntry = {
        id: question.id,
        question: question.question,
        answer: question.answer,
        status: status,
        timestamp: Date.now(),
        questionSet: currentQuestionSet
    };

    // Record XP eligibility on the entry: the >= 80% tolerance gate lives only
    // in localStorage, and the server scoring function (functions/index.js)
    // honors this flag when awarding XP.
    const currentTolerance = parseInt(localStorage.getItem('answerTolerance') || '80');
    historyEntry.xpEligible = status === 'correct' && currentTolerance >= 80;

    state.questionHistory.push(historyEntry);
    state.sessionHistory.push(historyEntry);
    updateHistoryDisplay();

    if (state.currentUser && state.currentUser.emailVerified) {
        await saveHistoryItem(historyEntry);

        const difficulty = question.id.charAt(0);
        if (deps.updatePointsAndLeaderboard) {
            await deps.updatePointsAndLeaderboard(difficulty, status === 'correct');
        }
    }
}

export async function saveHistoryItem(historyEntry) {
    try {
        const { doc, setDoc } = window.firebaseDbFunctions;
        const historyDocRef = doc(
            window.firebaseDb,
            'users',
            state.currentUser.uid,
            'history',
            historyEntry.id + '_' + historyEntry.timestamp
        );
        await setDoc(historyDocRef, historyEntry);
    } catch (error) {
        console.error('Error saving history:', error);
        showToast('Could not save this question to your history - check your connection.', 'error');
    }
}

export async function loadUserHistory() {
    if (!state.currentUser || !state.currentUser.emailVerified) return;

    try {
        const { collection, getDocs, query, orderBy } = window.firebaseDbFunctions;
        const historyCollectionRef = collection(
            window.firebaseDb,
            'users',
            state.currentUser.uid,
            'history'
        );
        const q = query(historyCollectionRef, orderBy('timestamp', 'asc'));
        const querySnapshot = await getDocs(q);

        state.questionHistory = [];
        querySnapshot.forEach((doc) => {
            state.questionHistory.push(doc.data());
        });

        updateHistoryDisplay();
        state.questionsPracticed = state.questionHistory.length;
        state.historyLoaded = true;
        updateStats();
    } catch (error) {
        console.error('Error loading history:', error);
        showToast('Could not load your question history.', 'error');
    }
}

// Session history strip. The #historyItems container is not part of the
// current app shell, so this renders nothing today; it is kept (cheap,
// null-guarded) so the session strip can be reinstated by adding the
// container back to index.html.
export function updateHistoryDisplay() {
    const historyItems = document.getElementById('historyItems');
    if (!historyItems) return;

    if (state.sessionHistory.length === 0) {
        historyItems.innerHTML = '<span style="color: var(--text-tertiary); font-style: italic; font-size: 0.9em;">No questions practiced yet this session.</span>';
        return;
    }

    historyItems.innerHTML = '';

    state.sessionHistory.forEach((entry, index) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        item.dataset.index = index;

        let icon = '';
        let iconClass = '';

        if (entry.status === 'correct') {
            icon = '✓';
            iconClass = 'correct';
        } else if (entry.status === 'incorrect') {
            icon = '✗';
            iconClass = 'incorrect';
        } else {
            icon = '—';
            iconClass = 'skipped';
        }

        const statusIcon = document.createElement('span');
        statusIcon.className = `status-icon ${iconClass}`;
        statusIcon.textContent = icon;
        const idLabel = document.createElement('span');
        idLabel.textContent = entry.id;
        item.replaceChildren(statusIcon, idLabel);

        item.addEventListener('mouseenter', (e) => showHistoryTooltip(e, entry));
        item.addEventListener('mouseleave', hideHistoryTooltip);
        item.addEventListener('mousemove', updateTooltipPosition);

        historyItems.appendChild(item);
    });
}

export function showHistoryTooltip(event, entry) {
    const tooltip = document.getElementById('historyTooltip');
    const tooltipQuestion = document.getElementById('tooltipQuestion');
    const tooltipAnswer = document.getElementById('tooltipAnswer');

    setSanitizedHtml(tooltipQuestion, entry.question);
    setSanitizedHtml(tooltipAnswer, entry.answer);

    tooltip.classList.add('show');
    state.currentTooltipEvent = event;
    updateTooltipPosition(event);
}

export function hideHistoryTooltip() {
    const tooltip = document.getElementById('historyTooltip');
    tooltip.classList.remove('show');
    state.currentTooltipEvent = null;
}

export function updateTooltipPosition(event) {
    const tooltip = document.getElementById('historyTooltip');
    if (!tooltip.classList.contains('show')) return;

    const x = event.clientX;
    const y = event.clientY;
    const offset = 15;

    const tooltipRect = tooltip.getBoundingClientRect();
    let left = x + offset;
    let top = y + offset;

    if (left + tooltipRect.width > window.innerWidth) {
        left = x - tooltipRect.width - offset;
    }

    if (top + tooltipRect.height > window.innerHeight) {
        top = y - tooltipRect.height - offset;
    }

    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
}
