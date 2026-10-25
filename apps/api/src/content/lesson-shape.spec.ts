import { validateLesson } from '@tomcom/content-schema';
import { describe, expect, it } from 'vitest';
import { completeLesson } from '../../test/content-fixtures.js';
import { isL10n, toPackLesson, type LessonWithParts } from './lesson-shape.js';

function asStored(): LessonWithParts {
  const body = completeLesson(1);
  const id = '00000000-0000-4000-8000-000000000001';
  return {
    id,
    levelId: id,
    order: 1,
    title: body.title,
    description: body.description,
    estMinutes: body.estMinutes,
    tradeTags: [],
    status: 'draft',
    revision: 1,
    publishedRevision: null,
    createdBy: id,
    updatedBy: id,
    createdAt: new Date(),
    updatedAt: new Date(),
    screens: body.screens.map((s, i) => ({ ...s, lessonId: id, order: i + 1 })),
    questions: body.questions.map((q) => ({ ...q, lessonId: id })),
  } as unknown as LessonWithParts;
}

describe('toPackLesson', () => {
  it('produces a lesson that the shared content-schema accepts', () => {
    expect(validateLesson(toPackLesson(asStored()))).toEqual({ valid: true, errors: [] });
  });

  it('flattens screen bodies and keeps screen order', () => {
    const pack = toPackLesson(asStored());
    expect(pack.screens[0]).toMatchObject({
      order: 1,
      type: 'explain',
      body: { en: expect.any(String) },
    });
  });
});

describe('isL10n', () => {
  it.each([
    [{ te: 'నమస్తే', en: 'Hello' }, true],
    [{ en: 'partial draft' }, true],
    [{}, true],
    [{ english: 'x' }, false],
    [{ en: 1 }, false],
    [['en'], false],
    [null, false],
  ])('%j → %s', (value, ok) => {
    expect(isL10n(value)).toBe(ok);
  });
});
