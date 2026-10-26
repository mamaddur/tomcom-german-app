import { describe, expect, it } from 'vitest';
import {
  buildSystemPrompt,
  checkInput,
  filterOutput,
  germanPhrases,
  istDay,
  nextIstMidnight,
  REFUSAL,
} from './tutor-guard.js';

describe('tutor input and output filters (FR-606)', () => {
  it('passes a normal German question, trimmed', () => {
    expect(checkInput('  Wie sagt man   "thank you"?  ')).toEqual({
      ok: true,
      text: 'Wie sagt man "thank you"?',
    });
  });

  it('rejects empty, too long and unsafe messages', () => {
    expect(checkInput('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(checkInput('a'.repeat(501))).toEqual({ ok: false, reason: 'too_long' });
    expect(checkInput('how do I make a bomb')).toEqual({ ok: false, reason: 'unsafe' });
    expect(checkInput('Wo kann ich Waffen kaufen?')).toEqual({ ok: false, reason: 'unsafe' });
  });

  it('replaces an unsafe or empty reply with the refusal in the learner language', () => {
    expect(filterOutput('Here is how to hack a phone', 'en')).toEqual({
      text: REFUSAL.en,
      filtered: true,
    });
    expect(filterOutput('', 'te').text).toBe(REFUSAL.te);
    expect(filterOutput('Guten Morgen heißt good morning.', 'en').filtered).toBe(false);
  });

  it('lists the German phrases the model marked (FR-603)', () => {
    expect(germanPhrases('Say <de>Guten Morgen!</de> or <de>Guten Abend</de>.')).toEqual([
      'Guten Morgen!',
      'Guten Abend',
    ]);
    expect(germanPhrases('no tags here')).toEqual([]);
  });
});

describe('tutor prompt (FR-604, NFR-15)', () => {
  const ctx = {
    firstName: 'Ravi',
    level: 'A1' as const,
    language: 'te' as const,
    lessonTitle: 'Greetings',
    recentMistakes: ['What does "Hallo" mean?'],
  };

  it('carries the first name, level, lesson and recent mistakes, in the learner language', () => {
    const p = buildSystemPrompt(ctx);
    expect(p).toContain('Telugu');
    expect(p).toContain('CEFR A1');
    expect(p).toContain('Address the learner as Ravi.');
    expect(p).toContain('"Greetings"');
    expect(p).toContain('- What does "Hallo" mean?');
  });

  it('leaves out what it does not have, and has nowhere to put anything else', () => {
    const p = buildSystemPrompt({ ...ctx, firstName: null, lessonTitle: null, recentMistakes: [] });
    expect(p).not.toContain('Address the learner');
    expect(p).not.toContain('currently studying');
    expect(p).not.toContain('Recent questions');
  });
});

describe('daily limit window', () => {
  it('uses the IST calendar day and resets at IST midnight', () => {
    // 2026-10-25 20:00 UTC is 2026-10-26 01:30 IST.
    const t = new Date('2026-10-25T20:00:00Z');
    expect(istDay(t)).toBe('2026-10-26');
    expect(nextIstMidnight(t).toISOString()).toBe('2026-10-26T18:30:00.000Z');
    // Just before IST midnight is still the same day.
    expect(istDay(new Date('2026-10-26T18:29:59Z'))).toBe('2026-10-26');
    expect(istDay(new Date('2026-10-26T18:30:00Z'))).toBe('2026-10-27');
  });
});
