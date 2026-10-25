import type { Page } from 'playwright';

export const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3001';
export const PASSWORD = process.env.E2E_STAFF_PASSWORD ?? '';
export const DEV_OTP = '123456';

/** Signs a synthetic staff account in through the English login page (password, then OTP). */
export async function signIn(page: Page, phone: string): Promise<void> {
  await page.goto(`${WEB}/en/login`);
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('6-digit code').fill(DEV_OTP);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${WEB}/en/admin`);
}
