import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { useTranslation } from "@/hooks/use-translation";

/**
 * Where the newsletter double opt-in link lands.
 *
 * The token is read from the query string and spent immediately; it is never
 * put in a link on this page, logged, or echoed back into the DOM, so it does
 * not leak through a Referer header to anything the page later loads.
 */
export default function NewsletterConfirmPage() {
  const { t } = useTranslation();
  const [state, setState] = useState<"working" | "ok" | "failed">("working");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setState("failed");
      return;
    }
    let cancelled = false;
    fetch(`/api/newsletter/confirm?token=${encodeURIComponent(token)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: { ok: boolean }) => {
        if (!cancelled) setState(data.ok ? "ok" : "failed");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <AppShell breadcrumb={[{ label: t('footer.newsletterTitle') }]}>
      <div className="mx-auto max-w-lg rounded-sm border border-line bg-surface px-6 py-14 text-center">
        {state === "working" && (
          <>
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-ink-faint" aria-hidden="true" />
            <p className="text-sm text-ink-soft">{t('common.loading')}</p>
          </>
        )}
        {state === "ok" && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-8 w-8 text-yper" aria-hidden="true" />
            <h1 className="font-serif text-2xl text-ink">{t('newsletter.confirmedTitle')}</h1>
            <p className="mx-auto mt-2 max-w-[40ch] text-sm leading-relaxed text-ink-soft">
              {t('newsletter.confirmedBody')}
            </p>
          </>
        )}
        {state === "failed" && (
          <>
            <XCircle className="mx-auto mb-4 h-8 w-8 text-kata" aria-hidden="true" />
            <h1 className="font-serif text-2xl text-ink">{t('newsletter.failedTitle')}</h1>
            <p className="mx-auto mt-2 max-w-[40ch] text-sm leading-relaxed text-ink-soft">
              {t('newsletter.failedBody')}
            </p>
          </>
        )}
        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center rounded-sm bg-ink px-4 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
        >
          {t('nav.home')}
        </Link>
      </div>
    </AppShell>
  );
}
