import { useAuth } from "@/hooks/use-auth";
import { useState } from "react";
import { Link } from "wouter";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { PlusCircle, UserCircle, ChevronDown, LogOut, User, BarChart3, Users, Bell, Shield, FileText, MessageSquare, Menu, Coins, Home, Smartphone } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { el as dateFnsEl, enUS as dateFnsEn } from "date-fns/locale";
import { useTranslation } from "@/hooks/use-translation";
import logoImage from "../../assets/logo.png";
import { VerifyGovgrModal } from "../user/verify-govgr-modal";
import { LanguageSwitcher } from "@/components/ui/language-switcher";

import { useUnreadCount, useNotifications, useMarkAsRead } from "@/hooks/use-notifications";
import type { SortitionNotification } from "@/types/notifications";
import { notificationTypeConfig } from "@/types/notifications";
import SearchBar from "@/components/SearchBar";

export default function Header() {
  const { user, logoutMutation } = useAuth();
  const { t, locale } = useTranslation();
  const [, navigate] = useLocation();
  const dateFnsLocale = locale === 'el' ? dateFnsEl : dateFnsEn;
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);

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

  return (
    <header className="bg-background/95 backdrop-blur-sm border-b border-border shadow-md sticky top-0 z-50 transition-smooth">
      <div className="container mx-auto px-4 py-2 sm:py-3 flex justify-between items-center gap-3 sm:gap-4">
        <div className="flex items-center min-w-0">
          <Link
            href={user ? "/feed" : "/"}
            className="flex items-center gap-2 sm:gap-3 transition-smooth hover:opacity-80"
            data-testid="logo-link"
          >
            <img
              src={logoImage}
              alt=""
              className="h-8 sm:h-10 w-auto flex-shrink-0"
            />
            <div className="min-w-0">
              <span className="text-primary text-xl sm:text-2xl font-bold font-sans block leading-tight">
                AgoraX
              </span>
              <span className="text-muted-foreground text-xs sm:text-sm hidden sm:block leading-tight mt-0.5">
                {t('general.digitalDemocracy')}
              </span>
            </div>
          </Link>
        </div>

        {!user ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSwitcher />
            {/* Desktop buttons */}
            <button
              type="button"
              onClick={() => navigate("/auth")}
              className="hidden sm:inline-flex items-center justify-center whitespace-nowrap h-11 px-4 text-sm font-medium transition-smooth border border-border hover:bg-muted hover:border-primary rounded-md cursor-pointer"
              data-testid="button-login"
            >
              {t('auth.login')}
            </button>
            <button
              type="button"
              onClick={() => navigate("/auth?tab=register")}
              className="hidden sm:inline-flex items-center justify-center whitespace-nowrap h-11 px-4 text-sm font-medium transition-smooth shadow-sm hover:shadow-md bg-primary hover:bg-primary/90 text-white rounded-md cursor-pointer"
              data-testid="button-register"
            >
              {t('auth.register')}
            </button>
            <button
              type="button"
              onClick={() => navigate("/walkthrough")}
              className="hidden sm:flex items-center gap-2 min-h-[44px] transition-smooth hover:bg-muted rounded-md px-3 py-2 cursor-pointer"
              data-testid="button-walkthrough"
            >
              <MessageSquare className="h-4 w-4" />
              <span>{t('nav.process')}</span>
            </button>
            {/* Mobile hamburger */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="sm:hidden min-h-[44px] min-w-[44px] p-2">
                  <Menu className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 mt-2">
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
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 justify-end">
            <div className="flex-1 max-w-md min-w-0">
              <SearchBar />
            </div>
            {/* Single primary CTA; every destination lives once in the
                user dropdown (mobile additionally gets the bottom nav). */}
            <button
              type="button"
              onClick={() => navigate("/proposals/new")}
              className="hidden sm:flex items-center gap-2 min-h-[44px] bg-primary hover:bg-primary/90 text-white transition-smooth shadow-sm hover:shadow-md rounded-md px-3 py-2 cursor-pointer"
              data-testid="button-new-proposal"
            >
              <PlusCircle className="h-4 w-4" />
              <span>{t('nav.newProposal')}</span>
            </button>

            {/* Notification Bell */}
            <Popover open={isNotificationsOpen} onOpenChange={setIsNotificationsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="relative min-h-[44px] min-w-[44px] transition-smooth hover:bg-muted hover:border-primary"
                  data-testid="button-notifications"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs"
                      data-testid="badge-notification-count"
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0 mt-2" data-testid="popover-notifications">
                <div className="border-b p-4">
                  <h3 className="font-semibold text-sm">{t('notification.title')}</h3>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                  {notificationsLoading ? (
                    <div className="p-4 text-center text-sm text-muted-foreground" data-testid="text-loading-notifications">
                      {t('notification.loading')}
                    </div>
                  ) : notifications.length > 0 ? (
                    <div className="divide-y" data-testid="list-notifications">
                      {notifications.map((notification) => {
                        const config = notificationTypeConfig[notification.type] || { icon: '📋', color: 'bg-gray-50 border-gray-200' };
                        return (
                          <div
                            key={notification.id}
                            onClick={() => handleNotificationClick(notification)}
                            className={`p-3 cursor-pointer transition-smooth hover:bg-muted ${!notification.read ? "bg-muted/30" : ""}`}
                            data-testid={`notification-item-${notification.id}`}
                          >
                            <div className="flex items-start gap-2">
                              <span className="text-lg flex-shrink-0 mt-0.5">{config.icon}</span>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm ${!notification.read ? "font-semibold" : ""}`}>
                                  {notification.title}
                                </p>
                                {notification.message && (
                                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{notification.message}</p>
                                )}
                                <p className="text-xs text-muted-foreground mt-1" data-testid={`text-time-ago-${notification.id}`}>
                                  {formatDistanceToNow(new Date(notification.createdAt), {
                                    addSuffix: true,
                                    locale: dateFnsLocale
                                  })}
                                </p>
                              </div>
                              {!notification.read && (
                                <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" data-testid="indicator-unread" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-sm text-muted-foreground" data-testid="text-no-notifications">
                      {t('notification.empty')}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            <LanguageSwitcher />

            <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className={`flex items-center gap-1 sm:gap-2 transition-smooth hover:bg-muted hover:border-primary min-h-[44px] min-w-[44px] ${user.govgrVerified ? "border-green-500 bg-green-50/50" : ""}`}
                  data-testid="button-user-menu"
                >
                  {user.govgrVerified ? (
                    <Shield className="h-4 w-4 text-green-600 flex-shrink-0" />
                  ) : (
                    <UserCircle className="h-5 w-5 flex-shrink-0" />
                  )}
                  <span className="hidden sm:inline truncate max-w-[120px] md:max-w-[150px]">{user.name}</span>
                  <ChevronDown className="h-4 w-4 flex-shrink-0" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 mt-2">
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  {user.govgrVerified ? (
                    <div className="flex items-center text-green-600 font-medium">
                      <Shield className="mr-1 h-3 w-3" />
                      {t('ballot.verified')}
                    </div>
                  ) : (
                    <span className="text-amber-600">{t('ballot.unverified')}</span>
                  )}
                </div>
                <DropdownMenuSeparator />

                {!user.govgrVerified && (
                  <DropdownMenuItem
                    onClick={() => {
                      setIsVerifyModalOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="cursor-pointer transition-smooth bg-blue-50 text-blue-700 focus:bg-blue-100 focus:text-blue-800"
                    data-testid="menu-verify"
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    {t('ballot.verify')}
                  </DropdownMenuItem>
                )}

                <DropdownMenuItem
                  onClick={() => navigate("/home")}
                  className="cursor-pointer transition-smooth"
                  data-testid="menu-dashboard"
                >
                  <Home className="mr-2 h-4 w-4" />
                  {t('dashboard.title')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/profile")}
                  className="cursor-pointer transition-smooth"
                  data-testid="menu-profile"
                >
                  <User className="mr-2 h-4 w-4" />
                  {t('nav.profile')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/proposals")}
                  className="cursor-pointer transition-smooth"
                  data-testid="menu-proposals"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  {t('nav.proposals')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/communities")}
                  className="cursor-pointer transition-smooth"
                  data-testid="menu-communities"
                >
                  <Users className="mr-2 h-4 w-4" />
                  {t('nav.communities')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/sortition")}
                  className="cursor-pointer transition-smooth"
                  data-testid="menu-sortition"
                >
                  <Users className="mr-2 h-4 w-4" />
                  {t('nav.sortition')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/surveys")}
                  className="cursor-pointer transition-smooth"
                  data-testid="menu-surveys"
                >
                  <BarChart3 className="mr-2 h-4 w-4" />
                  {t('nav.surveys')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/points")}
                  className="cursor-pointer transition-smooth"
                  data-testid="menu-points"
                >
                  <Coins className="mr-2 h-4 w-4" />
                  {t('nav.points')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate("/walkthrough")}
                  className="cursor-pointer transition-smooth"
                  data-testid="menu-walkthrough"
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  {t('nav.walkthrough')}
                </DropdownMenuItem>
                {user.isAdmin && (
                  <DropdownMenuItem
                    onClick={() => navigate("/analytics")}
                    className="cursor-pointer transition-smooth"
                    data-testid="menu-analytics"
                  >
                    <BarChart3 className="mr-2 h-4 w-4" />
                    {t('nav.analytics')}
                  </DropdownMenuItem>
                )}
                {user.isAdmin && (
                  <DropdownMenuItem
                    onClick={() => navigate("/admin/accounts")}
                    className="cursor-pointer transition-smooth"
                    data-testid="menu-admin-accounts"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    {t('nav.adminAccounts')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  asChild
                  className="cursor-pointer transition-smooth"
                  data-testid="menu-android-download"
                >
                  <a href="/api/android/download" download="agorax.apk">
                    <Smartphone className="mr-2 h-4 w-4" />
                    {t('android.downloadMenuLabel')}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer transition-smooth text-red-600 focus:text-red-600"
                  data-testid="menu-logout"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {t('auth.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <VerifyGovgrModal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
      />
    </header>
  );
}
