import { test, expect } from '@playwright/test';

test.describe('Voting System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('dimitris');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should show voting panel', async ({ page }) => {
    await page.goto('/proposals/1');
    await page.getByText('Votes').click();
    await expect(page.getByText('Votes')).toBeVisible();
  });

  test('should cast a vote', async ({ page }) => {
    await page.goto('/proposals/1');
    await page.getByText('Votes').click();
    await page.getByRole('button', { name: /vote/i }).click();
    await expect(page.getByText(/vote cast/i)).toBeVisible({ timeout: 5000 });
  });
});
