/**
 * Profile/settings page contract tests.
 *
 * The user account surface must exist as a real, visible settings page. It must
 * not depend on the old poll product and it should remain reachable as part of
 * the core AgoraX civic workflow.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'client/src/App.tsx'), 'utf8');
const profileSource = readFileSync(resolve(process.cwd(), 'client/src/pages/profile-page.tsx'), 'utf8');

describe('profile/settings page contract', () => {
  it('registers /profile as a protected application route', () => {
    expect(appSource).toContain('<ProtectedRoute path="/profile" component={ProfilePage} />');
  });

  it('renders a visible account settings page shell', () => {
    expect(profileSource).toContain('data-testid="page-profile-settings"');
    expect(profileSource).toContain("t('profile.accountSettings')");
    expect(profileSource).toContain("t('profile.identityVerification')");
    // Note: the "participationSettings" card was removed in the GDPR data-
    // minimisation pass — it only held a no-op "Update Location" button
    // after the user-location vertical was dropped (migration 0014).
  });

  it('does not use legacy poll language or old admin-account framing', () => {
    expect(profileSource).not.toMatch(/poll/i);
    expect(profileSource).not.toContain("t('admin.manageAccounts')");
  });
});
