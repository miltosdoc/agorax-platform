import { useState } from "react";
import { Link } from "wouter";
import { Heart, ArrowRight, Smartphone, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { useToast } from "@/hooks/use-toast";
import logoImage from "../../assets/logo.png";
import { apiRequest } from "@/lib/queryClient";
import { downloadApk } from "@/lib/download-apk";
import { LOCALE_NAMES, SUPPORTED_LOCALES } from "@/lib/i18n-types";
import { setFeedbackWidgetEnabled } from "@/components/FeedbackWidget";

/**
 * The AGORA 2026 colophon: wordmark and support block, three link columns, and
 * the newsletter sign-up, over a solid ink ground.
 *
 * The comps render this block in the design's green; here it stays on --ink
 * with Kyanós accents, which is the same shape in the platform's own colours.
 */

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-bc-ink-soft">
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="text-left text-sm text-bc-ink-soft transition-colors duration-[120ms] hover:text-paper"
      >
        {children}
      </button>
    </li>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-sm text-bc-ink-soft transition-colors duration-[120ms] hover:text-paper"
      >
        {children}
      </Link>
    </li>
  );
}

function NewsletterForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Deliberately permissive: the address is confirmed by a round-trip email,
    // so the field only has to reject obvious typos, not adjudicate RFC 5322.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast({ title: t('footer.newsletterInvalid'), variant: "destructive" });
      return;
    }
    setPending(true);
    try {
      await apiRequest("POST", "/api/newsletter/subscribe", { email: email.trim() });
      setEmail("");
      toast({ title: t('footer.newsletterThanks') });
    } catch {
      toast({ title: t('footer.newsletterFailed'), variant: "destructive" });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4" data-testid="form-newsletter">
      <div className="flex items-center gap-2 rounded-full border border-bc-line bg-bc-panel p-1 pl-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('footer.newsletterPlaceholder')}
          aria-label={t('footer.newsletterBody')}
          className="min-w-0 flex-1 bg-transparent text-sm text-paper outline-none placeholder:text-bc-ink-soft"
          data-testid="input-newsletter-email"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full bg-paper px-4 text-sm font-medium text-ink transition-colors duration-[120ms] hover:bg-sunken disabled:opacity-60"
          data-testid="button-newsletter-submit"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {t('footer.newsletterSubmit')}
        </button>
      </div>
    </form>
  );
}

export default function Footer() {
  const { t, locale, setLocale } = useTranslation();
  const { toast } = useToast();

  function openFeedback() {
    setFeedbackWidgetEnabled(true);
    toast({ title: t('feedback.toggleLabel') });
  }

  async function handleApkDownload() {
    const result = await downloadApk();
    if (result === "unavailable") {
      toast({ title: t('android.notAvailable'), variant: "destructive" });
    } else if (result === "failed") {
      toast({ title: "Download failed", variant: "destructive" });
    }
  }

  return (
    <footer className="border-t border-line-strong bg-ink text-paper">
      <div className="mx-auto max-w-[1680px] px-4 lg:px-6">
        <div className="grid grid-cols-1 gap-x-8 gap-y-10 py-14 md:grid-cols-2 lg:grid-cols-12">
          {/* ── Wordmark, tagline, support ── */}
          <div className="lg:col-span-3">
            <Link href="/" className="inline-flex items-center gap-3" aria-label="AgoraX">
              <img src={logoImage} alt="" className="h-9 w-auto" />
              <span className="font-serif text-3xl leading-none text-paper">AgoraX</span>
            </Link>
            <p className="mt-4 max-w-[34ch] text-sm leading-relaxed text-bc-ink-soft">
              {t('footer.tagline')}
            </p>

            <div className="mt-6 rounded-sm border border-bc-line bg-bc-panel p-4">
              <p className="font-serif text-lg leading-tight text-paper">{t('footer.supportTitle')}</p>
              <p className="mt-1 text-xs leading-relaxed text-bc-ink-soft">{t('footer.supportBody')}</p>
              <Link
                href="/support"
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-sm border border-bc-line px-3 py-2 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
                data-testid="link-donate"
              >
                <Heart className="h-4 w-4" />
                <span className="flex-1 text-center">{t('footer.donate')}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {/* ── Link columns ── */}
          <div className="lg:col-span-2">
            <FooterColumn title={t('footer.navigation')}>
              <FooterLink href="/">{t('nav.home')}</FooterLink>
              <FooterLink href="/communities">{t('nav.communities')}</FooterLink>
              <FooterLink href="/proposals">{t('nav.proposals')}</FooterLink>
              <FooterLink href="/surveys">{t('nav.surveys')}</FooterLink>
              <FooterLink href="/podcasts">{t('nav.podcasts')}</FooterLink>
              <FooterLink href="/videos">{t('nav.videos')}</FooterLink>
            </FooterColumn>
          </div>

          <div className="lg:col-span-2">
            <FooterColumn title={t('footer.useful')}>
              <FooterLink href="/how-it-works">{t('footer.about')}</FooterLink>
              <FooterLink href="/verify">{t('footer.verify')}</FooterLink>
              <FooterLink href="/terms">{t('footer.terms')}</FooterLink>
              <FooterLink href="/privacy">{t('footer.privacy')}</FooterLink>
              <FooterLink href="/faq">{t('footer.faq')}</FooterLink>
            </FooterColumn>
          </div>

          <div className="lg:col-span-2">
            <FooterColumn title={t('footer.support')}>
              <FooterLink href="/faq">{t('footer.helpCentre')}</FooterLink>
              <FooterLink href="/walkthrough">{t('footer.userGuide')}</FooterLink>
              {/* There is no /feedback page — reporting happens through the
                  in-app widget, so these switch it on rather than pretending
                  to navigate somewhere. */}
              <FooterAction onClick={openFeedback}>{t('footer.reportProblem')}</FooterAction>
              <FooterAction onClick={openFeedback}>{t('footer.improvements')}</FooterAction>
            </FooterColumn>
          </div>

          {/* ── Newsletter + app ── */}
          <div className="md:col-span-2 lg:col-span-3">
            <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-paper">
              {t('footer.newsletterTitle')}
            </h3>
            <p className="mt-2 text-sm text-bc-ink-soft">{t('footer.newsletterBody')}</p>
            <NewsletterForm />

            {/* Only Android exists. The comps show an App Store badge too; a
                store badge that leads nowhere is a promise the project cannot
                keep, so it is not drawn until there is an iOS build. */}
            <button
              type="button"
              onClick={handleApkDownload}
              className="mt-6 inline-flex items-center gap-2.5 rounded-sm border border-bc-line px-4 py-2.5 text-sm text-paper transition-colors duration-[120ms] hover:bg-bc-panel"
              data-testid="button-footer-android"
            >
              <Smartphone className="h-5 w-5" />
              <span className="text-left leading-tight">
                <span className="block text-[10px] uppercase tracking-[0.12em] text-bc-ink-soft">
                  {t('footer.getAndroid')}
                </span>
                <span className="block text-sm font-medium">Android APK</span>
              </span>
            </button>
          </div>
        </div>

        {/* ── Legal row ── */}
        <div className="flex flex-col gap-3 border-t border-bc-line py-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-bc-ink-soft">
            {t('footer.madeWith')}
          </p>
          <div className="flex items-center gap-4">
            <p className="font-mono text-xs tabular-nums text-bc-ink-soft">
              © {new Date().getFullYear()} AgoraX
            </p>
            <div className="flex items-center gap-2">
              {SUPPORTED_LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLocale(code)}
                  className={`text-xs uppercase tracking-[0.1em] transition-colors duration-[120ms] ${
                    locale === code ? "text-paper" : "text-bc-ink-soft hover:text-paper"
                  }`}
                  data-testid={`footer-locale-${code}`}
                >
                  {LOCALE_NAMES[code]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
