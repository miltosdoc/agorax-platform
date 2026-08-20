/**
 * Tracker trends (internal) — wave-over-wave view of a question-bank code
 * across closed polls. Wording is character-identical by construction;
 * a version bump shows up as its own column so breaks are visible, never
 * smoothed over.
 */
import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';

interface BankRow { id: number; code: string; version: number; text: string; category: string }
interface Wave {
  pollId: number; tier: string; fieldEnd: string | null; bankVersion: number;
  completes: number; options: string[] | null;
  shares: number[] | null; weightedShares: number[] | null; effectiveN: string | null;
}

export default function SurveyTrendsPage() {
  const { locale } = useTranslation();
  const en = locale === 'en';
  const [bank, setBank] = useState<BankRow[]>([]);
  const [code, setCode] = useState<string>('');
  const [waves, setWaves] = useState<Wave[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<BankRow[]>('/api/admin/question-bank')
      .then((r) => setBank(r.data.filter((b) => b.category === 'tracker' || b.category === 'benchmark')))
      .catch((e) => setError(e?.message ?? (en ? 'Admins only' : 'Μόνο για διαχειριστές')));
  }, []);

  useEffect(() => {
    if (!code) return;
    setWaves(null);
    api.get<{ waves: Wave[] }>(`/api/admin/surveys/trends?code=${encodeURIComponent(code)}`)
      .then((r) => setWaves(r.data.waves))
      .catch((e) => setError(e?.message ?? (en ? 'Error' : 'Σφάλμα')));
  }, [code]);

  const codes = [...new Set(bank.map((b) => b.code))];
  const selected = bank.find((b) => b.code === code);
  const latest = waves?.[waves.length - 1];

  return (
    <AppShell title={en ? 'Tracker Trends' : 'Τάσεις Δεικτών'} breadcrumb={[{ label: en ? 'Polls' : 'Δημοσκοπήσεις', href: '/surveys' }, { label: en ? 'Trends' : 'Τάσεις' }]}>
      <p className="text-sm text-muted-foreground -mt-4 mb-6">
        {en
          ? 'Standing questions (trackers) wave-over-wave. Wording is identical between waves by construction — a version change is shown explicitly.'
          : 'Πάγιες ερωτήσεις (trackers) κύμα-προς-κύμα. Η διατύπωση είναι πανομοιότυπη μεταξύ κυμάτων εξ ορισμού — αλλαγή έκδοσης εμφανίζεται ρητά.'}
      </p>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-4">{error}</div>}

      <div className="max-w-md mb-6">
        <Select value={code} onValueChange={setCode}>
          <SelectTrigger><SelectValue placeholder={en ? 'Choose a tracker…' : 'Επίλεξε δείκτη…'} /></SelectTrigger>
          <SelectContent>
            {codes.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {selected && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{selected.text}</CardTitle>
            <CardDescription>
              {code} · {waves ? `${waves.length} ${en ? 'waves' : 'κύματα'}` : en ? 'loading…' : 'φόρτωση…'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {waves && waves.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">{en ? 'No closed wave with a sufficient sample yet.' : 'Κανένα κλειστό κύμα με επαρκές δείγμα ακόμη.'}</p>
            )}
            {waves && waves.length > 0 && latest?.options && (
              <div className="overflow-x-auto">
                <table className="text-sm w-full">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b">
                      <th className="py-2 pr-4">{en ? 'Wave' : 'Κύμα'}</th>
                      <th className="py-2 pr-4">n</th>
                      <th className="py-2 pr-4">v</th>
                      {latest.options.map((o, i) => <th key={i} className="py-2 pr-4">{o}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {waves.map((w) => (
                      <tr key={w.pollId} className="border-b last:border-0">
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {w.fieldEnd ? new Date(w.fieldEnd).toLocaleDateString(en ? 'en-US' : 'el-GR') : `#${w.pollId}`}
                          {w.tier === 'certified' && <Badge className="ml-1 text-[10px]">cert</Badge>}
                        </td>
                        <td className="py-2 pr-4">{w.completes}</td>
                        <td className="py-2 pr-4">{w.bankVersion}</td>
                        {(w.weightedShares ?? w.shares ?? []).map((s, i) => (
                          <td key={i} className="py-2 pr-4">
                            {(s * 100).toFixed(0)}%{w.weightedShares ? '' : '*'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-muted-foreground mt-2">{en ? '* unweighted (below the minimum weighting n)' : '* αστάθμιστο (κάτω από το ελάχιστο n στάθμισης)'}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
