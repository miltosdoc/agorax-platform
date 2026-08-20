import { test, expect } from '@playwright/test';

test.describe('Sortition System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('dimitris');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should show sortition panel', async ({ page }) => {
    await page.goto('/proposals/1');
    await page.getByText('Sortition').click();
    await expect(page.getByText('Sortition')).toBeVisible();
  });

  test('should show sortition members', async ({ page }) => {
    await page.goto('/proposals/1');
    await page.getByText('Sortition').click();
    await expect(page.getByText('Members')).toBeVisible();
  });
});
