import { describe, expect, it } from 'vitest';
import { scriptRuns } from './pdf.js';

describe('scriptRuns', () => {
  it('splits Telugu and Latin so each gets its font; spaces stay in the run', () => {
    // Punctuation and digits use the Latin font: the Telugu subset has no glyphs for them.
    expect(scriptRuns('రవి కుమార్ (A1) 80%')).toEqual([
      { telugu: true, text: 'రవి కుమార్ ' },
      { telugu: false, text: '(A1) 80%' },
    ]);
    expect(scriptRuns('Lesson 2: పలకరింపులు')).toEqual([
      { telugu: false, text: 'Lesson 2: ' },
      { telugu: true, text: 'పలకరింపులు' },
    ]);
  });

  it('keeps zero-width joiners inside the Telugu run', () => {
    expect(scriptRuns('క‌ష')).toEqual([{ telugu: true, text: 'క‌ష' }]);
  });
});
