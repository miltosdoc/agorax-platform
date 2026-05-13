/**
 * Community List Component
 * 
 * Displays a list of communities the user is a member of, with options to:
 * - View community details
 * - Create a new community
 * - Join existing communities
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Users, TrendingUp, Clock, Flame } from 'lucide-react';
import { Link } from 'wouter';
import { useTranslation } from '@/hooks/use-translation';

interface Community {
  id: number;
  name: string;
  description?: string;
  type: string;
  governanceModel?: string;
  memberCount?: number;
  democracyScore?: number;
  latestProposal?: { id: number; question: string; status: string; createdAt: string } | null;
  mostPopularProposal?: { id: number; question: string; supporters: number } | null;
}

export function CommunityList() {
  const { t } = useTranslation();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCommunities();
  }, []);

  async function fetchCommunities() {
    try {
      const res = await fetch('/api/communities');
      if (res.ok) {
        const data = await res.json();
        setCommunities(data);
      }
    } catch (error) {
      console.error('Failed to fetch communities:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{t('community.list_title')}</h2>
        <Button asChild>
          <Link href="/communities/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('community.create_button')}
          </Link>
        </Button>
      </div>

      {communities.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">{t('community.empty_message')}</p>
            <Button asChild className="mt-4">
              <Link href="/communities/new">{t('community.create_first')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {communities.map((community) => (
            <Card key={community.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{community.name}</span>
                  <Badge variant={community.type === 'managed' ? 'default' : 'secondary'}>
                    {community.type === 'managed' ? t('community.type_managed') : t('community.type_autonomous')}
                  </Badge>
                </CardTitle>
                <CardDescription>{community.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center">
                    <Users className="mr-1 h-4 w-4" />
                    {community.memberCount || 0} {t('community.members')}
                  </div>
                  {community.democracyScore && (
                    <div className="flex items-center">
                      <TrendingUp className="mr-1 h-4 w-4" />
                      {t('community.score')}: {community.democracyScore}
                    </div>
                  )}
                </div>

                {community.latestProposal && (
                  <Link
                    href={`/proposals/${community.latestProposal.id}`}
                    className="mt-3 block rounded border border-muted bg-muted/30 p-2 hover:bg-muted/60"
                  >
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {t('community.latest_proposal') || 'Πιο πρόσφατη'}
                    </div>
                    <p className="text-sm font-medium line-clamp-2 mt-0.5">
                      {community.latestProposal.question}
                    </p>
                  </Link>
                )}

                {community.mostPopularProposal && community.mostPopularProposal.supporters > 0 && (
                  <Link
                    href={`/proposals/${community.mostPopularProposal.id}`}
                    className="mt-2 block rounded border border-muted bg-muted/30 p-2 hover:bg-muted/60"
                  >
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Flame className="h-3 w-3 text-orange-500" />
                      {t('community.most_popular') || 'Πιο δημοφιλής'} · {community.mostPopularProposal.supporters} {t('proposal.support') || 'support'}
                    </div>
                    <p className="text-sm font-medium line-clamp-2 mt-0.5">
                      {community.mostPopularProposal.question}
                    </p>
                  </Link>
                )}

                <Button asChild className="mt-4 w-full" variant="outline">
                  <Link href={`/communities/${community.id}`}>{t('community.view')}</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
