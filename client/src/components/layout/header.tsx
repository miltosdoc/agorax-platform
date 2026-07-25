import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useLocation } from "wouter";
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
import { PlusCircle, UserCircle, ChevronDown, LogOut, User, BarChart3, Users, Bell, Shield, FileText, MessageSquare, MessageSquarePlus, Menu, Coins, Home, Smartphone, Check } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { el as dateFnsEl, enUS as dateFnsEn } from "date-fns/locale";
import { useTranslation } from "@/hooks/use-translation";
import logoImage from "../../assets/logo.png";
import { VerifyGovgrModal } from "../user/verify-govgr-modal";
import { LanguageSwitcher } from "@/components/ui/language-switcher";

import { useUnreadCount, useNotifications, useMarkAsRead } from "@/hooks/use-notifications";
import type { SortitionNotification } from "@/types/notifications";
import SearchBar from "@/components/SearchBar";
import { downloadApk } from "@/lib/download-apk";
import { isFeedbackWidgetEnabled, setFeedbackWidgetEnabled } from "@/components/FeedbackWidget";

export default function Header() {
  const { user, logoutMutation } = useAuth();
  const { t, locale } = useTranslation();
  const [location, navigate] = useLocation();
  const dateFnsLocale = locale === 'el' ? dateFnsEl : dateFnsEn;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [feedbackOn, setFeedbackOn] = useState(isFeedbackWidgetEnabled);
  useEffect(() => {
    const sync = () => setFeedbackOn(isFeedbackWidgetEnabled());
    window.addEventListener('agorax-feedback-toggle', sync);
    return () => window.removeEventListener('agorax-feedback-toggle', sync);
  }, []);
  const { toast } = useToast();

  async function handleApkDownload() {
    setIsMenuOpen(false);
    const result = await downloadApk();
    if (result === "unavailable") {
      toast({ title: t('android.notAvailable'), variant: "destructive" });
    } else if (result === "failed") {
      toast({ title: "Download failed", variant: "destructive" });
    }
  }

  const handleLogout = () => {
    navigate("/");
    logoutMutation.mutate();
  };

  // Fetch unread notification count
  const { data: unreadCountData } = useUnreadCount();

  // Fetch notifications when popover is open
  const { data: notificationsData, isLoading: notificationsLoading } = useNotifications({
    limit: 20,
  });

  // Mark notification as read mutation
  const markAsRead = useMarkAsRead();

  const handleNotificationClick = (notification: SortitionNotification) => {
    if (!notification.read) {
      markAsRead.mutate(notification.id);
    }
    setIsNotificationsOpen(false);
    // A message clipped in this popover has to be readable somewhere. Sending
    // an announcement-style notification to its actionUrl drops the reader on
    // a page that does not contain the text they were trying to read. The
    // popover is 320px wide, so two lines run out at roughly 80 characters.
    if ((notification.message?.length ?? 0) > 80) {
      navigate("/notifications");
      return;
    }
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

  // Current-page detection for the tier-2 nav
  const isCommunitiesActive = location === "/communities" || location.startsWith("/communities/");
  const isWalkthroughActive = location === "/walkthrough";

  const navLinkClass = (active: boolean) =>
    `inline-flex items-center border-b-2 px-0.5 text-sm font-medium transition-colors duration-[120ms] ${
      active
        ? "border-ink text-ink"
        : "border-transparent text-ink-soft hover:text-ink"
    }`;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-paper">
      {/* Institutional signature: solid ink rule across the very top */}
      <div className="h-1 bg-ink" aria-hidden="true" />

      {/* ── Tier 1: masthead ── */}
      <div className="container mx-auto flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2.5 sm:gap-x-3 sm:py-3">
        <Link
          href={user ? "/feed" : "/"}
          className="mr-auto flex min-w-0 items-center gap-2.5 sm:gap-3"
          data-testid="logo-link"
        >
          <img
            src={logoImage}
            alt=""
            className="h-8 w-auto flex-shrink-0 sm:h-9"
          />
          <span className="min-w-0">
            <span className="block font-serif text-xl leading-none text-ink sm:text-2xl">
              AgoraX
            </span>
            <span className="mt-1 hidden font-sans text-[10px] font-semibold uppercase leading-none tracking-[0.14em] text-ink-faint sm:block">
              {t('general.digitalDemocracy')}
            </span>
          </span>
        </Link>

        {!user ? (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <LanguageSwitcher />
            {/* Desktop buttons */}
            <button
              type="button"
              onClick={() => navigate("/auth")}
              className="hidden h-9 items-center justify-center whitespace-nowrap rounded-sm border border-ink px-3.5 text-sm font-medium text-ink transition-colors duration-[120ms] hover:bg-sunken sm:inline-flex"
              data-testid="button-login"
            >
              {t('auth.login')}
            </button>
            <button
              type="button"
              onClick={() => navigate("/auth?tab=register")}
              className="hidden h-9 items-center justify-center whitespace-nowrap rounded-sm bg-ink px-3.5 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep sm:inline-flex"
              data-testid="button-register"
            >
              {t('auth.register')}
            </button>
            {/* Mobile hamburger */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-sm text-ink transition-colors duration-[120ms] hover:bg-sunken sm:hidden"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="mt-2 w-56 rounded-sm border-line">
                <DropdownMenuItem onClick={() => navigate("/auth")} className="cursor-pointer">
                  {t('auth.login')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/auth?tab=register")} className="cursor-pointer">
                  {t('auth.register')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/proposals")} className="cursor-pointer">
                  <FileText className="mr-2 h-4 w-4" />
                  {t('nav.proposals')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/walkthrough")} className="cursor-pointer">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {t('nav.process')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <>
            {/* Search: inline on desktop, wraps to its own full-width line on mobile */}
            <div className="order-last w-full sm:order-none sm:w-56 md:w-72 lg:w-80">
              <SearchBar />
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5">
              <LanguageSwitcher />

              {/* Notification Bell */}
              <Popover open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-sm text-ink-soft transition-colors duration-[120ms] hover:bg-sunken hover:text-ink"
                    data-testid="button-notifications"
                  >
                    <Bell className="h-4 w-4" />
                    {unreadCount > 0 && (
                      <span
                        className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-sm bg-kyanos px-1 font-mono text-[10px] leading-none tabular-nums text-paper"
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
                      <div className="divide-y divide-line" data-testid="list-notifications">
                        {notifications.map((notification) => (
                          <div
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`cursor-pointer p-3 transition-colors duration-[120ms] hover:bg-sunken ${!notification.read ? "bg-kyanos-wash" : ""}`}
                            data-testid={`notification-item-${notification.id}`}
                          >
                            <div className="flex items-start gap-2.5">
                              <div className="min-w-0 flex-1">
                                <p className={`text-sm text-ink ${!notification.read ? "font-semibold" : ""}`}>
                                  {notification.title}
                                </p>
                                {notification.message && (
                                  <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{notification.message}</p>
                                )}
                                <p className="mt-1 font-mono text-[11px] tabular-nums text-ink-faint" data-testid={`text-time-ago-${notification.id}`}>
                                  {formatDistanceToNow(new Date(notification.createdAt), {
                                    addSuffix: true,
                                    locale: dateFnsLocale
                                  })}
                                </p>
                              </div>
                              {!notification.read && (
                                <div className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-kyanos" data-testid="indicator-unread" />
                              )}
                            </div>
                          </div>
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

              <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={`flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-sm border px-2 text-sm text-ink transition-colors duration-[120ms] sm:px-3 ${
                      user.govgrVerified
                        ? "border-yper bg-yper-wash"
                        : "border-line hover:border-line-strong hover:bg-sunken"
                    }`}
                    data-testid="button-user-menu"
                  >
                    {user.govgrVerified ? (
                      <Shield className="h-4 w-4 flex-shrink-0 text-yper" />
                    ) : (
                      <UserCircle className="h-4 w-4 flex-shrink-0 text-ink-soft" />
                    )}
                    <span className="hidden max-w-[120px] truncate sm:inline md:max-w-[150px]">{user.name}</span>
                    <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-ink-faint" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="mt-2 w-56 rounded-sm border-line">
                  <div className="px-2 py-1.5 text-xs">
                    {user.govgrVerified ? (
                      <div className="flex items-center font-medium text-yper">
                        <Shield className="mr-1 h-3 w-3" />
                        {t('ballot.verified')}
                      </div>
                    ) : (
                      <span className="text-warn">{t('ballot.unverified')}</span>
                    )}
                  </div>
                  <DropdownMenuSeparator />

                  {!user.govgrVerified && (
                    <DropdownMenuItem
                      onClick={() => {
                        setIsVerifyModalOpen(true);
                        setIsMenuOpen(false);
                      }}
                      className="cursor-pointer bg-kyanos-wash text-kyanos-deep focus:bg-kyanos-wash focus:text-kyanos-deep"
                      data-testid="menu-verify"
                    >
                      <Shield className="mr-2 h-4 w-4" />
                      {t('ballot.verify')}
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuItem
                    onClick={() => navigate("/home")}
                    className="cursor-pointer"
                    data-testid="menu-dashboard"
                  >
                    <Home className="mr-2 h-4 w-4" />
                    {t('dashboard.title')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate("/profile")}
                    className="cursor-pointer"
                    data-testid="menu-profile"
                  >
                    <User className="mr-2 h-4 w-4" />
                    {t('nav.profile')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate("/proposals")}
                    className="cursor-pointer"
                    data-testid="menu-proposals"
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    {t('nav.proposals')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate("/communities")}
                    className="cursor-pointer"
                    data-testid="menu-communities"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    {t('nav.communities')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate("/surveys")}
                    className="cursor-pointer"
                    data-testid="menu-surveys"
                  >
                    <BarChart3 className="mr-2 h-4 w-4" />
                    {t('nav.surveys')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate("/points")}
                    className="cursor-pointer"
                    data-testid="menu-points"
                  >
                    <Coins className="mr-2 h-4 w-4" />
                    {t('nav.points')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => navigate("/walkthrough")}
                    className="cursor-pointer"
                    data-testid="menu-walkthrough"
                  >
                    <MessageSquare className="mr-2 h-4 w-4" />
                    {t('nav.walkthrough')}
                  </DropdownMenuItem>
                  {user.isAdmin && (
                    <DropdownMenuItem
                      onClick={() => navigate("/analytics")}
                      className="cursor-pointer"
                      data-testid="menu-analytics"
                    >
                      <BarChart3 className="mr-2 h-4 w-4" />
                      {t('nav.analytics')}
                    </DropdownMenuItem>
                  )}
                  {user.isAdmin && (
                    <DropdownMenuItem
                      onClick={() => navigate("/admin/accounts")}
                      className="cursor-pointer"
                      data-testid="menu-admin-accounts"
                    >
                      <Users className="mr-2 h-4 w-4" />
                      {t('nav.adminAccounts')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={handleApkDownload}
                    className="cursor-pointer"
                    data-testid="menu-android-download"
                  >
                    <Smartphone className="mr-2 h-4 w-4" />
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
                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                    <span className="flex-1">{t('feedback.toggleLabel')}</span>
                    {feedbackOn && <Check className="ml-2 h-4 w-4 text-yper" />}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="cursor-pointer text-kata focus:text-kata"
                    data-testid="menu-logout"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {t('auth.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </div>

      {/* ── Tier 2: nav row (desktop) ── */}
      {!user ? (
        <nav className="hidden border-t border-line sm:block">
          <div className="container mx-auto flex h-11 items-stretch px-4">
            <button
              type="button"
              onClick={() => navigate("/walkthrough")}
              className={navLinkClass(isWalkthroughActive)}
              data-testid="button-walkthrough"
            >
              {t('nav.process')}
            </button>
          </div>
        </nav>
      ) : (
        <nav className="hidden border-t border-line sm:block">
          <div className="container mx-auto flex h-11 items-stretch gap-6 px-4">
            <button
              type="button"
              onClick={() => navigate("/communities")}
              className={navLinkClass(isCommunitiesActive)}
              data-testid="button-communities"
            >
              {t('nav.communities')}
            </button>

            <button
              type="button"
              onClick={() => navigate("/surveys")}
              className={navLinkClass(location.startsWith("/surveys"))}
              data-testid="button-surveys"
            >
              {t('nav.surveys')}
            </button>

            {/* Primary CTA */}
            <button
              type="button"
              onClick={() => navigate("/proposals/new")}
              className="ml-auto inline-flex items-center gap-2 self-center rounded-sm bg-ink px-3.5 py-1.5 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
              data-testid="button-new-proposal"
            >
              <PlusCircle className="h-4 w-4" />
              <span>{t('nav.newProposal')}</span>
            </button>
          </div>
        </nav>
      )}

      <VerifyGovgrModal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
      />
    </header>
  );
}
