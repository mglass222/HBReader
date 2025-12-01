// Settings module - Theme, Font Size, Device Detection
import { state } from './state.js';

// Forward declaration for showAnswerInput
export const deps = {
    showAnswerInput: null
};

export function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
}

export function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    const themeIcon = document.getElementById('themeIcon');
    const themeLabel = document.getElementById('themeLabel');
    const toggleSwitch = document.getElementById('toggleSwitch');

    if (theme === 'dark') {
        themeIcon.textContent = '🌙';
        themeLabel.textContent = 'Dark Mode';
        toggleSwitch.classList.add('active');
    } else {
        themeIcon.textContent = '☀️';
        themeLabel.textContent = 'Light Mode';
        toggleSwitch.classList.remove('active');
    }
}

export function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
}

export function initFontSize() {
    const savedFontSize = localStorage.getItem('fontSize') || '18';
    setFontSize(parseInt(savedFontSize));
}

export function setFontSize(size) {
    localStorage.setItem('fontSize', size);
    document.getElementById('fontSize').value = size;
    document.getElementById('fontSizeValue').textContent = size;

    let label = 'Medium';
    if (size <= 16) label = 'Small';
    else if (size <= 20) label = 'Medium';
    else if (size <= 24) label = 'Large';
    else label = 'Extra Large';
    document.getElementById('fontSizeLabel').textContent = label;

    document.getElementById('questionText').style.fontSize = size + 'px';
}

export function getFontSizeLabel(size) {
    if (size <= 16) return 'Small';
    if (size <= 20) return 'Medium';
    if (size <= 24) return 'Large';
    return 'Extra Large';
}

export function updateSliderFill(slider) {
    const min = slider.min || 0;
    const max = slider.max || 100;
    const value = slider.value;
    const percentage = ((value - min) / (max - min)) * 100;
    const blue = getComputedStyle(document.documentElement).getPropertyValue('--primary-blue').trim();
    const gray = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim();
    slider.style.background = `linear-gradient(to right, ${blue} 0%, ${blue} ${percentage}%, ${gray} ${percentage}%, ${gray} 100%)`;
}

export function initSliders() {
    document.querySelectorAll('.setting-group input[type="range"]').forEach(slider => {
        updateSliderFill(slider);
        slider.addEventListener('input', () => updateSliderFill(slider));
    });
}

export function initAnswerTolerance() {
    const savedTolerance = localStorage.getItem('answerTolerance') || '80';
    document.getElementById('answerTolerance').value = savedTolerance;
    document.getElementById('toleranceValue').textContent = savedTolerance;
    document.getElementById('toleranceWarning').style.display = parseInt(savedTolerance) < 80 ? 'block' : 'none';
}

export function detectDeviceType() {
    if (navigator.userAgentData) {
        return navigator.userAgentData.mobile ? 'mobile' : 'desktop';
    }
    const ua = navigator.userAgent;
    if (/Mobi|Android|iPad|Tablet/i.test(ua)) {
        return 'mobile';
    }
    return 'desktop';
}

export function updateBuzzerVisibility() {
    const buzzer = document.getElementById('buzzerButton');
    const isMobile = detectDeviceType() === 'mobile';
    const isStreaming = state.currentQuestion && !state.answerInputShown && state.currentSection === 'question';

    if (isMobile && isStreaming) {
        buzzer.classList.add('show');
    } else {
        buzzer.classList.remove('show');
    }
}

export function toggleSettings() {
    const settingsPanel = document.getElementById('settingsPanel');
    const toggleBtn = document.getElementById('settingsButton');

    if (!settingsPanel) return;

    if (settingsPanel.classList.contains('collapsed')) {
        settingsPanel.classList.remove('collapsed');
        if (toggleBtn) toggleBtn.textContent = 'Hide Settings';
    } else {
        settingsPanel.classList.add('collapsed');
        if (toggleBtn) toggleBtn.textContent = 'Show Settings';
    }
}

export function initSettingsEventListeners() {
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);

    document.getElementById('fontSize').addEventListener('input', (e) => {
        const size = parseInt(e.target.value);
        setFontSize(size);
    });

    document.getElementById('answerTolerance').addEventListener('input', (e) => {
        const tolerance = parseInt(e.target.value);
        document.getElementById('toleranceValue').textContent = tolerance;
        localStorage.setItem('answerTolerance', tolerance);
        document.getElementById('toleranceWarning').style.display = tolerance < 80 ? 'block' : 'none';
    });

    document.getElementById('buzzerButton').addEventListener('click', () => {
        if (deps.showAnswerInput) deps.showAnswerInput();
    });

    window.addEventListener('resize', updateBuzzerVisibility);
}
