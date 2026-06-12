import { useState } from "react";
import { Link } from "wouter";
import { useNotifications, useMarkAllAsRead } from "@/hooks/use-notifications";
import { NotificationItem } from "@/components/notifications/notification-item";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, CheckCheck, FileText } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import AppShell from "@/components/layout/AppShell";
import { PushOptIn } from "@/components/notifications/PushOptIn";
import { LocalNotifTestButton } from "@/components/notifications/LocalNotifTestButton";
import { EmptyState, LoadingState } from "@/components/ui/empty-state";

export default function NotificationsPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const markAllAsRead = useMarkAllAsRead();
  
  const { data, isLoading } = useNotifications({ 
    unreadOnly: filter === "unread",
    limit: 100 
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  return (
    <AppShell
      title={t('notification.title')}
      actions={
        unreadCount > 0 && (
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
        )
      }
    >
      <div className="mb-4">
        <PushOptIn />
      </div>
      <LocalNotifTestButton />
      <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "unread")}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">
            {t('notification.all')}
            {unreadCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                {unreadCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="unread">
            {t('notification.unread')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filter}>
          {isLoading ? (
            <LoadingState label={t('notification.loading')} />
          ) : notifications.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-12 w-12" />}
              title={t('notification.empty')}
              action={
                <Button asChild variant="outline" data-testid="notifications-empty-cta">
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
                  onClick={() => {
                    if (notif.actionUrl) {
                      window.location.href = notif.actionUrl;
                    }
                  }}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
