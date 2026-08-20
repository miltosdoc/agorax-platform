/** Server-only: compute SHA-256 hash of consent text. */
import { createHash } from 'node:crypto';
import { CONSENT_TEXT, type ConsentLocale } from '../../shared/consent';

export function consentTextHash(locale: ConsentLocale): string {
  return createHash('sha256').update(CONSENT_TEXT[locale], 'utf8').digest('hex');
}
