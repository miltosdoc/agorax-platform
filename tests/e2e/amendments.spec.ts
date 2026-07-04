import { test, expect } from '@playwright/test';

test.describe('Amendment System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('dimitris');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should show amendments panel', async ({ page }) => {
    await page.goto('/proposals/1');
    await page.getByText('Amendments').click();
    await expect(page.getByText('Amendments')).toBeVisible();
  });

  test('should submit an amendment', async ({ page }) => {
    await page.goto('/proposals/1');
    await page.getByText('Amendments').click();
    await page.getByRole('button', { name: /new amendment/i }).click();
    await page.getByLabel('Amendment').fill('Test amendment');
    await page.getByRole('button', { name: /submit/i }).click();
    await expect(page.getByText('Test amendment')).toBeVisible();
  });
});
