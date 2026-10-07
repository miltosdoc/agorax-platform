import type { SortitionNotification } from '../types/notifications';

type NotificationDestination = Pick<SortitionNotification, 'actionUrl' | 'proposalId' | 'sortitionBodyId' | 'communityId'>;

/** Open notifications inside the app, retaining the intended tab and fragment. */
export function notificationTarget(notification: NotificationDestination): string {
  const action = notification.actionUrl;
  if (action && action.startsWith('/') && !action.startsWith('//') && !/[\\\u0000-\u001f\u007f]/.test(action)) {
    try {
      const url = new URL(action, 'https://agorax.invalid');
      if (url.origin === 'https://agorax.invalid') return `${url.pathname}${url.search}${url.hash}`;
    } catch { /* Fall through to the associated object. */ }
  }
  if (isValidId(notification.proposalId)) return `/proposals/${notification.proposalId}`;
  // /sortition/:id is a member's scoring assignment, not the body's ID.
  if (isValidId(notification.sortitionBodyId)) return `/sortition/${notification.sortitionBodyId}/ceremony`;
  if (isValidId(notification.communityId)) return `/communities/${notification.communityId}`;
  return '/notifications';
}

function isValidId(value: number | null): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
