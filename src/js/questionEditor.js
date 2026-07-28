// Question Database Editor logic (extracted from question_editor.html)

// Data
let questions = {};
let metadata = {};
let flatQuestions = [];
let filteredQuestions = [];
let selectedQuestion = null;
let originalData = null;
let hasChanges = false;

// Constants
const REGIONS = [
    'United States',
    'Europe',
    'Asia',
    'Latin America & Caribbean',
    'Americas (Pre-Columbian)',
    'Africa',
    'Middle East & North Africa',
    'Global/Multi-Regional'
];

const TIME_PERIODS = [
    'Ancient World (pre-500 CE)',
    'Medieval Era (500-1450)',
    'Early Modern (1450-1750)',
    'Age of Revolutions (1750-1850)',
    'Industrial & Imperial Age (1850-1914)',
    'World Wars & Interwar (1914-1945)',
    'Contemporary Era (1945-present)'
];

const THEMES = [
    'Political & Governmental',
    'Military & Conflict',
    'Social Movements & Culture',
    'Economic & Trade',
    'Religion & Philosophy',
    'Science & Technology',
    'Arts & Literature'
];

const ANSWER_TYPES = [
    'People & Biography',
    'Events (Wars, Battles, Revolutions)',
    'Political History & Diplomacy',
    'Economic History & Trade',
    'Social History & Daily Life',
    'Cultural History (Art, Literature, Music)',
    'Religion & Mythology',
    'Science, Technology & Innovation',
    'Geography & Environment',
    'Places, Cities & Civilizations',
    'Groups, Organizations & Institutions',
    'Documents, Laws & Treaties',
    'Ideas, Ideologies & Philosophies'
];

// Elements
const searchInput = document.getElementById('searchInput');
const categoryFilter = document.getElementById('categoryFilter');
const regionFilter = document.getElementById('regionFilter');
const periodFilter = document.getElementById('periodFilter');
const typeFilter = document.getElementById('typeFilter');
const questionList = document.getElementById('questionList');
const stats = document.getElementById('stats');
const editorTitle = document.getElementById('editorTitle');
const modifiedIndicator = document.getElementById('modifiedIndicator');
const saveBtn = document.getElementById('saveBtn');
const revertBtn = document.getElementById('revertBtn');
const noSelection = document.getElementById('noSelection');
const editForm = document.getElementById('editForm');
const loadingOverlay = document.getElementById('loadingOverlay');

// Get question set from URL parameter (default: nat_hist_bee)
function getQuestionSet() {
    const params = new URLSearchParams(window.location.search);
    return params.get('set') || 'nat_hist_bee';
}

const currentQuestionSet = getQuestionSet();

// Initialize
async function init() {
    try {
        // Load data based on question set parameter
        const [questionsRes, metadataRes] = await Promise.all([
            fetch(`src/assets/${currentQuestionSet}_questions.json`),
            fetch(`src/assets/${currentQuestionSet}_question_metadata.json`)
        ]);

        questions = await questionsRes.json();
        const metadataData = await metadataRes.json();
        metadata = metadataData.categories || {};

        // Flatten questions for easy access
        flattenQuestions();

        // Populate filters
        populateFilters();

        // Build checkbox groups
        buildCheckboxGroups();

        // Initial render
        filterQuestions();

        // Event listeners
        searchInput.addEventListener('input', debounce(filterQuestions, 300));
        categoryFilter.addEventListener('change', filterQuestions);
        regionFilter.addEventListener('change', filterQuestions);
        periodFilter.addEventListener('change', filterQuestions);
        typeFilter.addEventListener('change', filterQuestions);

        saveBtn.addEventListener('click', saveChanges);
        revertBtn.addEventListener('click', revertChanges);

        // Form change listeners
        document.getElementById('questionText').addEventListener('input', onFormChange);
        document.getElementById('answerText').addEventListener('input', onFormChange);
        document.getElementById('questionCategory').addEventListener('change', onFormChange);
        document.getElementById('answerType').addEventListener('change', onFormChange);

        // Preview updates
        document.getElementById('questionText').addEventListener('input', updatePreviews);
        document.getElementById('answerText').addEventListener('input', updatePreviews);

        // Warn before leaving the page with unsaved changes
        window.addEventListener('beforeunload', (event) => {
            if (hasChanges) {
                event.preventDefault();
                event.returnValue = '';
            }
        });

        loadingOverlay.classList.add('hidden');
    } catch (error) {
        console.error('Failed to load data:', error);
        loadingOverlay.querySelector('.loading-text').textContent = 'Error loading data: ' + error.message;
    }
}

function flattenQuestions() {
    flatQuestions = [];
    const categories = ['preliminary', 'quarterfinals', 'semifinals', 'finals'];

    for (const category of categories) {
        if (questions[category]) {
            for (const q of questions[category]) {
                flatQuestions.push({
                    ...q,
                    category,
                    metadata: metadata[q.id] || {}
                });
            }
        }
    }
}

function populateFilters() {
    // Regions
    REGIONS.forEach(r => {
        const opt = document.createElement('option');
        opt.value = r;
        opt.textContent = r;
        regionFilter.appendChild(opt);
    });

    // Time periods
    TIME_PERIODS.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = p;
        periodFilter.appendChild(opt);
    });

    // Answer types
    ANSWER_TYPES.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        typeFilter.appendChild(opt);
    });
}

function buildCheckboxGroups() {
    const regionsGroup = document.getElementById('regionsGroup');
    const periodsGroup = document.getElementById('periodsGroup');
    const themesGroup = document.getElementById('themesGroup');

    REGIONS.forEach(r => {
        regionsGroup.appendChild(createCheckbox('region', r));
    });

    TIME_PERIODS.forEach(p => {
        periodsGroup.appendChild(createCheckbox('period', p));
    });

    THEMES.forEach(t => {
        themesGroup.appendChild(createCheckbox('theme', t));
    });
}

function createCheckbox(type, value) {
    const label = document.createElement('label');
    label.className = 'checkbox-item';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.type = type;
    input.value = value;

    const span = document.createElement('span');
    span.textContent = value;

    label.appendChild(input);
    label.appendChild(span);

    input.addEventListener('change', function() {
        label.classList.toggle('checked', this.checked);
        onFormChange();
    });
    return label;
}

function filterQuestions() {
    const search = searchInput.value.toLowerCase();
    const category = categoryFilter.value;
    const region = regionFilter.value;
    const period = periodFilter.value;
    const type = typeFilter.value;

    filteredQuestions = flatQuestions.filter(q => {
        // Category filter
        if (category && q.category !== category) return false;

        // Metadata filters
        const meta = q.metadata || {};
        if (region && (!meta.regions || !meta.regions.includes(region))) return false;
        if (period && (!meta.time_periods || !meta.time_periods.includes(period))) return false;
        if (type && meta.answer_type !== type) return false;

        // Search filter
        if (search) {
            const qText = stripHtml(q.question || '').toLowerCase();
            const aText = stripHtml(q.answer || '').toLowerCase();
            const idText = (q.id || '').toLowerCase();
            if (!qText.includes(search) && !aText.includes(search) && !idText.includes(search)) {
                return false;
            }
        }

        return true;
    });

    renderQuestionList();
    updateStats();
}

function renderQuestionList() {
    questionList.innerHTML = '';

    for (const q of filteredQuestions) {
        const item = document.createElement('div');
        item.className = 'question-item';
        if (selectedQuestion && selectedQuestion.id === q.id) {
            item.classList.add('selected');
        }

        const preview = stripHtml(q.question || '').substring(0, 80);
        const answerPreview = stripHtml(q.answer || '').substring(0, 50);

        item.innerHTML = `
            <div class="id">${escapeHtml(q.id)} (${escapeHtml(q.category)})</div>
            <div class="preview">${escapeHtml(preview)}...</div>
            <div class="answer-preview">Answer: ${escapeHtml(answerPreview)}...</div>
        `;

        item.addEventListener('click', () => selectQuestion(q));
        questionList.appendChild(item);
    }
}

function selectQuestion(q) {
    if (hasChanges) {
        if (!confirm('You have unsaved changes. Discard them?')) {
            return;
        }
    }

    selectedQuestion = q;
    originalData = JSON.parse(JSON.stringify(q));
    hasChanges = false;

    // Update UI
    noSelection.classList.add('hidden');
    editForm.classList.remove('hidden');
    modifiedIndicator.classList.add('hidden');
    saveBtn.disabled = true;
    revertBtn.disabled = true;

    editorTitle.textContent = `Editing: ${q.id}`;

    // Populate form
    document.getElementById('questionId').value = q.id;
    document.getElementById('questionCategory').value = q.category;
    document.getElementById('questionText').value = q.question || '';
    document.getElementById('answerText').value = q.answer || '';

    // Metadata
    const meta = q.metadata || {};
    document.getElementById('answerType').value = meta.answer_type || '';

    // Checkboxes
    document.querySelectorAll('.checkbox-item').forEach(item => {
        const input = item.querySelector('input');
        const type = input.dataset.type;
        const value = input.value;
        let checked = false;

        if (type === 'region') {
            checked = meta.regions && meta.regions.includes(value);
        } else if (type === 'period') {
            checked = meta.time_periods && meta.time_periods.includes(value);
        } else if (type === 'theme') {
            checked = meta.subject_themes && meta.subject_themes.includes(value);
        }

        input.checked = checked;
        item.classList.toggle('checked', checked);
    });

    updatePreviews();
    renderQuestionList();
}

function onFormChange() {
    if (!selectedQuestion) return;

    hasChanges = true;
    modifiedIndicator.classList.remove('hidden');
    saveBtn.disabled = false;
    revertBtn.disabled = false;
}

function updatePreviews() {
    const qText = document.getElementById('questionText').value;
    const aText = document.getElementById('answerText').value;

    document.getElementById('questionPreview').innerHTML = sanitizeAllowedHtml(qText);
    document.getElementById('answerPreview').innerHTML = sanitizeAllowedHtml(aText);
}

function getFormData() {
    const regions = [];
    const periods = [];
    const themes = [];

    document.querySelectorAll('.checkbox-item input:checked').forEach(input => {
        if (input.dataset.type === 'region') regions.push(input.value);
        else if (input.dataset.type === 'period') periods.push(input.value);
        else if (input.dataset.type === 'theme') themes.push(input.value);
    });

    return {
        id: document.getElementById('questionId').value,
        category: document.getElementById('questionCategory').value,
        question: document.getElementById('questionText').value,
        answer: document.getElementById('answerText').value,
        metadata: {
            regions,
            time_periods: periods,
            answer_type: document.getElementById('answerType').value,
            subject_themes: themes
        }
    };
}

async function saveChanges() {
    if (!selectedQuestion || !hasChanges) return;

    const formData = getFormData();
    if (!formData.metadata.answer_type) {
        showToast('Answer type is required before saving.', 'error');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        const response = await fetch('/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                original_id: selectedQuestion.id,
                original_category: selectedQuestion.category,
                ...formData
            })
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        // Update local data
        const oldCategory = selectedQuestion.category;
        const newCategory = formData.category;

        // Remove from old category if changed
        if (oldCategory !== newCategory) {
            const oldIndex = questions[oldCategory].findIndex(q => q.id === selectedQuestion.id);
            if (oldIndex > -1) {
                questions[oldCategory].splice(oldIndex, 1);
            }
            // Add to new category (guard against a category with no array yet)
            if (!questions[newCategory]) questions[newCategory] = [];
            questions[newCategory].push({
                id: formData.id,
                number: questions[newCategory].length + 1,
                question: formData.question,
                answer: formData.answer
            });
        } else {
            // Update in place (including the ID, if it was changed)
            const q = questions[oldCategory].find(q => q.id === selectedQuestion.id);
            if (q) {
                q.question = formData.question;
                q.answer = formData.answer;
                q.id = formData.id;
            }
        }

        // Update metadata (drop the old key when the ID changed)
        if (formData.id !== selectedQuestion.id) {
            delete metadata[selectedQuestion.id];
        }
        metadata[formData.id] = formData.metadata;

        // Refresh
        flattenQuestions();
        filterQuestions();

        // Update selected question (may be missing if the find above failed)
        selectedQuestion = flatQuestions.find(q => q.id === formData.id) || null;
        originalData = selectedQuestion ? JSON.parse(JSON.stringify(selectedQuestion)) : null;

        hasChanges = false;
        modifiedIndicator.classList.add('hidden');
        saveBtn.disabled = true;
        revertBtn.disabled = true;

        showToast('Changes saved successfully!', 'success');
    } catch (error) {
        console.error('Save failed:', error);
        showToast('Failed to save: ' + error.message, 'error');
        saveBtn.disabled = false;
    }

    saveBtn.textContent = 'Save Changes';
}

function revertChanges() {
    if (!selectedQuestion || !originalData) return;

    selectQuestion(originalData);
    hasChanges = false;
    modifiedIndicator.classList.add('hidden');
    saveBtn.disabled = true;
    revertBtn.disabled = true;
}

function updateStats() {
    stats.textContent = `Showing ${filteredQuestions.length} of ${flatQuestions.length} questions`;
}

function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = sanitizeAllowedHtml(html);
    return tmp.textContent || tmp.innerText || '';
}

function sanitizeAllowedHtml(html) {
    const template = document.createElement('template');
    template.innerHTML = html || '';
    const allowedTags = new Set(['STRONG', 'EM', 'U', 'BR']);

    function sanitizeNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return document.createTextNode(node.textContent || '');
        }
        if (node.nodeType !== Node.ELEMENT_NODE) {
            return null;
        }

        if (!allowedTags.has(node.tagName)) {
            const fragment = document.createDocumentFragment();
            node.childNodes.forEach(child => {
                const sanitized = sanitizeNode(child);
                if (sanitized) fragment.appendChild(sanitized);
            });
            return fragment;
        }

        const safeElement = document.createElement(node.tagName.toLowerCase());
        if (node.tagName !== 'BR') {
            node.childNodes.forEach(child => {
                const sanitized = sanitizeNode(child);
                if (sanitized) safeElement.appendChild(sanitized);
            });
        }
        return safeElement;
    }

    const output = document.createElement('div');
    template.content.childNodes.forEach(node => {
        const sanitized = sanitizeNode(node);
        if (sanitized) output.appendChild(sanitized);
    });
    return output.innerHTML;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => {
        switch (char) {
            case '&':
                return '&amp;';
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '"':
                return '&quot;';
            case "'":
                return '&#39;';
            default:
                return char;
        }
    });
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

function showToast(message, type) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// Initialize app (module scripts are deferred, so the DOM is ready here)
init();
