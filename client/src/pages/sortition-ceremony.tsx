/**
 * Selection Ceremony
 *
 * The democratic moment: shown immediately after a sortition body is created.
 * Frames the random draw as civic duty, displays the cryptographic
 * verification hash, and lists every selected member.
 */

import { useEffect, useState } from 'react';
import { useParams, Link } from 'wouter';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';

interface CeremonyMember {
  assignmentId: number;
  userId: number;
  name: string | null;
  username: string | null;
  profilePicture: string | null;
}

interface CeremonyData {
  bodyId: number;
  community: { id: number; name: string } | null;
  purpose: string;
  proposal: { id: number; question: string } | null;
  selectedAt: string | null;
  size: number;
  members: CeremonyMember[];
  verificationHash: string;
  currentUserAssignmentId: number | null;
}

function initials(name: string | null, username: string | null): string {
  const source = name ?? username ?? '?';
  return source
    .split(/\s+/)
    .map(p => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function SortitionCeremonyPage() {
  const params = useParams();
  const bodyId = params.bodyId;
  const { user } = useAuth();
  const [data, setData] = useState<CeremonyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bodyId) return;
    api.get<CeremonyData>(`/api/sortition/${bodyId}/ceremony`)
      .then((resp) => setData(resp.data))
      .catch((e) => setError(e?.message ?? 'Σφάλμα φόρτωσης'));
  }, [bodyId]);

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-amber-50/40 via-background to-background">
      <Header />
      <div className="container mx-auto py-8 px-4 max-w-2xl flex-grow">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700 mb-4">
            {error}
          </div>
        )}

        {!data && !error && (
          <div className="py-12 text-center text-sm text-muted-foreground">Φόρτωση…</div>
        )}

        {data && (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-medium">
                <Sparkles className="w-3.5 h-3.5" />
                Ο κλήρος έπεσε
              </div>
              <h1 className="text-3xl font-bold mb-2">Η στιγμή της δημοκρατίας</h1>
              <p className="text-sm text-muted-foreground">
                {data.community?.name && (
                  <>Στην κοινότητα <span className="font-medium">{data.community.name}</span> · </>
                )}
                {data.size} πολίτες κληρώθηκαν να αναλάβουν το πολιτικό τους καθήκον.
              </p>
            </div>

            {data.proposal && (
              <Card className="mb-4">
                <CardHeader className="pb-2">
                  <CardDescription>Σκοπός — {data.purpose}</CardDescription>
                  <CardTitle className="text-base">{data.proposal.question}</CardTitle>
                </CardHeader>
              </Card>
            )}

            <Card className="mb-4 border-amber-200 bg-amber-50/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="w-4 h-4 text-amber-700" />
                  Ψηφιακή σφραγίδα επαλήθευσης
                </CardTitle>
                <CardDescription>
                  Hash που μπορεί κάθε πολίτης να ξανατρέξει για να επαληθεύσει την κλήρωση.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="font-mono text-xs break-all bg-white border rounded p-3 text-amber-900">
                  {data.verificationHash}
                </div>
                {data.selectedAt && (
                  <div className="text-xs text-muted-foreground mt-2">
                    Κλήρωση: {new Date(data.selectedAt).toLocaleString('el-GR')}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Οι κληρωμένοι πολίτες</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data.members.map((m) => {
                    const isYou = user?.id === m.userId;
                    return (
                      <div
                        key={m.userId}
                        className={`flex items-center gap-3 p-3 rounded border ${
                          isYou ? 'border-amber-400 bg-amber-50' : 'border-border'
                        }`}
                      >
                        <Avatar className="w-10 h-10">
                          {m.profilePicture && (
                            <AvatarImage src={m.profilePicture} alt={m.name ?? ''} />
                          )}
                          <AvatarFallback>{initials(m.name, m.username)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {m.name ?? `Χρήστης #${m.userId}`}
                          </div>
                          {m.username && (
                            <div className="text-xs text-muted-foreground truncate">
                              @{m.username}
                            </div>
                          )}
                        </div>
                        {isYou && <Badge variant="default">Εσύ</Badge>}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {data.currentUserAssignmentId ? (
              <div className="flex justify-center">
                <Link href={`/sortition/${data.currentUserAssignmentId}`}>
                  <Button size="lg" className="bg-amber-600 hover:bg-amber-700">
                    Πήγαινε στην αποστολή σου
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="text-center text-sm text-muted-foreground">
                Δεν επιλέχθηκες σε αυτή την κλήρωση. Παρακολούθησε την εξέλιξη από
                {' '}<Link href="/sortition" className="underline">τον πίνακα κληρωτών σωμάτων</Link>.
              </div>
            )}
          </>
        )}
      </div>
      <Footer />
    </div>
  );
}
