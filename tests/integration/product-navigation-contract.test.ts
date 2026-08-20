/**
 * Product navigation contract tests.
 *
 * AgoraX primary UX is proposals/deliberation. Legacy polls are the final
 * ratification mechanism, not the main application surface.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSource = readFileSync(resolve(process.cwd(), 'client/src/App.tsx'), 'utf8');
const headerSource = readFileSync(resolve(process.cwd(), 'client/src/components/layout/header.tsx'), 'utf8');
const bottomNavSource = readFileSync(resolve(process.cwd(), 'client/src/components/layout/bottom-nav.tsx'), 'utf8');

describe('product navigation contract', () => {
  it('does not make legacy poll creation the primary header CTA', () => {
    expect(headerSource).not.toContain("t('nav.newPoll')");
    expect(headerSource).not.toContain('data-testid="button-new-poll"');
    expect(headerSource).toContain("navigate(\"/proposals/new\")");
  });

  it('does not expose My Polls as a primary account menu item', () => {
    expect(headerSource).not.toContain("navigate(\"/my-polls\")");
    expect(headerSource).not.toContain("t('nav.myPolls')");
  });

  it('uses proposal creation as the mobile create action', () => {
    expect(bottomNavSource).not.toContain('path: "/polls/create"');
    expect(bottomNavSource).not.toContain('hasDropdown: true');
    expect(bottomNavSource).not.toContain('handleCreatePoll');
    expect(bottomNavSource).toContain('path: "/proposals/new"');
  });

  it('does not route authenticated users into legacy poll management screens', () => {
    expect(appSource).not.toContain('component={MyPollsPage}');
    expect(appSource).not.toContain('component={PollCreatePage}');
    // Legacy /surveys/create + /surveys/:id/edit stay redirected; the
    // polling MODULE pages (pages/survey-*.tsx) are a different product
    // and are allowed.
    expect(appSource).toContain('path="/surveys/create"');
    expect(appSource).toContain('<Redirect to="/proposals/new" />');
  });
});
