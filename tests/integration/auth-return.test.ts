import { describe, expect, it } from 'vitest';
import { safeAuthReturnTo } from '../../client/src/lib/auth-return';

describe('authentication return destination', () => {
  it('preserves the local destination with its query and fragment', () => {
    expect(safeAuthReturnTo('/proposals/new?kind=poll#answers')).toBe('/proposals/new?kind=poll#answers');
    expect(safeAuthReturnTo('/surveys/42/edit')).toBe('/surveys/42/edit');
  });

  it('falls back for external, malformed and authentication-loop destinations', () => {
    for (const destination of [undefined, null, '', 'https://other.example/path', '//other.example/path', '/\\other.example/path', 'javascript:alert(1)', '/feed\n', '/auth?returnTo=/auth', '/auth/google']) {
      expect(safeAuthReturnTo(destination)).toBe('/feed');
    }
  });

  it('resolves local dot segments without losing the requested workflow', () => {
    expect(safeAuthReturnTo('/communities/../proposals/new?kind=poll')).toBe('/proposals/new?kind=poll');
  });
});
