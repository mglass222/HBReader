// Answer checking module - pure logic, no DOM access (unit-tested in tests/answerChecker.test.js)
//
// Answer lines follow quiz-bowl conventions: the <strong> text is the part a
// player must give, unbolded words are optional context, and parenthesised
// clauses list alternates ("or ...", "accept ...") or rejected answers
// ("do not accept ...", "prompt on ..."). A guess is correct when it matches
// a required (bolded) answer, allowing typos up to the tolerance and a
// little extra wording, but never a stray unbolded word or a list of guesses.

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

// Fallback for answers made only of stopwords (e.g. the letter "a"), which
// normalizeAnswer would reduce to an empty string.
function looseNormalize(answer) {
    return String(answer ?? '')
        .replace(/<[^>]*>/g, '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .trim()
        .replace(/\s+/g, ' ');
}

function normalizeOrLoose(answer) {
    return normalizeAnswer(answer) || looseNormalize(answer);
}

function wordsOf(normalized) {
    return normalized ? normalized.split(' ') : [];
}

// Remove "do not accept ..." / "prompt on ..." clauses so rejected or
// prompt-only alternatives are never treated as acceptable answers.
function stripRejectedClauses(text) {
    return text
        .replace(/(do\s+not|don'?t|never)\s+(accept|prompt)[^;)\]]*/gi, '')
        .replace(/prompt(ed)?\s+on[^;)\]]*/gi, '');
}

// Split an answer line into the top-level text and the contents of each
// top-level (...) or [...] group. Nested brackets stay inside their group.
function splitTopLevelGroups(text) {
    let main = '';
    const groups = [];
    let depth = 0;
    let current = '';

    for (const char of text) {
        if (char === '(' || char === '[') {
            if (depth > 0) current += char;
            depth++;
        } else if ((char === ')' || char === ']') && depth > 0) {
            depth--;
            if (depth === 0) {
                groups.push(current);
                current = '';
            } else {
                current += char;
            }
        } else if (depth > 0) {
            current += char;
        } else {
            main += char;
        }
    }
    if (current) groups.push(current); // unbalanced trailing group

    return { main, groups };
}

// Trailing conditions and catch-alls that are instructions to the reader,
// not part of the answer: "... before mentioned", "... or other equivalents".
const QUALIFIER_PATTERNS = [
    /\s+(before|until|after|once|if|when|since)\b.*$/i,
    /[,\s]*\b(and|or)\s+(other\s+)?(equivalents?|synonyms?)\b.*$/i,
    /\s+alone\b.*$/i,
    /[,\s]*\betc\.?\s*$/i
];

function stripQualifiers(clause) {
    let result = clause;
    for (const pattern of QUALIFIER_PATTERNS) {
        // Never cut away bold text: in "equivalents like <strong>kids</strong>"
        // the qualifier is followed by the answer itself.
        const removed = result.match(pattern)?.[0] ?? '';
        if (!removed.includes(BOLD_OPEN) && !removed.includes(BOLD_CLOSE)) {
            result = result.replace(pattern, '');
        }
    }
    return result.trim();
}

// Plain-text "accept ..." clauses that describe a kind of answer rather than
// naming one ("accept descriptive answers", "accept either underlined name").
const DESCRIPTIVE_CLAUSE = /\b(equivalents?|descriptive|descriptions?|answers?|synonyms?|mention(ed|s|ing)?|knowledge|indicat\w*|describ\w*|any|either|additional|clear|such|underlined|forms?|similar|reasonable|specific|it)\b/i;

const BOLD_OPEN = '\u0001';
const BOLD_CLOSE = '\u0002';

// Split one clause into its alternatives on "or" (and, for side clauses,
// commas) outside bold text, so "accept <strong>A</strong>, <strong>B</strong>"
// yields A and B. Commas in the main answer are apposition, not alternatives:
// "<strong>Charles V</strong>, Holy Roman Emperor".
function splitAlternatives(clause, splitOnCommas) {
    const parts = [];
    let current = '';
    let inBold = false;
    const pattern = splitOnCommas ? /(,\s*or\s+|,|\s+or\s+)/y : /(,?\s+or\s+)/y;

    for (let i = 0; i < clause.length;) {
        const char = clause[i];
        if (char === BOLD_OPEN) inBold = true;
        if (char === BOLD_CLOSE) inBold = false;

        if (!inBold) {
            pattern.lastIndex = i;
            const match = pattern.exec(clause);
            if (match) {
                parts.push(current);
                current = '';
                i += match[0].length;
                continue;
            }
        }
        current += char;
        i++;
    }
    parts.push(current);
    return parts.map(part => part.trim()).filter(Boolean);
}

// The bolded text a guess must contain. Bold may cover only a stem
// ("<strong>doughboy</strong>s"), so both the stem and the whole word it
// sits in are returned; either one counts.
function requiredTexts(alternative) {
    const stems = [];
    const words = [];
    const pattern = new RegExp(`([\\p{L}\\p{N}]*)${BOLD_OPEN}([^${BOLD_CLOSE}]*)${BOLD_CLOSE}([\\p{L}\\p{N}]*)`, 'gu');
    for (const [, before, bold, after] of alternative.matchAll(pattern)) {
        // Skip bolded punctuation such as a stray quote mark
        if (!/[\p{L}\p{N}]/u.test(bold)) continue;
        stems.push(bold);
        words.push(before + bold + after);
    }
    return [...new Set([stems.join(' ').trim(), words.join(' ').trim()])].filter(Boolean);
}

function plainText(alternative) {
    return alternative.replace(new RegExp(`[${BOLD_OPEN}${BOLD_CLOSE}]`, 'g'), '').replace(/\s+/g, ' ').trim();
}

/**
 * Parse an answer line into acceptable answers.
 * Each entry has `required` (the bolded text a guess must contain) and
 * `full` (the whole alternative, including optional unbolded words).
 */
export function parseAnswerLine(answerField) {
    let text = String(answerField ?? '')
        // Inline optional letters such as "J(ohn)" or "Treaty(s)"
        .replace(/(?<=\p{L})\(\p{L}{1,12}\)/gu, '')
        .replace(/<strong>/gi, BOLD_OPEN)
        .replace(/<\/strong>/gi, BOLD_CLOSE)
        .replace(/<[^>]*>/g, '');
    text = stripRejectedClauses(text);

    const { main, groups } = splitTopLevelGroups(text);
    const [mainClause, ...extraMainClauses] = main.split(';');
    const clauses = [
        { text: mainClause, isMain: true },
        ...[...extraMainClauses, ...groups.flatMap(group => group.split(';'))]
            .map(clause => ({ text: clause, isMain: false }))
    ];

    const answers = [];
    for (const { text: rawClause, isMain } of clauses) {
        let clause = rawClause.trim();
        const isAccept = /^(also\s+)?accept\b/i.test(clause);
        clause = clause.replace(/^(also\s+)?(accept|or)\s+/i, '');
        if (!isMain) clause = stripQualifiers(clause);
        if (!clause) continue;

        const clauseHasBold = clause.includes(BOLD_OPEN);
        // Unbolded side clauses only count when they explicitly say "accept";
        // "(or League)" alone is a fragment of the main answer, not a new one.
        if (!isMain && !isAccept && !clauseHasBold) continue;

        for (const alternative of splitAlternatives(clause, !isMain)) {
            const hasBold = alternative.includes(BOLD_OPEN);
            if (clauseHasBold && !hasBold) continue;

            const full = plainText(alternative);
            if (!/[\p{L}\p{N}]/u.test(full)) continue;
            if (!hasBold && !isMain && DESCRIPTIVE_CLAUSE.test(full)) continue;

            const requiredForms = hasBold ? requiredTexts(alternative) : [full];
            for (const required of requiredForms) {
                answers.push({ required, full });
            }
        }
    }

    return answers;
}

export function extractAcceptableAnswers(answerField) {
    const answers = parseAnswerLine(answerField).flatMap(({ required, full }) => [required, full]);
    return [...new Set(answers)];
}

// Whether `userWords` is the required answer plus a little extra wording.
// Extra words may come from the answer line itself ("battle of hastings"),
// plus at most one outside word ("president lincoln") so a list of
// several guesses never passes.
function isRequiredWithContext(userWords, requiredWords, fullWords) {
    if (requiredWords.length === 0) return false;
    const userSet = new Set(userWords);
    if (!requiredWords.every(word => userSet.has(word))) return false;

    const allowed = new Set([...requiredWords, ...fullWords]);
    const outsideWords = userWords.filter(word => !allowed.has(word));
    return outsideWords.length <= 1;
}

export function isAnswerCorrect(userAnswer, answerField, tolerance) {
    const normalizedUser = normalizeOrLoose(userAnswer);
    if (!normalizedUser) return false;
    const userWords = wordsOf(normalizedUser);

    for (const { required, full } of parseAnswerLine(answerField)) {
        const normalizedRequired = normalizeOrLoose(required);
        const normalizedFull = normalizeOrLoose(full);
        if (!normalizedRequired) continue;

        if (normalizedUser === normalizedRequired || normalizedUser === normalizedFull) return true;

        if (isRequiredWithContext(userWords, wordsOf(normalizedRequired), wordsOf(normalizedFull))) return true;

        if (calculateSimilarity(normalizedUser, normalizedRequired) >= tolerance) return true;
        if (calculateSimilarity(normalizedUser, normalizedFull) >= tolerance) return true;
    }

    return false;
}
