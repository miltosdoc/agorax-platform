import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  IconUsersGroup, IconCalendarEvent, IconCoins, IconShieldCheck,
  IconMail, IconClock, IconBookmark, IconFileText,
} from "@tabler/icons-react";
import { useTranslation } from "@/hooks/use-translation";
import { useAuth } from "@/hooks/use-auth";
import { RailSection, RailCard, Chip } from "@/components/rails/rail-section";
import { Thumbnail } from "@/components/thumbnails/Thumbnail";
import { mediaUrl, type CommunityCardData } from "@/components/cards/community-card";
import { initials } from "@/lib/initials";

interface CommunityRow extends CommunityCardData {
  viewerIsMember?: boolean;
}

interface MeetingRow {
  id: number;
  source: 'meeting' | 'room';
  title: string;
  startsAt: string;
  isOnline: boolean;
  location: string | null;
  isUrgent: boolean;
  roomId: number | null;
  attendingCount: number;
  viewerAttending: boolean;
}

/**
 * Icons come from two sets on purpose: the designer worked in Lucide and
 * Tabler, and the two draw different things well. Lucide carries the
 * interface verbs already used across this codebase (save, share, chevrons);
 * Tabler is reached for here because it has the civic nouns — a shield with a
 * tick, a calendar with an event on it — that Lucide renders more generically.
 * Both are 24px stroke sets on the same grid, so they sit together without
 * looking mismatched.
 */

function StatLine({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="flex items-center gap-2 text-xs text-ink-faint">
        <span className="flex-shrink-0" aria-hidden="true">{icon}</span>
        {label}
      </span>
      <span className="font-mono text-xs tabular-nums text-ink">{value}</span>
    </div>
  );
}

/**
 * "Η Αγορά μου" — the right rail of the home feed.
 *
 * Deliberately not another copy of the AgoraX feed: the middle column already
 * is the feed, and a rail repeating it would be the same information twice.
 * This one answers the questions the feed cannot — which rooms am I in, and
 * what is about to happen in them.
 */
export function MyAgoraRail() {
  const { t, locale } = useTranslation();
  const { user } = useAuth();

  const { data: communities } = useQuery<CommunityRow[]>({ queryKey: ["/api/communities"] });
  const mine = (communities ?? []).filter((c) => c.viewerIsMember).slice(0, 6);

  // One request for every community the viewer belongs to. The client used to
  // fan out per community and cap the fan-out, which silently dropped meetings
  // for anyone in more than a few.
  const { data: meetingsData } = useQuery<{ meetings: MeetingRow[] }>({
    queryKey: ["/api/me/meetings"],
  });

  const meetings = meetingsData?.meetings ?? [];

  if (!user) return null;

  return (
    <div>
      <RailSection title={t('nav.myCommunities')} moreHref="/communities" moreLabel={t('rail.more')}>
        {mine.length === 0 ? (
          <p className="rounded-sm border border-dashed border-line px-4 py-6 text-center text-xs text-ink-faint">
            {t('rail.empty')}
          </p>
        ) : (
          <div className="rounded-sm border border-line bg-surface">
            {mine.map((community) => (
              <Link
                key={community.id}
                href={`/communities/${community.id}`}
                className="flex items-center gap-3 border-b border-line px-3 py-2.5 last:border-b-0 hover:bg-sunken"
              >
                <div className="w-9 flex-shrink-0">
                  <Thumbnail
                    src={mediaUrl(community.avatarPath)}
                    thumbnailKey={community.thumbnailKey}
                    seed={`community-avatar-${community.id}`}
                    subject={community.category ?? 'community'}
                    ratio="1:1"
                    compact
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink">{community.name}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-faint">
                    <IconUsersGroup size={12} stroke={1.75} aria-hidden="true" />
                    {community.memberCount ?? 0}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </RailSection>

      <RailSection title={t('rail.meetings')}>
        {meetings.length === 0 ? (
          <p className="rounded-sm border border-dashed border-line px-4 py-6 text-center text-xs text-ink-faint">
            {t('rail.empty')}
          </p>
        ) : (
          <div className="rounded-sm border border-line bg-surface">
            {meetings.map((meeting) => {
              const start = new Date(meeting.startsAt);
              return (
                <div key={meeting.id} className="border-b border-line px-3.5 py-3 last:border-b-0">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                      <IconCalendarEvent size={13} stroke={1.75} aria-hidden="true" />
                      {start.toLocaleDateString(locale === "en" ? "en-GB" : "el-GR", {
                        day: "2-digit", month: "short",
                      })}
                    </span>
                    {meeting.isUrgent && (
                      <Chip tone="kata">{meeting.source === 'room' ? t('rail.liveNow') : t('rail.urgent')}</Chip>
                    )}
                  </div>
                  {meeting.source === 'room' && meeting.roomId ? (
                    <Link
                      href={`/conference/${meeting.roomId}`}
                      className="line-clamp-2 block text-xs font-medium leading-snug text-ink hover:text-kyanos"
                    >
                      {meeting.title}
                    </Link>
                  ) : (
                    <p className="line-clamp-2 text-xs font-medium leading-snug text-ink">{meeting.title}</p>
                  )}
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-faint">
                    <IconClock size={12} stroke={1.75} aria-hidden="true" />
                    {start.toLocaleTimeString(locale === "en" ? "en-GB" : "el-GR", {
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </RailSection>
    </div>
  );
}

/**
 * The profile page's left rail: who the viewer is, at a glance.
 *
 * The settings form in the middle column is a list of controls; this is the
 * standing answer to "what is my account", which the form never states in one
 * place.
 */
export function ProfileSummaryRail() {
  const { t, locale } = useTranslation();
  const { user } = useAuth();

  const { data: points } = useQuery<{ balance?: number; lifetime?: number }>({
    queryKey: ["/api/me/points"],
    retry: false,
  });
  const { data: communities } = useQuery<CommunityRow[]>({ queryKey: ["/api/communities"] });
  const { data: bookmarks } = useQuery<{ bookmarks?: unknown[] }>({ queryKey: ["/api/bookmarks"] });

  if (!user) return null;

  const memberCount = (communities ?? []).filter((c) => c.viewerIsMember).length;
  const joined = (user as { createdAt?: string }).createdAt
    ? new Date((user as { createdAt?: string }).createdAt!).toLocaleDateString(
        locale === "en" ? "en-GB" : "el-GR", { year: "numeric", month: "long" },
      )
    : null;

  return (
    <div className="mb-6">
      <RailCard>
        <div className="flex flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-kyanos font-sans text-lg font-semibold text-paper">
            {initials(user.name)}
          </span>
          <p className="mt-3 font-serif text-lg leading-tight text-ink">{user.name}</p>
          <p className="mt-0.5 font-mono text-xs text-ink-faint">@{user.username}</p>
          {user.govgrVerified && (
            <span className="mt-2">
              <Chip tone="accent">
                <IconShieldCheck size={11} stroke={2} className="mr-1" aria-hidden="true" />
                {t('admin.verified')}
              </Chip>
            </span>
          )}
        </div>

        <div className="mt-4">
          <StatLine
            icon={<IconMail size={14} stroke={1.75} />}
            label={t('auth.email')}
            value={<span className="max-w-[9rem] truncate">{user.email}</span>}
          />
          <StatLine
            icon={<IconUsersGroup size={14} stroke={1.75} />}
            label={t('nav.myCommunities')}
            value={memberCount}
          />
          <StatLine
            icon={<IconCoins size={14} stroke={1.75} />}
            label={t('nav.points')}
            value={points?.balance ?? 0}
          />
          <StatLine
            icon={<IconBookmark size={14} stroke={1.75} />}
            label={t('nav.bookmarks')}
            value={bookmarks?.bookmarks?.length ?? 0}
          />
          {joined && (
            <StatLine
              icon={<IconCalendarEvent size={14} stroke={1.75} />}
              label={t('communities.founded')}
              value={joined}
            />
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            href="/points"
            className="inline-flex h-8 items-center justify-center rounded-sm border border-line bg-sunken text-xs font-medium text-ink transition-colors duration-[120ms] hover:bg-surface"
          >
            {t('nav.points')}
          </Link>
          <Link
            href="/bookmarks"
            className="inline-flex h-8 items-center justify-center rounded-sm border border-line bg-sunken text-xs font-medium text-ink transition-colors duration-[120ms] hover:bg-surface"
          >
            {t('nav.bookmarks')}
          </Link>
        </div>
      </RailCard>
    </div>
  );
}

/** Compact "my proposals" list for the profile right rail. */
export function MyProposalsRail() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data } = useQuery<{ proposals?: Array<{ id: number; question: string; status: string; authorId?: number }> } | Array<{ id: number; question: string; status: string; authorId?: number }>>({
    queryKey: ["/api/proposals"],
  });

  const list = Array.isArray(data) ? data : (data?.proposals ?? []);
  const mine = user ? list.filter((p) => p.authorId === user.id).slice(0, 6) : [];

  return (
    <RailSection title={t('nav.myProposals')} moreHref="/proposals" moreLabel={t('rail.more')}>
      {mine.length === 0 ? (
        <p className="rounded-sm border border-dashed border-line px-4 py-6 text-center text-xs text-ink-faint">
          {t('rail.empty')}
        </p>
      ) : (
        <div className="rounded-sm border border-line bg-surface">
          {mine.map((proposal) => (
            <Link
              key={proposal.id}
              href={`/proposals/${proposal.id}`}
              className="flex items-start gap-2.5 border-b border-line px-3.5 py-3 last:border-b-0 hover:bg-sunken"
            >
              <IconFileText size={15} stroke={1.75} className="mt-0.5 flex-shrink-0 text-ink-faint" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 block text-xs leading-snug text-ink">{proposal.question}</span>
                <span className="mt-1 block text-[11px] uppercase tracking-[0.1em] text-ink-faint">
                  {proposal.status}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </RailSection>
  );
}
