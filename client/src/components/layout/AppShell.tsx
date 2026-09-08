import { ReactNode } from "react";
import { Link } from "wouter";
import { ChevronRight, ArrowLeft } from "lucide-react";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { useNotificationStream } from "@/hooks/use-notification-stream";
import { useMediaQuery } from "@/hooks/use-media-query";
import { ConsentInterstitial } from "@/components/user/consent-interstitial";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface AppShellProps {
  title?: string;
  breadcrumb?: BreadcrumbItem[];
  actions?: ReactNode;
  /**
   * The AGORA 2026 rails. Supplying either one switches the page to the
   * three-column layout of the comps; supplying neither keeps the centred
   * measure every existing page already uses, so nothing has to change to
   * adopt the new header and footer.
   *
   * Below xl both rails fall beneath the main column and collapse behind a
   * disclosure, so a phone reader reaches the page's own content first.
   */
  leftRail?: ReactNode;
  rightRail?: ReactNode;
  children: ReactNode;
}

/**
 * A rail: plain markup on a wide screen, a closed disclosure on a narrow one.
 *
 * The width is tracked, not read once at mount. The grid around the rails is
 * pure CSS and switches columns the moment the viewport crosses xl, so a
 * one-time read left the two out of step: a page opened narrow and then
 * widened kept its closed disclosures sitting in the empty side columns, and
 * a page opened wide and then shrunk dumped both rails, fully open, under
 * the content. Phones never cross 1280px, so nothing changes for them.
 */
function RailRegion({ label, children }: { label: string; children: ReactNode }) {
  const wide = useMediaQuery("(min-width: 1280px)");

  if (wide) return <>{children}</>;

  return (
    <details className="rounded-sm border border-line bg-surface">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink marker:content-none">
        {label}
      </summary>
      <div className="border-t border-line px-4 pb-1 pt-4">{children}</div>
    </details>
  );
}

export default function AppShell({
  title,
  breadcrumb,
  actions,
  leftRail,
  rightRail,
  children,
}: AppShellProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  useNotificationStream(!!user);

  const hasRails = Boolean(leftRail || rightRail);
  const railLabel = t('rail.showMore');

  // Tailwind needs whole class names at build time, so these are written out
  // rather than composed from the widths.
  const both = Boolean(leftRail && rightRail);
  const gridClass = both
    ? 'xl:grid-cols-[300px_minmax(0,1fr)_340px]'
    : leftRail
      ? 'xl:grid-cols-[300px_minmax(0,1fr)]'
      : 'xl:grid-cols-[minmax(0,1fr)_340px]';
  const mainColClass = leftRail ? 'xl:col-start-2' : 'xl:col-start-1';
  const rightColClass = both ? 'xl:col-start-3' : 'xl:col-start-2';

  // The comps put the breadcrumb and the page's primary action on one bar
  // directly under the masthead, aligned with the main column rather than the
  // rails.
  const bar = (breadcrumb && breadcrumb.length > 0) || actions ? (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav aria-label="Breadcrumb" data-testid="appshell-breadcrumb">
          <ol className="flex items-center gap-x-2 gap-y-1 flex-wrap text-sm text-ink-faint">
            {breadcrumb.map((item, idx) => {
              const isLast = idx === breadcrumb.length - 1;
              return (
                <li key={`${item.label}-${idx}`} className="flex items-center gap-2">
                  {idx === 0 && <ArrowLeft className="h-3.5 w-3.5 text-ink-faint" aria-hidden="true" />}
                  {item.href && !isLast ? (
                    <Link href={item.href} className="text-kyanos hover:underline underline-offset-2">
                      {item.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-ink-soft">{item.label}</span>
                  )}
                  {!isLast && <ChevronRight className="h-3 w-3 text-line-strong" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : (
        <span />
      )}
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  ) : null;

  const heading = title ? (
    <h1 className="mb-6 font-serif text-3xl tracking-tight text-ink sm:text-4xl" data-testid="appshell-title">
      {title}
    </h1>
  ) : null;

  return (
    <div className="flex min-h-screen flex-col pb-16 sm:pb-0">
      <Header />

      {hasRails ? (
        <div className="mx-auto w-full max-w-[1680px] flex-grow px-4 py-5 lg:px-6">
          {/* The track list matches the rails actually supplied. Declaring
              three columns when only one rail is passed leaves the missing
              one as dead space beside the content instead of giving that
              width back to it. */}
          <div className={`grid grid-cols-1 gap-6 ${gridClass}`}>
            {/* Below xl the rails fall beneath the page's own content and
                collapse behind a disclosure. Stacking them open would put
                twenty feed cards between a phone reader and the thing they
                came for. */}
            <main className={`order-first min-w-0 xl:order-none xl:row-start-1 ${mainColClass}`}>
              {bar}
              {heading}
              {children}
            </main>
            {leftRail && (
              <aside className="xl:col-start-1 xl:row-start-1" data-testid="appshell-left-rail">
                <RailRegion label={railLabel}>{leftRail}</RailRegion>
              </aside>
            )}
            {rightRail && (
              <aside className={`xl:row-start-1 ${rightColClass}`} data-testid="appshell-right-rail">
                <RailRegion label={railLabel}>{rightRail}</RailRegion>
              </aside>
            )}
          </div>
        </div>
      ) : (
        <main className="container mx-auto max-w-6xl flex-grow px-4 py-6">
          {bar}
          {heading}
          {children}
        </main>
      )}

      <Footer />
      {user && <BottomNav user={user} />}
      <ConsentInterstitial />
    </div>
  );
}
