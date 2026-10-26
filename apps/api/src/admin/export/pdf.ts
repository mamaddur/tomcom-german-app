import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';

const require = createRequire(import.meta.url);
const font = (subset: 'telugu' | 'latin', weight: 400 | 700) =>
  require.resolve(`@fontsource/anek-telugu/files/anek-telugu-${subset}-${weight}-normal.woff`);

/**
 * Anek Telugu (OFL-1.1). Chosen because fontkit, the font engine inside pdfkit, shapes its
 * Telugu conjuncts correctly; it crashes on the current Noto Sans Telugu build.
 */
const FONTS = {
  te: font('telugu', 400),
  teBold: font('telugu', 700),
  la: font('latin', 400),
  laBold: font('latin', 700),
};

const TELUGU = /[\u0C00-\u0C7F]/;
/** Spaces belong to whichever run they sit in; the Telugu subset font has no ASCII punctuation or digits. */
const NEUTRAL = /\s/;
/** Zero-width joiners stay with the run they sit in. */
const JOINERS = new Set(['\u200C', '\u200D']);

/** Splits text into runs of Telugu and non-Telugu, since each subset font covers one script. */
export function scriptRuns(text: string): Array<{ telugu: boolean; text: string }> {
  const runs: Array<{ telugu: boolean; text: string }> = [];
  for (const ch of text) {
    const last = runs[runs.length - 1];
    const neutral = NEUTRAL.test(ch) || JOINERS.has(ch);
    const telugu = neutral && last ? last.telugu : TELUGU.test(ch);
    if (last && last.telugu === telugu) last.text += ch;
    else runs.push({ telugu, text: ch });
  }
  return runs;
}

export type Pdf = PDFKit.PDFDocument;

export function createPdf(title: string): Pdf {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    info: { Title: title, Producer: 'TOMCOM' },
  });
  for (const [name, path] of Object.entries(FONTS)) doc.registerFont(name, path);
  return doc;
}

/** Writes mixed Telugu/English text at (x, y), or at the cursor, in one line of `width`. */
export function write(
  doc: Pdf,
  text: string,
  opts: { x?: number; y?: number; width?: number; size?: number; bold?: boolean } = {},
): void {
  const runs = scriptRuns(text || ' ');
  doc.fontSize(opts.size ?? 10);
  runs.forEach((run, i) => {
    doc.font(run.telugu ? (opts.bold ? 'teBold' : 'te') : opts.bold ? 'laBold' : 'la');
    const continued = i < runs.length - 1;
    if (i === 0 && opts.x !== undefined) {
      doc.text(run.text, opts.x, opts.y, { width: opts.width, continued, lineBreak: !!opts.width });
    } else {
      doc.text(run.text, { width: opts.width, continued });
    }
  });
}

/** A simple table that starts a new page when full. Cells are cut to fit one line. */
export function table(
  doc: Pdf,
  columns: Array<{ title: string; width: number; max?: number }>,
  rows: string[][],
): void {
  const left = doc.page.margins.left;
  const rowHeight = 16;
  const cut = (s: string, max = 40) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
  const header = () => {
    let x = left;
    const y = doc.y;
    for (const c of columns) {
      write(doc, c.title, { x, y, width: c.width - 4, bold: true, size: 9 });
      x += c.width;
    }
    doc.y = y + rowHeight;
    doc
      .moveTo(left, doc.y - 3)
      .lineTo(left + columns.reduce((a, c) => a + c.width, 0), doc.y - 3)
      .strokeColor('#999')
      .stroke();
  };
  header();
  for (const row of rows) {
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      header();
    }
    let x = left;
    const y = doc.y;
    columns.forEach((c, i) => {
      write(doc, cut(row[i] ?? '', c.max), { x, y, width: c.width - 4, size: 9 });
      x += c.width;
    });
    doc.y = y + rowHeight;
  }
  doc.x = left;
}

/** Collects the PDF into a buffer. */
export function toBuffer(doc: Pdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}
