import { randomUUID } from 'node:crypto';

const l10n = (en: string) => ({ te: `${en} (te)`, en });

/** A complete synthetic checkpoint with `n` reading and listening questions and 2 writing tasks. */
export function completeCheckpoint(audioId: string, n = 3) {
  const mcq = (i: number) => ({
    id: randomUUID(),
    type: 'mcq',
    prompt: l10n(`Reading ${i}`),
    payload: { options: ['Hallo', 'Tschüss', 'Danke'] },
    answer: i % 3,
    explanation: l10n(`Because ${i}`),
    difficulty: 1,
  });
  const listen = (i: number) => ({
    id: randomUUID(),
    type: 'listen_choose',
    prompt: l10n(`Listening ${i}`),
    payload: { audio: audioId, options: ['Guten Morgen', 'Gute Nacht'] },
    answer: i % 2,
    explanation: l10n(`Because ${i}`),
    difficulty: 1,
  });
  const write = (i: number) => ({
    id: randomUUID(),
    prompt: l10n(`Write about your work ${i}`),
    payload: { minWords: 10, maxWords: 60 },
    explanation: l10n('Give marks for greeting, job and closing'),
    difficulty: 1,
  });
  return {
    passMark: 0.6,
    draw: { reading: 2, listening: 2, writing: 1 },
    sections: {
      reading: Array.from({ length: n }, (_, i) => mcq(i)),
      listening: Array.from({ length: n }, (_, i) => listen(i)),
      writing: [write(1), write(2)],
    },
  };
}
