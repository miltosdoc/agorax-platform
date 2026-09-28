/**
 * The community's terms for each kind of vote, as an admin edits them.
 *
 * One block per kind — the same four the creation form offers, in the same
 * order — so what a community sets here and what an author can pick there
 * correspond one to one. Everything has a working default (see
 * DEFAULT_VOTE_RULES), so a community that never opens this still votes.
 */

import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { BarChart3, ScrollText, UserCheck, Vote } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/hooks/use-translation';
import {
  MAJORITY_RULES, PROPOSAL_KINDS, VOTE_RULE_COLUMNS, type MajorityRule, type ProposalKind,
} from '@shared/proposal-kinds';

/** The form fields behind the rules — the community columns of the same name. */
export interface VoteRulesForm {
  votingMinHours: number;
  votingMaxHours: number;
  decisionMajority: MajorityRule;
  minParticipationPct: string;
  statuteEnabled: boolean;
  statuteMinHours: number;
  statuteMaxHours: number;
  statuteMajority: MajorityRule;
  statuteMinParticipationPct: string;
  electionEnabled: boolean;
  electionMinHours: number;
  electionMaxHours: number;
  electionMinParticipationPct: string;
  electionNominationsEnabled: boolean;
  pollEnabled: boolean;
  pollMinHours: number;
  pollMaxHours: number;
  pollSuggestionsEnabled: boolean;
}

const ICONS: Record<ProposalKind, LucideIcon> = {
  decision: Vote,
  statute: ScrollText,
  election: UserCheck,
  poll: BarChart3,
};

/**
 * A duration entered in days or hours and stored in hours. Days is what
 * people mean for most votes; hours is there for a vote held during a
 * meeting.
 */
function DurationInput({ id, value, onChange }: { id: string; value: number; onChange: (hours: number) => void }) {
  const { t } = useTranslation();
  const [unit, setUnit] = useState<'days' | 'hours'>(value % 24 === 0 ? 'days' : 'hours');
  // Follow a value that arrives later (the saved row) without fighting the
  // author's own choice of unit.
  useEffect(() => {
    if (value % 24 !== 0) setUnit('hours');
  }, [value]);
  const shown = unit === 'days' ? value / 24 : value;
  return (
    <div className="flex gap-2">
      <Input
        id={id}
        type="number"
        min={1}
        step={1}
        value={Number.isInteger(shown) ? shown : Math.round(shown * 10) / 10}
        onChange={(e) => {
          const n = Math.max(1, Math.round(Number(e.target.value) || 1));
          onChange(unit === 'days' ? n * 24 : n);
        }}
        className="max-w-[7rem]"
      />
      <Select
        value={unit}
        onValueChange={(u) => {
          setUnit(u as 'days' | 'hours');
          // Keep the same length when only the unit changes, rounded up to
          // a whole day when switching to days.
          if (u === 'days') onChange(Math.max(24, Math.ceil(value / 24) * 24));
        }}
      >
        <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="days">{t('community.unit_days')}</SelectItem>
          <SelectItem value="hours">{t('community.unit_hours')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function VoteRulesSection<F extends VoteRulesForm>({
  form,
  update,
}: {
  form: F;
  update: <K extends keyof VoteRulesForm>(key: K, value: VoteRulesForm[K]) => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="space-y-4" data-testid="vote-rules-section">
      <div>
        <h2 className="text-lg font-semibold">{t('community.rules_title')}</h2>
        <p className="text-sm text-muted-foreground">{t('community.rules_help')}</p>
      </div>

      {PROPOSAL_KINDS.map((kind) => {
        const cols = VOTE_RULE_COLUMNS[kind];
        const Icon = ICONS[kind];
        const enabled = cols.enabled ? Boolean(form[cols.enabled]) : true;
        return (
          <div key={kind} className="space-y-4 rounded-sm border border-line p-4" data-testid={`vote-rules-${kind}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <Icon className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold text-ink">{t(`proposal.kind_${kind}`)}</h3>
                  <p className="mt-0.5 text-xs text-ink-faint">{t(`community.rules_${kind}_help`)}</p>
                </div>
              </div>
              {cols.enabled ? (
                <Switch
                  checked={enabled}
                  onCheckedChange={(on) => update(cols.enabled!, on)}
                  aria-label={t('community.rules_enabled')}
                  data-testid={`vote-rules-${kind}-enabled`}
                />
              ) : (
                <span className="text-xs text-ink-faint">{t('community.rules_always_on')}</span>
              )}
            </div>

            {enabled && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`${kind}-min`}>{t('community.rules_min_duration')}</Label>
                  <DurationInput id={`${kind}-min`} value={form[cols.min]} onChange={(h) => update(cols.min, h)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${kind}-max`}>{t('community.rules_max_duration')}</Label>
                  <DurationInput id={`${kind}-max`} value={form[cols.max]} onChange={(h) => update(cols.max, h)} />
                </div>
                {cols.majority && (
                  <div className="space-y-2">
                    <Label htmlFor={`${kind}-majority`}>{t('community.rules_majority')}</Label>
                    <Select value={form[cols.majority]} onValueChange={(v) => update(cols.majority!, v as MajorityRule)}>
                      <SelectTrigger id={`${kind}-majority`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MAJORITY_RULES.map((rule) => (
                          <SelectItem key={rule} value={rule}>{t(`community.majority_${rule}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {cols.quorum && (
                  <div className="space-y-2">
                    <Label htmlFor={`${kind}-quorum`}>{t('community.rules_quorum')}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`${kind}-quorum`}
                        type="number"
                        min={0}
                        max={100}
                        value={form[cols.quorum]}
                        onChange={(e) => update(cols.quorum!, e.target.value)}
                        className="max-w-[7rem]"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{t('community.rules_quorum_help')}</p>
                  </div>
                )}
                {cols.codrafting && (
                  <div className="flex items-start justify-between gap-4 border-t border-line pt-4 md:col-span-2">
                    <Label htmlFor={`${kind}-codrafting`} className="flex-1 cursor-pointer font-normal">
                      <span className="block text-sm text-ink">{t(`community.rules_${kind}_codrafting`)}</span>
                      <span className="mt-0.5 block text-xs text-ink-faint">{t(`community.rules_${kind}_codrafting_help`)}</span>
                    </Label>
                    <Switch
                      id={`${kind}-codrafting`}
                      checked={Boolean(form[cols.codrafting])}
                      onCheckedChange={(on) => update(cols.codrafting!, on)}
                      data-testid={`vote-rules-${kind}-codrafting`}
                    />
                  </div>
                )}
                {kind === 'election' && (
                  <p className="text-xs text-muted-foreground md:col-span-2">{t('community.rules_election_note')}</p>
                )}
                {kind === 'poll' && (
                  <p className="text-xs text-muted-foreground md:col-span-2">{t('community.rules_poll_note')}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
