// Game module - core game logic, streaming, answer checking
import { state } from './state.js';
import { getFilteredQuestions, updateFilterDisplay } from './filters.js';
import { updateStats, updateDifficultyDisplay } from './questions.js';
import { updateBuzzerVisibility } from './settings.js';

// Forward declarations
export const deps = {
    addToHistory: null,
    updatePointsAndLeaderboard: null
};

export function removeCursor(element) {
    const html = element.innerHTML;
    element.innerHTML = html.replace(/<span class="cursor"><\/span>/g, '');
}

export function getRandomQuestion() {
    const category = document.getElementById('category').value;
    const categoryQuestions = getFilteredQuestions(category);

    if (!categoryQuestions || categoryQuestions.length === 0) {
        return null;
    }

    const randomIndex = Math.floor(Math.random() * categoryQuestions.length);
    return categoryQuestions[randomIndex];
}

export function streamText(text, targetElement, callback) {
    if (state.streamingInterval) {
        clearInterval(state.streamingInterval);
        state.streamingInterval = null;
    }

    removeCursor(targetElement);

    let displayText = '';
    state.currentCharIndex = 0;
    let lastCharTime = Date.now();

    function addNextChar() {
        if (state.isPaused) return;

        const currentSpeed = 110 - parseInt(document.getElementById('speed').value);
        const now = Date.now();

        if (now - lastCharTime < currentSpeed) {
            return;
        }

        lastCharTime = now;

        if (state.currentCharIndex >= text.length) {
            clearInterval(state.streamingInterval);
            targetElement.innerHTML = displayText;
            updateBuzzerVisibility();
            if (callback) callback();
            return;
        }

        const char = text[state.currentCharIndex];

        if (char === '<') {
            let tagEnd = text.indexOf('>', state.currentCharIndex);
            if (tagEnd !== -1) {
                displayText += text.substring(state.currentCharIndex, tagEnd + 1);
                state.currentCharIndex = tagEnd + 1;
            } else {
                displayText += char;
                state.currentCharIndex++;
            }
        } else {
            displayText += char;
            state.currentCharIndex++;
        }

        targetElement.innerHTML = displayText + '<span class="cursor"></span>';
    }

    state.streamingInterval = setInterval(addNextChar, 10);
}

export function displayQuestion() {
    clearInterval(state.streamingInterval);
    state.streamingInterval = null;

    const existingInputSection = document.getElementById('answerInputSection');
    if (existingInputSection) {
        existingInputSection.remove();
    }

    state.currentQuestion = getRandomQuestion();

    if (!state.currentQuestion) {
        alert('No questions available in this category!');
        return;
    }

    updateDifficultyDisplay();

    state.questionsPracticed++;
    updateStats();

    const questionText = document.getElementById('questionText');
    removeCursor(questionText);
    questionText.innerHTML = '';

    document.getElementById('answerText').innerHTML = '';

    const pauseBtn = document.getElementById('pauseButton');
    pauseBtn.classList.remove('hidden');
    pauseBtn.textContent = 'Pause';

    state.currentSection = 'question';
    state.isPaused = false;
    state.answerInputShown = false;
    state.currentCharIndex = 0;

    updateBuzzerVisibility();

    streamText(
        state.currentQuestion.question,
        questionText,
        () => {
            if (!state.answerInputShown) {
                showAnswerInput();
            }
        }
    );
}

export function showAnswerInput() {
    if (state.answerInputShown) return;

    state.answerInputShown = true;
    state.isPaused = true;
    clearInterval(state.streamingInterval);

    const questionText = document.getElementById('questionText');
    removeCursor(questionText);

    if (state.currentQuestion && state.currentCharIndex < state.currentQuestion.question.length) {
        questionText.innerHTML += '<span class="buzz-marker">(#)</span>';
    }

    updateBuzzerVisibility();

    const questionDisplay = document.querySelector('.question-display');
    const inputSection = document.createElement('div');
    inputSection.className = 'answer-input-section';
    inputSection.id = 'answerInputSection';
    inputSection.innerHTML = `
        <input type="text" id="userAnswer" placeholder="Enter your answer..." autofocus>
        <div class="answer-input-buttons">
            <button class="btn-primary" onclick="checkAnswer()">Submit</button>
        </div>
    `;

    questionDisplay.insertBefore(inputSection, questionText);
    document.getElementById('userAnswer').focus();

    document.getElementById('userAnswer').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            checkAnswer();
        }
    });
}

function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function calculateSimilarity(a, b) {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;
    const distance = levenshteinDistance(a, b);
    return 1 - (distance / Math.max(a.length, b.length));
}

function extractAcceptableAnswers(answerField) {
    const answers = [];
    let text = answerField;

    const strongMatches = text.match(/<strong>([^<]+)<\/strong>/gi) || [];
    strongMatches.forEach(match => {
        const content = match.replace(/<\/?strong>/gi, '').trim();
        if (content && content.length > 1) {
            answers.push(content);
        }
    });

    const acceptMatches = text.match(/accept\s+([^;)]+)/gi) || [];
    acceptMatches.forEach(match => {
        let content = match.replace(/^accept\s+/i, '').trim();
        content = content.replace(/<[^>]*>/g, '').trim();
        if (content && content.length > 1) {
            answers.push(content);
        }
    });

    const primaryPart = text.split(/\(/)[0];
    const primaryClean = primaryPart.replace(/<[^>]*>/g, '').trim();
    if (primaryClean && primaryClean.length > 1) {
        answers.push(primaryClean);
    }

    return [...new Set(answers)];
}

function normalizeAnswer(answer) {
    let normalized = answer.replace(/<[^>]*>/g, '');
    normalized = normalized.toLowerCase()
        .replace(/\b(the|a|an|of|or|and|in|on|at|to)\b/g, '')
        .replace(/[^\w\s]/g, '')
        .trim()
        .replace(/\s+/g, ' ');
    return normalized;
}

export function checkAnswer() {
    const userAnswer = document.getElementById('userAnswer').value.trim();
    if (!userAnswer) {
        alert('Please enter an answer!');
        return;
    }

    const correctAnswer = state.currentQuestion.answer;
    const tolerance = parseInt(localStorage.getItem('answerTolerance') || '80') / 100;

    const acceptableAnswers = extractAcceptableAnswers(correctAnswer);
    const normalizedUser = normalizeAnswer(userAnswer);

    let isCorrect = false;
    for (const acceptable of acceptableAnswers) {
        const normalizedAcceptable = normalizeAnswer(acceptable);

        if (normalizedUser === normalizedAcceptable) {
            isCorrect = true;
            break;
        }

        if (normalizedAcceptable.includes(normalizedUser) ||
            normalizedUser.includes(normalizedAcceptable)) {
            isCorrect = true;
            break;
        }

        const similarity = calculateSimilarity(normalizedUser, normalizedAcceptable);
        if (similarity >= tolerance) {
            isCorrect = true;
            break;
        }
    }

    if (!isCorrect) {
        const normalizedCorrect = normalizeAnswer(correctAnswer);
        if (normalizedCorrect.includes(normalizedUser) ||
            normalizedUser.includes(normalizedCorrect) ||
            normalizedUser === normalizedCorrect) {
            isCorrect = true;
        }
        const similarity = calculateSimilarity(normalizedUser, normalizedCorrect);
        if (similarity >= tolerance) {
            isCorrect = true;
        }
    }

    if (deps.addToHistory) {
        deps.addToHistory(state.currentQuestion, isCorrect ? 'correct' : 'incorrect');
    }

    const inputSection = document.getElementById('answerInputSection');
    if (inputSection) {
        inputSection.remove();
    }

    clearInterval(state.streamingInterval);
    const questionText = document.getElementById('questionText');
    removeCursor(questionText);
    questionText.innerHTML = state.currentQuestion.question;

    document.getElementById('pauseButton').classList.add('hidden');

    const answerText = document.getElementById('answerText');
    const indicator = isCorrect
        ? '<span class="correct" style="font-size: 1.3em;">✓</span>'
        : '<span class="incorrect" style="font-size: 1.3em;">✗</span>';

    const meta = state.questionMetadata[state.currentQuestion.id];
    const questionType = meta ? meta.answer_type : null;
    const questionTypeTag = questionType
        ? `<div><span class="question-type-tag">${questionType}</span></div>`
        : '';

    answerText.innerHTML = `
        <div style="margin-bottom: 15px;">
            <strong>Your Answer:</strong> ${userAnswer} ${indicator}
        </div>
        <div>
            <strong>Correct Answer:</strong> ${correctAnswer}
        </div>
        ${questionTypeTag}
    `;

    state.currentSection = 'answer';
    state.answerInputShown = false;
    updateBuzzerVisibility();
}

export function resumeQuestion() {
    const inputSection = document.getElementById('answerInputSection');
    if (inputSection) {
        inputSection.remove();
    }
    state.answerInputShown = false;
    state.isPaused = false;

    updateBuzzerVisibility();

    if (state.streamingInterval) {
        clearInterval(state.streamingInterval);
        state.streamingInterval = null;
    }

    const targetElement = document.getElementById('questionText');
    const text = state.currentQuestion.question;

    removeCursor(targetElement);
    let displayText = targetElement.innerHTML;
    let lastCharTime = Date.now();

    function addNextChar() {
        if (state.isPaused) return;

        const currentSpeed = 110 - parseInt(document.getElementById('speed').value);
        const now = Date.now();

        if (now - lastCharTime < currentSpeed) {
            return;
        }

        lastCharTime = now;

        if (state.currentCharIndex >= text.length) {
            clearInterval(state.streamingInterval);
            targetElement.innerHTML = displayText;
            document.getElementById('pauseButton').classList.add('hidden');
            updateBuzzerVisibility();
            return;
        }

        const char = text[state.currentCharIndex];

        if (char === '<') {
            let tagEnd = text.indexOf('>', state.currentCharIndex);
            if (tagEnd !== -1) {
                displayText += text.substring(state.currentCharIndex, tagEnd + 1);
                state.currentCharIndex = tagEnd + 1;
            } else {
                displayText += char;
                state.currentCharIndex++;
            }
        } else {
            displayText += char;
            state.currentCharIndex++;
        }

        targetElement.innerHTML = displayText + '<span class="cursor"></span>';
    }

    state.streamingInterval = setInterval(addNextChar, 10);
}

export function revealAnswer() {
    const inputSection = document.getElementById('answerInputSection');
    if (inputSection) {
        inputSection.remove();
    }

    clearInterval(state.streamingInterval);

    const questionText = document.getElementById('questionText');
    removeCursor(questionText);
    questionText.innerHTML = state.currentQuestion.question;

    showAnswer();
}

export function showAnswer() {
    if (deps.addToHistory) {
        deps.addToHistory(state.currentQuestion, 'skipped');
    }

    document.getElementById('pauseButton').classList.add('hidden');
    state.currentSection = 'answer';
    state.isPaused = false;

    const meta = state.questionMetadata[state.currentQuestion.id];
    const questionType = meta ? meta.answer_type : null;
    const questionTypeTag = questionType
        ? `<div><span class="question-type-tag">${questionType}</span></div>`
        : '';

    document.getElementById('answerText').innerHTML = state.currentQuestion.answer + questionTypeTag;
    updateBuzzerVisibility();
}

export function closeModal() {
    document.getElementById('feedbackModal').style.display = 'none';
    document.getElementById('userAnswer')?.focus();
}

export function nextQuestionFromModal() {
    closeModal();
    displayQuestion();
}

export function handleStart() {
    document.getElementById('startButton').classList.add('hidden');
    document.getElementById('nextButton').classList.remove('hidden');
    document.getElementById('pauseButton').classList.remove('hidden');
    displayQuestion();
}

export function handleNext() {
    displayQuestion();
}

export function handlePauseResume() {
    if (!state.currentQuestion) return;

    state.isPaused = !state.isPaused;
    const button = document.getElementById('pauseButton');

    if (state.isPaused) {
        button.textContent = 'Resume';
        clearInterval(state.streamingInterval);
    } else {
        button.textContent = 'Pause';
        resumeQuestion();
    }
}

export function initGameEventListeners() {
    // Spacebar to buzz in
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && state.currentQuestion && !state.answerInputShown &&
            e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            showAnswerInput();
        }
    });

    // S = start/next
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        const key = e.key.toLowerCase();

        if (key === 's') {
            e.preventDefault();
            if (!state.currentQuestion) {
                handleStart();
            } else {
                handleNext();
            }
        }
    });

    // P = pause/resume, N = next, E = settings
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        const key = e.key.toLowerCase();

        if (key === 'e') {
            e.preventDefault();
            import('./settings.js').then(settings => settings.toggleSettings());
            return;
        }

        if (!state.currentQuestion || state.answerInputShown) {
            return;
        }

        if (key === 'p') {
            e.preventDefault();
            handlePauseResume();
        } else if (key === 'n') {
            e.preventDefault();
            handleNext();
        }
    });

    // Close modal when clicking outside
    window.onclick = function(event) {
        const modal = document.getElementById('feedbackModal');
        if (event.target === modal) {
            closeModal();
        }
    };
}
