import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, signIn, WEB } from './helpers';

/** Content studio journey in a real browser (FR-1001–1004): write → review → publish. */
const AUTHOR = '+915599990003';
const REVIEWER = '+915599990004';
const title = `Greetings ${Date.now()}`;
const wav = join(mkdtempSync(join(tmpdir(), 'studio-e2e-')), 'guten-morgen.wav');
execFileSync('ffmpeg', [
  '-v',
  'error',
  '-y',
  '-f',
  'lavfi',
  '-i',
  'sine=frequency=300:duration=1',
  wav,
]);

describe('content studio (FR-1001, FR-1003, FR-1004)', () => {
  let browser: Browser;
  let lessonUrl = '';
  // One sign-in per person: signing the same number in again within 30 s hits the OTP cooldown.
  let author: Page;
  let reviewer: Page;

  beforeAll(async () => {
    if (!PASSWORD) throw new Error('E2E_STAFF_PASSWORD is not set');
    browser = await chromium.launch();
  });
  afterAll(() => browser?.close());

  it(
    'an author writes a complete lesson in Telugu and English, with audio, and sends it for review',
    { timeout: 90_000 },
    async () => {
      const page = (author = await (await browser.newContext()).newPage());
      await signIn(page, AUTHOR);
      await page.getByRole('navigation').getByRole('link', { name: 'Content studio' }).click();
      await page.waitForURL(`${WEB}/en/studio`);

      const a1 = page.getByRole('region', { name: 'A1' });
      await a1.getByText('New lesson').click();
      await a1.getByLabel('Title (Telugu)').fill('పలకరింపులు');
      await a1.getByLabel('Title (English)').fill(title);
      await a1.getByRole('button', { name: 'Create' }).click();
      await page.waitForURL(/\/en\/studio\/lessons\//);
      lessonUrl = page.url();

      await page.getByLabel('Description (Telugu)').fill('జర్మన్‌లో పలకరించడం నేర్చుకోండి.');
      await page.getByLabel('Description (English)').fill('Learn to greet people in German.');

      await page.getByRole('button', { name: 'Add screen: Explanation' }).click();
      await page.getByLabel('Text (Telugu)').fill('రోజు సమయాన్ని బట్టి పలకరింపు మారుతుంది.');
      await page.getByLabel('Text (English)').fill('The greeting depends on the time of day.');
      await page.getByRole('button', { name: 'Add example' }).click();
      await page.getByLabel('German', { exact: true }).fill('Guten Morgen!');
      await page.locator('label.file input[type=file]').setInputFiles(wav);
      await page.getByLabel('Audio ready').waitFor();

      await page.getByRole('button', { name: 'Add question: Multiple choice' }).click();
      await page.getByLabel('Prompt (Telugu)').fill('"Guten Morgen" అంటే ఏమిటి?');
      await page.getByLabel('Prompt (English)').fill('What does "Guten Morgen" mean?');
      await page.getByLabel('Explanation (Telugu)').fill('"Guten Morgen" అంటే శుభోదయం.');
      await page.getByLabel('Explanation (English)').fill('"Guten Morgen" means good morning.');
      await page.getByLabel('Options (one per line)').fill('Good morning\nGood night\nThank you');

      await page.getByRole('button', { name: 'Save' }).click();
      await page.getByText('Saved as revision 2.').waitFor();
      await page.getByRole('button', { name: 'Send for review' }).click();
      await page.getByText('Status: In review').waitFor();
      expect(await page.getByText('In review: editing is locked.').isVisible()).toBe(true);
    },
  );

  it(
    'a reviewer approves it and publishes A1 as a new pack version',
    { timeout: 90_000 },
    async () => {
      const page = (reviewer = await (await browser.newContext()).newPage());
      await signIn(page, REVIEWER);
      await page.goto(lessonUrl);
      await page.getByRole('button', { name: 'Approve' }).click();
      await page.getByText('Status: Approved').waitFor();

      await page.getByRole('link', { name: 'Publish' }).click();
      await page.getByRole('button', { name: 'Publish A1' }).click();
      const status = page.getByRole('status').filter({ hasText: 'Published A1, version' });
      await status.waitFor();
      expect(await status.textContent()).toMatch(/Published A1, version \d+\./);
    },
  );

  it('keeps reviewers from editing and authors from publishing', { timeout: 60_000 }, async () => {
    await reviewer.goto(lessonUrl);
    expect(await reviewer.getByText('Read-only for your role.').isVisible()).toBe(true);
    expect(await reviewer.getByRole('button', { name: 'Save' }).count()).toBe(0);

    await author.goto(`${WEB}/en/studio/publish`);
    await author.getByRole('heading', { name: 'Publish lesson packs' }).waitFor();
    expect(await author.getByRole('button', { name: 'Publish A1' }).count()).toBe(0);
  });

  it(
    'an author drafts a checkpoint; a reviewer sees what blocks publishing (FR-404)',
    { timeout: 60_000 },
    async () => {
      await author.goto(`${WEB}/en/studio/checkpoints`);
      await author.getByRole('link', { name: 'B1 checkpoint' }).click();
      await author.waitForURL(`${WEB}/en/studio/checkpoints/B1`);
      await author.getByLabel('Pass mark (%)').fill('65');
      await author.getByRole('button', { name: 'Add question: Multiple choice' }).first().click();
      await author.getByLabel('Prompt (Telugu)').last().fill('"Danke" అంటే ఏమిటి?');
      await author.getByLabel('Prompt (English)').last().fill('What does "Danke" mean?');
      await author.getByRole('button', { name: 'Save' }).click();
      await author.getByRole('status').filter({ hasText: /Saved/ }).waitFor();

      await reviewer.goto(`${WEB}/en/studio/checkpoints/B1`);
      expect(await reviewer.getByText('Read-only for your role.').isVisible()).toBe(true);
      expect(await reviewer.getByLabel('Pass mark (%)').inputValue()).toBe('65');
      // The banks are far from full: publishing is refused with the reasons.
      expect(
        await reviewer.getByRole('heading', { name: 'Before it can be published' }).isVisible(),
      ).toBe(true);
      await reviewer.getByRole('button', { name: 'Publish checkpoint' }).click();
      const error = reviewer.getByRole('status').filter({ hasText: 'not complete' });
      await error.waitFor();
      expect(await error.textContent()).toMatch(/sections\/reading|the bank has/);
    },
  );
});
