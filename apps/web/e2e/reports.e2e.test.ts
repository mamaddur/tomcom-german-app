import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, signIn, WEB } from './helpers';

/** Admin dashboard and learner list with filters (FR-902, FR-903). */
// Test files run in parallel; each signs in a different account to avoid the OTP cooldown.
const TRAINER_2 = '+915500000002'; // seeded with TST-002

describe('dashboard and learners (FR-902, FR-903)', () => {
  let browser: Browser;

  beforeAll(async () => {
    if (!PASSWORD) throw new Error('E2E_STAFF_PASSWORD is not set');
    browser = await chromium.launch();
  });
  afterAll(() => browser?.close());

  it(
    'a trainer sees the dashboard, applies filters and opens the matching learner list',
    { timeout: 90_000 },
    async () => {
      const page = await browser.newPage();
      await signIn(page, TRAINER_2);
      expect(await page.getByRole('heading', { level: 1 }).textContent()).toBe('Dashboard');
      expect(await page.getByTestId('tile-learners').textContent()).toMatch(/^\d+$/);

      await page.getByLabel('Batches').selectOption({ label: 'TST-002' });
      await page.getByLabel('Level').selectOption('A1');
      await page.getByRole('button', { name: 'Apply' }).click();
      await page.waitForURL(/batchId=.*level=A1/);
      expect(await page.getByLabel('Level').inputValue()).toBe('A1');

      await page.getByRole('link', { name: 'See these learners' }).click();
      await page.waitForURL(/\/en\/admin\/learners\?.*batchId=/);
      expect(await page.getByRole('heading', { level: 1 }).textContent()).toBe('Learners');
      expect(await page.getByLabel('Level').inputValue()).toBe('A1');

      // A reversed date range is explained, not a crash.
      await page.goto(`${WEB}/en/admin?from=2026-02-01&to=2026-01-01`);
      expect(await page.getByRole('alert').first().textContent()).toContain('check the fields');
    },
  );
});
