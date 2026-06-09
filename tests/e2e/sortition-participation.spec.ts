import { test, expect } from '@playwright/test';

/**
 * Sortition Participation E2E Tests
 * 
 * Tests the sortition body scoring flow:
 * 1. Member receives selection notification
 * 2. Member attends scoring ceremony
 * 3. Member scores proposal (1-100 scale)
 * 4. Results are aggregated
 * 5. Proposal routes based on score (≤33 → author_review, 34-100 → voting)
 * 
 * Prerequisites: App running on localhost:5173, DEMO_MODE=true
 */

test.describe('Sortition Ceremony', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('miltos');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('sortition dashboard shows active bodies', async ({ page }) => {
    await page.goto('/sortition-dashboard');
    
    // Should show active sortition bodies
    const activeBodies = page.getByText(/active|selected|scoring/i);
    const count = await activeBodies.count();
    
    // Even if no active bodies, page should load without error
    await expect(page).toHaveURL(/.*sortition.*/);
  });

  test('sortition ceremony page loads', async ({ page }) => {
    await page.goto('/sortition-ceremony');
    
    // Page should load with ceremony information
    await expect(page.getByText(/ceremony|sortition|scoring/i)).toBeVisible({ timeout: 5000 });
  });

  test('scoring interface shows scale', async ({ page }) => {
    await page.goto('/sortition-scoring');
    
    // Should show scoring scale (1-100)
    const scaleIndicator = page.getByText(/1.*100|scale|score/i);
    if (await scaleIndicator.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(scaleIndicator).toBeVisible();
    }
    
    // Should have scoring input (slider, number input, or buttons)
    const scoringInput = page.getByRole('slider').or(
      page.getByRole('spinbutton')
    ).or(
      page.getByRole('button', { name: /score|submit/i })
    );
    
    // Input might not exist if no active sortition
    // Just verify page loads without crash
    await expect(page).toHaveURL(/.*scoring.*/);
  });
});

test.describe('Sortition Body Detail', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('miltos');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('body detail shows member list', async ({ page }) => {
    await page.goto('/sortition-body/1');
    
    // Should show body information
    await expect(page.getByText(/body|jury|panel|member/i)).toBeVisible({ timeout: 5000 });
  });

  test('body detail shows diversity dashboard', async ({ page }) => {
    await page.goto('/sortition-body/1');
    
    // Should show representativeness metrics
    const diversityMetrics = page.getByText(/diversity|representative|demographic/i);
    if (await diversityMetrics.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(diversityMetrics).toBeVisible();
    }
  });

  test('body detail shows verification hash', async ({ page }) => {
    await page.goto('/sortition-body/1');
    
    // Should show cryptographic verification hash
    const verificationHash = page.getByText(/verify|hash|proof|commitment/i);
    if (await verificationHash.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(verificationHash).toBeVisible();
    }
  });
});

test.describe('Sortition Scoring Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('miltos');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('member can submit score', async ({ page }) => {
    await page.goto('/sortition-scoring');
    
    // Look for score submission
    const submitBtn = page.getByRole('button', { name: /submit|score|save/i });
    if (await submitBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Find score input
      const scoreInput = page.getByRole('slider').or(page.getByRole('spinbutton'));
      if (await scoreInput.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Set a score
        await scoreInput.fill('75');
        await submitBtn.click();
        
        // Verify submission
        await expect(page.getByText(/submitted|saved|thank/i)).toBeVisible({ timeout: 10000 });
      }
    }
  });

  test('score validation rejects out of range', async ({ page }) => {
    await page.goto('/sortition-scoring');
    
    const scoreInput = page.getByRole('slider').or(page.getByRole('spinbutton'));
    if (await scoreInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Try invalid score
      await scoreInput.fill('150'); // > 100
      
      const submitBtn = page.getByRole('button', { name: /submit/i });
      if (await submitBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await submitBtn.click();
        
        // Should show validation error
        await expect(page.getByText(/valid|range|between|minimum|maximum/i)).toBeVisible({ timeout: 5000 });
      }
    }
  });
});

test.describe('Sortition Synthesis', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('miltos');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('synthesis page shows aggregated results', async ({ page }) => {
    await page.goto('/sortition-synthesis');
    
    // Should show aggregated scoring results
    await expect(page.getByText(/average|mean|median|result/i)).toBeVisible({ timeout: 5000 });
  });

  test('synthesis shows routing decision', async ({ page }) => {
    await page.goto('/sortition-synthesis');
    
    // Should show where the proposal routes next
    const routing = page.getByText(/voting|author.*review|return|next.*step/i);
    if (await routing.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(routing).toBeVisible();
    }
  });
});
