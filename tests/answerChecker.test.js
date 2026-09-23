import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    levenshteinDistance,
    calculateSimilarity,
    normalizeAnswer,
    extractAcceptableAnswers,
    isAnswerCorrect
} from '../src/js/answerChecker.js';

const SOVIET_ANSWER = '<strong>Soviet Union</strong> (accept USSR; do not accept or prompt on Russia)';

test('levenshteinDistance computes standard edit distance', () => {
    assert.equal(levenshteinDistance('kitten', 'sitting'), 3);
    assert.equal(levenshteinDistance('', 'abc'), 3);
    assert.equal(levenshteinDistance('same', 'same'), 0);
});

test('calculateSimilarity returns 1 for identical and 0 for empty', () => {
    assert.equal(calculateSimilarity('abc', 'abc'), 1);
    assert.equal(calculateSimilarity('', 'abc'), 0);
});

test('normalizeAnswer strips tags, articles, and punctuation', () => {
    assert.equal(normalizeAnswer('<strong>The Battle of Hastings</strong>!'), 'battle hastings');
});

test('normalizeAnswer folds accented characters instead of deleting them', () => {
    assert.equal(normalizeAnswer('José Martí'), 'jose marti');
});

test('extractAcceptableAnswers includes bolded and accept-clause answers', () => {
    const answers = extractAcceptableAnswers(SOVIET_ANSWER);
    assert.ok(answers.includes('Soviet Union'));
    assert.ok(answers.some(a => a.includes('USSR')));
});

test('extractAcceptableAnswers excludes "do not accept" and "prompt on" clauses', () => {
    const answers = extractAcceptableAnswers(SOVIET_ANSWER);
    assert.ok(!answers.some(a => /russia/i.test(a)), `Russia leaked into: ${JSON.stringify(answers)}`);
});

test('extractAcceptableAnswers excludes bare "prompt on" alternatives', () => {
    const answers = extractAcceptableAnswers('<strong>Mexica</strong> (prompt on Aztecs)');
    assert.ok(!answers.some(a => /aztec/i.test(a)), `Aztecs leaked into: ${JSON.stringify(answers)}`);
});

test('isAnswerCorrect rejects an explicitly rejected answer', () => {
    assert.equal(isAnswerCorrect('russia', SOVIET_ANSWER, 0.8), false);
    assert.equal(isAnswerCorrect('Russia', SOVIET_ANSWER, 0.8), false);
});

test('isAnswerCorrect accepts the primary answer and accept-clause alias', () => {
    assert.equal(isAnswerCorrect('Soviet Union', SOVIET_ANSWER, 0.8), true);
    assert.equal(isAnswerCorrect('ussr', SOVIET_ANSWER, 0.8), true);
});

test('isAnswerCorrect rejects single characters and tiny substrings', () => {
    assert.equal(isAnswerCorrect('u', SOVIET_ANSWER, 0.8), false);
    assert.equal(isAnswerCorrect('so', SOVIET_ANSWER, 0.8), false);
    assert.equal(isAnswerCorrect('sov', SOVIET_ANSWER, 0.8), false);
});

test('isAnswerCorrect accepts the bolded surname alone or with the full name', () => {
    const fdr = 'Franklin Delano <strong>Roosevelt</strong> (accept FDR)';
    assert.equal(isAnswerCorrect('Roosevelt', fdr, 0.8), true);
    assert.equal(isAnswerCorrect('Franklin Roosevelt', fdr, 0.8), true);
    assert.equal(isAnswerCorrect('Franklin Delano Roosevelt', fdr, 0.8), true);
    assert.equal(isAnswerCorrect('FDR', fdr, 0.8), true);
});

test('isAnswerCorrect rejects partial words even when they appear in the answer', () => {
    const fdr = 'Franklin Delano <strong>Roosevelt</strong> (accept FDR)';
    assert.equal(isAnswerCorrect('roose', fdr, 0.8), false);
});

test('isAnswerCorrect requires all of a fully bolded answer', () => {
    const fdr = '<strong>Franklin Delano Roosevelt</strong>';
    assert.equal(isAnswerCorrect('Franklin Delano Roosevelt', fdr, 0.8), true);
    assert.equal(isAnswerCorrect('Roosevelt', fdr, 0.8), false);
    assert.equal(isAnswerCorrect('Franklin', fdr, 0.8), false);

    const teddy = '<strong>Theodore</strong> (or <strong>Teddy</strong>) <strong>Roosevelt</strong>';
    assert.equal(isAnswerCorrect('Theodore Roosevelt', teddy, 0.8), true);
    assert.equal(isAnswerCorrect('Theodore', teddy, 0.8), false);
});

test('isAnswerCorrect rejects unbolded words from the answer line', () => {
    const hastings = 'Battle of <strong>Hastings</strong>';
    assert.equal(isAnswerCorrect('battle', hastings, 0.8), false);
    assert.equal(isAnswerCorrect('Hastings', hastings, 0.8), true);
    assert.equal(isAnswerCorrect('the Battle of Hastings', hastings, 0.8), true);

    const frost = 'Robert (Lee) <strong>Frost</strong>';
    assert.equal(isAnswerCorrect('Robert', frost, 0.8), false);
    assert.equal(isAnswerCorrect('Robert Frost', frost, 0.8), true);
});

test('isAnswerCorrect rejects a list of guesses', () => {
    const hastings = 'Battle of <strong>Hastings</strong>';
    assert.equal(isAnswerCorrect('lincoln washington hastings napoleon', hastings, 0.8), false);
    // One extra word of context is still fine
    assert.equal(isAnswerCorrect('President Lincoln', 'Abraham <strong>Lincoln</strong>', 0.8), true);
});

test('isAnswerCorrect does not accept reader instructions as answers', () => {
    const answer = '<strong>death penalty</strong> (accept <strong>capital punishment</strong> and other equivalents)';
    assert.equal(isAnswerCorrect('equivalents', answer, 0.8), false);
    assert.equal(isAnswerCorrect('capital punishment', answer, 0.8), true);
    assert.equal(isAnswerCorrect('descriptive answers', 'Arab Spring (accept descriptive answers)', 0.8), false);
});

test('isAnswerCorrect accepts a bolded stem or the whole word', () => {
    const doughboys = 'American <strong>doughboy</strong>s (prompt on soldiers)';
    assert.equal(isAnswerCorrect('doughboy', doughboys, 0.8), true);
    assert.equal(isAnswerCorrect('doughboys', doughboys, 0.8), true);
    assert.equal(isAnswerCorrect('soldiers', doughboys, 0.8), false);

    const wmd = '<strong>Weapon</strong>s of <strong>Mass Destruction</strong>';
    assert.equal(isAnswerCorrect('weapons of mass destruction', wmd, 0.8), true);
    assert.equal(isAnswerCorrect('weapon', wmd, 0.8), false);
});

test('isAnswerCorrect splits "or" alternatives and accept-clause lists', () => {
    const answer = '<strong>child</strong>ren (accept word forms and equivalents like <strong>kids</strong>, <strong>babies</strong>)';
    assert.equal(isAnswerCorrect('kids', answer, 0.8), true);
    assert.equal(isAnswerCorrect('babies', answer, 0.8), true);
    assert.equal(isAnswerCorrect('word forms', answer, 0.8), false);

    const charles = '<strong>Charles V</strong>, Holy Roman Emperor (or <strong>Charles I of Spain</strong>)';
    assert.equal(isAnswerCorrect('Charles V, Holy Roman Emperor', charles, 0.8), true);
    assert.equal(isAnswerCorrect('Charles I of Spain', charles, 0.8), true);
    assert.equal(isAnswerCorrect('Holy Roman Emperor', charles, 0.8), false);
});

test('isAnswerCorrect handles answers made only of stopwords', () => {
    assert.equal(isAnswerCorrect('a', '<strong>a</strong>', 0.8), true);
    assert.equal(isAnswerCorrect('b', '<strong>a</strong>', 0.8), false);
});

test('isAnswerCorrect forgives minor typos at the configured tolerance', () => {
    assert.equal(isAnswerCorrect('sovet union', SOVIET_ANSWER, 0.8), true);
});

test('isAnswerCorrect matches accented answers typed without accents', () => {
    const marti = '<strong>José Martí</strong>';
    assert.equal(isAnswerCorrect('jose marti', marti, 0.8), true);
});

test('isAnswerCorrect does not match stray words from the full answer field', () => {
    assert.equal(isAnswerCorrect('accept', SOVIET_ANSWER, 0.8), false);
    assert.equal(isAnswerCorrect('prompt', SOVIET_ANSWER, 0.8), false);
});

test('isAnswerCorrect handles empty and whitespace input', () => {
    assert.equal(isAnswerCorrect('', SOVIET_ANSWER, 0.8), false);
    assert.equal(isAnswerCorrect('   ', SOVIET_ANSWER, 0.8), false);
});

test('isAnswerCorrect works for plain answers with no markup or parentheses', () => {
    assert.equal(isAnswerCorrect('Magna Carta', 'Magna Carta', 0.8), true);
    assert.equal(isAnswerCorrect('magna karta', 'Magna Carta', 0.8), true);
    assert.equal(isAnswerCorrect('declaration', 'Magna Carta', 0.8), false);
});
