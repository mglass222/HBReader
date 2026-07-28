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

test('isAnswerCorrect accepts a whole-word part of the answer (surname rule)', () => {
    const fdr = '<strong>Franklin Delano Roosevelt</strong> (accept FDR)';
    assert.equal(isAnswerCorrect('Roosevelt', fdr, 0.8), true);
    assert.equal(isAnswerCorrect('FDR', fdr, 0.8), true);
});

test('isAnswerCorrect rejects partial words even when they appear in the answer', () => {
    const fdr = '<strong>Franklin Delano Roosevelt</strong> (accept FDR)';
    assert.equal(isAnswerCorrect('roose', fdr, 0.8), false);
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
