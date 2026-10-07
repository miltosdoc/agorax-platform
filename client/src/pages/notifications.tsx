import { Link, useLocation, useSearch } from "wouter";
import { notificationTarget } from "@/lib/notification-target";
import { useCommunityDirectory } from "@/hooks/use-community-membership";
import { useNotifications, useMarkAllAsRead, useClearNotifications } from "@/hooks/use-notifications";
import { NotificationItem } from "@/components/notifications/notification-item";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, CheckCheck, FileText, Mail, Trash2 } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { useAuth } from "@/hooks/use-auth";
import AppShell from "@/components/layout/AppShell";
import { PushOptIn } from "@/components/notifications/PushOptIn";
import { LocalNotifTestButton } from "@/components/notifications/LocalNotifTestButton";
import { EmptyState, LoadingState } from "@/components/ui/empty-state";

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const directory = useCommunityDirectory();
  const filter = new URLSearchParams(search).get('view') === 'all' ? 'all' : 'unread';
  const setFilter = (value: 'all' | 'unread') => navigate(`/notifications?view=${value}`);
  const markAllAsRead = useMarkAllAsRead();
  const clearNotifications = useClearNotifications();
  
  const { data, isLoading, isError, refetch } = useNotifications({
    unreadOnly: filter === "unread",
    limit: 100 
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  return (
    <AppShell
      title={t('notification.title')}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllAsRead.mutate()}
              disabled={markAllAsRead.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="mr-1 h-4 w-4" />
              {t('notification.markAllRead')}
            </Button>
          )}
          {/* Clears only what has been read, so nothing unseen disappears. */}
          {notifications.some((notification) => notification.read) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (window.confirm(t('notification.clearReadConfirm'))) {
                  clearNotifications.mutate(true);
                }
              }}
              disabled={clearNotifications.isPending}
              data-testid="button-clear-read"
            >
              <Trash2 className="mr-1 h-4 w-4" />
              {t('notification.clearRead')}
            </Button>
          )}
        </div>
      }
    >
      <div className="mx-auto max-w-3xl">
      <p className="mb-5 text-base text-muted-foreground">{t('redesign.personal.notificationsIntro')}</p>
      <div className="mb-6 space-y-4">
        <Link
          href="/notifications/settings"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          data-testid="link-email-prefs"
        >
          <Mail className="h-4 w-4" />
          {t('emailPrefs.title')}
        </Link>
        <details className="rounded-lg border bg-muted/30 p-4">
          <summary className="cursor-pointer text-sm font-medium">{t('redesign.personal.notificationChannels')}</summary>
          <div className="mt-4"><PushOptIn /></div>
        </details>
      </div>
      {/* Capacitor plugin-chain debug harness — admins only. */}
      {user?.isAdmin && <LocalNotifTestButton />}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "unread")}>
        <TabsList className="mb-4 h-auto">
          <TabsTrigger value="unread" className="min-h-11">
            {t('notification.unread')}
            {unreadCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                {unreadCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all" className="min-h-11">
            {t('notification.all')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filter}>
          {isLoading ? (
            <LoadingState label={t('notification.loading')} />
          ) : isError ? (
            <div role="alert" className="space-y-3 rounded-lg border p-5">
              <p>{t('redesign.personal.notificationsFailed')}</p>
              <Button variant="outline" onClick={() => refetch()}>{t('redesign.personal.tryAgain')}</Button>
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-12 w-12" />}
              title={t(filter === 'unread' ? 'redesign.personal.emptyUnread' : 'notification.empty')}
              action={
                filter === 'unread' ? <Button variant="outline" onClick={() => setFilter('all')}>{t('redesign.personal.allNotifications')}</Button> : <Button asChild variant="outline" data-testid="notifications-empty-cta">
                  <Link href="/proposals">
                    <FileText className="mr-2 h-4 w-4" />
                    {t('notification.browseProposals')}
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="border border-border rounded-lg overflow-hidden bg-background">
              {notifications.map((notif) => (
                <NotificationItem
                  key={notif.id}
                  notification={notif}
                  communityName={directory.data?.find(community => community.id === notif.communityId)?.name}
                  onClick={() => navigate(notificationTarget(notif))}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </AppShell>
  );
}
