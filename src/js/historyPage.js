// History Page module - full history table display (distinct from history.js session sidebar)
import { state, DIFFICULTY_NAMES } from './state.js';
import { updateStats } from './questions.js';
import { refreshDashboard } from './dashboard.js';
import { escapeHtml, sanitizeToHtml } from './rendering.js';
import { getQuestionMeta } from './filters.js';
import { showToast } from './ui.js';

// Forward declarations for cross-module dependencies
export const deps = {
    updateHistoryDisplay: null
};

export function getDifficultyName(key) {
    return DIFFICULTY_NAMES[key] || 'Unknown';
}

export function renderHistoryPageTable(data) {
    const wrapper = document.getElementById('historyTableWrapper');
    const isMobile = window.innerWidth <= 480;

    if (data.length === 0) {
        const message = state.questionHistory.length === 0
            ? 'You haven\'t practiced any questions yet. Head to the Practice tab to get started!'
            : 'No questions match your filters.';
        wrapper.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 40px;">${message}</p>`;
        return;
    }

    // Abbreviation helper for mobile
    function abbreviate(text, maxLen) {
        if (!isMobile || !text || text === 'N/A') return text;
        return text.length > maxLen ? text.substring(0, maxLen) : text;
    }

    let tableHTML = `
        <table class="history-table" id="historyTable">
            <thead>
                <tr>
                    <th style="min-width: ${isMobile ? '30px' : '30px'};">${isMobile ? 'ID' : 'Question ID'}<div class="resizer"></div></th>
                    <th style="min-width: ${isMobile ? '25px' : '25px'};">${isMobile ? '' : 'Status'}<div class="resizer"></div></th>
                    <th style="min-width: ${isMobile ? '25px' : '30px'};">${isMobile ? 'Diff' : 'Difficulty'}<div class="resizer"></div></th>
                    <th style="min-width: ${isMobile ? '30px' : '30px'};">${isMobile ? 'Reg' : 'Region'}<div class="resizer"></div></th>
                    <th style="min-width: ${isMobile ? '30px' : '30px'};">${isMobile ? 'Time' : 'Time Period'}<div class="resizer"></div></th>
                    <th style="min-width: ${isMobile ? '25px' : '30px'};">Type<div class="resizer"></div></th>
                    <th style="min-width: ${isMobile ? '30px' : '30px'};">Date</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.forEach(entry => {
        const dateObj = new Date(entry.timestamp);
        const date = isMobile
            ? `${dateObj.getMonth() + 1}/${dateObj.getDate()}`
            : dateObj.toLocaleDateString();
        const difficulty = isMobile
            ? entry.id.charAt(0)
            : getDifficultyName(entry.id.charAt(0));
        const statusIcon = entry.status === 'correct' ? '✓' : (entry.status === 'incorrect' ? '✗' : '—');

        // Get category information from set-qualified metadata
        const meta = getQuestionMeta(entry);
        const region = meta?.regions?.[0] ?? 'N/A';
        const timePeriod = meta?.time_periods?.[0] ?? 'N/A';
        const answerType = meta?.answer_type || 'N/A';
        const status = ['correct', 'incorrect', 'skipped'].includes(entry.status) ? entry.status : 'skipped';

        tableHTML += `
            <tr class="${status}" data-entry-key="${escapeHtml(`${entry.id}_${entry.timestamp}`)}">
                <td style="white-space: nowrap;">${escapeHtml(entry.id)}</td>
                <td>
                    <span class="status-badge ${status}">${statusIcon}</span>
                </td>
                <td>${escapeHtml(difficulty)}</td>
                <td>${escapeHtml(abbreviate(region, 7))}</td>
                <td>${escapeHtml(abbreviate(timePeriod, 7))}</td>
                <td>${escapeHtml(abbreviate(answerType, 4))}</td>
                <td>${escapeHtml(date)}</td>
            </tr>
        `;
    });

    tableHTML += '</tbody></table>';
    wrapper.innerHTML = tableHTML;
    wrapper.querySelectorAll('[data-entry-key]').forEach(row => {
        row.addEventListener('click', () => openQuestionDetail(row.dataset.entryKey));
    });

    // Initialize column resizing after table is rendered
    initColumnResizing();
}

// Column resizing functionality
export function initColumnResizing() {
    const table = document.getElementById('historyTable');
    if (!table) return;

    const resizers = table.querySelectorAll('.resizer');
    const allThs = table.querySelectorAll('thead th');
    let currentTh = null;
    let startX = 0;
    let startWidth = 0;

    resizers.forEach(resizer => {
        resizer.addEventListener('mousedown', (e) => {
            // Lock all column widths to their current rendered size
            allThs.forEach(th => {
                th.style.width = th.getBoundingClientRect().width + 'px';
            });

            currentTh = resizer.parentElement;
            startX = e.pageX;
            startWidth = currentTh.getBoundingClientRect().width;

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);

            e.preventDefault();
        });
    });

    function handleMouseMove(e) {
        if (!currentTh) return;

        const width = startWidth + (e.pageX - startX);
        const minWidth = parseInt(currentTh.style.minWidth) || 30;

        if (width >= minWidth) {
            currentTh.style.width = width + 'px';
        }
    }

    function handleMouseUp() {
        currentTh = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    }
}

// Accepts an "id_timestamp" key (exact attempt) or a bare question ID (first match)
export function openQuestionDetail(entryKey) {
    let entry = null;
    const separator = String(entryKey).lastIndexOf('_');
    if (separator > 0) {
        const id = entryKey.slice(0, separator);
        const timestamp = Number(entryKey.slice(separator + 1));
        entry = state.questionHistory.find(e => e.id === id && e.timestamp === timestamp);
    }
    if (!entry) {
        entry = state.questionHistory.find(e => e.id === entryKey);
    }
    if (!entry) return;

    const questionId = entry.id;

    // Get category information from set-qualified metadata
    const meta = getQuestionMeta(entry);
    const region = meta?.regions?.join(', ') || 'N/A';
    const timePeriod = meta?.time_periods?.join(', ') || 'N/A';
    const answerType = meta?.answer_type || 'N/A';
    const themes = meta?.subject_themes?.join(', ') || 'N/A';

    const newWindow = window.open('', '_blank');
    if (!newWindow) return;

    newWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Question ${escapeHtml(questionId)}</title>
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    max-width: 800px;
                    margin: 40px auto;
                    padding: 20px;
                    line-height: 1.6;
                }
                h1 { color: #4a90e2; }
                .question { font-size: 1.1em; margin: 20px 0; }
                .answer { background: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0; }
                .categories { background: #e3f2fd; padding: 15px; border-radius: 4px; margin: 20px 0; }
                .label { font-weight: 600; color: #666; margin-bottom: 10px; }
                .category-item { margin: 8px 0; }
                .category-label { font-weight: 600; color: #1976d2; display: inline-block; width: 120px; }
            </style>
        </head>
        <body>
            <h1>Question ${escapeHtml(questionId)}</h1>
            <div class="label">Question:</div>
            <div class="question">${sanitizeToHtml(entry.question)}</div>
            <div class="label">Answer:</div>
            <div class="answer">${sanitizeToHtml(entry.answer)}</div>
            <div class="label">Categories:</div>
            <div class="categories">
                <div class="category-item"><span class="category-label">Region:</span> ${escapeHtml(region)}</div>
                <div class="category-item"><span class="category-label">Time Period:</span> ${escapeHtml(timePeriod)}</div>
                <div class="category-item"><span class="category-label">Answer Type:</span> ${escapeHtml(answerType)}</div>
                <div class="category-item"><span class="category-label">Themes:</span> ${escapeHtml(themes)}</div>
            </div>
        </body>
        </html>
    `);
    newWindow.document.close();
}

// History filtering
export function filterHistoryPage() {
    const searchTerm = document.getElementById('historySearch').value.toLowerCase();
    const questionSetFilter = document.getElementById('historyQuestionSetFilter')?.value || 'all';
    const difficultyFilter = document.getElementById('difficultyFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;

    const filtered = state.questionHistory.filter(entry => {
        const matchesSearch = entry.id.toLowerCase().includes(searchTerm);
        const matchesQuestionSet = questionSetFilter === 'all' || entry.questionSet === questionSetFilter;
        const matchesDifficulty = difficultyFilter === 'all' || entry.id.charAt(0) === difficultyFilter;
        const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;

        return matchesSearch && matchesQuestionSet && matchesDifficulty && matchesStatus;
    });

    renderHistoryPageTable(filtered);
}

// Export history to CSV
export function exportHistoryPage() {
    if (state.questionHistory.length === 0) {
        alert('No history to export!');
        return;
    }

    let csv = 'Question ID,Status,Difficulty,Region,Time Period,Type,Date,Question,Answer\n';

    state.questionHistory.forEach(entry => {
        const date = new Date(entry.timestamp).toLocaleDateString();
        const difficulty = getDifficultyName(entry.id.charAt(0));
        const question = entry.question.replace(/"/g, '""').replace(/<[^>]*>/g, '');
        const answer = entry.answer.replace(/"/g, '""').replace(/<[^>]*>/g, '');

        // Get category information from set-qualified metadata
        const meta = getQuestionMeta(entry);
        const region = meta?.regions?.join('; ') || 'N/A';
        const timePeriod = meta?.time_periods?.join('; ') || 'N/A';
        const answerType = meta?.answer_type || 'N/A';

        csv += `"${entry.id}","${entry.status}","${difficulty}","${region}","${timePeriod}","${answerType}","${date}","${question}","${answer}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hbreader-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

// Clear all history
export async function clearHistoryPage() {
    if (!confirm('Are you sure you want to clear all your question history? This cannot be undone.')) {
        return;
    }

    // Delete from Firestore first so a failed remote delete leaves the
    // local view consistent with what is actually stored.
    if (state.currentUser && state.currentUser.emailVerified) {
        try {
            const { collection, getDocs, deleteDoc } = window.firebaseDbFunctions;
            const historyCollectionRef = collection(
                window.firebaseDb,
                'users',
                state.currentUser.uid,
                'history'
            );
            const querySnapshot = await getDocs(historyCollectionRef);

            const deletePromises = [];
            querySnapshot.forEach((docSnapshot) => {
                deletePromises.push(deleteDoc(docSnapshot.ref));
            });

            await Promise.all(deletePromises);
        } catch (error) {
            console.error('Error clearing history:', error);
            showToast('Could not clear history from the cloud. Your history is unchanged.', 'error');
            return;
        }
    }

    state.questionHistory = [];
    state.sessionHistory = [];
    if (deps.updateHistoryDisplay) {
        deps.updateHistoryDisplay();
    }
    state.questionsPracticed = 0;
    updateStats();

    showToast('History cleared.', 'success');
    refreshDashboard();
    renderHistoryPageTable(state.questionHistory);
}

export function restoreHistoryPageStructure() {
    const historyContainer = document.getElementById('historyContainer');
    historyContainer.innerHTML = `
        <div class="dashboard-header">
            <h1 class="dashboard-title">Question History</h1>
            <p class="dashboard-subtitle">Review your practice history and track your progress</p>
        </div>

        <div class="history-table-container">
            <div class="history-controls">
                <input type="text" class="history-search" id="historySearch" placeholder="Search by Question ID..." aria-label="Search history by question ID">
                <select class="history-filter" id="historyQuestionSetFilter" aria-label="Filter by question set">
                    <option value="all">All Question Sets</option>
                    <option value="nat_hist_bee">National History Bee</option>
                    <option value="us_hist_bee">US History Bee</option>
                </select>
                <select class="history-filter" id="difficultyFilter" aria-label="Filter by difficulty">
                    <option value="all">All Difficulties</option>
                    <option value="P">Preliminary</option>
                    <option value="Q">Quarterfinals</option>
                    <option value="S">Semifinals</option>
                    <option value="F">Finals</option>
                </select>
                <select class="history-filter" id="statusFilter" aria-label="Filter by status">
                    <option value="all">All Status</option>
                    <option value="correct">Correct</option>
                    <option value="incorrect">Incorrect</option>
                    <option value="skipped">Skipped</option>
                </select>
            </div>

            <div id="historyTableWrapper">
                <!-- Table will be generated by JS -->
            </div>

            <div class="dashboard-actions">
                <button class="btn-export" onclick="exportHistoryPage()">Export History (CSV)</button>
            </div>
        </div>
    `;

    // Re-attach event listeners for search and filters
    document.getElementById('historySearch').addEventListener('input', filterHistoryPage);
    document.getElementById('historyQuestionSetFilter').addEventListener('change', filterHistoryPage);
    document.getElementById('difficultyFilter').addEventListener('change', filterHistoryPage);
    document.getElementById('statusFilter').addEventListener('change', filterHistoryPage);
}

// Initialize history page event listeners
export function initHistoryPageEventListeners() {
    const historySearch = document.getElementById('historySearch');
    const historyQuestionSetFilter = document.getElementById('historyQuestionSetFilter');
    const difficultyFilter = document.getElementById('difficultyFilter');
    const statusFilter = document.getElementById('statusFilter');

    if (historySearch) historySearch.addEventListener('input', filterHistoryPage);
    if (historyQuestionSetFilter) historyQuestionSetFilter.addEventListener('change', filterHistoryPage);
    if (difficultyFilter) difficultyFilter.addEventListener('change', filterHistoryPage);
    if (statusFilter) statusFilter.addEventListener('change', filterHistoryPage);
}
