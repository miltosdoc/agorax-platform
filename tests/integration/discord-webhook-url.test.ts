import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { normalizeWebhookUrl } from '../../server/utils/discord';

const ID = '123456789012345678';
const TOKEN = 'aBcD_ef-GhIjKlMnOpQrStUvWxYz0123456789abcdefghijklmnopqrstu';

describe('Discord webhook URL check', () => {
  it('accepts the URL Discord copies, in its variants, and canonicalises it', () => {
    const canonical = `https://discord.com/api/webhooks/${ID}/${TOKEN}`;
    expect(normalizeWebhookUrl(canonical)).toBe(canonical);
    expect(normalizeWebhookUrl(`  https://discordapp.com/api/webhooks/${ID}/${TOKEN}/  `)).toBe(canonical);
    expect(normalizeWebhookUrl(`https://canary.discord.com/api/v10/webhooks/${ID}/${TOKEN}?wait=true`)).toBe(canonical);
  });

  it('rejects anything that is not a Discord webhook', () => {
    for (const bad of [
      `http://discord.com/api/webhooks/${ID}/${TOKEN}`,
      `https://discord.com.evil.example/api/webhooks/${ID}/${TOKEN}`,
      `https://evil.example/https://discord.com/api/webhooks/${ID}/${TOKEN}`,
      `https://discord.com/api/webhooks/${ID}`,
      `https://discord.com/api/webhooks/abc/${TOKEN}`,
      `https://169.254.169.254/latest/meta-data`,
      '',
      42,
      null,
    ]) {
      expect(normalizeWebhookUrl(bad)).toBeNull();
    }
  });
});
