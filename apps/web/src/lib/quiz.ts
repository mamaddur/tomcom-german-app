/**
 * Lesson quiz rules, the same as the phone app (FR-401–FR-403): five tap-only question types, a
 * random draw so a retake differs, and answer keys that are indices (content-schema).
 *
 * Responses: an option index for mcq, listen_choose and fill_gap; for match_pairs, the index in
 * `right` chosen for each `left` item (null while incomplete); for word_order, the indices of
 * `words` in the order the student tapped them.
 */
export interface QuizQuestion {
  id: string;
  type: 'mcq' | 'listen_choose' | 'fill_gap' | 'match_pairs' | 'word_order';
  prompt: Record<string, string>;
  payload: Record<string, unknown>;
  answer: unknown;
  explanation: Record<string, string>;
}

export type Response = number | Array<number | null> | null;

/** mulberry32: a small deterministic generator, so server and browser shuffle identically. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rand = seeded(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** FR-403: a random draw from the lesson's question bank. */
export function drawQuestions<T>(bank: readonly T[], count: number, seed: number): T[] {
  return shuffled(bank, seed).slice(0, count);
}

const sameList = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export function isCorrect(q: QuizQuestion, response: Response): boolean {
  switch (q.type) {
    case 'mcq':
    case 'listen_choose':
    case 'fill_gap':
      return response === q.answer;
    case 'match_pairs':
    case 'word_order':
      return Array.isArray(response) && Array.isArray(q.answer) && sameList(response, q.answer);
  }
}

/** Whether the student has filled in enough to press "Check". */
export function isAnswered(q: QuizQuestion, response: Response): boolean {
  switch (q.type) {
    case 'mcq':
    case 'listen_choose':
    case 'fill_gap':
      return typeof response === 'number';
    case 'match_pairs':
      return Array.isArray(response) && response.length > 0 && response.every((r) => r !== null);
    case 'word_order':
      return Array.isArray(response) && response.length === (q.payload.words as unknown[]).length;
  }
}

/** The correct answer as text, for feedback and the review. */
export function correctAnswerText(q: QuizQuestion): string {
  const p = q.payload;
  const answer = q.answer;
  switch (q.type) {
    case 'mcq':
    case 'listen_choose':
      return (p.options as string[])[answer as number] ?? '';
    case 'fill_gap':
      return (p.text as string).replace('___', (p.options as string[])[answer as number] ?? '');
    case 'match_pairs':
      return (answer as number[])
        .map((r, i) => `${(p.left as string[])[i]} = ${(p.right as string[])[r]}`)
        .join('\n');
    case 'word_order':
      return (answer as number[]).map((i) => (p.words as string[])[i]).join(' ');
  }
}

export const scoreOf = (correct: number, total: number) => (total === 0 ? 0 : correct / total);
