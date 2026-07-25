import { useState } from "react";
import { Link } from "wouter";
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
              <button
                type="button"
                className="mt-1 text-xs font-medium text-primary hover:underline"
                // The row navigates on click; expanding must not.
                onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                data-testid={`notification-toggle-${notification.id}`}
              >
                {expanded ? t('notification.showLess') : t('notification.showMore')}
              </button>
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

// Dropdown version for header bell
export function NotificationDropdownItem({ notification, onClick }: NotificationItemProps) {
  const { locale } = useTranslation();
  const dateFnsLocale = locale === 'el' ? dateFnsEl : dateFnsEn;
  const config = notificationTypeConfig[notification.type] || { icon: '📋' };

  return (
    <div
      className={`flex items-start gap-2 p-3 border-b border-border cursor-pointer transition-colors hover:bg-muted/50 ${
        !notification.read ? 'bg-muted/30' : ''
      }`}
      onClick={onClick}
    >
      <span className="text-lg flex-shrink-0">{config.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${!notification.read ? 'font-medium' : ''} truncate`}>
          {notification.title}
        </p>
        {/* The bell used to show the title alone, so a message-carrying
            notification looked empty until you opened the full page. */}
        {notification.message && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {notification.message}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatDistanceToNow(new Date(notification.createdAt), {
            addSuffix: true,
            locale: dateFnsLocale,
          })}
        </p>
      </div>
    </div>
  );
}
