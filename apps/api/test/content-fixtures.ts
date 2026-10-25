import { randomUUID } from 'node:crypto';

/** A complete lesson body (te + en everywhere) that passes content-schema. Synthetic content. */
export function completeLesson(
  expectedRevision: number,
  ids: { screen: string; question: string; audio: string } = {
    screen: randomUUID(),
    question: randomUUID(),
    audio: randomUUID(),
  },
) {
  return {
    expectedRevision,
    title: { te: 'పలకరింపులు', en: 'Greetings' },
    description: { te: 'జర్మన్‌లో పలకరించడం నేర్చుకోండి.', en: 'Learn to greet people in German.' },
    estMinutes: 15,
    tradeTags: [],
    screens: [
      {
        id: ids.screen,
        type: 'explain',
        body: {
          body: {
            te: 'రోజు సమయాన్ని బట్టి పలకరింపు మారుతుంది.',
            en: 'The greeting depends on the time of day.',
          },
          examples: [{ text: 'Guten Morgen!', audio: ids.audio }],
        },
      },
    ],
    questions: [
      {
        id: ids.question,
        type: 'mcq',
        prompt: { te: '"Hallo" అంటే ఏమిటి?', en: 'What does "Hallo" mean?' },
        payload: { options: ['Hello', 'Goodbye', 'Thanks'] },
        answer: 0,
        explanation: { te: '"Hallo" అంటే హలో.', en: '"Hallo" means hello.' },
        difficulty: 1,
      },
    ],
  };
}
