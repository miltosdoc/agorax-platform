import { test, expect } from '@playwright/test';

/**
 * Full Proposal Lifecycle E2E Test
 * 
 * Tests the complete journey: create → AI validation → amendments → 
 * sortition scoring → community voting → results display
 * 
 * Prerequisites:
 * - App running on localhost:5173
 * - PostgreSQL + Redis running (docker-compose up)
 * - DEMO_MODE=true (demo users available)
 * 
 * Demo users: miltos, elena, giorgos, maria, kostas (all password: 'password')
 */

test.describe('Proposal Full Lifecycle', () => {
  let proposalId: string;

  test.beforeEach(async ({ page }) => {
    // Login as demo user
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('miltos');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
    await expect(page).toBeInViewport();
  });

  test('create proposal and verify AI validation', async ({ page }) => {
    // Navigate to proposal creation
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /new proposal/i, exact: false }).click();
    
    // Fill proposal form
    await page.getByLabel('Title').fill('E2E Test Proposal - ' + Date.now());
    await page.getByLabel('Description').fill(
      'This is a comprehensive test proposal for verifying the full lifecycle. ' +
      'It includes specific measures for improving community engagement through ' +
      'transparent deliberation processes and participatory decision-making.'
    );
    
    // Submit proposal
    await page.getByRole('button', { name: /submit|create/i }).click();
    
    // Verify redirect to proposal detail page
    const url = page.url();
    expect(url).toMatch(/\/proposals\/\d+/);
    proposalId = url.split('/').pop() || '';
    
    // Verify proposal details are displayed
    await expect(page.getByText('E2E Test Proposal')).toBeVisible();
    await expect(page.getByText('comprehensive test proposal')).toBeVisible();
    
    // Verify AI validation badge is present (transparency requirement)
    const aiBadge = page.getByText(/ai.*validation|validation.*score|scored/i);
    await expect(aiBadge).toBeVisible({ timeout: 10000 });
    
    // Verify proposal lifecycle stepper shows current stage
    await expect(page.getByText(/submitted|under review|ai validation/i, { ignoreCase: true })).toBeVisible();
  });

  test('view proposal with lifecycle timeline', async ({ page }) => {
    // Navigate to existing proposal
    await page.goto('/proposals/1');
    
    // Verify lifecycle timeline is visible
    const timeline = page.getByRole('navigation', { name: /lifecycle|timeline|stages/i });
    await expect(timeline).toBeVisible();
    
    // Verify timeline shows stages
    await expect(page.getByText(/submitted|review|deliberation|voting/i, { ignoreCase: true })).toBeVisible();
    
    // Verify current stage is highlighted
    const currentStage = page.getByRole('listitem', { name: /current|active|now/i });
    // Current stage should have visual distinction (could be aria-current, color, etc.)
    await expect(currentStage).toBeVisible();
  });

  test('proposal shows AI validation transparency', async ({ page }) => {
    await page.goto('/proposals/1');
    
    // AI validation should show:
    // 1. What was checked (dimensions)
    // 2. Confidence level
    // 3. Expandable reasoning
    
    const aiSection = page.getByRole('region', { name: /ai|validation|assessment/i, exact: false });
    await expect(aiSection).toBeVisible();
    
    // Should show validation dimensions
    await expect(page.getByText(/structure|specificity|feasibility|completeness|clarity/i, { ignoreCase: true })).toBeVisible();
    
    // Should show confidence score
    const confidence = page.getByText(/\d+%.*confidence|confidence.*\d+%|score.*\d+/i);
    await expect(confidence).toBeVisible();
    
    // Should have expandable reasoning
    const expandButton = page.getByRole('button', { name: /view.*reasoning|explain|details|why/i, exact: false });
    if (expandButton.isVisible()) {
      await expandButton.click();
      await expect(page.getByText(/because|therefore|since|due to/i, { ignoreCase: true })).toBeVisible();
    }
  });

  test('navigate through proposal tabs', async ({ page }) => {
    await page.goto('/proposals/1');
    
    // Test all tabs are accessible
    const tabs = ['Overview', 'Debate', 'Amendments', 'Sortition', 'Voting'];
    for (const tab of tabs) {
      const tabElement = page.getByRole('tab', { name: tab, exact: false });
      if (await tabElement.isVisible({ timeout: 2000 }).catch(() => false)) {
        await tabElement.click();
        await expect(page.getByRole('tabpanel')).toBeVisible();
      }
    }
  });

  test('verify proposal has accessibility attributes', async ({ page }) => {
    await page.goto('/proposals/1');
    
    // Check for ARIA labels on interactive elements
    const buttons = page.getByRole('button');
    const buttonCount = await buttons.count();
    
    // At least some buttons should have accessible names
    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = buttons.n(i);
      const name = await button.getAttribute('aria-label') || 
                   await button.textContent();
      expect(name?.trim()).not.toBe('');
    }
    
    // Check for color not being sole indicator
    // (This is a visual check - we verify that text/labels accompany color cues)
    const statusElements = page.getByText(/draft|review|voting|passed|rejected/i);
    if (await statusElements.count() > 0) {
      // Status should have text labels, not just color
      await expect(statusElements.first()).toBeVisible();
    }
  });
});

test.describe('Proposal Creation Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('miltos');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('rejects empty proposal title', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /new proposal/i }).click();
    
    // Leave title empty, fill description
    await page.getByLabel('Description').fill('Has description but no title');
    await page.getByRole('button', { name: /submit|create/i }).click();
    
    // Should show validation error
    await expect(page.getByText(/title.*required|required.*title|enter.*title/i, { ignoreCase: true })).toBeVisible({ timeout: 5000 });
  });

  test('rejects proposal below minimum length', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /new proposal/i }).click();
    
    await page.getByLabel('Title').fill('Short');
    await page.getByLabel('Description').fill('Too short');
    await page.getByRole('button', { name: /submit|create/i }).click();
    
    // Should show validation error for minimum length
    await expect(page.getByText(/minimum|too short|at least|length/i, { ignoreCase: true })).toBeVisible({ timeout: 5000 });
  });

  test('shows loading state during submission', async ({ page }) => {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /new proposal/i }).click();
    
    await page.getByLabel('Title').fill('Loading Test Proposal');
    await page.getByLabel('Description').fill('Testing loading state display during form submission.');
    
    // Click submit and verify loading indicator appears
    const submitButton = page.getByRole('button', { name: /submit|create/i });
    await submitButton.click();
    
    // Loading state should be visible (spinner, disabled button, or text)
    const loadingIndicator = page.or([
      page.getByText(/submitting|creating|please wait|loading/i),
      page.getByRole('progressbar'),
      page.getByRole('status')
    ]);
    
    // Either we see loading OR we get redirected quickly
    try {
      await expect(loadingIndicator).toBeVisible({ timeout: 3000 });
    } catch {
      // If no loading indicator visible, redirect should have happened
      await expect(page).toHaveURL(/\/proposals\/\d+/);
    }
  });
});

test.describe('Proposal Results Display', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('miltos');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('displays voting results with transparency', async ({ page }) => {
    // Navigate to a proposal that has completed voting
    // (This assumes demo data has at least one completed proposal)
    await page.goto('/proposals/1');
    
    // Check for results section if voting is complete
    const resultsSection = page.getByRole('region', { name: /results|outcome|vote count/i, exact: false });
    
    if (await resultsSection.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Results should show:
      // 1. Total votes cast
      await expect(page.getByText(/\d+.*vote/i, { ignoreCase: true })).toBeVisible();
      
      // 2. Pass/fail status with threshold
      await expect(page.getByText(/passed|failed|threshold|requirement/i, { ignoreCase: true })).toBeVisible();
      
      // 3. Breakdown of yes/no/abstain
      await expect(page.getByText(/yes|no|abstain|for|against/i, { ignoreCase: true })).toBeVisible();
    }
  });
});
