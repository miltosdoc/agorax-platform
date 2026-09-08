import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPin, Users, CalendarDays, Globe, Languages, Link2, Shield, FileText,
  Video, Mic, Clock, Search, SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "@/hooks/use-translation";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { PagedRailSection, RailSection, RailCard, Chip } from "@/components/rails/rail-section";
import { Thumbnail } from "@/components/thumbnails/Thumbnail";
import { SaveButton, ShareButton } from "@/components/cards/card-actions";
import { mediaUrl } from "@/components/cards/community-card";
import { CommunityAppearanceDialog } from "@/components/community/CommunityAppearanceDialog";

interface CommunityLike {
  id: number;
  name: string;
  username?: string | null;
  description?: string | null;
  tagline?: string | null;
  category?: string | null;
  region?: string | null;
  language?: string | null;
  website?: string | null;
  type?: string | null;
  coverPath?: string | null;
  avatarPath?: string | null;
  thumbnailKey?: string | null;
  createdAt?: string | Date | null;
}

interface MeetingRow {
  id: number;
  /** 'room' is a scheduled call — you join it; 'meeting' is announced — you answer it. */
  source: 'meeting' | 'room';
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  isOnline: boolean;
  isUrgent: boolean;
  roomId: number | null;
  attendingCount: number;
  viewerAttending: boolean;
}

interface ActivityEvent {
  kind: "joined" | "proposal" | "post" | "media" | "decided";
  at: string;
  actorName: string | null;
  title: string | null;
  href: string | null;
  count?: number;
}

function DataRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <span className="flex items-center gap-2 text-xs text-ink-faint">
        <span className="flex-shrink-0" aria-hidden="true">{icon}</span>
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-xs font-medium text-ink">{value}</span>
    </div>
  );
}

/**
 * The community's identity card — the left column of comp 4: cover with the
 * overlapping mark, name, handle, chips, description, then the data table and
 * the join action.
 */
export function CommunityIdentityRail({
  community,
  memberCount,
  adminCount,
  joinAction,
  canEditAppearance = false,
}: {
  community: CommunityLike;
  memberCount: number;
  adminCount: number;
  /** The page owns joining: the rail only reserves the slot for that button. */
  joinAction?: React.ReactNode;
  /** Officers get the appearance control under the identity card. */
  canEditAppearance?: boolean;
}) {
  const { t, locale } = useTranslation();

  const founded = community.createdAt
    ? new Date(community.createdAt).toLocaleDateString(locale === "en" ? "en-GB" : "el-GR", {
        year: "numeric",
        month: "long",
      })
    : null;

  return (
    <div className="mb-6 overflow-hidden rounded-sm border border-line bg-surface">
      <div className="relative">
        <Thumbnail
          src={mediaUrl(community.coverPath)}
          thumbnailKey={community.thumbnailKey}
          seed={`community-${community.id}`}
          subject={community.category ?? 'community'}
          ratio="2:1"
          rounded={false}
          className="border-0 border-b border-line"
        />
        <div className="absolute -bottom-7 left-4 w-20">
          <Thumbnail
            src={mediaUrl(community.avatarPath)}
            thumbnailKey={community.thumbnailKey}
            seed={`community-avatar-${community.id}`}
            subject="community"
            ratio="1:1"
            compact
            className="border-2 border-surface shadow-sm"
          />
        </div>
      </div>

      <div className="p-4 pt-10">
        <h2 className="font-serif text-xl leading-tight text-ink">{community.name}</h2>
        {community.username && (
          <p className="mt-0.5 font-mono text-xs text-ink-faint">@{community.username}</p>
        )}

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {community.category && <Chip tone="accent">{t(`category.${community.category}`)}</Chip>}
          {community.type && <Chip>{t(`community.type_${community.type}`)}</Chip>}
        </div>

        {(community.tagline || community.description) && (
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
            {community.tagline || community.description}
          </p>
        )}

        <div className="mt-4">
          {community.region && <DataRow icon={<MapPin className="h-3.5 w-3.5" />} label={t('communities.region')} value={community.region} />}
          {community.type && (
            <DataRow icon={<Shield className="h-3.5 w-3.5" />} label={t('communities.type')} value={t(`community.type_${community.type}`)} />
          )}
          <DataRow icon={<Users className="h-3.5 w-3.5" />} label={t('communities.memberCount')} value={memberCount} />
          {adminCount > 0 && (
            <DataRow icon={<Shield className="h-3.5 w-3.5" />} label={t('communities.admins')} value={adminCount} />
          )}
          {founded && <DataRow icon={<CalendarDays className="h-3.5 w-3.5" />} label={t('communities.founded')} value={founded} />}
          {community.language && (
            <DataRow icon={<Languages className="h-3.5 w-3.5" />} label={t('communities.language')} value={community.language.toUpperCase()} />
          )}
          {community.website && (
            <DataRow
              icon={<Link2 className="h-3.5 w-3.5" />}
              label={t('communities.website')}
              value={
                <a
                  href={community.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-kyanos hover:underline"
                >
                  {community.website.replace(/^https?:\/\//, "")}
                </a>
              }
            />
          )}
        </div>

        <div className="mt-4 flex items-center gap-2">
          {joinAction ? <div className="flex-1">{joinAction}</div> : <div className="flex-1" />}
          <SaveButton entityType="community" entityId={community.id} />
          <ShareButton url={`/communities/${community.id}`} title={community.name} />
        </div>

        {canEditAppearance && (
          <div className="mt-2">
            <CommunityAppearanceDialog
              communityId={community.id}
              current={{
                avatarPath: community.avatarPath,
                coverPath: community.coverPath,
                thumbnailKey: community.thumbnailKey,
                tagline: community.tagline,
                category: community.category,
                region: community.region,
                website: community.website,
                username: community.username,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** "Συναντήσεις Κοινότητας" — the date block, the RSVP, the urgent pill. */
export function CommunityMeetingsRail({ communityId }: { communityId: number }) {
  const { t, locale } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data } = useQuery<{ meetings: MeetingRow[] }>({
    queryKey: [`/api/communities/${communityId}/meetings`],
  });

  const rsvp = useMutation({
    mutationFn: async (meetingId: number) => {
      const res = await apiRequest("POST", `/api/meetings/${meetingId}/rsvp`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/communities/${communityId}/meetings`] });
    },
  });

  return (
    <PagedRailSection
      title={t('rail.meetings')}
      items={data?.meetings ?? []}
      emptyLabel={t('rail.empty')}
      renderItem={(meeting) => {
        const start = new Date(meeting.startsAt);
        const day = start.toLocaleDateString(locale === "en" ? "en-GB" : "el-GR", { day: "2-digit" });
        const month = start
          .toLocaleDateString(locale === "en" ? "en-GB" : "el-GR", { month: "short" })
          .toLocaleUpperCase(locale === "en" ? "en-GB" : "el-GR");
        const time = start.toLocaleTimeString(locale === "en" ? "en-GB" : "el-GR", { hour: "2-digit", minute: "2-digit" });

        return (
          <RailCard>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
                <CalendarDays className="h-3 w-3" aria-hidden="true" />
                {t('rail.meetings')}
              </span>
              {meeting.isUrgent && (
                <Chip tone="kata">{meeting.source === 'room' ? t('rail.liveNow') : t('rail.urgent')}</Chip>
              )}
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 text-center">
                <div className="font-serif text-3xl leading-none tabular-nums text-ink">{day}</div>
                <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">{month}</div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-3 text-sm font-medium leading-snug text-ink">{meeting.title}</p>
                <div className="mt-1.5 space-y-1 text-[11px] text-ink-faint">
                  <div className="flex items-center gap-1.5">
                    {meeting.isOnline ? <Globe className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                    <span className="truncate">{meeting.isOnline ? t('rail.online') : meeting.location}</span>
                  </div>
                  {meeting.source === 'meeting' && (
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3 w-3" />
                      <span>{t('rail.declaredAttending').replace('{count}', String(meeting.attendingCount))}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    <span>{time}</span>
                  </div>
                </div>
              </div>
            </div>

            {user && (
              <div className="mt-3 flex items-center gap-2">
                {meeting.source === 'room' ? (
                  <Link
                    href={`/conference/${meeting.roomId}`}
                    className="inline-flex h-8 flex-1 items-center justify-center rounded-md bg-ink px-3 text-xs font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
                    data-testid={`link-join-room-${meeting.id}`}
                  >
                    {t('rail.joinCall')}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => rsvp.mutate(meeting.id)}
                    disabled={rsvp.isPending}
                    aria-pressed={meeting.viewerAttending}
                    className={`inline-flex h-8 flex-1 items-center justify-center rounded-md border px-3 text-xs font-medium transition-colors duration-[120ms] disabled:opacity-60 ${
                      meeting.viewerAttending
                        ? "border-kyanos/40 bg-kyanos-wash text-kyanos"
                        : "border-line bg-sunken text-ink hover:border-line-strong hover:bg-surface"
                    }`}
                    data-testid={`button-rsvp-${meeting.id}`}
                  >
                    {meeting.viewerAttending ? t('rail.attending') : t('rail.willAttend')}
                  </button>
                )}
                <ShareButton
                  url={meeting.source === 'room' ? `/conference/${meeting.roomId}` : `/communities/${communityId}`}
                  title={meeting.title}
                  className="h-8 w-8"
                />
              </div>
            )}
          </RailCard>
        );
      }}
    />
  );
}

/** "Ροή δραστηριότητας" — the right column of comp 4. */
export function CommunityActivityRail({ communityId }: { communityId: number }) {
  const { t, locale } = useTranslation();
  const { data, isLoading } = useQuery<{ events: ActivityEvent[] }>({
    queryKey: [`/api/communities/${communityId}/activity`],
  });

  const rtf = new Intl.RelativeTimeFormat(locale === "en" ? "en-GB" : "el-GR", { numeric: "auto" });
  const ago = (iso: string) => {
    const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
    const divisions: [number, Intl.RelativeTimeFormatUnit][] = [
      [60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.34, "week"], [12, "month"], [Infinity, "year"],
    ];
    let value = seconds;
    for (const [amount, unit] of divisions) {
      if (Math.abs(value) < amount) return rtf.format(Math.round(value), unit);
      value /= amount;
    }
    return "";
  };

  const sentence = (event: ActivityEvent) => {
    const who = event.actorName ?? "";
    switch (event.kind) {
      case "joined": return t('activity.joined').replace('{name}', who);
      case "proposal": return t('activity.proposed').replace('{name}', who).replace('{title}', event.title ?? "");
      case "post": return t('activity.posted').replace('{name}', who).replace('{title}', event.title ?? "");
      case "media": return t('activity.addedMedia').replace('{name}', who).replace('{title}', event.title ?? "");
      default:
        return t('activity.decided')
          .replace('{title}', event.title ?? "")
          .replace('{count}', String(event.count ?? 0));
    }
  };

  const events = data?.events ?? [];

  return (
    <RailSection title={t('rail.activityFeed')}>
      {isLoading ? (
        <div className="h-40 animate-pulse rounded-sm border border-line bg-sunken" aria-busy="true" />
      ) : events.length === 0 ? (
        <p className="rounded-sm border border-dashed border-line px-4 py-6 text-center text-xs text-ink-faint">
          {t('rail.empty')}
        </p>
      ) : (
        <div className="rounded-sm border border-line bg-surface">
          {events.map((event, i) => (
            <div key={i} className="border-b border-line px-3.5 py-3 last:border-b-0">
              {event.href ? (
                <Link href={event.href} className="text-xs leading-relaxed text-ink hover:text-kyanos">
                  {sentence(event)}
                </Link>
              ) : (
                <p className="text-xs leading-relaxed text-ink">{sentence(event)}</p>
              )}
              <p className="mt-1 text-[11px] text-ink-faint">{ago(event.at)}</p>
            </div>
          ))}
        </div>
      )}
    </RailSection>
  );
}

/** "Έγγραφα & πόροι" — the community library, newest first. */
export function CommunityDocumentsRail({ communityId }: { communityId: number }) {
  const { t } = useTranslation();
  const { data } = useQuery<{ media?: Array<{ id: number; kind: string; title: string; mimeType: string | null; sizeBytes: number | null }> }>({
    queryKey: [`/api/communities/${communityId}/media`],
  });

  const documents = (data?.media ?? []).filter((m) => m.kind === "document").slice(0, 6);

  const size = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const kindLabel = (mime: string | null) => {
    if (!mime) return "FILE";
    if (mime.includes("pdf")) return "PDF";
    if (mime.includes("zip")) return "ZIP";
    if (mime.includes("presentation")) return "PPTX";
    if (mime.includes("word")) return "DOCX";
    if (mime.includes("sheet")) return "XLSX";
    return mime.split("/").pop()?.toUpperCase().slice(0, 5) ?? "FILE";
  };

  return (
    <RailSection
      title={t('rail.documents')}
      moreHref={`/communities/${communityId}?tab=library`}
      moreLabel={t('rail.seeAllFiles')}
    >
      {documents.length === 0 ? (
        <p className="rounded-sm border border-dashed border-line px-4 py-6 text-center text-xs text-ink-faint">
          {t('rail.empty')}
        </p>
      ) : (
        <div className="rounded-sm border border-line bg-surface">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 border-b border-line px-3.5 py-3 last:border-b-0">
              <FileText className="h-5 w-5 flex-shrink-0 text-ink-faint" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-ink">{doc.title}</p>
                <p className="mt-0.5 font-mono text-[11px] text-ink-faint">
                  {kindLabel(doc.mimeType)}{doc.sizeBytes ? ` · ${size(doc.sizeBytes)}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </RailSection>
  );
}

/** "Ετικέτες" — the tag cloud at the foot of the right rail. */
export function CommunityTagsRail({ communityId }: { communityId: number }) {
  const { t } = useTranslation();
  const { data } = useQuery<{ tags: Array<{ id: number; slug: string; label: string }> }>({
    queryKey: [`/api/communities/${communityId}/tags`],
  });

  const tags = data?.tags ?? [];
  if (tags.length === 0) return null;

  return (
    <RailSection title={t('rail.tags')}>
      <div className="flex flex-wrap gap-1.5 rounded-sm border border-line bg-surface p-3.5">
        {tags.map((tag) => (
          <span
            key={tag.id}
            className="rounded-sm bg-sunken px-2 py-1 text-[11px] text-ink-soft"
          >
            {tag.label}
          </span>
        ))}
      </div>
    </RailSection>
  );
}

/**
 * The community's numbers, in the side card.
 *
 * These were a full-width block at the top of the page, which pushed the two
 * things people actually come for — the forum and the calls — below the fold.
 * Counts are reference material: worth having in view, never worth being the
 * first thing between a member and the discussion.
 */
export function CommunityStatsRail({
  memberCount,
  proposalCount,
  activeCount,
  decidedCount,
  democracyScore,
}: {
  memberCount: number;
  proposalCount: number;
  activeCount: number;
  decidedCount: number;
  /** Null when the score has not been computed for this community yet. */
  democracyScore: number | null;
}) {
  const { t } = useTranslation();

  const stats: Array<{ label: string; value: number }> = [
    { label: t('impact.members'), value: memberCount },
    { label: t('impact.proposals'), value: proposalCount },
    { label: t('impact.active'), value: activeCount },
    { label: t('impact.decided'), value: decidedCount },
  ];

  return (
    <RailSection title={t('communities.impactTitle')}>
      <RailCard>
        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="font-serif text-2xl leading-none tabular-nums text-ink">{stat.value}</p>
              <p className="mt-1 text-[10px] font-semibold uppercase leading-tight tracking-[0.1em] text-ink-faint">
                {stat.label}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-line pt-3">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
              <Shield className="h-3 w-3" aria-hidden="true" />
              {t('communities.democracyScore')}
            </span>
            <span className="font-mono text-xs tabular-nums text-ink">
              {democracyScore === null
                ? <span className="text-ink-faint">—</span>
                : <><span className="font-serif text-base">{democracyScore}</span><span className="text-ink-faint">/100</span></>}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
            <div
              className="h-full rounded-full bg-kyanos transition-[width] duration-500"
              style={{ width: `${democracyScore ?? 0}%` }}
            />
          </div>
        </div>
      </RailCard>
    </RailSection>
  );
}
