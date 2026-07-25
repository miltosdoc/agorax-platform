import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { el as dateFnsEl, enUS as dateFnsEn } from "date-fns/locale";
import { useTranslation } from "@/hooks/use-translation";
import { notificationTypeConfig } from "@/types/notifications";
import type { SortitionNotification } from "@/types/notifications";
import { useMarkAsRead } from "@/hooks/use-notifications";

interface NotificationItemProps {
  notification: SortitionNotification;
  onClick?: () => void;
}

/**
 * Beyond roughly two lines the clamp hides text, and the row click
 * navigates away — so a long message could not be read at all. Anything
 * past this length gets an expand toggle.
 */
const CLAMP_THRESHOLD = 110;

export function NotificationItem({ notification, onClick }: NotificationItemProps) {
  const { t, locale } = useTranslation();
  const markAsRead = useMarkAsRead();
  const dateFnsLocale = locale === 'el' ? dateFnsEl : dateFnsEn;
  const [expanded, setExpanded] = useState(false);

  const config = notificationTypeConfig[notification.type] || { icon: '📋', color: 'bg-gray-50 border-gray-200' };
  const isLong = (notification.message?.length ?? 0) > CLAMP_THRESHOLD;

  const handleClick = () => {
    if (!notification.read) {
      markAsRead.mutate(notification.id);
    }
    // Tapping the row is how you read a notification on a phone — a small
    // "more" link is not a realistic tap target. So a clipped message
    // expands in place, and navigation moves to its own explicit button.
    if (isLong) {
      setExpanded((v) => !v);
      return;
    }
    onClick?.();
  };

  return (
    <div
      className={`flex items-start gap-3 p-3 border-b border-border cursor-pointer transition-colors hover:bg-muted/50 ${
        !notification.read ? 'bg-muted/30' : ''
      }`}
      onClick={handleClick}
      data-testid={`notification-item-${notification.id}`}
    >
      <div className="text-2xl flex-shrink-0 mt-0.5">{config.icon}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium ${!notification.read ? 'text-foreground' : 'text-muted-foreground'}`}>
            {notification.title}
          </p>
          {!notification.read && (
            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
          )}
        </div>
        {notification.message && (
          <>
            <p
              className={`text-sm text-muted-foreground mt-0.5 whitespace-pre-line ${expanded ? '' : 'line-clamp-2'}`}
              data-testid={`notification-message-${notification.id}`}
            >
              {notification.message}
            </p>
            {isLong && (
              <div className="mt-1 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  className="min-h-[32px] text-xs font-medium text-primary hover:underline"
                  onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                  data-testid={`notification-toggle-${notification.id}`}
                >
                  {expanded ? t('notification.showLess') : t('notification.showMore')}
                </button>
                {notification.actionUrl && (
                  <button
                    type="button"
                    className="min-h-[32px] text-xs font-medium text-primary hover:underline"
                    onClick={(e) => { e.stopPropagation(); onClick?.(); }}
                    data-testid={`notification-open-${notification.id}`}
                  >
                    {t('notification.open')}
                  </button>
                )}
              </div>
            )}
          </>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(notification.createdAt), {
            addSuffix: true,
            locale: dateFnsLocale,
          })}
        </p>
      </div>
    </div>
  );
}
