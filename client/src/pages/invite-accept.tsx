/**
 * Invitation landing page — /invite/:token
 *
 * Reachable without an account on purpose: someone handed a link needs to see
 * which community is inviting them before deciding to sign up. The token is
 * only ever redeemed by an explicit click, never on page load, so opening the
 * link to look is not the same as joining.
 */

import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import Header from '@/components/layout/header';
import Footer from '@/components/layout/footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, MailOpen, ShieldX } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';

interface InvitePreview {
  token: string;
  communityId: number;
  communityName: string;
  communityDescription: string | null;
  targeted: boolean;
  role: string;
  message: string | null;
  expiresAt: string | null;
  valid: boolean;
  reason: 'revoked' | 'expired' | 'used' | 'not_for_you' | null;
  alreadyMember: boolean;
}

export default function InviteAcceptPage() {
  const { token } = useParams();
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { t } = useTranslation();

  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-fetched once auth settles: the same token reads differently for a
  // signed-in caller (it can be addressed to someone else, or already redeemed).
  useEffect(() => {
    if (!token || authLoading) return;
    setLoading(true);
    api.get<InvitePreview>(`/api/invites/${token}`)
      .then((r) => setInvite(r.data))
      .catch(() => setInvite(null))
      .finally(() => setLoading(false));
  }, [token, authLoading, user?.id]);

  const accept = async () => {
    if (!token) return;
    setAccepting(true);
    setError(null);
    try {
      const res = await api.post<{ communityId: number }>(`/api/invites/${token}/accept`, {});
      setLocation(`/communities/${res.data.communityId}`);
    } catch (e: any) {
      setError(e?.message || t('invite.accept_failed') || 'Η αποδοχή απέτυχε.');
      setAccepting(false);
    }
  };

  const reasonText = (reason: InvitePreview['reason']) => {
    switch (reason) {
      case 'revoked': return t('invite.reason_revoked') || 'Η πρόσκληση ανακλήθηκε.';
      case 'expired': return t('invite.reason_expired') || 'Η πρόσκληση έληξε.';
      case 'used': return t('invite.reason_used') || 'Η πρόσκληση έχει ήδη χρησιμοποιηθεί.';
      case 'not_for_you': return t('invite.reason_not_for_you') || 'Η πρόσκληση απευθύνεται σε άλλον λογαριασμό.';
      default: return t('invite.reason_unknown') || 'Η πρόσκληση δεν είναι έγκυρη.';
    }
  };

  const body = () => {
    if (loading || authLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      );
    }

    if (!invite) {
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <ShieldX className="h-10 w-10 text-destructive" />
          <p className="text-muted-foreground">{t('invite.not_found') || 'Δεν βρέθηκε τέτοια πρόσκληση.'}</p>
        </div>
      );
    }

    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <MailOpen className="h-6 w-6 mt-1 text-primary shrink-0" />
          <div>
            <p className="text-lg font-medium">{invite.communityName}</p>
            {invite.communityDescription && (
              <p className="text-sm text-muted-foreground mt-1">{invite.communityDescription}</p>
            )}
          </div>
        </div>

        {invite.message && (
          <blockquote className="border-l-2 border-line pl-3 text-sm italic text-muted-foreground">
            {invite.message}
          </blockquote>
        )}

        {invite.role === 'admin' && (
          <p className="text-sm">{t('invite.as_admin') || 'Η πρόσκληση σε εντάσσει ως διαχειριστή.'}</p>
        )}

        {invite.expiresAt && invite.valid && (
          <p className="text-xs text-muted-foreground">
            {(t('invite.expires_at') || 'Ισχύει έως') + ' ' + new Date(invite.expiresAt).toLocaleString()}
          </p>
        )}

        {invite.alreadyMember ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t('invite.already_member') || 'Είσαι ήδη μέλος αυτής της κοινότητας.'}</p>
            <Button onClick={() => setLocation(`/communities/${invite.communityId}`)}>
              {t('invite.go_to_community') || 'Στην κοινότητα'}
            </Button>
          </div>
        ) : !invite.valid ? (
          <p className="text-sm text-destructive">{reasonText(invite.reason)}</p>
        ) : !user ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('invite.sign_in_note') || 'Συνδέσου ή δημιούργησε λογαριασμό για να αποδεχθείς την πρόσκληση.'}
            </p>
            <Button onClick={() => setLocation(`/auth?returnTo=${encodeURIComponent(`/invite/${token}`)}`)}>
              {t('invite.sign_in') || 'Σύνδεση / Εγγραφή'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Button onClick={accept} disabled={accepting} data-testid="invite-accept">
              {accepting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('invite.accept') || 'Αποδοχή πρόσκλησης'}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle className="font-serif font-normal">{t('invite.title') || 'Πρόσκληση σε κοινότητα'}</CardTitle>
            <CardDescription>
              {t('invite.subtitle') || 'Κάποιος σε προσκαλεί να συμμετάσχεις.'}
            </CardDescription>
          </CardHeader>
          <CardContent>{body()}</CardContent>
        </Card>
      </main>
      <Footer />
    </div>
  );
}
