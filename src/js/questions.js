// Questions module - loading and stats
import { state } from './state.js';
import { fetchMetadata, updateSelectedTypesDisplay, updateFilterDisplay, updateRegionFilterState } from './filters.js';
import { showToast } from './ui.js';

const DIFFICULTY_LABELS = {
    preliminary: 'Preliminary',
    quarterfinals: 'Quarterfinals',
    semifinals: 'Semifinals',
    finals: 'Finals'
};

const questionsCache = {};
const questionsPromises = {};

// Guards against rapid question-set switches: only the latest load wins
let loadToken = 0;

function fetchQuestions(questionSet) {
    if (!questionsPromises[questionSet]) {
        questionsPromises[questionSet] = (async () => {
            const response = await fetch(`src/assets/${questionSet}_questions.json`);
            if (!response.ok) {
                throw new Error(`Failed to load questions for ${questionSet}: HTTP ${response.status}`);
            }
            questionsCache[questionSet] = await response.json();
            return questionsCache[questionSet];
        })().catch(error => {
            delete questionsPromises[questionSet];
            throw error;
        });
    }
    return questionsPromises[questionSet];
}

function setQuestionLoadingState(isLoading) {
    const startButton = document.getElementById('startButton');
    if (startButton) {
        startButton.disabled = isLoading;
        startButton.textContent = isLoading ? 'Loading…' : 'Start';
    }
}

export async function loadQuestions(questionSet = 'nat_hist_bee') {
    const token = ++loadToken;
    setQuestionLoadingState(true);
    try {
        const [questionsData, metadata] = await Promise.all([
            fetchQuestions(questionSet),
            fetchMetadata(questionSet)
        ]);

        // A newer load started while this one was in flight - discard
        if (token !== loadToken) return;

        state.questions = questionsData;
        state.questionMetadata = metadata;
        updateDifficultyOptions();
        updateStats();
    } catch (error) {
        console.error('Error loading questions:', error);
        if (token === loadToken) {
            showToast('Failed to load questions. Check your connection and reload the page.', 'error', 8000);
        }
    } finally {
        if (token === loadToken) {
            setQuestionLoadingState(false);
        }
    }
}

export function updateStats() {
    const statsEl = document.getElementById('stats');
    if (statsEl) statsEl.textContent = `${state.questionsPracticed} questions practiced`;
}

export function getSpeedLabel(speed) {
    if (speed <= 25) return 'Very Fast';
    if (speed <= 40) return 'Fast';
    if (speed <= 60) return 'Medium';
    if (speed <= 80) return 'Slow';
    return 'Very Slow';
}

export function updateDifficultyDisplay() {
    const category = document.getElementById('category').value;
    document.getElementById('difficultyValue').textContent = DIFFICULTY_LABELS[category] || category;
}

export function updateDifficultyOptions() {
    const select = document.getElementById('category');
    if (!select) return;

    let selectedOptionAvailable = false;

    Array.from(select.options).forEach(option => {
        const count = state.questions[option.value]?.length || 0;
        option.textContent = `${DIFFICULTY_LABELS[option.value] || option.value} (${count.toLocaleString()})`;
        option.disabled = count === 0;
        if (option.value === select.value && count > 0) {
            selectedOptionAvailable = true;
        }
    });

    if (!selectedOptionAvailable) {
        const firstAvailable = Array.from(select.options).find(option => !option.disabled);
        if (firstAvailable) {
            select.value = firstAvailable.value;
        }
    }

    updateDifficultyDisplay();
    updateFilterDisplay();
}

export async function onQuestionSetChange() {
    const questionSet = document.getElementById('questionSet').value;

    state.activeFilters = {
        region: 'all',
        timePeriod: 'all',
        answerTypes: []
    };
    document.getElementById('regionFilter').value = 'all';
    document.getElementById('timeFilter').value = 'all';
    updateSelectedTypesDisplay();
    updateFilterDisplay();
    updateRegionFilterState();

    await loadQuestions(questionSet);
    updateDifficultyDisplay();
}

export function initQuestionEventListeners() {
    const speedSlider = document.getElementById('speed');
    const updateSpeedDisplay = () => {
        // The displayed value is the actual delay: 110 - slider value
        const speed = 110 - parseInt(speedSlider.value);
        document.getElementById('speedValue').textContent = speed;
        document.getElementById('speedLabel').textContent = getSpeedLabel(speed);
    };
    speedSlider.addEventListener('input', updateSpeedDisplay);
    // Sync immediately - the static HTML label is only a placeholder
    updateSpeedDisplay();

    document.getElementById('category').addEventListener('change', () => {
        updateDifficultyDisplay();
        updateStats();
    });

    document.getElementById('questionSet').addEventListener('change', onQuestionSetChange);
}
