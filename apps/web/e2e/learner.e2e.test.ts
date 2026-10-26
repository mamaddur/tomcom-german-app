import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WEB } from './helpers';

/** Student web: sign in with phone and code, take a lesson quiz, see progress, ask the tutor. */
const LEARNER = '+915500000014'; // demo learner part-way through A1 (scripts/demo-up.sh)
const CODE = '123456'; // synthetic numbers always accept this code in dev

/** Needs the demo course and sample learners (`scripts/demo-up.sh`); CI seeds staff only, so it is skipped there. Run with E2E_DEMO=1. */
describe.skipIf(!process.env.E2E_DEMO)('student web (FR-101 FR-301 FR-401 FR-601)', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  });
  afterAll(() => browser?.close());

  it('signs in, passes the next lesson quiz and sees progress', { timeout: 120_000 }, async () => {
    const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
    await page.goto(`${WEB}/en/learn/login`);
    await page.getByLabel(/mobile number/i).fill(LEARNER);
    await page.getByRole('button', { name: /send code/i }).click();
    await page.getByLabel(/6-digit/i).fill(CODE);
    await page.getByRole('button', { name: /sign in/i }).click();
    // Sign-in lands on the learner's own language; read the pages in English.
    await page.waitForURL(/\/(te|en)\/learn$/);
    await page.goto(`${WEB}/en/learn`);
    expect(await page.locator('h1').innerText()).toMatch(/^Welcome/);

    await page.getByRole('link', { name: /continue/i }).click();
    await page.waitForURL(/lessons\/[^/]+$/);
    await page.getByRole('link', { name: /quiz/i }).click();
    await page.waitForURL(/quiz$/);

    for (let n = 0; n < 12 && !(await page.locator('#quiz-score').count()); n++) {
      if (await page.locator('[role=radio]').count()) {
        await page.locator('[role=radio]').first().click();
      } else if (await page.locator('.pairs').count()) {
        const left = page.locator('.pairs .choices').first().locator('button');
        for (let i = 0; i < (await left.count()); i++) {
          await left.nth(i).click();
          await page
            .locator('.pairs .choices')
            .nth(1)
            .locator('button:not([disabled])')
            .first()
            .click();
        }
      } else {
        const words = await page.locator('.choices.inline button').count();
        for (let i = 0; i < words; i++) {
          await page.locator('.choices.inline button:not([disabled])').first().click();
        }
      }
      await page.getByRole('button', { name: /check/i }).click();
      await page.locator('#quiz-feedback').waitFor();
      await page.locator('.button-row button').click();
    }
    await page.locator('#quiz-score').waitFor();
    expect(await page.locator('#quiz-score').innerText()).toMatch(/\d+%/);
    // The result is saved to the server; the page says so by not showing an error.
    await page.waitForTimeout(1500);
    expect(await page.locator('[role=alert].error').count()).toBe(0);
  });

  it('asks the tutor and switches language', { timeout: 60_000 }, async () => {
    const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
    await page.goto(`${WEB}/en/learn/login`);
    await page.getByLabel(/mobile number/i).fill('+915500000006');
    await page.getByRole('button', { name: /send code/i }).click();
    await page.getByLabel(/6-digit/i).fill(CODE);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(`${WEB}/en/learn`);
    await page.goto(`${WEB}/en/learn/tutor`);
    await page.getByLabel(/ask about german/i).fill('How do I say thank you?');
    await page.getByRole('button', { name: /^send$/i }).click();
    await page
      .getByText(/Report this answer/i)
      .first()
      .waitFor();
    await page.locator('a[lang=te]').first().click();
    await page.waitForURL(/\/te\/learn\/tutor/);
  });
});
