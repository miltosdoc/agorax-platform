import { test, expect } from '@playwright/test';

test.describe('Community Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('dimitris');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should view community dashboard', async ({ page }) => {
    await page.goto('/communities/1');
    await expect(page.getByRole('heading')).toBeVisible();
    await expect(page.getByText('Democracy Score')).toBeVisible();
  });

  test('should show community proposals', async ({ page }) => {
    await page.goto('/communities/1');
    await expect(page.getByText('Proposals')).toBeVisible();
  });
});
