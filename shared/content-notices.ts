import { z } from 'zod';

export type ContentNoticeStatus = 'received' | 'under_review' | 'decided';
export type ContentNoticeEmailStatus = 'sent' | 'unavailable' | 'failed';
export type ContentNoticeOutcome = 'no_action' | 'action_taken' | 'more_information';
export interface ContentNoticeDecision {
  outcome: ContentNoticeOutcome;
  reason: string;
  basis: string;
  measure: string | null;
  decidedAt: string;
}
export interface ContentNoticeReceipt {
  reference: string;
  trackingToken: string;
  emailStatus: ContentNoticeEmailStatus;
}
export interface ContentNoticePublicStatus {
  reference: string;
  status: ContentNoticeStatus;
  createdAt: string;
  updatedAt: string;
  decision?: ContentNoticeDecision;
  emailStatus: ContentNoticeEmailStatus;
}
export interface ContentNoticeAdmin extends ContentNoticePublicStatus {
  contentUrl: string;
  name: string | null;
  email: string | null;
  explanation: string;
  goodFaith: boolean;
  category: 'illegal_content' | 'child_safety';
  locale: 'el' | 'en';
  relatedReference: string | null;
  affectedUserId: number | null;
  reviewedBy: number | null;
  history: Array<{ id: number; event: string; actorUserId: number | null; details: Record<string, unknown>; createdAt: string }>;
  emailAttempts: Array<{ id: number; kind: 'acknowledgement' | 'decision' | 'affected_user'; status: 'pending' | ContentNoticeEmailStatus; createdAt: string; finishedAt: string | null }>;
}
export interface ContentNoticeAdminList { notices: ContentNoticeAdmin[]; total: number; pending: number }

const optionalText = (max: number) => z.string().trim().max(max).optional().transform(value => value || undefined);
export const contentNoticeSubmissionSchema = z.object({
  contentUrl: z.string().trim().min(1).max(2048),
  name: optionalText(200),
  email: optionalText(254).refine(value => !value || z.string().email().safeParse(value).success, 'Invalid email'),
  explanation: z.string().trim().min(20).max(12000),
  goodFaith: z.literal(true),
  locale: z.enum(['el', 'en']),
  category: z.enum(['illegal_content', 'child_safety']).default('illegal_content'),
  relatedReference: optionalText(36).refine(value => !value || z.string().uuid().safeParse(value).success, 'Invalid reference'),
}).strict().superRefine((value, context) => {
  // DSA Article 16(2)(c): identity/contact may be omitted for suspected
  // offences under Articles 3–7 of Directive 2011/93/EU.
  if (value.category !== 'child_safety') {
    if (!value.name) context.addIssue({ code: 'custom', path: ['name'], message: 'Name is required' });
    if (!value.email) context.addIssue({ code: 'custom', path: ['email'], message: 'Email is required' });
  }
});
export type ContentNoticeSubmission = z.infer<typeof contentNoticeSubmissionSchema>;

export const contentNoticeLookupSchema = z.object({
  reference: z.string().trim().uuid(),
  trackingToken: z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/),
}).strict();
export const contentNoticeReviewSchema = contentNoticeLookupSchema.extend({
  explanation: z.string().trim().min(20).max(12000),
});
export const contentNoticeAdminDecisionSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('under_review') }).strict(),
  z.object({
    status: z.literal('decided'),
    outcome: z.enum(['no_action', 'action_taken', 'more_information']),
    reason: z.string().trim().min(20).max(8000),
    basis: z.string().trim().min(3).max(4000),
    measure: optionalText(4000),
    affectedUserId: z.number().int().positive().optional(),
  }).strict(),
]).superRefine((value, context) => {
  if (value.status === 'decided' && value.outcome === 'action_taken' && (!value.measure || value.measure.length < 10)) {
    context.addIssue({ code: 'custom', path: ['measure'], message: 'Describe the measure already performed (at least 10 characters)' });
  }
});
export type ContentNoticeAdminDecision = z.infer<typeof contentNoticeAdminDecisionSchema>;

/** A local locator only. Never fetch reported URLs on the server. */
export function normalizeContentNoticeUrl(input: string, configuredPublicUrl: string): string | null {
  if (input.length > 2048 || /[\u0000-\u0020\u007f\\]/.test(input)) return null;
  if (!input.startsWith('/') && !/^https?:\/\//i.test(input)) return null;
  if (input.startsWith('//')) return null;
  try {
    const base = new URL(configuredPublicUrl);
    const url = new URL(input, base.origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== base.origin || url.username || url.password) return null;
    // A local path must stay local when reused as an href. Dot-segment
    // normalization can turn /..//host into a protocol-relative locator.
    if (url.pathname.startsWith('//')) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}
