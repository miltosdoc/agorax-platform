import { Link, useLocation, useSearch } from 'wouter';
import { Home, Users, Compass, Vote, BarChart3, Play, Headphones, Bookmark, Plus, HelpCircle, ChevronRight } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { cn } from '@/lib/utils';
import { useCommunityDirectory, pinnedFirst } from '@/hooks/use-community-membership';
import { initials } from '@/lib/initials';

interface MemberCommunity {
  id: number;
  name: string;
  viewerIsMember?: boolean;
  avatarPath?: string | null;
}

function useMemberCommunities() {
  const query = useCommunityDirectory();
  return { ...query, communities: pinnedFirst((query.data ?? []).filter((community) => community.viewerIsMember)) };
}

function CommunityMark({ community }: { community: MemberCommunity }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-kyanos-wash text-xs font-semibold text-kyanos" aria-hidden="true">
      {community.avatarPath ? <img src={`/media/${community.avatarPath}`} alt="" className="h-full w-full object-cover" /> : initials(community.name)}
    </span>
  );
}

/** Personal navigation stays distinct from the public discovery feed. */
export default function PlatformNavigation() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [location] = useLocation();
  const search = useSearch();
  const exploring = location === '/communities' && new URLSearchParams(search).get('view') === 'discover';
  const { communities, isLoading } = useMemberCommunities();
  const items = [
    { label: t('nav.home'), href: user ? '/feed' : '/', icon: Home, active: location === '/' || location === '/feed' || location === '/home' },
    { label: t(user ? 'nav.myCommunities' : 'nav.communities'), href: user ? '/communities?view=mine' : '/communities', icon: Users, active: location.startsWith('/communities') && !exploring },
    { label: t('nav.proposals'), href: '/proposals', icon: Vote, active: location.startsWith('/proposals') && location !== '/proposals/new' },
    { label: t('nav.surveys'), href: '/surveys', icon: BarChart3, active: location.startsWith('/surveys') },
    { label: t('nav.videos'), href: '/videos', icon: Play, active: location.startsWith('/videos') },
    { label: t('nav.podcasts'), href: '/podcasts', icon: Headphones, active: location.startsWith('/podcasts') },
    ...(user ? [{ label: t('nav.bookmarks'), href: '/bookmarks', icon: Bookmark, active: location.startsWith('/bookmarks') }] : []),
  ];

  return (
    <aside className="platform-navigation" data-testid="platform-navigation">
      <div className="platform-navigation-sticky">
        <nav aria-label={t('shell.primaryNavigation')} className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} title={item.label} aria-current={item.active ? 'page' : undefined}
                className={cn('platform-navigation-link', item.active && 'platform-navigation-link-active')}>
                <Icon className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />
                <span className="platform-navigation-label">{item.label}</span>
              </Link>
            );
          })}
          <Link href="/communities?view=discover" title={t('shell.exploreCommunities')} aria-current={exploring ? 'page' : undefined} className={cn("platform-navigation-link text-ink-soft", exploring && "platform-navigation-link-active")}>
            <Compass className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />
            <span className="platform-navigation-label">{t('shell.exploreCommunities')}</span>
          </Link>
        </nav>

        {user && (
          <>
            <Link href="/proposals/new" className="platform-navigation-create" title={t('nav.newProposal')}>
              <Plus className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="platform-navigation-label">{t('nav.newProposal')}</span>
            </Link>
            <section className="platform-navigation-communities" aria-label={t('nav.myCommunities')}>
              <div className="mb-3 flex items-center justify-between gap-2 px-3">
                <h2 className="text-sm font-semibold text-ink-soft">{t('nav.myCommunities')}</h2>
                <Link href="/communities?view=mine" aria-label={t('shell.allMyCommunities')} className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-sunken">
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              {isLoading ? <p className="px-3 text-sm text-ink-faint">{t('shell.loadingCommunities')}</p> : communities.length === 0 ? (
                <p className="px-3 text-sm leading-relaxed text-ink-faint">{t('shell.noCommunities')}</p>
              ) : communities.slice(0, 6).map((community) => (
                <Link key={community.id} href={`/communities/${community.id}`} className={cn('flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 hover:bg-sunken', location === `/communities/${community.id}` && 'bg-kyanos-wash')}>
                  <CommunityMark community={community} />
                  <span className="min-w-0 truncate text-sm font-medium text-ink">{community.name}</span>
                </Link>
              ))}
            </section>
          </>
        )}
        <Link href="/walkthrough" className="platform-navigation-link mt-6 text-ink-faint" title={t('nav.help')}>
          <HelpCircle className="h-[22px] w-[22px] shrink-0" aria-hidden="true" />
          <span className="platform-navigation-label">{t('nav.help')}</span>
        </Link>
      </div>
    </aside>
  );
}

/** In portrait layouts, community shortcuts remain reachable without a rail. */
export function MyCommunityShortcuts() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { communities } = useMemberCommunities();
  if (!user) return null;
  return (
    <nav className="platform-community-shortcuts" aria-label={t('nav.myCommunities')}>
      <Link href="/communities?view=mine" className="flex shrink-0 items-center gap-2 rounded-full bg-kyanos-wash px-4 py-2.5 text-sm font-semibold text-kyanos">
        <Users className="h-4 w-4" aria-hidden="true" />{t('nav.myCommunities')}
      </Link>
      {communities.slice(0, 4).map((community) => (
        <Link key={community.id} href={`/communities/${community.id}`} className="flex max-w-[200px] shrink-0 items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-sunken">
          <CommunityMark community={community} /><span className="truncate">{community.name}</span>
        </Link>
      ))}
      <Link href="/communities?view=discover" className="flex shrink-0 items-center gap-2 rounded-full px-3 py-2.5 text-sm text-ink-soft hover:bg-sunken">
        <Compass className="h-4 w-4" aria-hidden="true" />{t('shell.exploreCommunities')}
      </Link>
    </nav>
  );
}
