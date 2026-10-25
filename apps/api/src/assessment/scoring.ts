/** Server-side answer checking for checkpoint items; the same rules as the app's lesson quiz. */
export function isCorrect(type: string, answer: unknown, response: unknown): boolean {
  switch (type) {
    case 'mcq':
    case 'listen_choose':
    case 'fill_gap':
      return typeof response === 'number' && response === answer;
    case 'match_pairs':
    case 'word_order':
      return (
        Array.isArray(response) &&
        Array.isArray(answer) &&
        response.length === answer.length &&
        response.every((v, i) => v === answer[i])
      );
    default:
      return false;
  }
}

/** Overall score: the mean of the section scores (each section counts equally). */
export const overall = (sections: Record<string, number>) => {
  const values = Object.values(sections);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
};

/** Random sample without replacement (FR-403 applies to checkpoints too). */
export function draw<T>(bank: T[], n: number): T[] {
  const copy = [...bank];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

export const wordCount = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length;
