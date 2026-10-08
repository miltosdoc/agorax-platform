import { ReactNode } from 'react';
import { Link } from 'wouter';
import { ChevronRight, ChevronDown, ArrowLeft } from 'lucide-react';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import PlatformNavigation, { MyCommunityShortcuts } from '@/components/layout/platform-navigation';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { useNotificationStream } from '@/hooks/use-notification-stream';
import { ConsentInterstitial } from '@/components/user/consent-interstitial';

export interface BreadcrumbItem { label: string; href?: string; }

interface AppShellProps {
  title?: string;
  breadcrumb?: BreadcrumbItem[];
  actions?: ReactNode;
  /** Optional contextual content. It is disclosed on demand, separate from navigation. */
  leftRail?: ReactNode;
  rightRail?: ReactNode;
  /** Public legal/contact channels stay usable without participation consent. */
  requireConsent?: boolean;
  children: ReactNode;
}

function RailRegion({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="platform-context-disclosure group rounded-xl border border-line bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-ink marker:content-none">
        <span>{label}</span><ChevronDown className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-line px-4 pb-1 pt-4">{children}</div>
    </details>
  );
}

export default function AppShell({ title, breadcrumb, actions, leftRail, rightRail, requireConsent = true, children }: AppShellProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  useNotificationStream(!!user);
  const hasRails = Boolean(leftRail || rightRail);

  return (
    <div className="platform-shell flex min-h-screen flex-col">
      <a href="#main-content" className="platform-skip-link">{t('shell.skipContent')}</a>
      <Header compact />
      <div className={`platform-body ${hasRails ? 'platform-body-with-context' : ''}`}>
        <PlatformNavigation />
        <div className="platform-content-column min-w-0">
          <MyCommunityShortcuts />
          <main id="main-content" tabIndex={-1} className="platform-main min-w-0 focus:outline-none">
            {((breadcrumb && breadcrumb.length > 0) || actions) && (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                {breadcrumb && breadcrumb.length > 0 ? (
                  <nav aria-label={t('shell.primaryNavigation')} data-testid="appshell-breadcrumb">
                    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-faint">
                      {breadcrumb.map((item, idx) => {
                        const isLast = idx === breadcrumb.length - 1;
                        return (
                          <li key={`${item.label}-${idx}`} className="flex min-w-0 items-center gap-2">
                            {idx === 0 && <ArrowLeft className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden="true" />}
                            {item.href && !isLast ? <Link href={item.href} className="text-kyanos hover:underline underline-offset-2">{item.label}</Link> : <span aria-current={isLast ? 'page' : undefined} className="text-ink-soft">{item.label}</span>}
                            {!isLast && <ChevronRight className="h-3 w-3 text-line-strong" aria-hidden="true" />}
                          </li>
                        );
                      })}
                    </ol>
                  </nav>
                ) : <span />}
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
              </div>
            )}
            {title && <h1 className="mb-7 text-3xl font-semibold tracking-tight text-ink sm:text-4xl" data-testid="appshell-title">{title}</h1>}
            {children}
          </main>
        </div>
        {hasRails && (
          <div className="platform-context space-y-4">
            {leftRail && <aside data-testid="appshell-left-rail"><RailRegion label={t('shell.communityContext')}>{leftRail}</RailRegion></aside>}
            {rightRail && <aside data-testid="appshell-right-rail"><RailRegion label={t('shell.yourContext')}>{rightRail}</RailRegion></aside>}
          </div>
        )}
      </div>
      <Footer />
      {requireConsent && <ConsentInterstitial />}
    </div>
  );
}
