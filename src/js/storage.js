// Storage module - safe access to per-browser settings.
//
// localStorage throws (SecurityError) when the browser blocks site data, and
// can throw on write when storage is full. Settings are conveniences, so every
// access is wrapped and falls back to an in-memory copy for this page load.

const memoryFallback = new Map();

export function readSetting(key, fallback) {
    try {
        const value = localStorage.getItem(key);
        if (value !== null) return value;
    } catch {
        // Storage blocked; use the in-memory copy below
    }
    return memoryFallback.get(key) ?? fallback;
}

export function writeSetting(key, value) {
    memoryFallback.set(key, String(value));
    try {
        localStorage.setItem(key, String(value));
    } catch {
        // Storage blocked or full; the in-memory copy keeps this session working
    }
}

export const XP_MIN_TOLERANCE = 80;

// Answer tolerance as a percentage (0-100). XP is only earned at >= 80%.
export function getAnswerTolerance() {
    const tolerance = parseInt(readSetting('answerTolerance', String(XP_MIN_TOLERANCE)), 10);
    return Number.isNaN(tolerance) ? XP_MIN_TOLERANCE : tolerance;
}
