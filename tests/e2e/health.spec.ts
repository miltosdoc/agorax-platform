import { test, expect } from '@playwright/test';

test.describe('Health Check', () => {
  test('should return healthy status', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    expect(body.status).toBe('ok');
    expect(body.uptime).toBeDefined();
    expect(body.memory).toBeDefined();
    expect(body.version).toBeDefined();
  });
});
