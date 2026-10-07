import { Link, useLocation } from "wouter";
import { Home, PlusCircle, Users, User, Vote } from "lucide-react";
import { SafeUser } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/use-translation";

interface BottomNavProps {
  user: SafeUser | null;
}

export default function BottomNav({ user }: BottomNavProps) {
  const { t } = useTranslation();
  const [location] = useLocation();

  if (!user) {
    return null;
  }

  // «Αρχική» is the feed — the same place login lands and the logo points to.
  // Strategic order: the two spaces (communities, votes) flank the one
  // creative action («Νέο», elevated dead-center) — the same places the
  // header offers.
  const navItems = [
    {
      label: t('nav.home'),
      icon: Home,
      path: "/feed",
      testId: "nav-home",
    },
    {
      label: t('nav.communities'),
      icon: Users,
      path: "/communities",
      testId: "nav-communities",
    },
    {
      label: t('shell.create'),
      icon: PlusCircle,
      path: "/proposals/new",
      testId: "nav-create-proposal",
      primary: true,
    },
    {
      label: t('nav.proposals'),
      icon: Vote,
      path: "/proposals",
      testId: "nav-proposals",
    },
    {
      label: t('nav.profile'),
      icon: User,
      path: "/profile",
      testId: "nav-profile",
    },
  ];

  const isActive = (path: string) =>
    location === path
    || (path !== '/feed' && location.startsWith(path + '/')
      // Creating is «Νέο», not browsing the votes.
      && !(path === '/proposals' && location.startsWith('/proposals/new')));

  return (
    <nav
      className="platform-bottom-navigation fixed bottom-0 left-0 right-0 z-40 border-t border-line bg-surface/95 backdrop-blur safe-area-inset-bottom"
      data-testid="bottom-navigation"
      aria-label={t('shell.primaryNavigation')}
    >
      <div className="flex justify-around items-center h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          if ((item as any).primary) {
            // The one creative action — elevated, always visible.
            return (
              <Link
                key={item.path}
                href={item.path}
                className="flex flex-col items-center justify-center flex-1 relative tap-highlight-none"
                data-testid={item.testId}
                aria-label={t('nav.newProposal')}
                aria-current={active ? 'page' : undefined}
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-kyanos text-accent-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <span className={cn("mt-0.5 text-xs font-medium", active ? "text-kyanos" : "text-ink-faint")}>
                  {item.label}
                </span>
              </Link>
            );
          }
          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "relative flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center tap-highlight-none transition-smooth",
                active ? "text-kyanos" : "text-ink-faint"
              )}
              data-testid={item.testId}
              aria-current={active ? 'page' : undefined}
            >
              <Icon
                className={cn(
                  "mb-1 h-6 w-6 transition-smooth",
                  active && "text-kyanos"
                )}
              />
              <span className="text-xs font-medium">{item.label}</span>
              {active && (
                <span className="absolute top-0 h-1 w-12 rounded-b-full bg-kyanos transition-smooth" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
