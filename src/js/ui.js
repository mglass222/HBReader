// UI helpers module - toast notifications and lightweight gameplay feedback

function getToastContainer() {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
    }
    return container;
}

export function showToast(message, type = 'info', duration = 4000) {
    const container = getToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        // Remove after the fade-out transition; fallback in case it never fires
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        setTimeout(() => toast.remove(), 600);
    }, duration);
}

// Append a "+N XP" indicator to the answer reveal area after a correct answer
export function showXPGain(xp) {
    const answerText = document.getElementById('answerText');
    // Skip if the answer reveal is no longer on screen (user moved on)
    if (!answerText || !xp || answerText.childNodes.length === 0) return;

    const gain = document.createElement('div');
    gain.className = 'xp-gain';
    gain.textContent = `+${xp} XP`;
    answerText.appendChild(gain);
}
