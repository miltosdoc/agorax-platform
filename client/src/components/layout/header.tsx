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
  Settings, HelpCircle, PlusCircle,
} from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import logoImage from "../../assets/logo.png";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";

import { useUnreadCount, useNotifications } from "@/hooks/use-notifications";
import { NotificationItem } from "@/components/notifications/notification-item";
import type { SortitionNotification } from "@/types/notifications";
import SearchBar from "@/components/SearchBar";
import { downloadApk } from "@/lib/download-apk";
import { isFeedbackWidgetEnabled, setFeedbackWidgetEnabled } from "@/components/FeedbackWidget";
import { initials } from "@/lib/initials";

/**
 * The AGORA 2026 masthead.
 *
 * Three columns on desktop — wordmark, centred primary nav, icon cluster —
 * mirroring the comps. The design's green is not reproduced: every accent here
 * resolves to Kyanós (--kyanos), the platform's flag blue, so the new layout
 * arrives without a rebrand.
 */
export default function Header() {
  const { user, logoutMutation } = useAuth();
  const { t } = useTranslation();
  const [location, navigate] = useLocation();
  const [isAccountOpen, setIsAccountOpen] = useState(false);
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
    navigate("/");
    logoutMutation.mutate();
  };

  const { data: unreadCountData } = useUnreadCount();
  const { data: notificationsData, isLoading: notificationsLoading } = useNotifications({ limit: 20 });

  // Navigation only: NotificationItem marks the notification read itself, and
  // calls this back solely when there is somewhere to go — a message that is
  // clipped expands in place instead, so the reader never has to leave the
  // popover to finish reading it.
  const handleNotificationClick = (notification: SortitionNotification) => {
    setIsNotificationsOpen(false);
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    } else if (notification.proposalId) {
      navigate(`/proposals/${notification.proposalId}`);
    } else {
      navigate("/notifications");
    }
  };

  const unreadCount = unreadCountData?.count || 0;
  const notifications = notificationsData?.notifications || [];

  // The primary nav of the comps. Shown to everyone: a signed-out visitor can
  // browse proposals, surveys and the media shelves, and hits the auth wall
  // only where the route itself is protected.
  const navItems: { label: string; href: string; match: (l: string) => boolean }[] = [
    { label: t('nav.home'), href: user ? "/feed" : "/", match: (l) => l === "/" || l === "/feed" || l === "/home" },
    { label: t('nav.communities'), href: "/communities", match: (l) => l.startsWith("/communities") },
    { label: t('nav.proposals'), href: "/proposals", match: (l) => l.startsWith("/proposals") },
    { label: t('nav.surveys'), href: "/surveys", match: (l) => l.startsWith("/surveys") },
    { label: t('nav.podcasts'), href: "/podcasts", match: (l) => l.startsWith("/podcasts") },
    { label: t('nav.videos'), href: "/videos", match: (l) => l.startsWith("/videos") },
    { label: t('nav.profile'), href: "/profile", match: (l) => l.startsWith("/profile") },
  ];

  const navLinkClass = (active: boolean) =>
    `relative inline-flex items-center whitespace-nowrap px-0.5 py-1 text-[15px] transition-colors duration-[120ms] ${
      active
        ? "font-semibold text-ink after:absolute after:inset-x-0 after:-bottom-[13px] after:h-[3px] after:bg-kyanos after:content-['']"
        : "text-ink-soft hover:text-ink"
    }`;

  const iconButtonClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-sm text-ink-soft transition-colors duration-[120ms] hover:bg-sunken hover:text-ink";

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper">
      {/* Institutional signature: solid ink rule across the very top */}
      <div className="h-1 bg-ink" aria-hidden="true" />

      <div className="mx-auto flex max-w-[1680px] items-center gap-3 px-4 py-2.5 lg:gap-6 lg:px-6">
        {/* ── Wordmark ── */}
        <Link
          href={user ? "/feed" : "/"}
          className="flex min-w-0 flex-1 items-center gap-2.5 lg:w-[220px] lg:flex-none xl:w-[260px]"
          data-testid="logo-link"
        >
          <img src={logoImage} alt="" className="h-8 w-auto flex-shrink-0 sm:h-9" />
          <span className="min-w-0">
            <span className="flex items-baseline gap-1.5 leading-none">
              <span className="font-serif text-lg leading-none text-ink sm:text-2xl">AgoraX</span>
              {/* The platform is not finished and should never pretend to be:
                  votes are advisory (Terms §7) and the rules still move. */}
              <span
                className="rounded-sm border border-kyanos/40 bg-kyanos-wash px-1 py-0.5 font-sans text-[9px] font-semibold uppercase leading-none tracking-[0.12em] text-kyanos"
                data-testid="badge-beta"
              >
                Beta
              </span>
            </span>
            <span className="mt-1 hidden font-sans text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-ink-faint sm:block">
              {t('general.digitalDemocracy')}
            </span>
          </span>
        </Link>

        {/* ── Primary nav (desktop) ── */}
        <nav className="hidden flex-1 items-center justify-center gap-5 lg:flex xl:gap-8" aria-label="Primary">
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
        </nav>

        {/* ── Icon cluster ── */}
        <div className="ml-auto flex flex-shrink-0 items-center gap-1 lg:ml-0">
          {user && (
            <div className="hidden w-44 xl:block xl:w-56">
              <SearchBar />
            </div>
          )}

          <span className="hidden sm:inline-flex">
            <LanguageSwitcher />
          </span>

          <ThemeSwitcher />

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
                <PopoverContent align="end" className="mt-2 w-80 rounded-sm border-line p-0" data-testid="popover-notifications">
                  <div className="border-b border-line px-4 py-3">
                    <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
                      {t('notification.title')}
                    </h3>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto">
                    {notificationsLoading ? (
                      <div className="p-4 text-center text-sm text-ink-faint" data-testid="text-loading-notifications">
                        {t('notification.loading')}
                      </div>
                    ) : notifications.length > 0 ? (
                      <div data-testid="list-notifications">
                        {notifications.map((notification) => (
                          <NotificationItem
                            key={notification.id}
                            notification={notification}
                            onClick={() => handleNotificationClick(notification)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-sm text-ink-faint" data-testid="text-no-notifications">
                        {t('notification.empty')}
                      </div>
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              <Link
                href="/bookmarks"
                className={`hidden sm:inline-flex ${iconButtonClass}`}
                data-testid="link-bookmarks"
                aria-label={t('nav.bookmarks')}
              >
                <Bookmark className="h-[18px] w-[18px]" />
              </Link>

              <button
                type="button"
                onClick={() => navigate("/proposals/new")}
                className="hidden h-9 items-center gap-1.5 rounded-full bg-ink px-3.5 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep md:inline-flex"
                data-testid="button-new-proposal"
              >
                <PlusCircle className="h-4 w-4" />
                <span className="hidden lg:inline">{t('nav.newProposal')}</span>
              </button>

              {/* Avatar + account panel. The comps put the initials disc and the
                  hamburger side by side inside one pill; both open the panel. */}
              <DropdownMenu open={isAccountOpen} onOpenChange={setIsAccountOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="ml-0.5 flex h-9 items-center gap-1.5 rounded-full border border-line pl-0.5 pr-2 transition-colors duration-[120ms] hover:border-line-strong hover:bg-sunken"
                    data-testid="button-user-menu"
                    aria-label={t('nav.account')}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-kyanos font-sans text-[11px] font-semibold tracking-wide text-paper">
                      {initials(user.name)}
                    </span>
                    {isAccountOpen ? (
                      <X className="h-4 w-4 text-ink-soft" />
                    ) : (
                      <Menu className="h-4 w-4 text-ink-soft" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="mt-2 w-72 rounded-sm border-line p-0">
                  <div className="border-b border-line px-4 py-3">
                    <p className="font-serif text-lg leading-tight text-ink">{t('nav.account')}</p>
                    <p className="mt-0.5 truncate text-xs text-ink-faint">{user.name}</p>
                  </div>
                  <div className="py-1">
                    {/* First item: the account card above names the member, so
                        the way to edit that is where they look for it. */}
                    <DropdownMenuItem onClick={() => navigate("/profile")} className="cursor-pointer" data-testid="menu-profile">
                      <User className="mr-2.5 h-4 w-4 text-ink-faint" />
                      {t('nav.profile')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/bookmarks")} className="cursor-pointer sm:hidden" data-testid="menu-bookmarks">
                      <Bookmark className="mr-2.5 h-4 w-4 text-ink-faint" />
                      {t('nav.bookmarks')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/proposals?mine=1")} className="cursor-pointer" data-testid="menu-my-proposals">
                      <FileText className="mr-2.5 h-4 w-4 text-ink-faint" />
                      {t('nav.myProposals')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate("/communities")} className="cursor-pointer" data-testid="menu-communities">
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
              className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full bg-ink px-4 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
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
                className={`${iconButtonClass} lg:hidden`}
                data-testid="button-mobile-nav"
                aria-label={t('nav.home')}
              >
                <Menu className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="mt-2 w-56 rounded-sm border-line">
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
                    {t('nav.process')}
                  </DropdownMenuItem>
                </>
              )}
              {user && (
                <>
                  <DropdownMenuSeparator />
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

      {/* Search drops to its own line below xl so it never squeezes the nav. */}
      {user && (
        <div className="border-t border-line px-4 py-2 xl:hidden">
          <SearchBar />
        </div>
      )}
    </header>
  );
}
