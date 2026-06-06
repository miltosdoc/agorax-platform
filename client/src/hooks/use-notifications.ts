import { useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { SortitionNotification, NotificationsResponse } from "@/types/notifications";

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      Plugins?: {
        LocalNotifications?: {
          schedule: (opts: {
            notifications: Array<{
              id: number;
              title: string;
              body: string;
              extra?: Record<string, unknown>;
            }>;
          }) => Promise<unknown>;
        };
      };
    };
  }
}

async function fireLocalNotification(title: string, body: string): Promise<void> {
  const plugin = window.Capacitor?.Plugins?.LocalNotifications;
  if (!plugin || !window.Capacitor?.isNativePlatform?.()) return;
  try {
    await plugin.schedule({
      notifications: [{ id: Date.now() % 2_147_483_647, title, body }],
    });
  } catch { /* permission denied or not granted */ }
}

export function useUnreadCount() {
  const query = useQuery<{ count: number }>({
    queryKey: ["/api/sortition-notifications/unread-count"],
    refetchInterval: 30000,
  });

  // Fire a local notification when unread count increases (new notification arrived)
  const prevCount = useRef(query.data?.count ?? 0);
  useEffect(() => {
    const current = query.data?.count ?? 0;
    if (query.isSuccess && current > prevCount.current) {
      // Fetch the latest notification to show in the toast
      apiRequest("GET", "/api/sortition-notifications?limit=1&unread=true")
        .then((res: any) => {
          const n = (Array.isArray(res) ? res : res.notifications?.[0]) ?? null;
          if (n) fireLocalNotification(n.title ?? "Νέα ειδοποίηση", n.message ?? "");
        })
        .catch(() => {});
      prevCount.current = current;
    }
  }, [query.data?.count, query.isSuccess]);

  return query;
}

export function useNotifications(options?: { unreadOnly?: boolean; limit?: number }) {
  const { unreadOnly = false, limit = 50 } = options || {};
  return useQuery<NotificationsResponse>({
    queryKey: ["/api/sortition-notifications", { unreadOnly, limit }],
  });
}

export function useMarkAsRead() {
  return useMutation({
    mutationFn: async (notificationId: number) => {
      return await apiRequest("POST", `/api/sortition-notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sortition-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sortition-notifications/unread-count"] });
    },
  });
}

export function useMarkAllAsRead() {
  return useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/sortition-notifications/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sortition-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sortition-notifications/unread-count"] });
    },
  });
}
