import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  UserCircle, LogOut, User, BarChart3, Users, Bell, FileText, MessageSquare,
  MessageSquarePlus, Menu, Coins, Home, Smartphone, Check, Bookmark, X,
  Settings, HelpCircle, PlusCircle, Plus, Search,
} from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { AgoraLogo } from "@/components/brand/AgoraLogo";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

import { useUnreadCount } from "@/hooks/use-notifications";
import { NotificationsDropdown } from "@/components/notifications/notifications-dropdown";
import type { SortitionNotification } from "@/types/notifications";
import { notificationTarget } from "@/lib/notification-target";
import SearchBar from "@/components/SearchBar";
import { downloadApk } from "@/lib/download-apk";
import { isFeedbackWidgetEnabled, setFeedbackWidgetEnabled } from "@/components/FeedbackWidget";
import { initials } from "@/lib/initials";

/** Compact masthead for the personal shell; standalone pages retain direct links. */
export default function Header({ compact = false }: { compact?: boolean } = {}) {
  const { user, logoutMutation } = useAuth();
  const { t, locale } = useTranslation();
  const [location, navigate] = useLocation();
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [feedbackOn, setFeedbackOn] = useState(isFeedbackWidgetEnabled);
  useEffect(() => {
    const sync = () => setFeedbackOn(isFeedbackWidgetEnabled());
    window.addEventListener('agorax-feedback-toggle', sync);
    return () => window.removeEventListener('agorax-feedback-toggle', sync);
  }, []);
  const { toast } = useToast();

  async function handleApkDownload() {
    setIsAccountOpen(false);
    const result = await downloadApk();
    if (result === "unavailable") {
      toast({ title: t('android.notAvailable'), variant: "destructive" });
    } else if (result === "failed") {
      toast({ title: "Download failed", variant: "destructive" });
    }
  }

  const handleLogout = () => {
    setIsAccountOpen(false);
    logoutMutation.mutate();
  };

  const { data: unreadCountData } = useUnreadCount();

  // The item marks itself read before invoking this SPA navigation.
  const handleNotificationClick = (notification: SortitionNotification) => {
    setIsNotificationsOpen(false);
    navigate(notificationTarget(notification));
  };

  const unreadCount = unreadCountData?.count || 0;

  // Browsing remains available to visitors; protected actions require login.
  const navItems: { label: string; href: string; match: (l: string) => boolean }[] = [
    { label: t('nav.home'), href: user ? "/feed" : "/", match: (l) => l === "/" || l === "/feed" || l === "/home" },
    { label: t('nav.communities'), href: "/communities", match: (l) => l.startsWith("/communities") },
    { label: t('nav.proposals'), href: "/proposals", match: (l) => l.startsWith("/proposals") },
    { label: t('nav.surveys'), href: "/surveys", match: (l) => l.startsWith("/surveys") },
    { label: t('nav.podcasts'), href: "/podcasts", match: (l) => l.startsWith("/podcasts") },
    { label: t('nav.videos'), href: "/videos", match: (l) => l.startsWith("/videos") },
  ];

  const navLinkClass = (active: boolean) =>
    `relative inline-flex items-center whitespace-nowrap px-0.5 py-1 text-[15px] transition-colors duration-[120ms] ${
      active
        ? "font-semibold text-ink after:absolute after:inset-x-0 after:-bottom-[13px] after:h-[3px] after:bg-kyanos after:content-['']"
        : "text-ink-soft hover:text-ink"
    }`;

  const iconButtonClass =
    "inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors duration-[120ms] hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kyanos";

  return (
    <header className="platform-header sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur" data-shell={compact || undefined}>
      <div className="mx-auto flex max-w-[1480px] items-center gap-2 px-4 py-3 sm:gap-3 lg:gap-5 lg:px-6">
        {/* ── Wordmark ── */}
        <Link
          href={user ? "/feed" : "/"}
          className={`flex min-w-0 items-center gap-2 ${compact ? "mr-auto shrink-0 md:mr-3 xl:w-[228px]" : "mr-auto shrink-0"}`}
          data-testid="logo-link"
        >
          <span className="relative flex-shrink-0">
            <AgoraLogo title={t('brand.name')} className="h-6 w-auto min-[380px]:h-7 sm:h-8" />
            {/* The platform is not finished and should never pretend to be:
                votes are advisory (Terms §7) and the rules still move. It
                hangs under the letters, where the full logo has its tagline. */}
            <span
              className="absolute -bottom-2 right-0 rounded-sm border border-kyanos/40 bg-kyanos-wash px-1 py-px font-sans text-[8px] font-bold uppercase leading-none tracking-[0.12em] text-kyanos"
              data-testid="badge-beta"
            >
              Beta
            </span>
          </span>
        </Link>

        {/* ── Primary nav (desktop) ── */}
        {!compact && <nav className="hidden flex-1 items-center justify-center gap-4 xl:flex 2xl:gap-6" aria-label={t('shell.primaryNavigation')}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={navLinkClass(item.match(location))}
              data-testid={`nav-${item.href.replace(/\//g, "") || "home"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>}

        {compact && user && (
          <div className="hidden min-w-0 flex-1 md:block lg:max-w-[560px]">
            <SearchBar />
          </div>
        )}

        {/* ── Icon cluster ── */}
        <div className="ml-auto flex flex-shrink-0 items-center gap-0.5 sm:gap-1">
          {user && (
            <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
              <PopoverTrigger asChild>
                <button type="button" className={`${iconButtonClass} ${compact ? "md:hidden" : ""}`} aria-label={t('search.placeholder')} data-testid="button-open-search">
                  <Search className="h-5 w-5" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[min(92vw,420px)] rounded-xl border-line p-3">
                <SearchBar />
              </PopoverContent>
            </Popover>
          )}

          <span className="hidden 2xl:inline-flex">
            <LanguageSwitcher />
          </span>

          <span className="hidden sm:inline-flex"><ThemeSwitcher /></span>

          {user ? (
            <>
              <Popover open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen}>
                <PopoverTrigger asChild>
                  <button type="button" className={`relative ${iconButtonClass}`} data-testid="button-notifications" aria-label={t('notification.title')}>
                    <Bell className="h-[18px] w-[18px]" />
                    {unreadCount > 0 && (
                      <span
                        className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-sm bg-kyanos px-1 font-mono text-[10px] leading-none tabular-nums text-paper"
                        data-testid="badge-notification-count"
                      >
                        {unreadCount > 9 ? "9+" : unreadCount}
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" sideOffset={8} collisionPadding={12} className="flex max-h-[min(640px,calc(100dvh-96px))] w-[min(420px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border-line p-0 shadow-xl" data-testid="popover-notifications" aria-label={t('notification.title')}>
                  <NotificationsDropdown unreadCount={unreadCount} onOpenNotification={handleNotificationClick} onClose={() => setIsNotificationsOpen(false)} />
                </PopoverContent>
              </Popover>

              <Link
                href="/bookmarks"
                className={`hidden lg:inline-flex ${iconButtonClass}`}
                data-testid="link-bookmarks"
                aria-label={t('nav.bookmarks')}
              >
                <Bookmark className="h-[18px] w-[18px]" />
              </Link>

              <button
                type="button"
                onClick={() => navigate("/proposals/new")}
                className={`hidden h-11 items-center gap-1.5 rounded-full bg-kyanos px-4 text-sm font-semibold text-accent-foreground transition-colors duration-[120ms] hover:bg-kyanos-deep ${compact ? "min-[1200px]:inline-flex" : "min-[1600px]:inline-flex"}`}
                data-testid="button-new-proposal"
              >
                <span>{t('nav.newProposal')}</span>
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>

              {/* Avatar + account panel. The comps put the initials disc and the
                  hamburger side by side inside one pill; both open the panel. */}
              <DropdownMenu open={isAccountOpen} onOpenChange={setIsAccountOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="ml-0.5 flex h-11 items-center gap-1.5 rounded-full border border-line pl-1 pr-1 sm:pr-2.5 transition-colors duration-[120ms] hover:border-line-strong hover:bg-sunken"
                    data-testid="button-user-menu"
                    aria-label={t('nav.account')}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-kyanos font-sans text-xs font-semibold tracking-wide text-paper">
                      {initials(user.name)}
                    </span>
                    {isAccountOpen ? (
                      <X className="hidden h-4 w-4 text-ink-soft sm:block" />
                    ) : (
                      <Menu className="hidden h-4 w-4 text-ink-soft sm:block" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="mt-2 max-h-[calc(100dvh-100px)] w-72 overflow-y-auto rounded-xl border-line p-0 [&_[role=menuitem]]:min-h-11">
                  <div className="border-b border-line px-4 py-3">
                    <p className="font-serif text-lg leading-tight text-ink">{t('nav.account')}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-faint">{user.name}</p>
                  </div>
                  <div className="flex items-center justify-between border-b border-line px-4 py-2 2xl:hidden">
                    <span className="text-xs text-ink-faint">{t('shell.appearanceLanguage')}</span>
                    <div className="flex items-center gap-1"><LanguageSwitcher /><span className="sm:hidden"><ThemeSwitcher /></span></div>
                  </div>
                  <div className="py-1">
                    {/* First item: the account card above names the member, so
                        the way to edit that is where they look for it. */}
                    <DropdownMenuItem onClick={() => navigate("/profile")} className="min-h-11 cursor-pointer" data-testid="menu-profile">
                      <User className="mr-2.5 h-4 w-4 text-ink-faint" />
                      {t('nav.profile')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/bookmarks")} className="cursor-pointer lg:hidden" data-testid="menu-bookmarks">
                      <Bookmark className="mr-2.5 h-4 w-4 text-ink-faint" />
                      {t('nav.bookmarks')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/proposals?mine=1")} className="cursor-pointer" data-testid="menu-my-proposals">
                      <FileText className="mr-2.5 h-4 w-4 text-ink-faint" />
                      {t('nav.myProposals')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/communities?view=mine")} className="cursor-pointer" data-testid="menu-communities">
                      <Users className="mr-2.5 h-4 w-4 text-ink-faint" />
                      {t('nav.myCommunities')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/surveys")} className="cursor-pointer" data-testid="menu-surveys">
                      <BarChart3 className="mr-2.5 h-4 w-4 text-ink-faint" />
                      {t('nav.mySurveys')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/points")} className="cursor-pointer" data-testid="menu-points">
                      <Coins className="mr-2.5 h-4 w-4 text-ink-faint" />
                      {t('nav.points')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/walkthrough")} className="cursor-pointer" data-testid="menu-walkthrough">
                      <HelpCircle className="mr-2.5 h-4 w-4 text-ink-faint" />
                      {t('nav.help')}
                    </DropdownMenuItem>

                    {user.isAdmin && <DropdownMenuSeparator />}
                    {/* Platform-wide settings, not account ones — the account
                        equivalent is Profile at the top of this menu. */}
                    {user.isAdmin && (
                      <DropdownMenuItem onClick={() => navigate("/settings")} className="cursor-pointer" data-testid="menu-settings">
                        <Settings className="mr-2.5 h-4 w-4 text-ink-faint" />
                        {t('nav.settings')}
                      </DropdownMenuItem>
                    )}
                    {user.isAdmin && (
                      <DropdownMenuItem onClick={() => navigate("/analytics")} className="cursor-pointer" data-testid="menu-analytics">
                        <BarChart3 className="mr-2.5 h-4 w-4 text-ink-faint" />
                        {t('nav.analytics')}
                      </DropdownMenuItem>
                    )}
                    {user.isAdmin && (
                      <DropdownMenuItem onClick={() => navigate("/admin/accounts")} className="cursor-pointer" data-testid="menu-admin-accounts">
                        <Users className="mr-2.5 h-4 w-4 text-ink-faint" />
                        {t('nav.adminAccounts')}
                      </DropdownMenuItem>
                    )}
                    {user.isAdmin && (
                      <DropdownMenuItem onClick={() => navigate("/admin/content-notices")} className="cursor-pointer" data-testid="menu-admin-content-notices">
                        <FileText className="mr-2.5 h-4 w-4 text-ink-faint" />
                        {locale === 'en' ? 'Content notices' : 'Αναφορές περιεχομένου'}
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleApkDownload} className="cursor-pointer" data-testid="menu-android-download">
                      <Smartphone className="mr-2.5 h-4 w-4 text-ink-faint" />
                      {t('android.downloadMenuLabel')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={(e) => {
                        // Keep the menu open so the check state is visible.
                        e.preventDefault();
                        const next = !feedbackOn;
                        setFeedbackWidgetEnabled(next);
                        setFeedbackOn(next);
                      }}
                      className="cursor-pointer"
                      data-testid="menu-feedback-toggle"
                    >
                      <MessageSquarePlus className="mr-2.5 h-4 w-4 text-ink-faint" />
                      <span className="flex-1">{t('feedback.toggleLabel')}</span>
                      {feedbackOn && <Check className="ml-2 h-4 w-4 text-yper" />}
                    </DropdownMenuItem>
                  </div>
                  <div className="border-t border-line py-1">
                    <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-kata focus:text-kata" data-testid="menu-logout">
                      <LogOut className="mr-2.5 h-4 w-4" />
                      {t('auth.logout')}
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <button
              type="button"
              onClick={() => navigate("/auth")}
              className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-full bg-ink px-4 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
              data-testid="button-login"
            >
              {t('auth.login')}
              <UserCircle className="h-4 w-4" />
            </button>
          )}

          {/* Mobile nav trigger — the primary nav collapses here below lg. */}
          <DropdownMenu open={isMobileNavOpen} onOpenChange={setIsMobileNavOpen}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`${iconButtonClass} ${compact ? "min-[1100px]:hidden" : "xl:hidden"}`}
                data-testid="button-mobile-nav"
                aria-label={t('shell.openNavigation')}
              >
                <Menu className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="mt-2 max-h-[calc(100dvh-100px)] w-64 overflow-y-auto rounded-xl border-line [&_[role=menuitem]]:min-h-11">
              {navItems.map((item) => (
                <DropdownMenuItem key={item.href} onClick={() => navigate(item.href)} className="cursor-pointer">
                  {item.label}
                </DropdownMenuItem>
              ))}
              {!user && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/auth")} className="cursor-pointer">
                    {t('auth.login')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/auth?tab=register")} className="cursor-pointer">
                    {t('auth.register')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/walkthrough")} className="cursor-pointer">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    {t('footer.userGuide')}
                  </DropdownMenuItem>
                </>
              )}
              {user && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/communities?view=mine")} className="cursor-pointer">
                    <Users className="mr-2 h-4 w-4" />
                    {t('nav.myCommunities')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/proposals/new")} className="cursor-pointer">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    {t('nav.newProposal')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/home")} className="cursor-pointer">
                    <Home className="mr-2 h-4 w-4" />
                    {t('dashboard.title')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    {t('nav.profile')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Ornament slot: empty in every theme but Marble, which draws a meander here. */}
      <div className="theme-rule" aria-hidden="true" />

    </header>
  );
}
