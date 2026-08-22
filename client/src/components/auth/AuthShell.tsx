/**
 * The frame around every signed-out page that is not the login screen:
 * password reset, address confirmation, unsubscribe.
 *
 * Two things it has to do.
 *
 * First, look like AgoraX. These pages are reached by clicking a link in an
 * email, usually in a browser with no session — the exact situation where a
 * careful person asks "is this really them?". A bare white card answers that
 * question badly. The masthead, the wordmark, the Beta badge and the type are
 * the same ones on the login screen, because that is what recognition is
 * made of.
 *
 * Second, carry the language switcher. Someone arriving from an email has no
 * session, so nothing on the server can tell the page which language to use;
 * the switcher is how they say. It writes to the same local store the rest of
 * the app reads, so the choice survives into the page they land on next.
 */

import type { ReactNode } from 'react';
import { LanguageSwitcher } from '@/components/ui/language-switcher';
import { useTranslation } from '@/hooks/use-translation';
import { EYEBROW } from './auth-styles';
import logoImage from '../../assets/logo.png';

interface AuthShellProps {
  title: string;
  /** Optional line under the heading. */
  subtitle?: string;
  children: ReactNode;
}

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <a href="/" className="flex items-center gap-3">
            <img src={logoImage} alt="AgoraX" className="h-9 w-auto" />
            <span className="flex items-baseline gap-1.5 leading-none">
              <span className="font-serif text-xl font-normal text-ink">AgoraX</span>
              <span
                className="rounded-sm border border-kyanos/40 bg-kyanos-wash px-1 py-0.5 font-sans text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-kyanos"
                data-testid="badge-beta"
              >
                Beta
              </span>
            </span>
          </a>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:px-6 lg:items-center lg:py-16">
        <div className="w-full max-w-md rounded-sm border border-line bg-surface p-6 sm:p-8">
          <p className={EYEBROW}>{t('header.digitalDemocracy')}</p>
          <h1 className="mt-4 font-serif text-2xl font-normal leading-tight text-ink">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{subtitle}</p>
          )}
          <div className="mt-6 space-y-4">{children}</div>
        </div>
      </main>
    </div>
  );
}
