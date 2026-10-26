import Ajv2020, { type ErrorObject } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import lessonPackSchema from './lesson-pack.schema.json';

export { lessonPackSchema };

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);

const validate = ajv.compile(lessonPackSchema);
const SCHEMA_ID = lessonPackSchema.$id;
const lessonValidator = ajv.getSchema(`${SCHEMA_ID}#/$defs/lesson`)!;
const vocabValidator = ajv.getSchema(`${SCHEMA_ID}#/$defs/vocabItem`)!;
const checkpointValidator = ajv.getSchema(`${SCHEMA_ID}#/$defs/checkpoint`)!;

/**
 * Checks one lesson in pack shape (FR-301, FR-401, BR-02): every text in te + en, screens and
 * questions well-formed. Used by the studio API before a lesson can go to review.
 */
export function validateLesson(lesson: unknown): ValidationResult {
  if (!lessonValidator(lesson)) {
    return { valid: false, errors: (lessonValidator.errors ?? []).map(formatError) };
  }
  const errors = questionErrors((lesson as LessonShape).questions);
  return { valid: errors.length === 0, errors };
}

interface QuestionShape {
  id: string;
  type: 'mcq' | 'listen_choose' | 'fill_gap' | 'match_pairs' | 'word_order';
  payload: {
    options?: string[];
    left?: string[];
    right?: string[];
    words?: string[];
    audio?: string;
  };
  answer: unknown;
}
interface LessonShape {
  id: string;
  questions: QuestionShape[];
}

const isPermutation = (a: number[], n: number) =>
  a.length === n && new Set(a).size === n && a.every((i) => i < n);

/** Answer keys that fit their question (FR-401); JSON Schema checks the shapes, this the sizes. */
function questionErrors(questions: QuestionShape[]): string[] {
  const errors: string[] = [];
  for (const q of questions) {
    const p = q.payload;
    const where = `question ${q.id}`;
    switch (q.type) {
      case 'mcq':
      case 'listen_choose':
      case 'fill_gap':
        if ((q.answer as number) >= p.options!.length)
          errors.push(`${where}: answer is not one of the options`);
        break;
      case 'match_pairs':
        if (p.left!.length !== p.right!.length)
          errors.push(`${where}: left and right need the same number of items`);
        else if (!isPermutation(q.answer as number[], p.left!.length))
          errors.push(`${where}: answer must match every left item to a different right item`);
        break;
      case 'word_order':
        if (!isPermutation(q.answer as number[], p.words!.length))
          errors.push(`${where}: answer must use every word exactly once`);
        break;
    }
  }
  return errors;
}

export interface CheckpointShape {
  passMark: number;
  draw: { reading: number; listening: number; writing: number };
  sections: {
    reading: QuestionShape[];
    listening: QuestionShape[];
    writing: Array<{ id: string; payload: { minWords: number; maxWords: number } }>;
  };
}

/**
 * Checks a level checkpoint (FR-404). With `forPublish`, every bank must also hold at least as
 * many items as an attempt draws, so each attempt can be filled.
 */
export function validateCheckpoint(
  checkpoint: unknown,
  opts: { forPublish?: boolean } = {},
): ValidationResult {
  if (!checkpointValidator(checkpoint)) {
    return { valid: false, errors: (checkpointValidator.errors ?? []).map(formatError) };
  }
  const c = checkpoint as CheckpointShape;
  const errors = [...questionErrors(c.sections.reading), ...questionErrors(c.sections.listening)];
  for (const q of c.sections.listening) {
    if (!q.payload.audio) errors.push(`question ${q.id}: a listening question needs a recording`);
  }
  for (const w of c.sections.writing) {
    if (w.payload.minWords > w.payload.maxWords)
      errors.push(`task ${w.id}: minWords is above maxWords`);
  }
  const ids = [...c.sections.reading, ...c.sections.listening, ...c.sections.writing].map(
    (q) => q.id,
  );
  if (new Set(ids).size !== ids.length) errors.push('duplicate question id');
  if (opts.forPublish) {
    for (const s of ['reading', 'listening', 'writing'] as const) {
      if (c.sections[s].length < c.draw[s]) {
        errors.push(`${s}: the bank has ${c.sections[s].length}, an attempt draws ${c.draw[s]}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateVocabItem(item: unknown): ValidationResult {
  return vocabValidator(item)
    ? { valid: true, errors: [] }
    : { valid: false, errors: (vocabValidator.errors ?? []).map(formatError) };
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Structural check plus cross-references that JSON Schema cannot express. */
export function validateLessonPack(pack: unknown): ValidationResult {
  if (!validate(pack)) {
    return { valid: false, errors: (validate.errors ?? []).map(formatError) };
  }
  return referenceErrors(pack as unknown as PackShape);
}

interface PackShape {
  lessons: Array<LessonShape & { screens: Array<{ vocabIds?: string[] }>; video?: string }>;
  vocab: Array<{ id: string; german: { audio: string }; image?: string }>;
  media: Array<{ id: string }>;
}

function referenceErrors(pack: PackShape): ValidationResult {
  const errors: string[] = pack.lessons.flatMap((l) => questionErrors(l.questions));
  const media = new Set(pack.media.map((m) => m.id));
  const vocab = new Set(pack.vocab.map((v) => v.id));
  const lessonIds = new Set<string>();
  for (const lesson of pack.lessons) {
    if (lessonIds.has(lesson.id)) errors.push(`duplicate lesson id ${lesson.id}`);
    lessonIds.add(lesson.id);
    for (const q of lesson.questions) {
      if (q.payload.audio && !media.has(q.payload.audio))
        errors.push(`question ${q.id}: missing audio media ${q.payload.audio}`);
    }
    if (lesson.video && !media.has(lesson.video))
      errors.push(`lesson ${lesson.id}: missing video media`);
    for (const screen of lesson.screens) {
      for (const id of screen.vocabIds ?? []) {
        if (!vocab.has(id)) errors.push(`lesson ${lesson.id}: unknown vocab ${id}`);
      }
    }
  }
  // Every German string must have audio present in the pack (FR-302).
  for (const audio of collectAudio(pack)) {
    if (!media.has(audio)) errors.push(`missing audio media ${audio}`);
  }
  for (const v of pack.vocab) {
    if (v.image && !media.has(v.image)) errors.push(`vocab ${v.id}: missing image media`);
  }
  return { valid: errors.length === 0, errors };
}

function collectAudio(node: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => collectAudio(n, out));
  else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (typeof obj.text === 'string' && typeof obj.audio === 'string') out.add(obj.audio);
    Object.values(obj).forEach((v) => collectAudio(v, out));
  }
  return out;
}

function formatError(e: ErrorObject): string {
  return `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`;
}
