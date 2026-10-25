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

      // FR-905: both downloads arrive as files with the filters applied.
      for (const [name, ext] of [
        ['Download Excel', 'xlsx'],
        ['Download PDF', 'pdf'],
      ] as const) {
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.getByRole('link', { name }).click(),
        ]);
        expect(download.suggestedFilename()).toMatch(new RegExp(`^tomcom-report-.*\\.${ext}$`));
        expect(download.url()).toContain('level=A1');
      }

      await page.getByRole('link', { name: 'See these learners' }).click();
      await page.waitForURL(/\/en\/admin\/learners\?.*batchId=/);
      expect(await page.getByRole('heading', { level: 1 }).textContent()).toBe('Learners');
      expect(await page.getByLabel('Level').inputValue()).toBe('A1');

      // FR-907 readiness list with the same filters, and its Excel download.
      await page.getByRole('navigation').getByRole('link', { name: 'Exam readiness' }).click();
      await page.waitForURL(`${WEB}/en/admin/readiness`);
      await page.getByLabel('Level').selectOption('A1');
      await page.getByRole('button', { name: 'Apply' }).click();
      await page.waitForURL(/readiness\?.*level=A1/);
      const [sheet] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('link', { name: 'Download Excel' }).click(),
      ]);
      expect(sheet.suggestedFilename()).toMatch(/^tomcom-report-.*\.xlsx$/);

      // Writing to mark (nothing waiting for this synthetic trainer).
      await page.getByRole('navigation').getByRole('link', { name: 'Mark writing' }).click();
      await page.waitForURL(`${WEB}/en/admin/marking`);
      expect(await page.getByRole('heading', { level: 1 }).textContent()).toBe('Mark writing');

      // Issued certificates in this trainer's batches; only admins can withdraw them.
      await page.getByRole('navigation').getByRole('link', { name: 'Certificates' }).click();
      await page.waitForURL(`${WEB}/en/admin/certificates`);
      expect(await page.getByRole('heading', { level: 1 }).textContent()).toBe('Certificates');
      expect(await page.getByText('Withdraw…').count()).toBe(0);

      // A reversed date range is explained, not a crash.
      await page.goto(`${WEB}/en/admin?from=2026-02-01&to=2026-01-01`);
      expect(await page.getByRole('alert').first().textContent()).toContain('check the fields');
    },
  );
});
