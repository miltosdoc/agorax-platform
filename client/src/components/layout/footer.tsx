import { useState } from "react";
import { Link } from "wouter";
import { Heart, Smartphone, Loader2, ChevronDown } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { useToast } from "@/hooks/use-toast";
import { AgoraLogo } from "@/components/brand/AgoraLogo";
import { apiRequest } from "@/lib/queryClient";
import { downloadApk } from "@/lib/download-apk";
import { LOCALE_NAMES, SUPPORTED_LOCALES } from "@/lib/i18n-types";
import { setFeedbackWidgetEnabled } from "@/components/FeedbackWidget";

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-sans text-sm font-semibold text-ink">
        {title}
      </h3>
      <ul className="mt-3 space-y-1.5">{children}</ul>
    </div>
  );
}

function FooterAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex min-h-11 items-center text-left text-sm text-ink-soft transition-colors duration-[120ms] hover:text-kyanos"
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
        className="inline-flex min-h-11 items-center text-sm text-ink-soft transition-colors duration-[120ms] hover:text-kyanos"
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
      <div className="flex items-center gap-2 rounded-full border border-line bg-sunken p-1 pl-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('footer.newsletterPlaceholder')}
          aria-label={t('footer.newsletterBody')}
          className="min-w-0 flex-1 bg-transparent h-11 text-base text-ink outline-none placeholder:text-ink-faint"
          data-testid="input-newsletter-email"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-11 flex-shrink-0 items-center gap-1.5 rounded-full bg-kyanos px-4 text-sm font-medium text-accent-foreground transition-colors duration-[120ms] hover:bg-kyanos-deep disabled:opacity-60"
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
    <footer className="platform-footer border-t border-line bg-surface text-ink">
      <div className="mx-auto max-w-[1480px] px-4 py-6 lg:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label={t('brand.name')}><AgoraLogo className="h-7 w-auto" /></Link>
            <p className="m-0 text-xs text-ink-faint">© {new Date().getFullYear()} {t('brand.name')}</p>
          </div>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm" aria-label={t('footer.useful')}>
            <Link href="/walkthrough" className="inline-flex min-h-11 items-center text-ink-soft hover:text-kyanos">{t('footer.userGuide')}</Link>
            <Link href="/privacy" className="inline-flex min-h-11 items-center text-ink-soft hover:text-kyanos">{t('footer.privacy')}</Link>
            <Link href="/terms" className="inline-flex min-h-11 items-center text-ink-soft hover:text-kyanos">{t('footer.terms')}</Link>
            <Link href="/report-content" className="inline-flex min-h-11 items-center text-ink-soft hover:text-kyanos" data-testid="link-report-content">{locale === 'en' ? 'Report content' : 'Αναφορά περιεχομένου'}</Link>
            <Link href="/support" className="inline-flex min-h-11 items-center gap-2 font-medium text-kyanos" data-testid="link-donate"><Heart className="h-4 w-4" />{t('footer.donate')}</Link>
          </nav>
        </div>
        <details className="group mt-2 border-t border-line pt-2">
          <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 text-sm text-ink-faint marker:content-none">
            {t('shell.moreFooter')}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="grid gap-x-8 gap-y-6 py-6 sm:grid-cols-2 lg:grid-cols-4">
            <FooterColumn title={t('footer.navigation')}>
              <FooterLink href="/communities">{t('nav.communities')}</FooterLink>
              <FooterLink href="/proposals">{t('nav.proposals')}</FooterLink>
              <FooterLink href="/surveys">{t('nav.surveys')}</FooterLink>
              <FooterLink href="/podcasts">{t('nav.podcasts')}</FooterLink>
              <FooterLink href="/videos">{t('nav.videos')}</FooterLink>
            </FooterColumn>
            <FooterColumn title={t('footer.useful')}>
              <FooterLink href="/how-it-works">{t('footer.about')}</FooterLink>
              <FooterLink href="/verify">{t('footer.verify')}</FooterLink>
              <FooterLink href="/faq">{t('footer.faq')}</FooterLink>
              <FooterAction onClick={openFeedback}>{t('footer.reportProblem')}</FooterAction>
              <FooterAction onClick={openFeedback}>{t('footer.improvements')}</FooterAction>
            </FooterColumn>
            <div>
              <h3 className="text-sm font-semibold text-ink">{t('shell.appearanceLanguage')}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {SUPPORTED_LOCALES.map((code) => (
                  <button key={code} type="button" onClick={() => setLocale(code)} className={`min-h-11 rounded-full border px-4 text-sm ${locale === code ? 'border-kyanos bg-kyanos-wash text-kyanos' : 'border-line text-ink-soft hover:bg-sunken'}`} data-testid={`footer-locale-${code}`}>{LOCALE_NAMES[code]}</button>
                ))}
              </div>
              <button type="button" onClick={handleApkDownload} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-line px-4 text-sm text-ink-soft hover:bg-sunken" data-testid="button-footer-android"><Smartphone className="h-4 w-4" /><span>{t('footer.getAndroid')}</span></button>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink">{t('footer.newsletterTitle')}</h3>
              <p className="mt-3 text-sm text-ink-faint">{t('footer.newsletterBody')}</p>
              <NewsletterForm />
            </div>
          </div>
          <p className="mt-1 text-xs text-ink-faint">{t('footer.madeWith')}</p>
        </details>
      </div>
    </footer>
  );
}
