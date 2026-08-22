/**
 * The institutional idiom of the signed-out pages, in one place.
 *
 * These lived as local constants in auth-page.tsx while it was the only
 * signed-out page. Password reset, address confirmation and unsubscribe are
 * now signed-out pages too, and they are reached at exactly the moments
 * someone is most likely to doubt the message is genuine — a link from an
 * email, in a browser where they are not logged in. A confirmation page that
 * looks nothing like the platform reads as a phishing page.
 *
 * Tokens only, 120ms colour transitions, matching the rest of the platform.
 */

export const EYEBROW =
  "text-xs uppercase tracking-[0.14em] font-semibold text-ink-faint";

export const BUTTON_BASE =
  "inline-flex w-full items-center justify-center gap-2 rounded-sm px-6 py-2.5 text-sm font-medium transition-colors duration-[120ms] disabled:cursor-not-allowed disabled:opacity-50";

export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-ink text-paper hover:bg-kyanos-deep`;

export const BUTTON_SECONDARY = `${BUTTON_BASE} border border-ink bg-surface text-ink hover:bg-sunken`;

export const LINK_CLASS =
  "text-sm text-kyanos transition-colors duration-[120ms] hover:underline underline-offset-2";

export const INPUT_CLASS =
  "h-10 rounded-sm border-line bg-paper text-sm text-ink placeholder:text-ink-faint transition-colors duration-[120ms] focus-visible:ring-1 focus-visible:ring-kyanos focus-visible:border-line-strong";

export const CHECKBOX_CLASS =
  "mt-0.5 h-4 w-4 rounded-[2px] border border-ink bg-paper data-[state=checked]:bg-ink data-[state=checked]:text-paper";
