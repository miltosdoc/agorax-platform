import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/hooks/use-translation";
import { useLocation } from "wouter";
import { ArrowLeft, BadgeCheck, Fingerprint, Shield, Trash2, User } from "lucide-react";
import { VerifyGovgrModal } from "@/components/user/verify-govgr-modal";
import { DeleteAccount } from "@/components/user/delete-account";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);

  const effectiveUser = user ?? {
    id: 0,
    username: "demo",
    name: "Demo User",
    email: "demo@agorax.gr",
    profilePicture: null,
    isAdmin: false,
    accountStatus: "active",
    govgrVerified: false,
    govgrVerifiedAt: null,
    govgrFirstName: null,
    govgrLastName: null,
    govgrMunicipality: null,
    govgrPostcode: null,
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  const headerActions = (
    <div className="flex flex-wrap gap-2">
      <Badge variant={effectiveUser.govgrVerified ? "default" : "secondary"} className="min-h-8 px-3">
        <BadgeCheck className="mr-1.5 h-4 w-4" />
        {effectiveUser.govgrVerified ? t('ballot.verified') : t('ballot.unverified')}
      </Badge>
      {effectiveUser.isAdmin && (
        <Badge variant="outline" className="min-h-8 px-3">
          <Shield className="mr-1.5 h-4 w-4" />
          {t('profile.adminRole')}
        </Badge>
      )}
    </div>
  );

  return (
    <AppShell title={t('profile.accountSettings')} actions={headerActions}>
      <div data-testid="page-profile-settings">
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2"
          onClick={() => setLocation("/home")}
          data-testid="button-profile-back"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('general.back')}
        </Button>
        <p className="mb-6 max-w-2xl text-muted-foreground">
          {t('profile.accountSettingsDescription')}
        </p>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                {t('profile.userInformation')}
              </CardTitle>
              <CardDescription>{t('profile.securityAndAccess')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('profile.memberId')}</p>
                <p className="font-mono text-sm">#{effectiveUser.id}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('auth.username')}</p>
                <p className="break-words font-medium">{effectiveUser.username}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('profile.name')}</p>
                <p className="break-words">{effectiveUser.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('auth.email')}</p>
                <p className="break-words">{effectiveUser.email}</p>
              </div>
              <Separator />
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t('profile.accountStatus')}</p>
                <p>{effectiveUser.accountStatus || 'active'}</p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Fingerprint className="h-5 w-5 text-primary" />
                  {t('profile.identityVerification')}
                </CardTitle>
                <CardDescription>{t('profile.identityVerificationDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium text-muted-foreground">{t('profile.govgrStatus')}</p>
                  <p className="mt-1 font-semibold">
                    {effectiveUser.govgrVerified ? t('profile.verified') : t('profile.notVerified')}
                  </p>
                </div>
                {effectiveUser.govgrVerified &&
                  (effectiveUser.govgrFirstName || effectiveUser.govgrMunicipality) && (
                    <div className="rounded-lg border p-4 space-y-1.5 text-sm">
                      <p className="font-medium text-muted-foreground">
                        {t('profile.verifiedIdentity')}
                      </p>
                      {(effectiveUser.govgrFirstName || effectiveUser.govgrLastName) && (
                        <p>
                          <span className="text-muted-foreground">{t('profile.verifiedName')}:</span>{' '}
                          {[effectiveUser.govgrFirstName, effectiveUser.govgrLastName]
                            .filter(Boolean)
                            .join(' ')}
                        </p>
                      )}
                      {(effectiveUser.govgrMunicipality || effectiveUser.govgrPostcode) && (
                        <p>
                          <span className="text-muted-foreground">
                            {t('profile.verifiedResidence')}:
                          </span>{' '}
                          {[effectiveUser.govgrMunicipality, effectiveUser.govgrPostcode]
                            .filter(Boolean)
                            .join(' ')}
                        </p>
                      )}
                    </div>
                  )}
                <p className="text-sm text-muted-foreground">{t('profile.identityActionUnavailable')}</p>
                {!effectiveUser.govgrVerified && (
                  <Button
                    onClick={() => setIsVerifyModalOpen(true)}
                    data-testid="button-verify-identity"
                    className="gap-2"
                  >
                    <Shield className="h-4 w-4" />
                    {t('profile.verifyIdentity')}
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-destructive" />
                  {t('profile.accountDangerZone')}
                </CardTitle>
                <CardDescription>{t('profile.accountDangerZoneDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">{t('profile.accountDeletionUnavailable')}</p>
                <DeleteAccount />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <VerifyGovgrModal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
      />
    </AppShell>
  );
}
