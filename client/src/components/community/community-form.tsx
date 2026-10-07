/**
 * Community Creation Form
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import { useQueryClient } from '@tanstack/react-query';

export function CommunityForm() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('autonomous');
  const [joinPolicy, setJoinPolicy] = useState('open');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Ο τρόπος διακυβέρνησης προκύπτει από το είδος — ο διακομιστής τον
      // παράγει μόνος του, δεν τον διαλέγει ο ιδρυτής χωριστά.
      const resp = await api.post('/api/communities', {
        name: name.trim(),
        description: description.trim(),
        type,
        joinPolicy,
      });
      const data = resp.data as { id: number };
      await queryClient.invalidateQueries({ queryKey: ['/api/communities'] });
      navigate(`/communities/${data.id}`);
    } catch (err: any) {
      setError(err.message || t('community.create_error'));
    }
    setLoading(false);
  };

  return (
    <Card className="rounded-2xl border-line">
      <CardHeader>
        <CardTitle>{t('community.create_title')}</CardTitle>
        <CardDescription>
          {t('community.createBasics')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">{t('community.name_label')} *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('community.name_placeholder')}
              required
              maxLength={120}
              className="min-h-12 rounded-xl text-base"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('community.description_label')}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('community.description_placeholder')}
              rows={4}
              className="rounded-xl text-base leading-relaxed"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">{t('community.type_label')}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="type" className="min-h-12 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="autonomous">{t('community.type_autonomous')}</SelectItem>
                <SelectItem value="managed">{t('community.type_managed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="join-policy">{t('community.createMembershipLabel')}</Label>
            <Select value={joinPolicy} onValueChange={setJoinPolicy}>
              <SelectTrigger id="join-policy" className="min-h-12 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="open">{t('communities.openJoin')}</SelectItem><SelectItem value="approval">{t('communities.approvalJoin')}</SelectItem><SelectItem value="invite_only">{t('communities.inviteJoin')}</SelectItem></SelectContent>
            </Select>
            <p className="text-sm text-ink-soft">{t('community.createMembershipHelp')}</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded text-sm">{error}</div>
          )}

          <div className="flex gap-2">
            <Button className="min-h-11 rounded-xl" type="submit" disabled={loading || !name.trim()}>
              {loading ? t('community.creating') : t('community.create_button')}
            </Button>
            <Button className="min-h-11 rounded-xl" type="button" variant="outline" onClick={() => navigate('/communities')}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
