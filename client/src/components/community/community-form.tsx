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

export function CommunityForm() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState('autonomous');
  const [governanceModel, setGovernanceModel] = useState('no_admin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const resp = await api.post('/api/communities', {
        name,
        description,
        type,
        governanceModel,
      });
      const data = resp.data as { id: number };
      navigate(`/communities/${data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || t('community.create_error'));
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('community.create_title')}</CardTitle>
        <CardDescription>
          {t('community.create_description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">{t('community.name_label')} *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('community.name_placeholder')}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('community.description_label')}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('community.description_placeholder')}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">{t('community.type_label')}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="autonomous">{t('community.type_autonomous')}</SelectItem>
                <SelectItem value="managed">{t('community.type_managed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="governance">{t('community.governance_label')}</Label>
            <Select value={governanceModel} onValueChange={setGovernanceModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no_admin">{t('community.governance_no_admin')}</SelectItem>
                <SelectItem value="admin_team">{t('community.governance_admin_team')}</SelectItem>
                <SelectItem value="hybrid">{t('community.governance_hybrid')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded text-sm">{error}</div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? t('community.creating') : t('community.create_button')}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/communities')}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
