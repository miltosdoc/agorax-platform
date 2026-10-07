import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { NotificationsResponse } from "@/types/notifications";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";

// Shared with use-notification-stream — keep the channel id in sync.
const ANDROID_CHANNEL_ID = 'agorax-default-high';
// Header instances come and go during SPA navigation. The app session outlives
// those instances, and logout reloads the document, clearing this set.
const recoveredNativeViewers = new Set<number>();

function isCurrentViewer(viewerId: number): boolean {
  return queryClient.getQueryData<{ id: number } | null>(['/api/user'])?.id === viewerId;
}

async function fireLocalNotification(title: string, body: string, viewerId: number): Promise<void> {
  const plugin = window.Capacitor?.Plugins?.LocalNotifications;
  const isNative = window.Capacitor?.isNativePlatform?.();
  if (!plugin || !isNative) return;
  try {
    // Make sure the high-importance channel exists (idempotent).
    if (plugin.createChannel) {
      try {
        await plugin.createChannel({
          id: ANDROID_CHANNEL_ID,
          name: 'Agora',
          description: 'Agora notifications',
          importance: 5,
          visibility: 1,
          vibration: true,
          lights: true,
          sound: 'default',
        });
      } catch { /* already exists */ }
    }
    if (!isCurrentViewer(viewerId)) return;
    await plugin.schedule({
      notifications: [{
        id: Date.now() % 2_147_483_647,
        title,
        body,
        channelId: ANDROID_CHANNEL_ID,
      }],
    });
  } catch {
    // best-effort; permission may not be granted
  }
}

/** Recover existing unread items once per viewer, independently of UI mounts. */
export async function recoverInitialNativeNotification(viewerId: number, unreadCount: number): Promise<void> {
  if (!isCurrentViewer(viewerId) || recoveredNativeViewers.has(viewerId)) return;
  recoveredNativeViewers.add(viewerId);
  if (unreadCount <= 0 || typeof window === 'undefined' || !window.Capacitor?.isNativePlatform?.()) return;
  try {
    const response = await apiRequest('GET', '/api/sortition-notifications?limit=1&unread=true');
    const data = await response.json() as NotificationsResponse;
    const notification = Array.isArray(data.notifications) ? data.notifications[0] : undefined;
    if (isCurrentViewer(viewerId) && notification?.userId === viewerId) {
      await fireLocalNotification(notification.title, notification.message ?? '', viewerId);
    }
  } catch {
    // Initial recovery is best-effort; incoming notifications use SSE.
  }
}

export function useUnreadCount() {
  const { user } = useAuth();
  const query = useQuery<{ count: number }>({
    queryKey: ["/api/sortition-notifications/unread-count", { viewerId: user?.id ?? 0 }],
    queryFn: async () => (await apiRequest('GET', '/api/sortition-notifications/unread-count')).json(),
    enabled: !!user,
    refetchInterval: 30000,
  });

  // SSE already schedules incoming native notifications. Only recover unread
  // items on the first successful load, avoiding a second toast after each SSE.
  useEffect(() => {
    if (user && query.isSuccess) void recoverInitialNativeNotification(user.id, query.data?.count ?? 0);
  }, [user?.id, query.data?.count, query.isSuccess]);

  return query;
}

export function useNotifications(options?: { unreadOnly?: boolean; limit?: number; enabled?: boolean }) {
  const { user } = useAuth();
  const { unreadOnly = false, enabled = true } = options || {};
  const limit = Math.min(100, Math.max(1, Math.trunc(options?.limit ?? 50) || 50));
  return useQuery<NotificationsResponse>({
    queryKey: ["/api/sortition-notifications", { viewerId: user?.id ?? 0, unreadOnly, limit }],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit), unread: String(unreadOnly) });
      return (await apiRequest('GET', `/api/sortition-notifications?${params}`)).json();
    },
    enabled: !!user && enabled,
    staleTime: 30_000,
    refetchOnMount: 'always',
  });
}

function useNotificationMutationError() {
  const { toast } = useToast();
  const { t } = useTranslation();
  return () => toast({ title: t('notification.title'), description: t('notification.actionFailed'), variant: 'destructive' });
}

export function useMarkAsRead() {
  const onError = useNotificationMutationError();
  return useMutation({
    mutationFn: async (notificationId: number) => {
      return await apiRequest("POST", `/api/sortition-notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sortition-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sortition-notifications/unread-count"] });
    },
    onError,
  });
}

export function useMarkAllAsRead() {
  const onError = useNotificationMutationError();
  return useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/sortition-notifications/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sortition-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sortition-notifications/unread-count"] });
    },
    onError,
  });
}

export function useDeleteNotification() {
  const onError = useNotificationMutationError();
  return useMutation({
    mutationFn: async (notificationId: number) => {
      return await apiRequest("DELETE", `/api/sortition-notifications/${notificationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sortition-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sortition-notifications/unread-count"] });
    },
    onError,
  });
}

/** Clears read notifications by default; pass false to clear everything. */
export function useClearNotifications() {
  const onError = useNotificationMutationError();
  return useMutation({
    mutationFn: async (readOnly: boolean = true) => {
      return await apiRequest("DELETE", `/api/sortition-notifications?readOnly=${readOnly}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sortition-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sortition-notifications/unread-count"] });
    },
    onError,
  });
}
