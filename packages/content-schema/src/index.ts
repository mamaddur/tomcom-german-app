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

/**
 * Checks one lesson in pack shape (FR-301, FR-401, BR-02): every text in te + en, screens and
 * questions well-formed. Used by the studio API before a lesson can go to review.
 */
export function validateLesson(lesson: unknown): ValidationResult {
  return lessonValidator(lesson)
    ? { valid: true, errors: [] }
    : { valid: false, errors: (lessonValidator.errors ?? []).map(formatError) };
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
  lessons: Array<{ id: string; screens: Array<{ vocabIds?: string[] }>; video?: string }>;
  vocab: Array<{ id: string; german: { audio: string }; image?: string }>;
  media: Array<{ id: string }>;
}

function referenceErrors(pack: PackShape): ValidationResult {
  const errors: string[] = [];
  const media = new Set(pack.media.map((m) => m.id));
  const vocab = new Set(pack.vocab.map((v) => v.id));
  const lessonIds = new Set<string>();
  for (const lesson of pack.lessons) {
    if (lessonIds.has(lesson.id)) errors.push(`duplicate lesson id ${lesson.id}`);
    lessonIds.add(lesson.id);
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
