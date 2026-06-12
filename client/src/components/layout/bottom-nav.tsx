import { Link, useLocation } from "wouter";
import { Home, PlusCircle, FileText, Users, User } from "lucide-react";
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
  const navItems = [
    {
      label: t('nav.home'),
      icon: Home,
      path: "/feed",
      testId: "nav-home",
    },
    {
      label: t('nav.proposals'),
      icon: FileText,
      path: "/proposals",
      testId: "nav-proposals",
    },
    {
      label: t('nav.newProposal'),
      icon: PlusCircle,
      path: "/proposals/new",
      testId: "nav-create-proposal",
    },
    {
      label: t('nav.communities'),
      icon: Users,
      path: "/communities",
      testId: "nav-communities",
    },
    {
      label: t('nav.profile'),
      icon: User,
      path: "/profile",
      testId: "nav-profile",
    },
  ];

  const isActive = (path: string) => location === path;

  return (
    <nav
      className="sm:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border shadow-lg z-50 safe-area-inset-bottom"
      data-testid="bottom-navigation"
    >
      <div className="flex justify-around items-center h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                "flex flex-col items-center justify-center min-h-[44px] min-w-[44px] flex-1 relative tap-highlight-none transition-smooth",
                active ? "text-primary" : "text-muted-foreground"
              )}
              data-testid={item.testId}
            >
              <Icon
                className={cn(
                  "h-6 w-6 mb-1 transition-smooth",
                  active && "text-primary"
                )}
              />
              <span className="text-xs font-medium">{item.label}</span>
              {active && (
                <span className="absolute top-0 w-12 h-1 bg-primary rounded-b-full transition-smooth" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
