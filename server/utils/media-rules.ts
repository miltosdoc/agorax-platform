/**
 * Shared upload rules for user-submitted media, used by both the
 * proposal-media router and the community-library router so the two
 * pipelines can never drift apart.
 *
 * Size is the only enforced limit (same 120MB ceiling for audio and
 * video). Duration is still probed and stored so the UI can display it,
 * but is no longer a rejection reason — the uploader decides what length
 * makes sense for their content.
 */

import { createHash } from 'crypto';
import path from 'path';

export const MEDIA_ROOT = process.env.AGORAX_MEDIA_DIR
  || path.resolve(process.cwd(), 'uploads', 'media');

export const LIMITS = {
  podcast: {
    maxBytes: 120 * 1024 * 1024,
    mimes: new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a']),
    exts: new Set(['.mp3', '.m4a']),
  },
  video: {
    maxBytes: 120 * 1024 * 1024,
    mimes: new Set(['video/mp4', 'video/quicktime']),
    exts: new Set(['.mp4', '.mov']),
  },
  document: {
    maxBytes: 25 * 1024 * 1024,
    mimes: new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.oasis.opendocument.text',
      'text/plain',
    ]),
    exts: new Set(['.pdf', '.doc', '.docx', '.odt', '.txt']),
  },
} as const;

export type Kind = keyof typeof LIMITS;

export function isKind(v: unknown): v is Kind {
  return v === 'podcast' || v === 'video' || v === 'document';
}

export function hashId(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

/**
 * decodeURIComponent that cannot throw. Client-supplied headers
 * (X-File-Name, X-Media-Title) are attacker-controlled — a malformed
 * percent sequence must degrade to the fallback, never to an unhandled
 * URIError inside an async Express handler.
 */
export function safeDecodeHeader(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  try {
    return decodeURIComponent(value);
  } catch {
    return fallback;
  }
}

/**
 * Static validation of an incoming upload (size, extension, mime).
 * Returns null when acceptable, otherwise { status, message } ready to send.
 * Podcast/video tolerate any audio/ or video/ mime prefix (browsers report
 * many variants); documents must match the allow-list exactly;
 * application/octet-stream is always tolerated.
 */
export function validateUpload(
  kind: Kind,
  byteLength: number,
  ext: string,
  mimeType: string,
): { status: number; message: string } | null {
  const limits = LIMITS[kind];
  if (byteLength > limits.maxBytes) {
    return {
      status: 413,
      message: `file too large; ${kind} max is ${Math.round(limits.maxBytes / 1024 / 1024)}MB`,
    };
  }
  if (!limits.exts.has(ext as never)) {
    return {
      status: 415,
      message: `unsupported extension ${ext || '(none)'}; expected one of ${[...limits.exts].join(', ')}`,
    };
  }
  if (mimeType && !limits.mimes.has(mimeType as never) && mimeType !== 'application/octet-stream') {
    const prefixOk = kind !== 'document'
      && (mimeType.startsWith('audio/') || mimeType.startsWith('video/'));
    if (!prefixOk) {
      return { status: 415, message: `mime ${mimeType} not allowed` };
    }
  }
  return null;
}
