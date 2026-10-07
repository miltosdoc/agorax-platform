import { Link } from 'wouter';
import { CheckCircle2, Clock3, LockKeyhole, UserPlus, Loader2 } from 'lucide-react';
import { useCommunityMembership } from '@/hooks/use-community-membership';
import { useTranslation } from '@/hooks/use-translation';
import { cn } from '@/lib/utils';

export interface CommunityJoinActionProps {
  communityId: number;
  className?: string;
  onJoined?: () => void;
  compact?: boolean;
  showMemberStatus?: boolean;
}

/** Joining takes place in this card; requests are read again after a reload. */
export function CommunityJoinAction({ communityId, className, onJoined, compact = false, showMemberStatus = false }: CommunityJoinActionProps) {
  const { t } = useTranslation();
  const { user, community, status, joining, join, isLoading, error, retry } = useCommunityMembership(communityId);
  const buttonClass = cn('inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kyanos focus-visible:ring-offset-2', className);
  if (!user && status === 'invite_only') return <span className={cn(buttonClass, 'text-ink-soft')}><LockKeyhole className="h-4 w-4" />{t('membership.inviteOnly')}</span>;
  if (!user) {
    const returnTo = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : `/communities/${communityId}`;
    return <Link href={`/auth?returnTo=${encodeURIComponent(returnTo)}`} className={cn(buttonClass, 'border border-line bg-surface text-ink hover:bg-sunken')} data-testid={`join-login-${communityId}`}><UserPlus className="h-4 w-4" />{t('membership.signIn')}</Link>;
  }
  if (isLoading) return <span className={cn(buttonClass, 'text-ink-soft')} aria-busy="true"><Loader2 className="h-4 w-4 animate-spin" /><span className="sr-only">{t('common.loading')}</span></span>;
  if (error) return <button type="button" onClick={() => void retry()} className={cn(buttonClass, 'border border-line text-ink-soft')}>{t('membership.retry')}</button>;
  if (!community) return null;
  if (status === 'member') return showMemberStatus ? <span className={cn(buttonClass, 'bg-kyanos-wash text-kyanos')} data-testid={`join-member-${communityId}`}><CheckCircle2 className="h-4 w-4" />{t('membership.member')}</span> : null;
  if (status === 'pending') return <span className={cn(buttonClass, 'border border-line bg-sunken text-ink-soft')} role="status" data-testid={`join-pending-${communityId}`}><Clock3 className="h-4 w-4" />{t(compact ? 'membership.pendingShort' : 'membership.pending')}</span>;
  if (status === 'invite_only') return <span className={cn(buttonClass, 'text-ink-soft')} data-testid={`join-invite-only-${communityId}`}><LockKeyhole className="h-4 w-4" />{t('membership.inviteOnly')}</span>;
  return <div className="min-w-0" onClick={(event) => event.stopPropagation()}>
    <button type="button" className={cn(buttonClass, 'bg-kyanos text-white hover:bg-kyanos-deep disabled:cursor-wait disabled:opacity-70')} disabled={joining} onClick={() => join.mutate(undefined, { onSuccess: (state) => { if (state === 'member') onJoined?.(); } })} data-testid={`join-community-${communityId}`}>
      {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
      {t(joining ? 'membership.joining' : community.joinPolicy === 'approval' ? 'membership.request' : 'membership.join')}
    </button>
    {join.isError && <p className="mt-2 text-sm text-destructive" role="alert">{t('membership.failed')}</p>}
  </div>;
}
