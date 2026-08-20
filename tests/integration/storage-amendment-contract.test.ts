import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Storage Amendment Contract', () => {
  const amendmentStorage = readFileSync(
    join(__dirname, '../../server/storage/amendments.ts'),
    'utf8'
  );

  it('exposes getAmendment in AmendmentRepository', () => {
    expect(amendmentStorage).toMatch(/getAmendment/);
  });

  it('implements getAmendment in AmendmentRepository', () => {
    expect(amendmentStorage).toMatch(/async getAmendment/);
  });
});
