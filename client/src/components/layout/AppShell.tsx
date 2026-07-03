import { ReactNode } from "react";
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import BottomNav from "@/components/layout/bottom-nav";
import { useAuth } from "@/hooks/use-auth";
import { useNotificationStream } from "@/hooks/use-notification-stream";
import { ConsentInterstitial } from "@/components/user/consent-interstitial";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface AppShellProps {
  title?: string;
  breadcrumb?: BreadcrumbItem[];
  actions?: ReactNode;
  children: ReactNode;
}

export default function AppShell({ title, breadcrumb, actions, children }: AppShellProps) {
  const { user } = useAuth();
  useNotificationStream(!!user);

  return (
    <div className="flex flex-col min-h-screen pb-16 sm:pb-0">
      <Header />

      {breadcrumb && breadcrumb.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          data-testid="appshell-breadcrumb"
        >
          <div className="container mx-auto px-4 pt-4 pb-1 max-w-6xl">
            <ol className="flex items-center flex-wrap gap-x-2 gap-y-1 text-sm text-ink-faint">
              {breadcrumb.map((item, idx) => {
                const isLast = idx === breadcrumb.length - 1;
                return (
                  <li key={`${item.label}-${idx}`} className="flex items-center gap-2">
                    {item.href && !isLast ? (
                      <Link href={item.href} className="text-kyanos hover:underline underline-offset-2">
                        {item.label}
                      </Link>
                    ) : (
                      <span aria-current="page" className="text-ink-soft">{item.label}</span>
                    )}
                    {!isLast && <ChevronRight className="w-3 h-3 text-line-strong" aria-hidden="true" />}
                  </li>
                );
              })}
            </ol>
          </div>
        </nav>
      )}

      <main className="container mx-auto py-6 px-4 max-w-6xl flex-grow">
        {(title || actions) && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
            {title && (
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="appshell-title">
                {title}
              </h1>
            )}
            {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
          </div>
        )}
        {children}
      </main>

      <Footer />
      {user && <BottomNav user={user} />}
      <ConsentInterstitial />
    </div>
  );
}
