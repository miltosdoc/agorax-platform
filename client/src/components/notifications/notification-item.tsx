import { useId, useLayoutEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { el as dateFnsEl, enUS as dateFnsEn } from "date-fns/locale";
import { Bell, Users, Clock, Vote, MessageSquare, FileText, Video, AlertTriangle, Mic, Mail, Megaphone, MoreHorizontal, Check, Trash2, ArrowUpRight, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import type { SortitionNotification } from "@/types/notifications";
import { useDeleteNotification, useMarkAsRead } from "@/hooks/use-notifications";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface NotificationItemProps {
  notification: SortitionNotification;
  onClick?: () => void;
  communityName?: string;
}

const icons: Record<string, LucideIcon> = {
  sortition_assigned: Users, sortition_deadline: Clock, sortition_reminder: Bell,
  proposal_advanced: FileText, amendment_ready: MessageSquare, vote_started: Vote,
  conference_scheduled: Mic, conference_starting: Mic, sortition_room_opened: Mic,
  new_proposal: FileText, new_media: Video, file_lost: AlertTriangle,
  deliberation_reminder: Clock, community_invite: Mail, platform_update: Megaphone,
  forum_reply: MessageSquare,
};

export function NotificationItem({ notification, onClick, communityName }: NotificationItemProps) {
  const { t, locale } = useTranslation();
  const markAsRead = useMarkAsRead();
  const deleteNotification = useDeleteNotification();
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const messageId = useId();
  const messageRef = useRef<HTMLParagraphElement>(null);
  const opening = useRef(false);
  const Icon = icons[notification.type] || Bell;
  const date = new Date(notification.createdAt);
  const dateLabel = Number.isFinite(date.getTime()) ? formatDistanceToNow(date, { addSuffix: true, locale: locale === 'el' ? dateFnsEl : dateFnsEn }) : '';

  useLayoutEffect(() => {
    const element = messageRef.current;
    if (!element || expanded) return;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [notification.message, expanded]);

  async function openNotification() {
    if (opening.current || !onClick) return;
    opening.current = true;
    try {
      if (!notification.read) await markAsRead.mutateAsync(notification.id).catch(() => undefined);
      onClick();
    } finally { opening.current = false; }
  }

  return (
    <article className={`flex items-start gap-3 border-b border-line p-4 last:border-b-0 ${notification.read ? 'bg-surface' : 'bg-kyanos-wash/50'}`} data-testid={`notification-item-${notification.id}`} data-read={notification.read}>
      <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${notification.read ? 'bg-sunken text-ink-soft' : 'bg-surface text-kyanos'}`} aria-hidden="true"><Icon className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 pt-1">
            <h3 className={`break-words text-base font-semibold leading-snug ${notification.read ? 'text-ink-soft' : 'text-ink'}`}>
              {onClick ? <button type="button" onClick={() => void openNotification()} className="text-left hover:text-kyanos focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kyanos" disabled={markAsRead.isPending}>{notification.title}</button> : notification.title}
            </h3>
            {communityName && <p className="mb-0 mt-1 break-words text-sm font-medium text-kyanos">{communityName}</p>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button type="button" className="-mr-1 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-faint hover:bg-sunken hover:text-ink" aria-label={t('notification.moreActions')} title={t('notification.moreActions')} data-testid={`notification-menu-${notification.id}`}><MoreHorizontal className="h-5 w-5" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl border-line p-1">
              {!notification.read && <DropdownMenuItem className="min-h-11 cursor-pointer" onSelect={() => markAsRead.mutate(notification.id)} disabled={markAsRead.isPending} data-testid={`notification-read-${notification.id}`}><Check className="mr-2 h-4 w-4" />{t('notification.markRead')}</DropdownMenuItem>}
              <DropdownMenuItem className="min-h-11 cursor-pointer text-kata focus:text-kata" onSelect={() => deleteNotification.mutate(notification.id)} disabled={deleteNotification.isPending} data-testid={`notification-delete-${notification.id}`}><Trash2 className="mr-2 h-4 w-4" />{t('notification.delete')}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {notification.message && <p id={messageId} ref={messageRef} className={`mb-0 mt-2 break-words whitespace-pre-line text-sm leading-relaxed text-ink-soft ${expanded ? '' : 'line-clamp-2'}`} data-testid={`notification-message-${notification.id}`}>{notification.message}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
          {!notification.read && <span className="inline-flex items-center gap-1.5 font-semibold text-kyanos"><span className="h-1.5 w-1.5 rounded-full bg-kyanos" aria-hidden="true" />{t('notification.new')}</span>}
          <time dateTime={Number.isFinite(date.getTime()) ? date.toISOString() : undefined} title={Number.isFinite(date.getTime()) ? date.toLocaleString(locale === 'el' ? 'el-GR' : 'en-GB') : undefined}>{dateLabel}</time>
        </div>
        {(onClick || overflows || expanded) && <div className="mt-1 flex flex-wrap items-center gap-x-4">
          {onClick && <button type="button" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-kyanos hover:underline" onClick={() => void openNotification()} disabled={markAsRead.isPending} data-testid={`notification-open-${notification.id}`}>{t('notification.open')}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></button>}
          {(overflows || expanded) && <button type="button" className="min-h-11 text-sm font-medium text-ink-soft hover:text-kyanos" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} aria-controls={messageId} data-testid={`notification-toggle-${notification.id}`}>{t(expanded ? 'notification.showLess' : 'notification.showMore')}</button>}
        </div>}
      </div>
    </article>
  );
}
