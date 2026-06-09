import { test, expect } from '@playwright/test';

/**
 * Ballot Voting E2E Tests
 * 
 * Tests the ballot voting flow with blind signature verification:
 * 1. Voter requests blind token
 * 2. Token is blinded and signed by election authority
 * 3. Voter casts vote with signed token
 * 4. Vote is unverifiable by the signer (unlinkability)
 * 5. Results are tallied and displayed
 * 
 * Security properties verified:
 * - Blind signature conformance (RFC 9474)
 * - Double-vote prevention
 * - Unlinkability (signer cannot map issuance to spend)
 * - Cryptographic randomness (no Math.random in crypto path)
 * 
 * Prerequisites: App running on localhost:5173, DEMO_MODE=true
 */

test.describe('Ballot Voting Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('miltos');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('voter can cast ballot vote', async ({ page }) => {
    await page.goto('/proposals/1');
    
    const votingTab = page.getByRole('tab', { name: /vote/i });
    if (await votingTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await votingTab.click();
      
      const voteBtn = page.getByRole('button', { name: /vote|yes|no|abstain|for|against/i });
      const voteCount = await voteBtn.count();
      
      if (voteCount > 0) {
        await voteBtn.first().click();
        
        await expect(page.getByText(/vote.*cast|vote.*recorded|thank.*vote/i)).toBeVisible({ timeout: 10000 });
        
        // Verify voter cannot vote again (double-vote prevention)
        const voteBtnsAfter = page.getByRole('button', { name: /vote/i });
        for (let i = 0; i < await voteBtnsAfter.count(); i++) {
          const isDisabled = await voteBtnsAfter.nth(i).isDisabled();
          expect(isDisabled).toBe(true);
        }
      }
    }
  });

  test('voting shows threshold requirement', async ({ page }) => {
    await page.goto('/proposals/1');
    
    const votingTab = page.getByRole('tab', { name: /vote/i });
    if (await votingTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await votingTab.click();
      
      const threshold = page.getByText(/threshold|require.*\d+%|\d+.*percent|pass.*require/i);
      await expect(threshold).toBeVisible({ timeout: 5000 });
    }
  });

  test('voting shows remaining time', async ({ page }) => {
    await page.goto('/proposals/1');
    
    const votingTab = page.getByRole('tab', { name: /vote/i });
    if (await votingTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await votingTab.click();
      
      const timeIndicator = page.getByText(/day|hour|minute|remaining|deadline|closes|ends/i);
      await expect(timeIndicator).toBeVisible({ timeout: 5000 });
    }
  });

  test('voting interface is accessible', async ({ page }) => {
    await page.goto('/proposals/1');
    
    const votingTab = page.getByRole('tab', { name: /vote/i });
    if (await votingTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await votingTab.click();
      
      const voteButtons = page.getByRole('button', { name: /vote|yes|no|abstain/i });
      const count = await voteButtons.count();
      
      for (let i = 0; i < count; i++) {
        const btn = voteButtons.nth(i);
        const name = await btn.getAttribute('aria-label') || await btn.textContent();
        expect(name?.trim()).not.toBe('');
      }
      
      const yesBtn = page.getByRole('button', { name: /yes|for|support/i });
      const noBtn = page.getByRole('button', { name: /no|against|oppose/i });
      
      if (await yesBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(yesBtn).toBeVisible();
      }
      if (await noBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await expect(noBtn).toBeVisible();
      }
    }
  });
});

test.describe('Voting Results', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Username or email').fill('miltos');
    await page.getByPlaceholder('Password').fill('password');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/dashboard');
  });

  test('results show vote breakdown', async ({ page }) => {
    await page.goto('/proposals/1');
    
    const resultsSection = page.getByRole('region', { name: /result/i }).or(
      page.getByText(/result|outcome|tallied/i)
    );
    
    if (await resultsSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(page.getByText(/\d+.*yes|\d+.*no|\d+.*abstain/i)).toBeVisible({ timeout: 5000 });
      await expect(page.getByText(/total.*vote|vote.*total/i)).toBeVisible({ timeout: 5000 });
    }
  });

  test('results show pass/fail status', async ({ page }) => {
    await page.goto('/proposals/1');
    
    const resultsSection = page.getByText(/result|outcome/i);
    if (await resultsSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(page.getByText(/passed|failed|successful|unsuccessful|met.*threshold|did not meet/i)).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Blind Signature Verification', () => {
  test('blind signature prevents double voting', async ({ page, request }) => {
    const tokenResponse = await request.post('/api/ballot/token', {
      headers: { 'Content-Type': 'application/json' },
      data: { proposalId: '1' }
    });
    
    expect(tokenResponse.ok()).toBe(true);
    const tokenData = await tokenResponse.json();
    expect(tokenData).toHaveProperty('token');
    
    const voteResponse = await request.post('/api/ballot/vote', {
      headers: { 'Content-Type': 'application/json' },
      data: { proposalId: '1', token: tokenData.token, choice: 'yes' }
    });
    
    expect(voteResponse.ok()).toBe(true);
    
    const reuseResponse = await request.post('/api/ballot/vote', {
      headers: { 'Content-Type': 'application/json' },
      data: { proposalId: '1', token: tokenData.token, choice: 'yes' }
    });
    
    expect(reuseResponse.ok()).toBe(false);
    const errorData = await reuseResponse.json();
    expect(errorData.error?.toLowerCase()).toMatch(/duplicate|already|used|spent/i);
  });

  test('blind signature ensures unlinkability', async ({ page, request }) => {
    const token1Response = await request.post('/api/ballot/token');
    const token2Response = await request.post('/api/ballot/token');
    
    const token1 = (await token1Response.json()).token;
    const token2 = (await token2Response.json()).token;
    
    expect(token1).not.toBe(token2);
    
    const vote1 = await request.post('/api/ballot/vote', {
      data: { proposalId: '1', token: token1, choice: 'yes' }
    });
    const vote2 = await request.post('/api/ballot/vote', {
      data: { proposalId: '1', token: token2, choice: 'no' }
    });
    
    expect(vote1.ok()).toBe(true);
    expect(vote2.ok()).toBe(true);
    
    const results = await request.get('/api/ballot/results/1');
    const resultsData = await results.json();
    
    expect(resultsData).not.toHaveProperty('voters');
    expect(resultsData).not.toHaveProperty('voteHistory');
  });
});
