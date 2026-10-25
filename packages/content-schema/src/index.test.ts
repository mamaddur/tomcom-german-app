import { describe, expect, it } from 'vitest';
import { validateLessonPack } from './index';
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
