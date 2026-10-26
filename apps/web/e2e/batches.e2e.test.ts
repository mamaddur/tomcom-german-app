import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, signIn, WEB } from './helpers';

/** Admin portal: batches and bulk upload (FR-901), trainers see only their own (FR-908). */
const ADMIN = '+915599990002';
const TRAINER_1 = '+915500000001'; // Test-Lakshmi, seeded with batch TST-001 and others
const code = `E2E-${Date.now().toString(36).toUpperCase()}`;
const csv = join(mkdtempSync(join(tmpdir(), 'batches-e2e-')), 'learners.csv');
writeFileSync(
  csv,
  ['Name,Phone', `Test-X,+9155${String(Date.now()).slice(-8)}`, 'Test-Y,123'].join('\n'),
);

describe('batches (FR-901, FR-908)', () => {
  let browser: Browser;

  beforeAll(async () => {
    if (!PASSWORD) throw new Error('E2E_STAFF_PASSWORD is not set');
    browser = await chromium.launch();
  });
  afterAll(() => browser?.close());

  it('a TOMCOM admin creates a batch and uploads a learner list', { timeout: 90_000 }, async () => {
    const page = await browser.newPage();
    await signIn(page, ADMIN);
    await page.getByRole('link', { name: 'Batches' }).first().click();
    await page.getByText('New batch').click();
    await page.getByLabel('Batch code').fill(code);
    await page.getByLabel('Name').fill('E2E synthetic batch');
    await page.getByLabel('District').selectOption('warangal');
    await page.getByRole('button', { name: 'Create batch' }).click();
    await page.waitForURL(/\/en\/admin\/batches\/[0-9a-f-]{36}$/);
    expect(await page.getByRole('heading', { level: 1 }).textContent()).toContain(code);

    await page.getByLabel('CSV or Excel file').setInputFiles(csv);
    await page.getByRole('button', { name: 'Upload' }).click();
    const status = page.locator('p[role=status]');
    await status.waitFor();
    const text = await status.textContent();
    expect(text).toContain('Upload done: 0 moved into this batch, 1 invited, 0 unchanged.');
    expect(text).toContain('row 3');
    expect(await page.getByRole('heading', { level: 2 }).first().textContent()).toContain(
      '1 uploaded number has not signed up yet',
    );
  });

  it('a trainer sees only their own batch', { timeout: 60_000 }, async () => {
    const page = await browser.newPage();
    await signIn(page, TRAINER_1);
    await page.goto(`${WEB}/en/admin/batches`);
    const rows = page.locator('table.data tbody tr');
    await rows.first().waitFor();
    const texts = await rows.allTextContents();
    expect(texts.some((r) => r.includes('TST-001'))).toBe(true);
    // Every listed batch is one this trainer teaches.
    expect(texts.every((r) => r.includes('Test-Lakshmi'))).toBe(true);
    expect(await page.getByText(code).count()).toBe(0);
    expect(await page.getByText('New batch').count()).toBe(0);
  });
});
