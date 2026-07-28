// Answer checking module - pure logic, no DOM access (unit-tested in tests/answerChecker.test.js)

export function levenshteinDistance(a, b) {
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

export function calculateSimilarity(a, b) {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;
    const distance = levenshteinDistance(a, b);
    return 1 - (distance / Math.max(a.length, b.length));
}

export function normalizeAnswer(answer) {
    return String(answer ?? '')
        .replace(/<[^>]*>/g, '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\b(the|a|an|of|or|and|in|on|at|to)\b/g, '')
        .replace(/[^\w\s]/g, '')
        .trim()
        .replace(/\s+/g, ' ');
}

// Remove "do not accept ..." / "prompt on ..." clauses so rejected or
// prompt-only alternatives are never treated as acceptable answers.
function stripRejectedClauses(text) {
    return text
        .replace(/(do\s+not|don'?t|never)\s+(accept|prompt)[^;)\]]*/gi, '')
        .replace(/prompt(ed)?\s+on[^;)\]]*/gi, '');
}

export function extractAcceptableAnswers(answerField) {
    const answers = [];
    const text = stripRejectedClauses(String(answerField ?? ''));

    const strongMatches = text.match(/<strong>([^<]+)<\/strong>/gi) || [];
    strongMatches.forEach(match => {
        const content = match.replace(/<\/?strong>/gi, '').trim();
        if (content && content.length > 1) {
            answers.push(content);
        }
    });

    const acceptMatches = text.match(/\baccept\s+([^;)\]]+)/gi) || [];
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

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// True when `needle` appears in `haystack` as consecutive whole words.
// Requires at least 3 characters so single letters and fragments never match.
function matchesWholeWords(haystack, needle) {
    if (needle.length < 3) return false;
    return new RegExp(`\\b${escapeRegExp(needle)}\\b`).test(haystack);
}

export function isAnswerCorrect(userAnswer, answerField, tolerance) {
    const normalizedUser = normalizeAnswer(userAnswer);
    if (!normalizedUser) return false;

    for (const acceptable of extractAcceptableAnswers(answerField)) {
        const normalizedAcceptable = normalizeAnswer(acceptable);
        if (!normalizedAcceptable) continue;

        if (normalizedUser === normalizedAcceptable) return true;

        // Whole-word containment in either direction: "roosevelt" for
        // "franklin delano roosevelt", or extra words around the answer.
        if (matchesWholeWords(normalizedAcceptable, normalizedUser)) return true;
        if (matchesWholeWords(normalizedUser, normalizedAcceptable)) return true;

        if (calculateSimilarity(normalizedUser, normalizedAcceptable) >= tolerance) return true;
    }

    return false;
}
