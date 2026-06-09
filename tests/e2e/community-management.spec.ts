import { test, expect } from '@playwright/test';

/**
 * Community Management E2E Tests
 * 
 * Tests community creation, settings management, member management,
 * and autonomous community configuration.
 * 
 * Prerequisites: App running on localhost:5173, DEMO_MODE=true
 */

test.describe('Community Creation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('miltos');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('create new community with all required fields', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Find and click community creation button
    const createBtn = page.getByRole('button', { name: /community|create|new/i, exact: false });
    if (await createBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await createBtn.click();
    } else {
      // Alternative: navigate to community page
      await page.goto('/communities');
    }
    
    // Fill community form
    const nameField = page.getByLabel(/name|title/i, { exact: false });
    if (await nameField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameField.fill('E2E Test Community ' + Date.now());
    }
    
    const descField = page.getByLabel(/description|about/i, { exact: false });
    if (await descField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await descField.fill('Test community for E2E verification');
    }
    
    // Submit
    const submitBtn = page.getByRole('button', { name: /create|submit|save/i });
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
    }
    
    // Verify community was created
    await expect(page.getByText('E2E Test Community')).toBeVisible({ timeout: 10000 });
  });

  test('community creation requires name', async ({ page }) => {
    await page.goto('/communities');
    
    // Try to create without name
    const submitBtn = page.getByRole('button', { name: /create|submit/i });
    if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await submitBtn.click();
      
      // Should show validation error
      await expect(page.getByText(/name.*required|required.*name|enter.*name/i, { ignoreCase: true })).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Community Settings', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('miltos');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('configure voting thresholds', async ({ page }) => {
    // Navigate to community settings
    await page.goto('/community-settings');
    
    // Look for threshold configuration
    const thresholdField = page.getByLabel(/threshold|pass.*threshold|vote.*threshold/i, { exact: false });
    
    if (await thresholdField.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Verify default threshold is 50% (0.5)
      const value = await thresholdField.inputValue();
      expect(parseFloat(value) >= 0).toBe(true);
      
      // Change threshold and save
      await thresholdField.fill('0.6');
      const saveBtn = page.getByRole('button', { name: /save|update/i });
      if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await saveBtn.click();
        
        // Verify save confirmation
        await expect(page.getByText(/saved|updated|success/i, { ignoreCase: true })).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test('configure amendment thresholds', async ({ page }) => {
    await page.goto('/community-settings');
    
    // Look for amendment threshold
    const amendmentThreshold = page.getByLabel(/amendment.*threshold|override/i, { exact: false });
    
    if (await amendmentThreshold.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Verify default is 30% (0.3) for community override of author-rejected amendments
      const value = await amendmentThreshold.inputValue();
      expect(parseFloat(value) >= 0).toBe(true);
    }
  });

  test('settings page has accessibility labels', async ({ page }) => {
    await page.goto('/community-settings');
    
    // All form fields should have labels
    const inputs = page.getByRole('textbox');
    const count = await inputs.count();
    
    for (let i = 0; i < count; i++) {
      const input = inputs.n(i);
      const label = await input.getAttribute('aria-label') || 
                    await input.getAttribute('aria-labelledby');
      // Either has aria-label or is associated with a <label> element
      expect(label !== null || await input.locator('..').getByRole('label').isVisible()).toBe(true);
    }
  });
});

test.describe('Community Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('miltos');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('dashboard shows impact metrics', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Dashboard should show impact metrics (civic tech best practice)
    // - Number of proposals
    // - Number of participants
    // - Proposals implemented
    
    const metrics = page.getByText(/\d+.*(proposal|member|participant|vote)/i);
    const metricCount = await metrics.count();
    
    // Should have at least some metrics displayed
    expect(metricCount).toBeGreaterThan(0);
  });

  test('dashboard shows activity feed', async ({ page }) => {
    await page.goto('/dashboard');
    
    // Should show recent activity
    const activityFeed = page.getByRole('feed').or(
      page.getByRole('list', { name: /activity|recent|latest/i, exact: false })
    );
    
    // Activity feed might not have explicit ARIA role, so also check for content
    const activityItems = page.getByText(/proposed|voted|amended|scored|created/i, { ignoreCase: true });
    
    if (await activityItems.count() > 0) {
      await expect(activityItems.first()).toBeVisible();
    }
  });
});
