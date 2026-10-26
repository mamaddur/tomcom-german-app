import { describe, expect, it } from 'vitest';
import { istToday, lessonStates, streakDays } from '@/lib/progress';
import {
  correctAnswerText,
  drawQuestions,
  isAnswered,
  isCorrect,
  scoreOf,
  shuffled,
  type QuizQuestion,
} from '@/lib/quiz';

const q = (
  type: QuizQuestion['type'],
  payload: Record<string, unknown>,
  answer: unknown,
): QuizQuestion => ({
  id: type,
  type,
  prompt: { te: '', en: '' },
  payload,
  answer,
  explanation: {},
});

describe('quiz rules (FR-401–FR-403)', () => {
  it('marks single-choice types by option index', () => {
    const mcq = q('mcq', { options: ['Hallo', 'Tschüss'] }, 0);
    expect(isCorrect(mcq, 0)).toBe(true);
    expect(isCorrect(mcq, 1)).toBe(false);
    expect(isCorrect(mcq, null)).toBe(false);
    expect(correctAnswerText(mcq)).toBe('Hallo');
    expect(
      correctAnswerText(q('fill_gap', { text: 'Ich ___ Ravi.', options: ['heiße', 'bist'] }, 0)),
    ).toBe('Ich heiße Ravi.');
  });

  it('marks match pairs and word order as whole lists', () => {
    const pairs = q(
      'match_pairs',
      { left: ['Hallo', 'Danke'], right: ['Thanks', 'Hello'] },
      [1, 0],
    );
    expect(isCorrect(pairs, [1, 0])).toBe(true);
    expect(isCorrect(pairs, [0, 1])).toBe(false);
    expect(isAnswered(pairs, [1, null])).toBe(false);
    expect(isAnswered(pairs, [1, 0])).toBe(true);
    expect(correctAnswerText(pairs)).toBe('Hallo = Hello\nDanke = Thanks');

    const order = q('word_order', { words: ['Ich', 'heiße', 'Ravi'] }, [0, 1, 2]);
    expect(isCorrect(order, [0, 1, 2])).toBe(true);
    expect(isCorrect(order, [0, 2, 1])).toBe(false);
    expect(isAnswered(order, [0, 1])).toBe(false);
    expect(correctAnswerText(order)).toBe('Ich heiße Ravi');
  });

  it('draws a random but repeatable subset, and shuffles the same way for server and browser', () => {
    const bank = Array.from({ length: 10 }, (_, i) => i);
    expect(drawQuestions(bank, 4, 7)).toEqual(drawQuestions(bank, 4, 7));
    expect(drawQuestions(bank, 4, 7)).toHaveLength(4);
    expect(drawQuestions(bank, 4, 7)).not.toEqual(drawQuestions(bank, 4, 8));
    expect(shuffled(bank, 3).sort((a, b) => a - b)).toEqual(bank);
    expect(drawQuestions(bank, 99, 1)).toHaveLength(10);
  });

  it('scores as a share of correct answers', () => {
    expect(scoreOf(4, 5)).toBe(0.8);
    expect(scoreOf(0, 0)).toBe(0);
  });
});

describe('progress (FR-202–FR-204)', () => {
  it('opens a lesson once the one before it is passed, unless unlock is off', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(lessonStates(ids, new Set(['a']), true)).toEqual(['passed', 'open', 'locked', 'locked']);
    expect(lessonStates(ids, new Set(), true)).toEqual(['open', 'locked', 'locked', 'locked']);
    expect(lessonStates(ids, new Set(['a']), false)).toEqual(['passed', 'open', 'open', 'open']);
  });

  it('counts the streak in IST days, ending today or yesterday', () => {
    // 2026-10-26 20:00 UTC is 2026-10-27 01:30 IST.
    const now = new Date('2026-10-26T20:00:00Z');
    expect(istToday(now)).toBe('2026-10-27');
    const days = (...d: string[]) => d.map((date) => ({ date, seconds: 300 }));
    expect(streakDays(days('2026-10-27', '2026-10-26', '2026-10-25'), now)).toBe(3);
    expect(streakDays(days('2026-10-26', '2026-10-25'), now)).toBe(2); // not yet today
    expect(streakDays(days('2026-10-24'), now)).toBe(0);
    expect(streakDays([{ date: '2026-10-27', seconds: 0 }], now)).toBe(0);
  });
});
