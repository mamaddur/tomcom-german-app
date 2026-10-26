import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEB } from './helpers';

/** FR-703: the public page behind the certificate's QR code. No sign-in. */
describe('certificate check page (FR-703)', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  });
  afterAll(() => browser?.close());

  it('opens from the QR link without a locale, in Telugu, and explains an unknown code', async () => {
    const page = await browser.newPage();
    await page.goto(`${WEB}/c/TC-0000000000`);
    await page.waitForURL(`${WEB}/te/c/TC-0000000000`);
    expect(await page.getByRole('heading', { level: 1 }).textContent()).toBe('సర్టిఫికెట్ తనిఖీ');
    expect(await page.locator('p.error').textContent()).toContain('ఈ IDతో సర్టిఫికెట్ లేదు');
    // Kept out of search engines.
    expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex');

    await page.getByRole('link', { name: 'English' }).click();
    await page.waitForURL(`${WEB}/en/c/TC-0000000000`);
    expect(await page.locator('p.error').textContent()).toContain('No certificate has this ID');
  });
});
