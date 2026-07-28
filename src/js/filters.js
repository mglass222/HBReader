// Filter management module
import { state } from './state.js';

export const QUESTION_SETS = ['nat_hist_bee', 'us_hist_bee'];
const DEFAULT_QUESTION_SET = 'nat_hist_bee';

// Question IDs collide across question sets (both use P/Q/S/F prefixes),
// so metadata is cached per set and lookups must be set-qualified.
const metadataCache = {};
const metadataPromises = {};

export function fetchMetadata(questionSet) {
    if (!metadataPromises[questionSet]) {
        metadataPromises[questionSet] = (async () => {
            const response = await fetch(`src/assets/${questionSet}_question_metadata.json`);
            if (!response.ok) {
                throw new Error(`Failed to load metadata for ${questionSet}: HTTP ${response.status}`);
            }
            const data = await response.json();
            metadataCache[questionSet] = data.categories || {};
            return metadataCache[questionSet];
        })().catch(error => {
            delete metadataPromises[questionSet];
            throw error;
        });
    }
    return metadataPromises[questionSet];
}

export async function loadMetadata(questionSet = DEFAULT_QUESTION_SET) {
    state.questionMetadata = await fetchMetadata(questionSet);
}

// Set-qualified metadata lookup for history entries
export function getQuestionMeta(entry) {
    if (!entry || !entry.id) return undefined;
    const questionSet = entry.questionSet || DEFAULT_QUESTION_SET;
    return metadataCache[questionSet]?.[entry.id];
}

// Dashboard and History render entries from every set, so both metadata
// files must be available before set-qualified lookups can succeed.
export async function ensureAllMetadataLoaded() {
    await Promise.all(QUESTION_SETS.map(set =>
        fetchMetadata(set).catch(error => console.error('Error preloading metadata:', error))
    ));
}

export function onRegionFilterChange() {
    state.activeFilters.region = document.getElementById('regionFilter').value;
    updateSelectedTypesDisplay();
    updateFilterDisplay();
}

export function onTimePeriodFilterChange() {
    state.activeFilters.timePeriod = document.getElementById('timeFilter').value;
    updateSelectedTypesDisplay();
    updateFilterDisplay();
}

export function onAnswerTypeFilterChange() {
    const select = document.getElementById('answerTypeFilter');
    const value = select.value;

    if (value === 'all') {
        state.activeFilters.answerTypes = [];
    } else {
        if (!state.activeFilters.answerTypes.includes(value)) {
            state.activeFilters.answerTypes.push(value);
        }
    }
    select.value = 'all';
    updateSelectedTypesDisplay();
    updateFilterDisplay();
}

export function updateSelectedTypesDisplay() {
    const regionIndicator = document.getElementById('regionIndicator');
    const regionTagsContainer = document.getElementById('regionTags');
    const timePeriodIndicator = document.getElementById('timePeriodIndicator');
    const timePeriodTagsContainer = document.getElementById('timePeriodTags');
    const typesIndicator = document.getElementById('questionTypesIndicator');
    const typesTagsContainer = document.getElementById('questionTypesTags');

    // Region display
    regionTagsContainer.replaceChildren();
    if (state.activeFilters.region !== 'all') {
        regionTagsContainer.appendChild(createFilterTag(state.activeFilters.region, clearRegionFilter));
    }

    if (regionTagsContainer.children.length === 0) {
        regionIndicator.style.display = 'none';
    } else {
        regionIndicator.style.display = 'flex';
    }

    // Time period display
    timePeriodTagsContainer.replaceChildren();
    if (state.activeFilters.timePeriod !== 'all') {
        timePeriodTagsContainer.appendChild(createFilterTag(state.activeFilters.timePeriod, clearTimePeriodFilter));
    }

    if (timePeriodTagsContainer.children.length === 0) {
        timePeriodIndicator.style.display = 'none';
    } else {
        timePeriodIndicator.style.display = 'flex';
    }

    // Question types display
    typesTagsContainer.replaceChildren();
    state.activeFilters.answerTypes.forEach(type => {
        typesTagsContainer.appendChild(createFilterTag(type, () => removeQuestionType(type)));
    });

    if (typesTagsContainer.children.length === 0) {
        typesIndicator.style.display = 'none';
    } else {
        typesIndicator.style.display = 'flex';
    }
}

function createFilterTag(label, onRemove) {
    const tag = document.createElement('span');
    tag.className = 'question-type-filter-tag';
    tag.append(document.createTextNode(label));

    const remove = document.createElement('span');
    remove.className = 'remove-type';
    remove.textContent = '×';
    remove.addEventListener('click', onRemove);
    tag.appendChild(remove);

    return tag;
}

export function clearRegionFilter() {
    state.activeFilters.region = 'all';
    document.getElementById('regionFilter').value = 'all';
    updateSelectedTypesDisplay();
    updateFilterDisplay();
}

export function clearTimePeriodFilter() {
    state.activeFilters.timePeriod = 'all';
    document.getElementById('timeFilter').value = 'all';
    updateSelectedTypesDisplay();
    updateFilterDisplay();
}

export function removeQuestionType(type) {
    state.activeFilters.answerTypes = state.activeFilters.answerTypes.filter(t => t !== type);
    updateSelectedTypesDisplay();
    updateFilterDisplay();
}

export function getFilteredQuestions(category) {
    if (!state.questions[category]) return [];

    return state.questions[category].filter(q => {
        const meta = state.questionMetadata[q.id];
        if (!meta) return true;

        if (state.activeFilters.region !== 'all') {
            if (!meta.regions.includes(state.activeFilters.region)) return false;
        }

        if (state.activeFilters.timePeriod !== 'all') {
            if (!meta.time_periods.includes(state.activeFilters.timePeriod)) return false;
        }

        if (state.activeFilters.answerTypes.length > 0) {
            if (!state.activeFilters.answerTypes.includes(meta.answer_type)) return false;
        }

        return true;
    });
}

export function updateFilterDisplay() {
    const matchingCount = document.getElementById('matchingCount');

    const hasFilters = state.activeFilters.answerTypes.length > 0 ||
                      state.activeFilters.region !== 'all' ||
                      state.activeFilters.timePeriod !== 'all';

    const category = document.getElementById('category').value;
    const filtered = getFilteredQuestions(category);
    const total = state.questions[category] ? state.questions[category].length : 0;

    if (hasFilters) {
        matchingCount.style.display = 'block';
        matchingCount.className = 'matching-count';

        if (filtered.length === 0) {
            matchingCount.className += ' error';
            matchingCount.textContent = 'No questions match these filters';
        } else if (filtered.length < 10) {
            matchingCount.className += ' warning';
            matchingCount.textContent = `Only ${filtered.length} questions match`;
        } else {
            matchingCount.textContent = `${filtered.length} of ${total} questions match`;
        }
    } else {
        matchingCount.style.display = 'none';
    }
}

export function removeFilter(type) {
    switch(type) {
        case 'region':
            state.activeFilters.region = 'all';
            document.getElementById('regionFilter').value = 'all';
            break;
        case 'timePeriod':
            state.activeFilters.timePeriod = 'all';
            document.getElementById('timeFilter').value = 'all';
            break;
    }
    updateFilterDisplay();
}

export function clearAllFilters() {
    state.activeFilters.region = 'all';
    state.activeFilters.timePeriod = 'all';
    state.activeFilters.answerTypes = [];

    document.getElementById('regionFilter').value = 'all';
    document.getElementById('timeFilter').value = 'all';
    const secondaryFilter = document.getElementById('secondaryFilter');
    if (secondaryFilter) secondaryFilter.value = 'all';
    document.getElementById('answerTypeFilter').value = 'all';

    updateSelectedTypesDisplay();
    updateFilterDisplay();
}

export function updateRegionFilterState() {
    const questionSet = document.getElementById('questionSet').value;
    const regionFilter = document.getElementById('regionFilter');
    const regionSection = document.getElementById('regionFilterSection');
    const isUSHistory = questionSet.startsWith('us_');

    regionFilter.disabled = isUSHistory;
    regionSection.classList.toggle('disabled', isUSHistory);

    if (isUSHistory) {
        regionFilter.value = 'all';
        state.activeFilters.region = 'all';
    }
}

export function initFilterEventListeners() {
    document.getElementById('regionFilter')?.addEventListener('change', onRegionFilterChange);
    document.getElementById('timeFilter')?.addEventListener('change', onTimePeriodFilterChange);
    document.getElementById('answerTypeFilter')?.addEventListener('change', onAnswerTypeFilterChange);
}
