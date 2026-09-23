// Game module - core game logic, streaming, answer checking
import { state } from './state.js';
import { getFilteredQuestions, updateFilterDisplay } from './filters.js';
import { updateStats, updateDifficultyDisplay } from './questions.js';
import { updateBuzzerVisibility } from './settings.js';
import { appendSanitizedHtml } from './rendering.js';
import { isAnswerCorrect } from './answerChecker.js';
import { getAnswerTolerance } from './storage.js';

// Forward declarations
export const deps = {
    addToHistory: null,
    updatePointsAndLeaderboard: null
};

// Track buzz position for displaying marker after answer reveal
let buzzCharIndex = null;

function getQuestionWithBuzzMarker() {
    if (!state.currentQuestion) {
        return '';
    }
    if (buzzCharIndex === null) {
        return state.currentQuestion.question;
    }
    const question = state.currentQuestion.question;
    return question.slice(0, buzzCharIndex) + '<span class="buzz-marker">(#)</span>' + question.slice(buzzCharIndex);
}

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

export function streamText(text, targetElement, callback, resume = false) {
    if (state.streamingInterval) {
        clearInterval(state.streamingInterval);
        state.streamingInterval = null;
    }

    removeCursor(targetElement);

    // When resuming, keep what is already on screen and continue from
    // state.currentCharIndex instead of starting over.
    let displayText = resume ? targetElement.innerHTML : '';
    if (!resume) {
        state.currentCharIndex = 0;
    }
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
    buzzCharIndex = null;

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
    // Only allow buzzing while a question is being read - prevents re-opening
    // the answer input after the answer is revealed (XP re-award exploit).
    if (state.answerInputShown || state.currentSection !== 'question' || !state.currentQuestion) return;

    state.answerInputShown = true;
    state.isPaused = true;
    clearInterval(state.streamingInterval);

    const questionText = document.getElementById('questionText');
    removeCursor(questionText);

    if (state.currentQuestion && state.currentCharIndex < state.currentQuestion.question.length) {
        buzzCharIndex = state.currentCharIndex;
        questionText.innerHTML += '<span class="buzz-marker">(#)</span>';
    } else {
        buzzCharIndex = null;
    }

    // Hide Pause while the answer input is up - otherwise pausing would cancel
    // the buzz and resume the stream, letting the player hear more of the
    // question and re-buzz.
    document.getElementById('pauseButton').classList.add('hidden');

    updateBuzzerVisibility();

    const questionDisplay = document.querySelector('.question-display');
    const inputSection = document.createElement('div');
    inputSection.className = 'answer-input-section';
    inputSection.id = 'answerInputSection';
    inputSection.innerHTML = `
        <input type="text" id="userAnswer" placeholder="Enter your answer..." aria-label="Your answer" autofocus>
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

function createQuestionTypeTag(questionType) {
    if (!questionType) return null;

    const wrapper = document.createElement('div');
    const tag = document.createElement('span');
    tag.className = 'question-type-tag';
    tag.textContent = questionType;
    wrapper.appendChild(tag);
    return wrapper;
}

export function checkAnswer() {
    // Guard against double-submits and submits after the answer is revealed
    if (!state.currentQuestion || state.currentSection !== 'question' || !state.answerInputShown) return;

    const userAnswer = document.getElementById('userAnswer').value.trim();
    if (!userAnswer) {
        alert('Please enter an answer!');
        return;
    }

    const correctAnswer = state.currentQuestion.answer;
    const tolerance = getAnswerTolerance() / 100;
    const isCorrect = isAnswerCorrect(userAnswer, correctAnswer, tolerance);

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
    questionText.innerHTML = getQuestionWithBuzzMarker();

    document.getElementById('pauseButton').classList.add('hidden');

    const answerText = document.getElementById('answerText');
    const indicator = document.createElement('span');
    indicator.className = isCorrect ? 'correct' : 'incorrect';
    indicator.style.fontSize = '1.3em';
    indicator.textContent = isCorrect ? '✓' : '✗';

    const meta = state.questionMetadata[state.currentQuestion.id];
    const questionType = meta ? meta.answer_type : null;
    const yourAnswer = document.createElement('div');
    yourAnswer.style.marginBottom = '15px';
    const yourAnswerLabel = document.createElement('strong');
    yourAnswerLabel.textContent = 'Your Answer:';
    yourAnswer.append(yourAnswerLabel, ` ${userAnswer} `, indicator);

    const correctAnswerDisplay = document.createElement('div');
    const correctAnswerLabel = document.createElement('strong');
    correctAnswerLabel.textContent = 'Correct Answer:';
    correctAnswerDisplay.append(correctAnswerLabel, ' ');
    appendSanitizedHtml(correctAnswerDisplay, correctAnswer);

    answerText.replaceChildren(yourAnswer, correctAnswerDisplay);
    const questionTypeTag = createQuestionTypeTag(questionType);
    if (questionTypeTag) {
        answerText.appendChild(questionTypeTag);
    }

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

    const questionText = document.getElementById('questionText');
    removeCursor(questionText);

    // Drop any buzz marker left from a cancelled buzz before resuming
    questionText.innerHTML = questionText.innerHTML.replace(/<span class="buzz-marker">\(#\)<\/span>/g, '');
    buzzCharIndex = null;

    streamText(
        state.currentQuestion.question,
        questionText,
        () => {
            if (!state.answerInputShown) {
                showAnswerInput();
            }
        },
        true
    );
}

export function revealAnswer() {
    const inputSection = document.getElementById('answerInputSection');
    if (inputSection) {
        inputSection.remove();
    }

    clearInterval(state.streamingInterval);

    const questionText = document.getElementById('questionText');
    removeCursor(questionText);
    questionText.innerHTML = getQuestionWithBuzzMarker();

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
    const answerText = document.getElementById('answerText');
    answerText.replaceChildren();
    appendSanitizedHtml(answerText, state.currentQuestion.answer);
    const questionTypeTag = createQuestionTypeTag(questionType);
    if (questionTypeTag) {
        answerText.appendChild(questionTypeTag);
    }
    updateBuzzerVisibility();
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
    // No pause while the answer input is shown: resuming would cancel the buzz
    // (resumeQuestion removes the input) and reveal more of the question.
    if (!state.currentQuestion || state.currentSection !== 'question' || state.answerInputShown) return;

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
            state.currentSection === 'question' &&
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

}
