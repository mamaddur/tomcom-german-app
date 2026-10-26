import type { GermanLevel } from '../generated/prisma/client.js';

/** What the learner reads, in the two languages of the app (ADR-007). */
export const REFUSAL: Record<'te' | 'en', string> = {
  te: 'క్షమించండి, నేను జర్మన్ నేర్చుకోవడం గురించి మాత్రమే సహాయం చేయగలను. జర్మన్ గురించి ఏదైనా అడగండి.',
  en: 'Sorry, I can only help with learning German. Ask me anything about German.',
};

export const MAX_INPUT_CHARS = 500;

/**
 * Baseline safety filter (FR-606): unsafe content in English, German and common transliterations.
 * It is a floor, not the whole defence: the system prompt restricts topics, and the vendor's own
 * moderation joins it once chosen. Matching is on word starts so "Waffe" and "Waffen" both hit.
 */
const UNSAFE = [
  /\b(suicid|kill (my|your)self|self[- ]harm|selbstmord|umbringen)/i,
  /\b(bomb|explosive|sprengstoff|weapon|waffe|terror)/i,
  /\b(porn|nude|sex(ual)?\b|erotik)/i,
  /\b(drugs?|cocaine|heroin|kokain)/i,
  /\b(hack|exploit|malware|passwort stehlen)/i,
];

export type InputVerdict =
  { ok: true; text: string } | { ok: false; reason: 'empty' | 'too_long' | 'unsafe' };

export function checkInput(raw: string): InputVerdict {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > MAX_INPUT_CHARS) return { ok: false, reason: 'too_long' };
  if (UNSAFE.some((re) => re.test(text))) return { ok: false, reason: 'unsafe' };
  return { ok: true, text };
}

/** Replaces an unsafe or empty reply with the refusal (FR-606 output filter). */
export function filterOutput(
  reply: string,
  language: 'te' | 'en',
): { text: string; filtered: boolean } {
  const text = reply.trim();
  if (!text || UNSAFE.some((re) => re.test(text)))
    return { text: REFUSAL[language], filtered: true };
  return { text, filtered: false };
}

/** German phrases the model marked with <de>…</de>, in order (FR-603). */
export function germanPhrases(reply: string): string[] {
  return [...reply.matchAll(/<de>([\s\S]*?)<\/de>/g)].map((m) => m[1]!.trim()).filter(Boolean);
}

export interface PromptContext {
  /** First name only (NFR-15). Phone, surname, district and trade never reach the model. */
  firstName: string | null;
  level: GermanLevel;
  language: 'te' | 'en';
  lessonTitle: string | null;
  /** Prompts of the questions the learner got wrong recently (FR-604). */
  recentMistakes: string[];
}

const LEVEL_NAME: Record<GermanLevel, string> = {
  none: 'a complete beginner',
  A1: 'CEFR A1',
  A2: 'CEFR A2',
  B1: 'CEFR B1',
};

/**
 * The system prompt (FR-604, FR-606). Everything the model may know about the learner is built
 * here from the fields of [PromptContext], and nowhere else (NFR-15).
 */
export function buildSystemPrompt(ctx: PromptContext): string {
  const lines = [
    'You are a friendly German tutor for adult learners from Telangana who are preparing to work in Germany.',
    `Explain in ${ctx.language === 'te' ? 'Telugu' : 'English'}. Wrap every German word or phrase you want the learner to hear in <de>…</de>.`,
    `The learner is at ${LEVEL_NAME[ctx.level]}. Use short, simple sentences at that level.`,
    'Only help with learning German: vocabulary, grammar, pronunciation tips, and German for work and daily life.',
    'If asked about anything else, or for anything unsafe, politely refuse in one sentence and offer a German topic instead.',
    'Never ask for or repeat personal information such as phone numbers, addresses or documents.',
  ];
  if (ctx.firstName) lines.push(`Address the learner as ${ctx.firstName}.`);
  if (ctx.lessonTitle) lines.push(`They are currently studying the lesson "${ctx.lessonTitle}".`);
  if (ctx.recentMistakes.length) {
    lines.push('Recent questions they answered wrong (help with these if relevant):');
    for (const m of ctx.recentMistakes) lines.push(`- ${m}`);
  }
  return lines.join('\n');
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The IST calendar day of an instant, as YYYY-MM-DD: the daily limit resets at IST midnight. */
export function istDay(now: Date): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The next IST midnight (UTC instant), when a learner over the daily limit can write again. */
export function nextIstMidnight(now: Date): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const midnightIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1);
  return new Date(midnightIst - IST_OFFSET_MS);
}
