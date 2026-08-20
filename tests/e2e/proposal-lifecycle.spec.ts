import { test, expect } from '@playwright/test';

test.describe('Proposal Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('dimitris');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('should create a new proposal', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /new proposal/i, exact: false }).click();
    await page.getByLabel('Title').fill('Test Proposal');
    await page.getByLabel('Description').fill('This is a test proposal for E2E testing.');
    await page.getByRole('button', { name: /submit|create/i }).click();
    await expect(page).toHaveURL(/\/proposals\/\d+/);
  });

  test('should view proposal details', async ({ page }) => {
    await page.goto('/proposals/1');
    await expect(page.getByText('Test Proposal')).toBeVisible();
    await expect(page.getByText('Overview')).toBeVisible();
    await expect(page.getByText('Debate')).toBeVisible();
    await expect(page.getByText('Amendments')).toBeVisible();
  });

  test('should navigate proposal tabs', async ({ page }) => {
    await page.goto('/proposals/1');
    await page.getByText('Overview').click();
    await expect(page.getByText('Overview')).toBeVisible();
    await page.getByText('Debate').click();
    await expect(page.getByText('Debate')).toBeVisible();
    await page.getByText('Amendments').click();
    await expect(page.getByText('Amendments')).toBeVisible();
  });
});
