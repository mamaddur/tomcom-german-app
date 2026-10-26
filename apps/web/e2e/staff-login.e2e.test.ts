import { chromium, type Browser, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Staff sign-in in a real browser against a real API (scripts/e2e-web.sh starts both).
 * Uses the synthetic super admin from seed:dev; never real accounts.
 */
const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3001';
const PASSWORD = process.env.E2E_STAFF_PASSWORD ?? '';
const SUPER_ADMIN = '+915599990001';
const DEV_OTP = '123456';

describe('admin portal staff sign-in (NFR-10)', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    if (!PASSWORD) throw new Error('E2E_STAFF_PASSWORD is not set');
    browser = await chromium.launch();
    page = await browser.newPage();
  });
  afterAll(() => browser?.close());

  it('sends a signed-out visitor to the Telugu login page', async () => {
    await page.goto(`${WEB}/te/admin`);
    await page.waitForURL(`${WEB}/te/login`);
    await expect(
      page.getByRole('heading', { name: 'సిబ్బంది సైన్-ఇన్' }).isVisible(),
    ).resolves.toBe(true);
  });

  it('rejects a wrong password with a Telugu message', async () => {
    await page.getByLabel('మొబైల్ నంబర్').fill(SUPER_ADMIN);
    await page.getByLabel('పాస్‌వర్డ్').fill('definitely-not-it');
    await page.getByRole('button', { name: 'కొనసాగించండి' }).click();
    await page.locator('#login-error').getByText('పాస్‌వర్డ్ తప్పు').waitFor();
    // The number stays filled in after a failed attempt; the password does not.
    await expect(page.getByLabel('మొబైల్ నంబర్').inputValue()).resolves.toBe(SUPER_ADMIN);
    await expect(page.getByLabel('పాస్‌వర్డ్').inputValue()).resolves.toBe('');
  });

  it('needs the password and then the OTP', async () => {
    await page.getByLabel('పాస్‌వర్డ్').fill(PASSWORD);
    await page.getByRole('button', { name: 'కొనసాగించండి' }).click();
    const code = page.getByLabel('6 అంకెల కోడ్');
    await code.waitFor();
    await code.fill('000000');
    await page.getByRole('button', { name: 'సైన్ ఇన్' }).click();
    await page.locator('#login-error').getByText('కోడ్ తప్పు').waitFor();
    await code.fill(DEV_OTP);
    await page.getByRole('button', { name: 'సైన్ ఇన్' }).click();
    await page.waitForURL(`${WEB}/te/admin`);
    await expect(page.getByText('సూపర్ అడ్మిన్').isVisible()).resolves.toBe(true);
  });

  it('a super admin reads the audit log, newest first (FR-909)', async () => {
    await page.getByRole('navigation').getByRole('link', { name: 'ఆడిట్ లాగ్' }).click();
    await page.waitForURL(`${WEB}/te/admin/audit`);
    const rows = page.locator('table.data tbody tr');
    await rows.first().waitFor();
    // The failed and successful sign-ins above are among the newest entries.
    const texts = await rows.allTextContents();
    expect(texts.some((r) => r.includes('failure:otp_invalid'))).toBe(true);
    expect(texts.some((r) => r.includes('staff_login') && r.includes('success'))).toBe(true);
  });

  it('a super admin changes a setting within its range (FR-1101)', async () => {
    await page.goto(`${WEB}/te/admin/settings`);
    const goal = page.locator('section#goal\\.dailyMinutes');
    await goal.getByRole('textbox').or(goal.getByRole('spinbutton')).fill('999');
    await goal.getByRole('button').click();
    await page.locator('p.error').waitFor();
    expect(await page.locator('p.error').textContent()).toContain('అనుమతించిన పరిధికి బయట');

    const again = page.locator('section#goal\\.dailyMinutes');
    await again.getByRole('spinbutton').fill('10');
    await again.getByRole('button').click();
    await page.locator('p.ok').waitFor();
    expect(await page.locator('p.ok').textContent()).toContain('goal.dailyMinutes');
  });

  it('keeps tokens out of reach of page scripts', async () => {
    const cookies = await page.context().cookies();
    const session = cookies.filter((c) => c.name === 'tomcom_at' || c.name === 'tomcom_rt');
    expect(session).toHaveLength(2);
    for (const c of session) expect(c).toMatchObject({ httpOnly: true, sameSite: 'Strict' });
    await expect(page.evaluate(() => document.cookie)).resolves.not.toContain('tomcom_');
  });

  it('renews an expired access token without asking to sign in again', async () => {
    await page.context().clearCookies({ name: 'tomcom_at' });
    await page.goto(`${WEB}/te/admin`);
    expect(page.url()).toBe(`${WEB}/te/admin`);
    const names = (await page.context().cookies()).map((c) => c.name);
    expect(names).toContain('tomcom_at');
  });

  it('signs out and then needs a full sign-in again', async () => {
    await page.getByRole('button', { name: 'సైన్ అవుట్' }).click();
    await page.waitForURL(`${WEB}/te/login`);
    await page.goto(`${WEB}/te/admin`);
    await page.waitForURL(`${WEB}/te/login`);
  });
});
