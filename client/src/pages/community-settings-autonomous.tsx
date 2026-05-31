/**
 * Autonomous community settings — liquid majority view.
 *
 * For each governable setting, every member sees the current value, the live
 * tally of votes, and a control to cast or change their own vote. The
 * community's value is whatever wins by plurality; ties keep the current
 * value (server-enforced).
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import {
  GOVERNABLE_SETTING_DESCRIPTORS,
  GOVERNABLE_SETTING_KEYS,
  type GovernableSettingKey,
} from '@shared/governable-settings';

interface SettingRow {
  key: GovernableSettingKey;
  currentValue: string;
  tally: Array<{ value: string; count: number }>;
  yourVote: string | null;
}

interface Props {
  communityId: string;
  isMember: boolean;
}

export function AutonomousSettingsView({ communityId, isMember }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<SettingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    api.get<SettingRow[]>(`/api/communities/${communityId}/setting-votes`)
      .then((r) => setRows(r.data))
      .catch(() => setError(t('community.settings_load_error') || 'Failed to load'));
  }, [communityId, t]);

  function applyRow(updated: SettingRow) {
    setRows((current) => current ? current.map((r) => r.key === updated.key ? updated : r) : current);
  }

  async function castVote(key: GovernableSettingKey, value: string) {
    setPending((p) => ({ ...p, [key]: true }));
    try {
      const resp = await api.put<{ yourVote: string | null; currentValue: string; tally: SettingRow['tally'] }>(
        `/api/communities/${communityId}/setting-votes/${key}`,
        { value },
      );
      applyRow({ key, currentValue: resp.data.currentValue, tally: resp.data.tally, yourVote: resp.data.yourVote });
      setDrafts((d) => ({ ...d, [key]: '' }));
    } catch (err: any) {
      setError(err?.response?.data?.message || (t('community.settings_save_error') || 'Vote failed'));
    } finally {
      setPending((p) => ({ ...p, [key]: false }));
    }
  }

  async function clearVote(key: GovernableSettingKey) {
    setPending((p) => ({ ...p, [key]: true }));
    try {
      const resp = await api.delete<{ yourVote: null; currentValue: string; tally: SettingRow['tally'] }>(
        `/api/communities/${communityId}/setting-votes/${key}`,
      );
      applyRow({ key, currentValue: resp.data.currentValue, tally: resp.data.tally, yourVote: null });
    } finally {
      setPending((p) => ({ ...p, [key]: false }));
    }
  }

  if (error) return <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>;
  if (!rows) return <div className="py-8 text-center text-muted-foreground">{t('common.loading')}</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('community.autonomous_settings_title') || 'Liquid settings'}</CardTitle>
          <CardDescription>
            {t('community.autonomous_settings_description')
              || 'Every member votes on each setting. The plurality choice is applied to the community. Ties keep the current value.'}
          </CardDescription>
        </CardHeader>
      </Card>

      {GOVERNABLE_SETTING_KEYS.map((key) => {
        const row = rows.find((r) => r.key === key);
        if (!row) return null;
        const desc = GOVERNABLE_SETTING_DESCRIPTORS[key];
        const total = row.tally.reduce((sum, t) => sum + t.count, 0);
        const labelKey = `community.${key.replace(/([A-Z])/g, '_$1').toLowerCase()}`;
        const draft = drafts[key] ?? row.yourVote ?? row.currentValue;

        return (
          <Card key={key}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{t(labelKey) || key}</CardTitle>
                  <CardDescription className="mt-1">
                    {t('community.current_value') || 'Current'}: <span className="font-mono">{row.currentValue || '—'}</span>
                  </CardDescription>
                </div>
                {row.yourVote !== null && (
                  <Badge variant="secondary">{t('community.you_voted') || 'You voted'}: <span className="ml-1 font-mono">{row.yourVote}</span></Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {row.tally.length > 0 && (
                <ul className="space-y-1">
                  {row.tally.map((tallyRow) => {
                    const pct = total > 0 ? Math.round((tallyRow.count / total) * 100) : 0;
                    const isWinner = tallyRow.value === row.currentValue;
                    return (
                      <li key={tallyRow.value} className="flex items-center gap-2 text-sm">
                        <span className="font-mono w-24 truncate" title={tallyRow.value}>{tallyRow.value}</span>
                        <div className="flex-1 h-2 bg-muted rounded">
                          <div className={`h-full rounded ${isWinner ? 'bg-primary' : 'bg-muted-foreground/40'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-16 text-right text-muted-foreground">{tallyRow.count} · {pct}%</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {row.tally.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('community.no_votes_yet') || 'No votes yet.'}</p>
              )}

              {isMember && (
                <div className="flex flex-wrap items-end gap-2 pt-2 border-t">
                  <div className="flex-1 min-w-[180px] space-y-1">
                    <Label htmlFor={`vote-${key}`}>{t('community.your_vote') || 'Your vote'}</Label>
                    {desc.type === 'enum' && (
                      <Select value={draft} onValueChange={(v) => setDrafts((d) => ({ ...d, [key]: v }))}>
                        <SelectTrigger id={`vote-${key}`}><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {(desc.allowed || []).map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {desc.type === 'boolean' && (
                      <div className="flex items-center gap-2 h-10">
                        <Switch
                          id={`vote-${key}`}
                          checked={draft === 'true'}
                          onCheckedChange={(checked) => setDrafts((d) => ({ ...d, [key]: checked ? 'true' : 'false' }))}
                        />
                        <span className="text-sm font-mono">{draft || 'false'}</span>
                      </div>
                    )}
                    {(desc.type === 'integer' || desc.type === 'unlimited_or_positive_integer' || desc.type === 'decimal') && (
                      <Input
                        id={`vote-${key}`}
                        type="number"
                        value={draft}
                        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                        step={desc.type === 'decimal' ? '0.01' : '1'}
                        min={desc.min}
                        max={desc.max}
                      />
                    )}
                  </div>
                  <Button
                    size="sm"
                    disabled={!!pending[key] || draft === '' || draft === row.yourVote}
                    onClick={() => castVote(key, draft)}
                  >
                    {row.yourVote === null ? (t('community.cast_vote') || 'Cast vote') : (t('community.update_vote') || 'Update vote')}
                  </Button>
                  {row.yourVote !== null && (
                    <Button size="sm" variant="outline" disabled={!!pending[key]} onClick={() => clearVote(key)}>
                      {t('community.clear_vote') || 'Clear'}
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
