import { Link } from 'wouter';
import { Compass, Plus } from 'lucide-react';
import { useCommunityDirectory } from '@/hooks/use-community-membership';
import { useTranslation } from '@/hooks/use-translation';
import { CommunityCard } from '@/components/cards/community-card';

export function CommunityList() {
  const { t } = useTranslation();
  const directory = useCommunityDirectory();
  const communities = (directory.data ?? []).filter((community) => community.viewerIsMember);
  return <section className="py-4 sm:py-8">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-semibold text-ink">{t('communities.my')}</h2><div className="flex flex-wrap gap-2"><Link href="/communities" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 text-sm font-medium text-ink hover:bg-sunken"><Compass className="h-4 w-4" />{t('communities.discover')}</Link><Link href="/communities/new" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-kyanos px-4 text-sm font-medium text-white hover:bg-kyanos-deep"><Plus className="h-4 w-4" />{t('community.create_button')}</Link></div></header>
    {directory.isLoading ? <div className="grid gap-4 min-[700px]:grid-cols-2" aria-busy="true">{[0, 1].map((i) => <div key={i} className="h-56 animate-pulse rounded-2xl bg-sunken" />)}</div> : directory.isError ? <div role="alert" className="rounded-2xl border border-line p-6"><p>{t('communities.loadError')}</p><button type="button" onClick={() => void directory.refetch()} className="mt-3 min-h-11 px-4 text-kyanos">{t('membership.retry')}</button></div> : communities.length ? <div className="grid gap-4 min-[700px]:grid-cols-2">{communities.map((community) => <CommunityCard key={community.id} community={community} />)}</div> : <p className="rounded-2xl border border-dashed border-line p-6 text-base text-ink-soft">{t('communities.noMemberships')}</p>}
  </section>;
}
