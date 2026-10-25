import type { Lesson, Question, Screen } from '../generated/prisma/client.js';

export type LessonWithParts = Lesson & { screens: Screen[]; questions: Question[] };

/** The lesson in lesson-pack shape (@tomcom/content-schema), used for validation and packs. */
export function toPackLesson(lesson: LessonWithParts) {
  return {
    id: lesson.id,
    order: lesson.order,
    title: lesson.title,
    description: lesson.description,
    estMinutes: lesson.estMinutes,
    ...(lesson.tradeTags.length ? { tradeTags: lesson.tradeTags } : {}),
    screens: [...lesson.screens]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        id: s.id,
        order: s.order,
        type: s.type,
        ...(s.body as Record<string, unknown>),
      })),
    questions: lesson.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      payload: q.payload,
      answer: q.answer,
      explanation: q.explanation,
      difficulty: q.difficulty,
    })),
  };
}

/** Locale-keyed text (ADR-007): two-letter keys, string values. Completeness is checked on submit. */
export function isL10n(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.entries(value).every(
      ([k, v]) => /^[a-z]{2}$/.test(k) && typeof v === 'string' && v.length <= 10_000,
    )
  );
}
