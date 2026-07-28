// Dashboard module - statistics, charts, and performance trends
import { state, DIFFICULTY_COLORS, DIFFICULTY_NAMES, ANSWER_TYPE_COLORS, ANSWER_TYPE_SHORT_NAMES } from './state.js';
import { getQuestionMeta } from './filters.js';

// Forward declarations for cross-module dependencies
export const deps = {
    loadUserHistory: null
};

// Dashboard Functions
export function createRadialChart(container, percentage, size = 'normal') {
    const isSmall = size === 'small';
    const svgSize = isSmall ? 100 : 150;
    const center = svgSize / 2;
    const radius = isSmall ? 40 : 66;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    container.innerHTML = `
        <svg width="${svgSize}" height="${svgSize}">
            <circle class="radial-chart-bg" cx="${center}" cy="${center}" r="${radius}"></circle>
            <circle class="radial-chart-progress correct" cx="${center}" cy="${center}" r="${radius}"
                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
        </svg>
        <div class="radial-chart-text">
            <div class="radial-chart-percentage">${percentage}%</div>
        </div>
    `;
}

// Get filtered question history based on dashboard question set selector
export function getFilteredHistoryForDashboard() {
    if (state.dashboardQuestionSet === 'all') {
        return state.questionHistory;
    }
    return state.questionHistory.filter(entry => entry.questionSet === state.dashboardQuestionSet);
}

export function calculateStats() {
    const filteredHistory = getFilteredHistoryForDashboard();
    const stats = {
        total: filteredHistory.length,
        correct: 0,
        incorrect: 0,
        skipped: 0,
        currentStreak: 0,
        bestStreak: 0,
        byDifficulty: {
            P: { total: 0, correct: 0, incorrect: 0, skipped: 0 },
            Q: { total: 0, correct: 0, incorrect: 0, skipped: 0 },
            S: { total: 0, correct: 0, incorrect: 0, skipped: 0 },
            F: { total: 0, correct: 0, incorrect: 0, skipped: 0 }
        }
    };

    let currentStreak = 0;
    let bestStreak = 0;

    filteredHistory.forEach((entry) => {
        // Overall stats
        if (entry.status === 'correct') {
            stats.correct++;
            currentStreak++;
            bestStreak = Math.max(bestStreak, currentStreak);
        } else if (entry.status === 'incorrect') {
            stats.incorrect++;
            currentStreak = 0;
        } else {
            stats.skipped++;
        }

        // Difficulty stats (treat unknown legacy statuses as skipped)
        const difficultyKey = entry.id.charAt(0);
        if (stats.byDifficulty[difficultyKey]) {
            const status = ['correct', 'incorrect', 'skipped'].includes(entry.status) ? entry.status : 'skipped';
            stats.byDifficulty[difficultyKey].total++;
            stats.byDifficulty[difficultyKey][status]++;
        }
    });

    // Calculate current streak (consecutive correct from end)
    for (let i = filteredHistory.length - 1; i >= 0; i--) {
        if (filteredHistory[i].status === 'correct') {
            stats.currentStreak++;
        } else {
            break;
        }
    }

    stats.bestStreak = bestStreak;

    return stats;
}

export function calculateCategoryStats() {
    const filteredHistory = getFilteredHistoryForDashboard();
    const regionStats = {};
    const answerTypeStats = {};

    filteredHistory.forEach((entry) => {
        const meta = getQuestionMeta(entry);
        if (!meta) return;

        // Process regions
        (meta.regions || []).forEach(region => {
            if (!regionStats[region]) {
                regionStats[region] = { total: 0, correct: 0 };
            }
            regionStats[region].total++;
            if (entry.status === 'correct') {
                regionStats[region].correct++;
            }
        });

        // Process answer type
        const answerType = meta.answer_type;
        if (answerType) {
            if (!answerTypeStats[answerType]) {
                answerTypeStats[answerType] = { total: 0, correct: 0 };
            }
            answerTypeStats[answerType].total++;
            if (entry.status === 'correct') {
                answerTypeStats[answerType].correct++;
            }
        }
    });

    return { regionStats, answerTypeStats };
}

export function updateCategoryStatsDisplay(answerTypeStats) {
    const answerTypeStatsDiv = document.getElementById('answerTypeStats');

    // All possible answer types
    const allAnswerTypes = [
        "People & Biography",
        "Events (Wars, Battles, Revolutions)",
        "Political History & Diplomacy",
        "Economic History & Trade",
        "Social History & Daily Life",
        "Cultural History (Art, Literature, Music)",
        "Religion & Mythology",
        "Science, Technology & Innovation",
        "Geography & Environment",
        "Places, Cities & Civilizations",
        "Groups, Organizations & Institutions",
        "Documents, Laws & Treaties",
        "Ideas, Ideologies & Philosophies"
    ];

    // Display name abbreviations
    const displayNames = {
        "People & Biography": "People & Bio",
        "Events (Wars, Battles, Revolutions)": "Events & Wars",
        "Political History & Diplomacy": "Political & Diplomacy",
        "Economic History & Trade": "Economic & Trade",
        "Social History & Daily Life": "Social & Daily Life",
        "Cultural History (Art, Literature, Music)": "Cultural & Arts",
        "Religion & Mythology": "Religion & Myth",
        "Science, Technology & Innovation": "Science & Tech",
        "Geography & Environment": "Geography & Env",
        "Places, Cities & Civilizations": "Places & Civs",
        "Groups, Organizations & Institutions": "Groups & Orgs",
        "Documents, Laws & Treaties": "Docs & Treaties",
        "Ideas, Ideologies & Philosophies": "Ideas & Philosophy"
    };

    // Helper function to create stat item HTML
    function createStatItem(label, fullLabel, total, correct) {
        const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;
        return `
            <div class="category-stat-item">
                <div class="category-stat-label" title="${fullLabel}">${label}</div>
                <div class="category-stat-bar-container">
                    <div class="category-stat-bar" style="width: ${percentage}%"></div>
                </div>
                <div class="category-stat-value">${percentage}%</div>
                <div class="category-stat-count">(${total})</div>
            </div>
        `;
    }

    // Generate answer type stats HTML for ALL types
    let answerTypeHTML = '';
    allAnswerTypes.forEach(type => {
        const stats = answerTypeStats[type] || { total: 0, correct: 0 };
        const displayName = displayNames[type] || type;
        answerTypeHTML += createStatItem(displayName, type, stats.total, stats.correct);
    });
    answerTypeStatsDiv.innerHTML = answerTypeHTML;
}

// ============================================
// PERFORMANCE TRENDS
// ============================================

export function filterHistoryByTimePeriod(period) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let startDate;
    switch (period) {
        case 'today':
            startDate = startOfToday;
            break;
        case 'week':
            startDate = new Date(startOfToday);
            startDate.setDate(startDate.getDate() - 7);
            break;
        case 'month':
            startDate = new Date(startOfToday);
            startDate.setDate(startDate.getDate() - 30);
            break;
        case 'year':
            startDate = new Date(startOfToday);
            startDate.setFullYear(startDate.getFullYear() - 1);
            break;
        case 'all':
        default:
            startDate = new Date(0); // Beginning of time
            break;
    }

    // First filter by question set, then by time
    const historyToFilter = getFilteredHistoryForDashboard();
    return historyToFilter.filter(entry => entry.timestamp >= startDate.getTime());
}

// Local-timezone YYYY-MM-DD key. toISOString() buckets by UTC, which puts
// evening sessions on the wrong day relative to the local-midnight period
// boundaries used by filterHistoryByTimePeriod.
function localDateKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function calculateTrendStats(period) {
    const filteredHistory = filterHistoryByTimePeriod(period);

    if (filteredHistory.length === 0) {
        return { dates: [], overall: [], byDifficulty: {}, byAnswerType: {} };
    }

    // Group by date
    const byDate = {};

    filteredHistory.forEach(entry => {
        const date = new Date(entry.timestamp);
        let dateKey;

        // Use appropriate grouping based on period
        if (period === 'year' || period === 'all') {
            // Group by week for year/all time
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            dateKey = localDateKey(weekStart);
        } else {
            // Group by day for shorter periods
            dateKey = localDateKey(date);
        }

        if (!byDate[dateKey]) {
            byDate[dateKey] = {
                overall: { total: 0, correct: 0 },
                byDifficulty: {},
                byAnswerType: {}
            };
        }

        const dayData = byDate[dateKey];
        const isCorrect = entry.status === 'correct';
        const difficulty = entry.id.charAt(0);
        const meta = getQuestionMeta(entry);
        const answerType = meta ? meta.answer_type : null;

        // Overall stats
        dayData.overall.total++;
        if (isCorrect) dayData.overall.correct++;

        // By difficulty
        if (!dayData.byDifficulty[difficulty]) {
            dayData.byDifficulty[difficulty] = { total: 0, correct: 0 };
        }
        dayData.byDifficulty[difficulty].total++;
        if (isCorrect) dayData.byDifficulty[difficulty].correct++;

        // By answer type
        if (answerType) {
            if (!dayData.byAnswerType[answerType]) {
                dayData.byAnswerType[answerType] = { total: 0, correct: 0 };
            }
            dayData.byAnswerType[answerType].total++;
            if (isCorrect) dayData.byAnswerType[answerType].correct++;
        }
    });

    // Sort dates and calculate percentages
    const sortedDates = Object.keys(byDate).sort();

    const result = {
        dates: sortedDates,
        overall: [],
        byDifficulty: { P: [], Q: [], S: [], F: [] },
        byAnswerType: {}
    };

    // Initialize answer type arrays
    Object.keys(ANSWER_TYPE_COLORS).forEach(type => {
        result.byAnswerType[type] = [];
    });

    sortedDates.forEach(date => {
        const dayData = byDate[date];

        // Overall accuracy
        const overallPct = dayData.overall.total > 0
            ? Math.round((dayData.overall.correct / dayData.overall.total) * 100)
            : null;
        result.overall.push(overallPct);

        // Difficulty accuracy
        ['P', 'Q', 'S', 'F'].forEach(diff => {
            const diffData = dayData.byDifficulty[diff];
            const pct = diffData && diffData.total > 0
                ? Math.round((diffData.correct / diffData.total) * 100)
                : null;
            result.byDifficulty[diff].push(pct);
        });

        // Answer type accuracy
        Object.keys(ANSWER_TYPE_COLORS).forEach(type => {
            const typeData = dayData.byAnswerType[type];
            const pct = typeData && typeData.total > 0
                ? Math.round((typeData.correct / typeData.total) * 100)
                : null;
            result.byAnswerType[type].push(pct);
        });
    });

    return result;
}

export function createTrendChart(container, data, options = {}) {
    const { dates, series, colors, showLegend = false, legendContainer = null } = options;

    container.innerHTML = '';

    if (!dates || dates.length === 0) {
        container.innerHTML = '<div class="trend-chart-empty">No data available for this period</div>';
        return;
    }

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 200;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Create SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'trend-chart');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // Draw grid lines
    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartHeight * (4 - i) / 4);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', padding.left);
        line.setAttribute('y1', y);
        line.setAttribute('x2', width - padding.right);
        line.setAttribute('y2', y);
        line.setAttribute('class', 'trend-grid-line');
        svg.appendChild(line);

        // Y-axis labels
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', padding.left - 5);
        label.setAttribute('y', y + 3);
        label.setAttribute('class', 'trend-axis-label trend-y-label');
        label.textContent = `${i * 25}%`;
        svg.appendChild(label);
    }

    // X-axis labels (show subset of dates)
    const maxLabels = Math.min(dates.length, 7);
    const labelInterval = Math.ceil(dates.length / maxLabels);
    dates.forEach((date, i) => {
        if (i % labelInterval === 0 || i === dates.length - 1) {
            const x = padding.left + (chartWidth * i / (dates.length - 1 || 1));
            const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            label.setAttribute('x', x);
            label.setAttribute('y', height - 5);
            label.setAttribute('class', 'trend-axis-label trend-x-label');
            // Format date as MM/DD. Keys are local YYYY-MM-DD strings; parse
            // the parts directly since `new Date('YYYY-MM-DD')` is UTC midnight
            // and would shift the label back a day in western timezones.
            const [, labelMonth, labelDay] = date.split('-').map(Number);
            label.textContent = `${labelMonth}/${labelDay}`;
            svg.appendChild(label);
        }
    });

    // Draw lines for each series
    Object.entries(series).forEach(([name, values]) => {
        if (!values || values.every(v => v === null)) return;

        const color = colors[name] || '#3498db';
        const points = [];

        values.forEach((val, i) => {
            if (val !== null) {
                const x = padding.left + (chartWidth * i / (dates.length - 1 || 1));
                const y = padding.top + chartHeight - (chartHeight * val / 100);
                points.push({ x, y, val });
            }
        });

        if (points.length > 1) {
            // Draw line
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
            path.setAttribute('d', d);
            path.setAttribute('class', 'trend-line');
            path.setAttribute('stroke', color);
            svg.appendChild(path);
        }

        // Draw dots
        points.forEach(p => {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', p.x);
            circle.setAttribute('cy', p.y);
            circle.setAttribute('r', 3);
            circle.setAttribute('class', 'trend-dot');
            circle.setAttribute('fill', color);
            svg.appendChild(circle);
        });
    });

    container.appendChild(svg);

    // Create legend if needed
    if (showLegend && legendContainer) {
        legendContainer.innerHTML = '';
        Object.entries(series).forEach(([name, values]) => {
            // Only show in legend if there's data
            if (!values || values.every(v => v === null)) return;

            const color = colors[name] || '#3498db';
            const displayName = ANSWER_TYPE_SHORT_NAMES[name] || DIFFICULTY_NAMES[name] || name;

            const item = document.createElement('div');
            item.className = 'trend-legend-item';
            item.innerHTML = `
                <div class="trend-legend-color" style="background: ${color}"></div>
                <span>${displayName}</span>
            `;
            legendContainer.appendChild(item);
        });
    }
}

export function renderTrendCharts() {
    const stats = calculateTrendStats(state.selectedTrendPeriod);

    // Overall accuracy chart
    const overallContainer = document.getElementById('overallTrendChart');
    if (overallContainer) {
        createTrendChart(overallContainer, null, {
            dates: stats.dates,
            series: { 'Overall': stats.overall },
            colors: { 'Overall': '#3498db' }
        });
    }

    // Difficulty trend chart
    const difficultyContainer = document.getElementById('difficultyTrendChart');
    const difficultyLegend = document.getElementById('difficultyTrendLegend');
    if (difficultyContainer) {
        createTrendChart(difficultyContainer, null, {
            dates: stats.dates,
            series: stats.byDifficulty,
            colors: DIFFICULTY_COLORS,
            showLegend: true,
            legendContainer: difficultyLegend
        });
    }

    // Answer type trend chart
    const answerTypeContainer = document.getElementById('answerTypeTrendChart');
    const answerTypeLegend = document.getElementById('answerTypeTrendLegend');
    if (answerTypeContainer) {
        createTrendChart(answerTypeContainer, null, {
            dates: stats.dates,
            series: stats.byAnswerType,
            colors: ANSWER_TYPE_COLORS,
            showLegend: true,
            legendContainer: answerTypeLegend
        });
    }
}

export function onTrendPeriodChange(event) {
    const btn = event.target;
    if (!btn.classList.contains('time-period-btn')) return;

    // Update active state
    document.querySelectorAll('.time-period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Update selected period and re-render
    state.selectedTrendPeriod = btn.dataset.period;
    renderTrendCharts();
}

// Handle dashboard question set change
export function onDashboardQuestionSetChange(e) {
    state.dashboardQuestionSet = e.target.value;
    refreshDashboard();
}

// ============================================
// END PERFORMANCE TRENDS
// ============================================

export function refreshDashboard() {
    const dashboardContainer = document.getElementById('dashboardContainer');
    const filteredHistory = getFilteredHistoryForDashboard();

    if (filteredHistory.length === 0) {
        showEmptyDashboard();
        return;
    }

    // Make sure dashboard structure exists (in case it was replaced by empty state)
    let overallChart = document.getElementById('overallChart');
    if (!overallChart) {
        // Dashboard was destroyed, restore it
        restoreDashboardStructure();
        overallChart = document.getElementById('overallChart');
    }

    const stats = calculateStats();

    // Update overall stats
    const accuracyPercentage = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    createRadialChart(overallChart, accuracyPercentage);

    document.getElementById('correctCount').textContent = stats.correct;
    document.getElementById('incorrectCount').textContent = stats.incorrect;
    document.getElementById('skippedCount').textContent = stats.skipped;

    // Update category stats
    const categoryStats = calculateCategoryStats();
    updateCategoryStatsDisplay(categoryStats.answerTypeStats);

    // Update difficulty charts
    const difficultyCharts = document.getElementById('difficultyCharts');
    const difficultyNames = { P: 'Preliminary', Q: 'Quarterfinals', S: 'Semifinals', F: 'Finals' };

    difficultyCharts.innerHTML = '';
    Object.keys(difficultyNames).forEach(key => {
        const data = stats.byDifficulty[key];
        const percentage = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;

        const chartItem = document.createElement('div');
        chartItem.className = 'difficulty-chart-item';

        const chartDiv = document.createElement('div');
        chartDiv.className = 'radial-chart small';
        createRadialChart(chartDiv, percentage, 'small');

        const name = document.createElement('div');
        name.className = 'difficulty-name';
        name.textContent = difficultyNames[key];

        const count = document.createElement('div');
        count.className = 'difficulty-count';
        count.textContent = `${data.total} attempted`;

        chartItem.appendChild(chartDiv);
        chartItem.appendChild(name);
        chartItem.appendChild(count);
        difficultyCharts.appendChild(chartItem);
    });

    // Render performance trend charts
    renderTrendCharts();
}

export function restoreDashboardStructure() {
    const dashboardContainer = document.getElementById('dashboardContainer');
    dashboardContainer.innerHTML = `
        <div class="dashboard-header">
            <h1 class="dashboard-title">Dashboard</h1>
            <div class="dashboard-question-set-selector">
                <label for="dashboardQuestionSet">Question Set:</label>
                <select id="dashboardQuestionSet">
                    <option value="all"${state.dashboardQuestionSet === 'all' ? ' selected' : ''}>All Question Sets</option>
                    <option value="nat_hist_bee"${state.dashboardQuestionSet === 'nat_hist_bee' ? ' selected' : ''}>National History Bee</option>
                    <option value="us_hist_bee"${state.dashboardQuestionSet === 'us_hist_bee' ? ' selected' : ''}>US History Bee</option>
                </select>
            </div>
        </div>

        <!-- Overall Statistics -->
        <div class="dashboard-grid">
            <!-- Overall Accuracy Card -->
            <div class="dashboard-card">
                <div class="card-header">Overall Accuracy</div>
                <div class="card-body">
                    <div class="radial-chart" id="overallChart">
                        <!-- Chart will be generated by JS -->
                    </div>
                    <div class="stats-row">
                        <div class="stat-item">
                            <div class="stat-value correct" id="correctCount">0</div>
                            <div class="stat-label">Correct</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value incorrect" id="incorrectCount">0</div>
                            <div class="stat-label">Incorrect</div>
                        </div>
                        <div class="stat-item">
                            <div class="stat-value skipped" id="skippedCount">0</div>
                            <div class="stat-label">Skipped</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Performance by Answer Type Card -->
            <div class="dashboard-card">
                <div class="card-header">Performance by Answer Type</div>
                <div class="card-body" style="align-items: stretch;">
                    <div id="answerTypeStats" class="category-stats">
                        <!-- Answer type stats will be generated by JS -->
                    </div>
                </div>
            </div>

            <!-- Performance by Difficulty -->
            <div class="dashboard-card">
                <div class="card-header">Performance by Difficulty</div>
                <div class="card-body">
                    <div class="difficulty-charts" id="difficultyCharts">
                        <!-- Difficulty charts will be generated by JS -->
                    </div>
                </div>
            </div>
        </div>

        <!-- Performance Trends Section -->
        <div class="trends-section">
            <div class="trends-header">
                <div class="trends-title">Performance Trends</div>
                <div class="time-period-selector">
                    <button class="time-period-btn" data-period="today">Today</button>
                    <button class="time-period-btn" data-period="week">This Week</button>
                    <button class="time-period-btn active" data-period="month">This Month</button>
                    <button class="time-period-btn" data-period="year">This Year</button>
                    <button class="time-period-btn" data-period="all">All Time</button>
                </div>
            </div>

            <div class="trends-grid">
                <!-- Overall Accuracy Trend -->
                <div class="trend-card">
                    <div class="trend-card-header">Overall Accuracy Over Time</div>
                    <div class="trend-chart-container" id="overallTrendChart">
                        <!-- Chart will be generated by JS -->
                    </div>
                </div>

                <!-- Accuracy by Answer Type Trend -->
                <div class="trend-card">
                    <div class="trend-card-header">Accuracy by Answer Type</div>
                    <div class="trend-chart-container" id="answerTypeTrendChart">
                        <!-- Chart will be generated by JS -->
                    </div>
                    <div class="trend-legend" id="answerTypeTrendLegend"></div>
                </div>

                <!-- Accuracy by Difficulty Trend -->
                <div class="trend-card">
                    <div class="trend-card-header">Accuracy by Difficulty</div>
                    <div class="trend-chart-container" id="difficultyTrendChart">
                        <!-- Chart will be generated by JS -->
                    </div>
                    <div class="trend-legend" id="difficultyTrendLegend"></div>
                </div>
            </div>
        </div>
    `;

    // Re-attach event listener for time period selector
    const selector = document.querySelector('.time-period-selector');
    if (selector) {
        selector.addEventListener('click', onTrendPeriodChange);
    }

    // Re-attach event listener for dashboard question set selector
    const dashboardQSSelector = document.getElementById('dashboardQuestionSet');
    if (dashboardQSSelector) {
        dashboardQSSelector.addEventListener('change', onDashboardQuestionSetChange);
    }
}

export function showEmptyDashboard() {
    const dashboardContainer = document.getElementById('dashboardContainer');
    const questionSetNames = {
        'all': 'any question set',
        'nat_hist_bee': 'National History Bee',
        'us_hist_bee': 'US History Bee'
    };
    const filterName = questionSetNames[state.dashboardQuestionSet] || state.dashboardQuestionSet;
    const isFiltered = state.dashboardQuestionSet !== 'all';

    dashboardContainer.innerHTML = `
        <div class="dashboard-header">
            <h1 class="dashboard-title">Dashboard</h1>
            <div class="dashboard-question-set-selector">
                <label for="dashboardQuestionSet">Question Set:</label>
                <select id="dashboardQuestionSet">
                    <option value="all"${state.dashboardQuestionSet === 'all' ? ' selected' : ''}>All Question Sets</option>
                    <option value="nat_hist_bee"${state.dashboardQuestionSet === 'nat_hist_bee' ? ' selected' : ''}>National History Bee</option>
                    <option value="us_hist_bee"${state.dashboardQuestionSet === 'us_hist_bee' ? ' selected' : ''}>US History Bee</option>
                </select>
            </div>
        </div>
        <div class="empty-state">
            <div class="empty-state-icon">📊</div>
            <h2 class="empty-state-title">No Statistics Yet</h2>
            <p class="empty-state-message">
                ${isFiltered
                    ? `No practice history found for ${filterName}. Try selecting a different question set or start practicing!`
                    : 'Start practicing questions to see your performance statistics here.'}
            </p>
            <button class="btn-primary" onclick="navigateTo('practice')" style="margin-top: 20px; padding: 12px 24px;">
                Start Practicing
            </button>
        </div>
    `;

    // Re-attach event listener for the selector
    const dashboardQSSelector = document.getElementById('dashboardQuestionSet');
    if (dashboardQSSelector) {
        dashboardQSSelector.addEventListener('change', onDashboardQuestionSetChange);
    }
}

// Initialize dashboard event listeners
export function initDashboardEventListeners() {
    const selector = document.querySelector('.time-period-selector');
    if (selector) {
        selector.addEventListener('click', onTrendPeriodChange);
    }

    const dashboardQSSelector = document.getElementById('dashboardQuestionSet');
    if (dashboardQSSelector) {
        dashboardQSSelector.addEventListener('change', onDashboardQuestionSetChange);
    }
}
