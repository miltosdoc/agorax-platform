/** The author's pasted words win over the model's near-copy (server/utils/proposal-compiler.ts). */
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../server/utils/llm-client', () => ({ chatCompletion: vi.fn(), LlmUnavailableError: class extends Error {} }));
const { restoreVerbatim } = await import('../../server/utils/proposal-compiler');

const paste = Array.from({ length: 60 }, (_, i) => `λέξη${i}`).join(' ') + ' ούτω καθεξής, τέλος.';

describe('restoreVerbatim', () => {
  it('puts back a word the model changed', () => {
    expect(restoreVerbatim(paste, paste.replace('καθεξής', 'καθεξώς'))).toBe(paste);
  });
  it('finds the paste after a line of instruction', () => {
    expect(restoreVerbatim(`Ψηφοφορία για αυτό:\n${paste}`, paste.replace('καθεξής', 'καθεξώς'))).toBe(paste);
  });
  it('finds one article in the middle of the paste', () => {
    const middle = paste.split(' ').slice(10, 40).join(' ');
    expect(restoreVerbatim(paste, middle.replace('λέξη20', 'λεξη20'))).toBe(middle);
  });
  it('leaves a real rewrite alone', () => {
    const rewrite = Array.from({ length: 30 }, (_, i) => `άλλο${i}`).join(' ');
    expect(restoreVerbatim(paste, rewrite)).toBe(rewrite);
  });
});
