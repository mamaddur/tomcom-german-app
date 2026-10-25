/** A minimal valid A1 pack used by tests and as an example for authors. Synthetic content. */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sha = 'a'.repeat(64);

export const AUDIO_HALLO = id(101);
export const AUDIO_MORGEN = id(102);

export function samplePack() {
  return {
    schemaVersion: 1,
    level: 'A1',
    version: 1,
    publishedAt: '2026-10-25T00:00:00Z',
    settings: { passMark: 0.8, questionsPerQuiz: 10 },
    lessons: [
      {
        id: id(1),
        order: 1,
        title: { te: 'పలకరింపులు', en: 'Greetings' },
        description: {
          te: 'జర్మన్‌లో పలకరించడం నేర్చుకోండి.',
          en: 'Learn to greet people in German.',
        },
        estMinutes: 15,
        screens: [
          {
            id: id(11),
            order: 1,
            type: 'explain',
            body: {
              te: 'రోజు సమయాన్ని బట్టి పలకరింపు మారుతుంది.',
              en: 'The greeting depends on the time of day.',
            },
            examples: [{ text: 'Guten Morgen!', audio: AUDIO_MORGEN }],
          },
          { id: id(12), order: 2, type: 'vocab', vocabIds: [id(201)] },
          {
            id: id(13),
            order: 3,
            type: 'dialogue',
            lines: [
              {
                speaker: 'A',
                german: { text: 'Hallo!', audio: AUDIO_HALLO },
                meaning: { te: 'హలో!', en: 'Hello!' },
              },
            ],
          },
        ],
        questions: [
          {
            id: id(301),
            type: 'mcq',
            prompt: { te: '"Hallo" అంటే ఏమిటి?', en: 'What does "Hallo" mean?' },
            payload: { options: ['Hello', 'Goodbye', 'Thanks'] },
            answer: 0,
            explanation: { te: '"Hallo" అంటే హలో.', en: '"Hallo" means hello.' },
            difficulty: 1,
          },
        ],
      },
    ],
    vocab: [
      {
        id: id(201),
        german: { text: 'Hallo', audio: AUDIO_HALLO },
        article: null,
        meaning: { te: 'హలో', en: 'hello' },
      },
    ],
    media: [
      { id: AUDIO_HALLO, type: 'audio', path: 'audio/hallo.opus', bytes: 9000, sha256: sha },
      {
        id: AUDIO_MORGEN,
        type: 'audio',
        path: 'audio/guten-morgen.opus',
        bytes: 11000,
        sha256: sha,
      },
    ],
  };
}
