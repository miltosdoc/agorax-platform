import { useState } from 'react';
import { Link } from 'wouter';
import { Bell, CheckCheck, Settings, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { useNotifications, useMarkAllAsRead } from '@/hooks/use-notifications';
import { useCommunityDirectory } from '@/hooks/use-community-membership';
import { useTranslation } from '@/hooks/use-translation';
import { NotificationItem } from './notification-item';
import { Button } from '@/components/ui/button';
import type { SortitionNotification } from '@/types/notifications';

interface Props {
  unreadCount: number;
  onOpenNotification: (notification: SortitionNotification) => void;
  onClose: () => void;
}

export function NotificationsDropdown({ unreadCount, onOpenNotification, onClose }: Props) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<'unread' | 'all'>(unreadCount > 0 ? 'unread' : 'all');
  const query = useNotifications({ unreadOnly: scope === 'unread', limit: 15 });
  const markAll = useMarkAllAsRead();
  const directory = useCommunityDirectory();
  const count = query.data?.unreadCount ?? unreadCount;
  const notifications = query.data?.notifications ?? [];
  const communities = new Map(directory.data?.map(community => [community.id, community.name]));

  return <>
    <div className="shrink-0 border-b border-line px-4 pb-3 pt-3">
      <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold text-ink">{t('notification.title')}</h2><Link href="/notifications/settings" onClick={onClose} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-sunken" aria-label={t('notification.settings')} title={t('notification.settings')} data-testid="notification-dropdown-settings"><Settings className="h-5 w-5" /></Link></div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-full bg-sunken p-1" role="group" aria-label={t('notification.filterLabel')}>
          {(['unread', 'all'] as const).map(value => <button key={value} type="button" className={`inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-medium ${scope === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink'}`} onClick={() => setScope(value)} aria-pressed={scope === value} data-testid={`notification-dropdown-${value}`}>
            {t(value === 'unread' ? 'notification.newTab' : 'notification.all')}{value === 'unread' && count > 0 && <span className="rounded-full bg-kyanos-wash px-1.5 py-0.5 text-xs font-semibold tabular-nums text-kyanos">{count > 99 ? '99+' : count}</span>}
          </button>)}
        </div>
        {count > 0 && <button type="button" onClick={() => markAll.mutate()} disabled={markAll.isPending} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-kyanos disabled:opacity-50" title={t('notification.markAllRead')} data-testid="notification-dropdown-mark-all">{markAll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}{t('notification.markAllShort')}</button>}
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="notification-dropdown-scroll">
      {query.isLoading ? <div role="status" className="space-y-5 p-5" data-testid="text-loading-notifications"><span className="sr-only">{t('notification.loading')}</span>{[1, 2, 3].map(value => <div key={value} className="flex animate-pulse gap-3"><div className="h-10 w-10 rounded-xl bg-sunken" /><div className="flex-1 space-y-2"><div className="h-4 w-3/4 rounded bg-sunken" /><div className="h-3 rounded bg-sunken" /><div className="h-3 w-1/2 rounded bg-sunken" /></div></div>)}</div>
        : query.isError ? <div role="alert" className="space-y-3 p-6 text-center"><AlertCircle className="mx-auto h-7 w-7 text-ink-faint" /><p className="text-sm text-ink-soft">{t('redesign.personal.notificationsFailed')}</p><Button variant="outline" onClick={() => void query.refetch()}>{t('redesign.personal.tryAgain')}</Button></div>
        : notifications.length ? <div data-testid="list-notifications">{notifications.map(notification => <NotificationItem key={notification.id} notification={notification} communityName={notification.communityId ? communities.get(notification.communityId) : undefined} onClick={() => onOpenNotification(notification)} />)}</div>
        : <div className="px-6 py-9 text-center" data-testid="text-no-notifications"><span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-kyanos-wash text-kyanos"><Bell className="h-6 w-6" /></span><p className="text-base font-medium text-ink">{t(scope === 'unread' ? 'redesign.personal.emptyUnread' : 'notification.empty')}</p><p className="mb-0 mt-2 text-sm leading-relaxed text-ink-soft">{t('notification.emptyHint')}</p>{scope === 'unread' && <button type="button" className="mt-3 min-h-11 text-sm font-medium text-kyanos hover:underline" onClick={() => setScope('all')}>{t('redesign.personal.allNotifications')}</button>}</div>}
    </div>
    <Link href="/notifications?view=all" onClick={onClose} className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-t border-line bg-surface px-5 py-3 text-sm font-semibold text-kyanos hover:bg-sunken" data-testid="notification-dropdown-view-all">{t('notification.viewAll')}<ArrowRight className="h-4 w-4" /></Link>
  </>;
}
