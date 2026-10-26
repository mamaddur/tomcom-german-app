/** Lower-cases a German phrase and drops punctuation, so "Guten Morgen!" matches "guten morgen". */
export function normalizePhrase(s: string): string {
  return s
    .toLowerCase()
    .replace(/[!?.,;:"“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits a tutor reply at its <de>…</de> marks (FR-603). Unclosed marks stay plain text. */
export function splitReply(reply: string): Array<{ text: string; german: boolean }> {
  const parts: Array<{ text: string; german: boolean }> = [];
  let rest = reply;
  for (;;) {
    const m = /<de>([\s\S]*?)<\/de>/.exec(rest);
    if (!m) break;
    if (m.index > 0) parts.push({ text: rest.slice(0, m.index), german: false });
    parts.push({ text: m[1]!.trim(), german: true });
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) parts.push({ text: rest, german: false });
  return parts;
}
