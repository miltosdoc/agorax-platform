import { Link } from "wouter";
import { Heart, Github, Users, MessageSquarePlus, ExternalLink } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { useTranslation } from "@/hooks/use-translation";

/**
 * "Υποστήριξε την AgoraX" — where the footer's donate button lands.
 *
 * No payment is taken here and none is simulated. AgoraX has one funding
 * channel that actually exists (GitHub Sponsors, per FUNDING.yml), so the page
 * links out to it and is honest that the platform takes no money itself. The
 * other three ways to help cost nothing, and on a deliberation platform they
 * are worth more than a card number anyway.
 */

const SPONSOR_URL = "https://github.com/sponsors/miltosdoc";
const REPO_URL = "https://github.com/miltosdoc/agorax-platform";

function SupportCard({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-sm border border-line bg-surface p-5">
      <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-sm bg-kyanos-wash text-kyanos" aria-hidden="true">
        {icon}
      </span>
      <h2 className="font-serif text-lg leading-tight text-ink">{title}</h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">{body}</p>
      <div className="mt-4">{action}</div>
    </div>
  );
}

const primaryAction =
  "inline-flex h-9 items-center gap-2 rounded-sm bg-ink px-4 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep";
const secondaryAction =
  "inline-flex h-9 items-center gap-2 rounded-sm border border-line px-4 text-sm font-medium text-ink transition-colors duration-[120ms] hover:bg-sunken";

export default function SupportPage() {
  const { t } = useTranslation();

  return (
    <AppShell breadcrumb={[{ label: t('footer.supportTitle') }]}>
      <section className="mb-8 rounded-sm border border-line bg-kyanos-wash px-6 py-12 text-center sm:px-10 sm:py-16">
        <Heart className="mx-auto mb-4 h-8 w-8 text-kyanos" aria-hidden="true" />
        <h1 className="font-serif text-3xl leading-tight text-ink sm:text-4xl">{t('footer.supportTitle')}</h1>
        <p className="mx-auto mt-3 max-w-[52ch] text-sm leading-relaxed text-ink-soft sm:text-base">
          {t('support.intro')}
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SupportCard
          icon={<Heart className="h-5 w-5" />}
          title={t('support.donateTitle')}
          body={t('support.donateBody')}
          action={
            <a href={SPONSOR_URL} target="_blank" rel="noopener noreferrer" className={primaryAction}>
              {t('support.donateCta')}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          }
        />
        <SupportCard
          icon={<Users className="h-5 w-5" />}
          title={t('support.participateTitle')}
          body={t('support.participateBody')}
          action={
            <Link href="/communities" className={secondaryAction}>
              {t('nav.communities')}
            </Link>
          }
        />
        <SupportCard
          icon={<Github className="h-5 w-5" />}
          title={t('support.codeTitle')}
          body={t('support.codeBody')}
          action={
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={secondaryAction}>
              GitHub
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          }
        />
        <SupportCard
          icon={<MessageSquarePlus className="h-5 w-5" />}
          title={t('support.feedbackTitle')}
          body={t('support.feedbackBody')}
          action={
            <Link href="/faq" className={secondaryAction}>
              {t('footer.helpCentre')}
            </Link>
          }
        />
      </div>

      <p className="mt-6 rounded-sm border border-line bg-sunken px-4 py-3 text-xs leading-relaxed text-ink-soft">
        {t('support.disclosure')}
      </p>
    </AppShell>
  );
}
