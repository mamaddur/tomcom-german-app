import { describe, expect, it } from 'vitest';
import { validateCheckpoint, validateLessonPack } from './index';
import { AUDIO_MORGEN, samplePack } from './sample-pack';

describe('validateLessonPack', () => {
  it('accepts the sample pack', () => {
    expect(validateLessonPack(samplePack())).toEqual({ valid: true, errors: [] });
  });

  it('requires Telugu text (BR-02)', () => {
    const pack = samplePack();
    delete (pack.lessons[0]!.title as { te?: string }).te;
    const result = validateLessonPack(pack);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toMatch(/title.*te/);
  });

  it('accepts an extra locale without schema changes (NFR-16)', () => {
    const pack = samplePack();
    (pack.lessons[0]!.title as Record<string, string>).hi = 'अभिवादन';
    expect(validateLessonPack(pack).valid).toBe(true);
  });

  it('rejects checkpoint-only question types in a downloadable pack (ADR-009)', () => {
    const pack = samplePack();
    (pack.lessons[0]!.questions[0] as { type: string }).type = 'speaking';
    expect(validateLessonPack(pack).valid).toBe(false);
  });

  it('rejects audio over 100 KB (NFR-04)', () => {
    const pack = samplePack();
    pack.media[0]!.bytes = 150_000;
    expect(validateLessonPack(pack).valid).toBe(false);
  });

  it('rejects video of 2 minutes or more (FR-305)', () => {
    const pack = samplePack();
    pack.media.push({
      id: '00000000-0000-4000-8000-000000000900',
      type: 'video',
      path: 'video/intro.mp4',
      bytes: 2_000_000,
      sha256: 'b'.repeat(64),
      durationMs: 150_000,
    } as (typeof pack.media)[number]);
    expect(validateLessonPack(pack).valid).toBe(false);
  });

  it('reports German text whose audio is not in the pack (FR-302)', () => {
    const pack = samplePack();
    pack.media = pack.media.filter((m) => m.id !== AUDIO_MORGEN);
    const result = validateLessonPack(pack);
    expect(result.errors).toContain(`missing audio media ${AUDIO_MORGEN}`);
  });

  it('reports unknown vocab references', () => {
    const pack = samplePack();
    pack.vocab = [];
    expect(validateLessonPack(pack).errors.join()).toMatch(/unknown vocab/);
  });
});

describe('validateLesson / validateVocabItem', () => {
  it('accepts a single lesson from the sample pack', async () => {
    const { validateLesson } = await import('./index');
    expect(validateLesson(samplePack().lessons[0])).toEqual({ valid: true, errors: [] });
  });

  it('reports a lesson missing Telugu text', async () => {
    const { validateLesson } = await import('./index');
    const lesson = samplePack().lessons[0]!;
    delete (lesson.description as { te?: string }).te;
    const result = validateLesson(lesson);
    expect(result.valid).toBe(false);
    expect(result.errors.join()).toMatch(/description/);
  });

  it('checks vocab items', async () => {
    const { validateVocabItem } = await import('./index');
    expect(validateVocabItem(samplePack().vocab[0]).valid).toBe(true);
    expect(validateVocabItem({ ...samplePack().vocab[0], meaning: { en: 'hello' } }).valid).toBe(
      false,
    );
  });
});

describe('quiz question shapes (FR-401)', () => {
  const qid = (n: number) => `00000000-0000-4000-8000-${String(800 + n).padStart(12, '0')}`;
  const base = {
    prompt: { te: 'ప్రశ్న', en: 'Question' },
    explanation: { te: 'వివరణ', en: 'Explanation' },
    difficulty: 1,
  };
  const withQuestions = (questions: object[]) => {
    const pack = samplePack();
    (pack.lessons[0]!.questions as object[]) = questions.map((q, i) => ({
      id: qid(i),
      ...base,
      ...q,
    }));
    return validateLessonPack(pack);
  };

  it('accepts one question of each type', () => {
    expect(
      withQuestions([
        { type: 'mcq', payload: { options: ['Hallo', 'Tschüss'] }, answer: 0 },
        {
          type: 'listen_choose',
          payload: { audio: AUDIO_MORGEN, options: ['Guten Morgen', 'Gute Nacht'] },
          answer: 0,
        },
        {
          type: 'fill_gap',
          payload: { text: 'Ich ___ Ravi.', options: ['heiße', 'bist'] },
          answer: 0,
        },
        {
          type: 'match_pairs',
          payload: { left: ['Hallo', 'Danke'], right: ['Thanks', 'Hello'] },
          answer: [1, 0],
        },
        {
          type: 'word_order',
          payload: { words: ['Ravi', 'heiße', 'Ich'] },
          answer: [2, 1, 0],
        },
      ]),
    ).toEqual({ valid: true, errors: [] });
  });

  it.each([
    ['an answer outside the options', { type: 'mcq', payload: { options: ['a', 'b'] }, answer: 2 }],
    [
      'a gap sentence without a gap',
      { type: 'fill_gap', payload: { text: 'Ich bin', options: ['a', 'b'] }, answer: 0 },
    ],
    [
      'pairs of different lengths',
      {
        type: 'match_pairs',
        payload: { left: ['a', 'b'], right: ['c', 'd', 'e'] },
        answer: [0, 1],
      },
    ],
    [
      'two left items matched to the same right item',
      { type: 'match_pairs', payload: { left: ['a', 'b'], right: ['c', 'd'] }, answer: [0, 0] },
    ],
    [
      'a word order that skips a word',
      { type: 'word_order', payload: { words: ['a', 'b', 'c'] }, answer: [0, 1] },
    ],
    [
      'listening without audio',
      { type: 'listen_choose', payload: { options: ['a', 'b'] }, answer: 0 },
    ],
    [
      'typing answers (NFR-18: no free text)',
      { type: 'fill_gap', payload: { text: 'Ich ___', options: ['a', 'b'] }, answer: 'bin' },
    ],
  ])('rejects %s', (_label, q) => {
    expect(withQuestions([q]).valid).toBe(false);
  });

  it('reports question audio that is not in the pack (FR-302)', () => {
    const result = withQuestions([
      { type: 'listen_choose', payload: { audio: qid(99), options: ['a', 'b'] }, answer: 0 },
    ]);
    expect(result.errors.join()).toMatch(/missing audio media/);
  });
});

describe('validateCheckpoint (FR-404)', () => {
  const cid = (n: number) => `00000000-0000-4000-8000-${String(900 + n).padStart(12, '0')}`;
  const base = {
    prompt: { te: 'ప్రశ్న', en: 'Question' },
    explanation: { te: 'వివరణ', en: 'Explanation' },
    difficulty: 1,
  };
  const checkpoint = () => ({
    passMark: 0.6,
    draw: { reading: 1, listening: 1, writing: 1 },
    sections: {
      reading: [{ id: cid(1), type: 'mcq', payload: { options: ['a', 'b'] }, answer: 0, ...base }],
      listening: [
        {
          id: cid(2),
          type: 'listen_choose',
          payload: { audio: AUDIO_MORGEN, options: ['a', 'b'] },
          answer: 1,
          ...base,
        },
      ],
      writing: [{ id: cid(3), payload: { minWords: 20, maxWords: 60 }, ...base }],
    },
  });

  it('accepts a complete checkpoint, also for publishing', () => {
    expect(validateCheckpoint(checkpoint(), { forPublish: true })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('needs a recording for every listening question', () => {
    const c = checkpoint();
    c.sections.listening[0] = {
      ...c.sections.listening[0]!,
      type: 'mcq',
      payload: { options: ['a', 'b'] } as never,
    };
    expect(validateCheckpoint(c).errors.join()).toMatch(/needs a recording/);
  });

  it('checks answer keys like lesson quizzes', () => {
    const c = checkpoint();
    c.sections.reading[0]!.answer = 5;
    expect(validateCheckpoint(c).valid).toBe(false);
  });

  it('can be saved with a small bank but not published', () => {
    const c = checkpoint();
    c.draw.reading = 10;
    expect(validateCheckpoint(c).valid).toBe(true);
    expect(validateCheckpoint(c, { forPublish: true }).errors.join()).toMatch(
      /reading: the bank has 1, an attempt draws 10/,
    );
  });

  it('rejects a pass mark out of range and writing limits the wrong way round', () => {
    expect(validateCheckpoint({ ...checkpoint(), passMark: 0.2 }).valid).toBe(false);
    const c = checkpoint();
    c.sections.writing[0]!.payload = { minWords: 80, maxWords: 40 };
    expect(validateCheckpoint(c).errors.join()).toMatch(/minWords is above maxWords/);
  });
});
