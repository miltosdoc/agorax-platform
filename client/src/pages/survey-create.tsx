/**
 * Survey creation — natural-language intent → LLM Poll Compiler → preview →
 * field. The compiler enforces methodology (neutral wording, balanced
 * scales) and the adversarial reviewer blocks push-poll attempts with a
 * visible explanation.
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Sparkles, Send } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { TierBadge } from './surveys-page';

interface CompiledPollResponse {
  poll: { id: number; title: string; topicTag: string; tier: string };
  items: Array<{
    id: number; text: string; itemType: string; options: string[] | null;
    randomizeOptions: boolean; isAttentionCheck: boolean;
  }>;
  verdict: { approved: boolean; flags: Array<{ issue: string; explanation: string; severity: string }>; reasoning: string };
}

const ITEM_TYPE_LABELS: Record<string, string> = {
  single_choice: 'Μοναδική επιλογή',
  multi_choice: 'Πολλαπλή επιλογή',
  likert: 'Κλίμακα',
  open_text: 'Ελεύθερο κείμενο',
};

export default function SurveyCreatePage() {
  const [, navigate] = useLocation();
  const [intent, setIntent] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compiled, setCompiled] = useState<CompiledPollResponse | null>(null);

  async function compile() {
    setBusy(true);
    setError(null);
    try {
      const resp = await api.post<CompiledPollResponse>('/api/surveys', { intent });
      setCompiled(resp.data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Η μεταγλώττιση απέτυχε');
    } finally {
      setBusy(false);
    }
  }

  async function field() {
    if (!compiled) return;
    setBusy(true);
    try {
      await api.post(`/api/surveys/${compiled.poll.id}/field`, {});
      navigate(`/surveys/${compiled.poll.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Η δημοσίευση απέτυχε');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell title="Νέα Δημοσκόπηση">
      <p className="text-sm text-muted-foreground -mt-4 mb-6">
        Περιέγραψε τι θέλεις να μετρήσεις. Ο μεταγλωττιστής χτίζει ουδέτερο
        ερωτηματολόγιο — και ένας ανεξάρτητος έλεγχος απορρίπτει προσπάθειες
        προπαγάνδας.
      </p>

      {!compiled && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Τι θέλεις να μάθεις;
            </CardTitle>
            <CardDescription>
              π.χ. «Θέλω να μάθω αν οι κάτοικοι της γειτονιάς μου θα χρησιμοποιούσαν
              νέους ποδηλατοδρόμους στο κέντρο»
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Περιέγραψε την πρόθεσή σου με φυσική γλώσσα…"
            />
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
              </div>
            )}
            <Button onClick={compile} disabled={intent.trim().length < 10 || busy}>
              {busy ? 'Μεταγλώττιση…' : 'Δημιουργία ερωτηματολογίου'}
            </Button>
          </CardContent>
        </Card>
      )}

      {compiled && (
        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base">{compiled.poll.title}</CardTitle>
                <TierBadge tier={compiled.poll.tier} />
              </div>
              <CardDescription>Θέμα: {compiled.poll.topicTag}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {compiled.verdict.flags.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 space-y-1">
                  {compiled.verdict.flags.map((f, i) => (
                    <p key={i}><strong>{f.issue}</strong>: {f.explanation}</p>
                  ))}
                </div>
              )}
              <ol className="space-y-3">
                {compiled.items.map((item, i) => (
                  <li key={item.id} className="border rounded p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{i + 1}. {item.text}</p>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className="text-xs">{ITEM_TYPE_LABELS[item.itemType] ?? item.itemType}</Badge>
                        {item.isAttentionCheck && <Badge variant="secondary" className="text-xs">έλεγχος προσοχής</Badge>}
                        {item.randomizeOptions && <Badge variant="secondary" className="text-xs">τυχαία σειρά</Badge>}
                      </div>
                    </div>
                    {item.options && (
                      <ul className="mt-2 text-xs text-muted-foreground list-disc pl-5">
                        {item.options.map((o, j) => <li key={j}>{o}</li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted-foreground">
                Στην αρχή του ερωτηματολογίου θα προστεθούν αυτόματα 2–3 πάγιες
                ερωτήσεις της πλατφόρμας (κοινό σύστημα ερωτήσεων — δηλώνεται και
                στους συμμετέχοντες).
              </p>
              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
              )}
              <div className="flex gap-2">
                <Button onClick={field} disabled={busy}>
                  <Send className="w-4 h-4 mr-1" /> {busy ? 'Δημοσίευση…' : 'Δημοσίευση στο πάνελ'}
                </Button>
                <Button variant="outline" onClick={() => { setCompiled(null); setError(null); }}>
                  Νέα προσπάθεια
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </AppShell>
  );
}
