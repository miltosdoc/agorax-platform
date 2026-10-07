import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest, ApiError } from '@/lib/queryClient';
import type { CommunityCardData } from '@/components/cards/community-card';
import { getCommunityJoinStatus, type CommunityJoinStatus } from '@shared/community-membership';

/** A single shared directory request supplies membership to every visible card. */
export function useCommunityDirectory() {
  const { user } = useAuth();
  return useQuery<CommunityCardData[]>({
    queryKey: ['/api/communities', { viewerId: user?.id ?? 0 }],
    queryFn: async () => (await apiRequest('GET', '/api/communities')).json(),
    staleTime: 30_000,
  });
}

export function useCommunityMembership(communityId: number) {
  const { user } = useAuth();
  const client = useQueryClient();
  const directory = useCommunityDirectory();
  const community = directory.data?.find((row) => row.id === communityId);
  const status: CommunityJoinStatus | undefined = community
    ? community.viewerJoinStatus ?? getCommunityJoinStatus({
        isMember: !!community.viewerIsMember,
        hasPendingRequest: false,
        joinPolicy: community.joinPolicy,
      })
    : undefined;
  const mutationKey = ['community-membership', communityId];
  const joining = useIsMutating({ mutationKey }) > 0;
  const join = useMutation({
    mutationKey,
    mutationFn: async (): Promise<'member' | 'pending'> => {
      try {
        const response = await apiRequest('POST', `/api/communities/${communityId}/members`, {});
        return response.status === 202 ? 'pending' : 'member';
      } catch (error) {
        // A second card or tab may already have joined. Recover from the
        // authoritative server conflict rather than leaving a stale button.
        if (error instanceof ApiError && error.status === 409) return 'member';
        throw error;
      }
    },
    onSuccess: (nextStatus) => {
      client.setQueryData<CommunityCardData[]>(['/api/communities', { viewerId: user?.id ?? 0 }], (rows) =>
        Array.isArray(rows) ? rows.map((row) => row.id === communityId ? {
          ...row,
          viewerJoinStatus: nextStatus,
          viewerIsMember: nextStatus === 'member',
          memberCount: nextStatus === 'member' && !row.viewerIsMember ? (row.memberCount ?? 0) + 1 : row.memberCount,
        } : row) : rows,
      );
      // Refresh all contexts where joining opens content or actions, including
      // sibling cards and member-only library/forum/proposal queries.
      void client.invalidateQueries({ predicate: (query) => {
        const path = String(query.queryKey[0]);
        return path.startsWith('/api/communities') || path.startsWith('/api/community') ||
          path.startsWith('/api/feed') || path.startsWith('/api/activity-feed') || path.startsWith('/api/discovery') ||
          path.startsWith('/api/proposals') || path.startsWith('/api/user/communities') ||
          path.startsWith('/api/surveys') || path.startsWith('/api/media');
      } });
    },
  });

  return { user, community, status, joining, join, isLoading: directory.isLoading, error: directory.error, retry: directory.refetch };
}
