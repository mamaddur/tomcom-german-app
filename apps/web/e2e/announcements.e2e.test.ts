import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, signIn, WEB } from './helpers';

/** FR-906: a trainer announces to their own batch, then stops it. */
const TRAINER_3 = '+915500000003'; // seeded with TST-003; other files use other accounts

describe('announcements (FR-906)', () => {
  let browser: Browser;

  beforeAll(async () => {
    if (!PASSWORD) throw new Error('E2E_STAFF_PASSWORD is not set');
    browser = await chromium.launch();
  });
  afterAll(() => browser?.close());

  it(
    'a trainer sends a bilingual banner to their batch and stops it',
    { timeout: 90_000 },
    async () => {
      const page = await browser.newPage();
      const title = `E2E ${Date.now()}`;
      await signIn(page, TRAINER_3);
      await page.goto(`${WEB}/en/admin/announcements`);
      // Trainers cannot pick "Everyone".
      expect(await page.locator('#batchId option', { hasText: 'Everyone' }).count()).toBe(0);
      if (!(await page.getByLabel('Title (English)').isVisible())) {
        await page.getByText('New announcement').click();
      }
      await page.getByLabel('Send to').selectOption({ index: 1 });
      await page.getByLabel('Title (Telugu)').fill(`${title} తెలుగు`);
      await page.getByLabel('Title (English)').fill(title);
      await page.getByLabel('Message (Telugu)').fill('రేపు తరగతి లేదు');
      await page.getByLabel('Message (English)').fill('No class tomorrow');
      await page.getByRole('button', { name: 'Send' }).click();
      await page.waitForURL(/sent=1/);

      const row = page.locator('table.data tbody tr', { hasText: title });
      expect(await row.textContent()).toContain('Showing');
      await row.getByRole('button', { name: 'Stop showing' }).click();
      await page.waitForURL(`${WEB}/en/admin/announcements`);
      expect(await page.locator('table.data tbody tr', { hasText: title }).textContent()).toContain(
        'Not showing',
      );
    },
  );
});
