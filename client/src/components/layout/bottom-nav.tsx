import { Link, useLocation } from "wouter";
import { Home, PlusCircle, BarChart3, Users, User } from "lucide-react";
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
  // Strategic order: the two spaces (communities, polls) flank the one
  // creative action (new proposal, elevated dead-center). The flat proposals
  // list stays reachable from the header menu — it earns no thumb slot.
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
      label: t('nav.newProposal'),
      icon: PlusCircle,
      path: "/proposals/new",
      testId: "nav-create-proposal",
      primary: true,
    },
    {
      label: t('nav.surveys'),
      icon: BarChart3,
      path: "/surveys",
      testId: "nav-surveys",
    },
    {
      label: t('nav.profile'),
      icon: User,
      path: "/profile",
      testId: "nav-profile",
    },
  ];

  const isActive = (path: string) =>
    location === path || (path !== '/feed' && location.startsWith(path + '/'));

  return (
    <nav
      className="sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-line bg-paper shadow-lg safe-area-inset-bottom"
      data-testid="bottom-navigation"
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
                className="flex flex-col items-center justify-center flex-1 relative -mt-5 tap-highlight-none"
                data-testid={item.testId}
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-paper bg-ink text-paper shadow-lg">
                  <Icon className="h-7 w-7" />
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
