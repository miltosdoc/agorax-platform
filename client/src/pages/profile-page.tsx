import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import AppShell from "@/components/layout/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/hooks/use-translation";
import { useLocation } from "wouter";
import { ArrowLeft, BadgeCheck, Download, Fingerprint, KeyRound, Loader2, Shield, Smartphone, Trash2, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { anonInventory, exportAnonData, importAnonData } from "@/lib/anon-transfer";
import { VerifyGovgrModal } from "@/components/user/verify-govgr-modal";
import { DeleteAccount } from "@/components/user/delete-account";
import { useToast } from "@/hooks/use-toast";
import { downloadApk } from "@/lib/download-apk";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [apkDownloading, setApkDownloading] = useState(false);
  const [inventory, setInventory] = useState(anonInventory);
  const [exportCode, setExportCode] = useState<string | null>(null);
  const [importCode, setImportCode] = useState('');
  const [importing, setImporting] = useState(false);

  async function handleAnonImport() {
    setImporting(true);
    try {
      const result = await importAnonData(importCode);
      if (!result.ok) {
        toast({
          title: result.error === 'panel_invalid' ? t('anon.importPanelInvalid') : t('anon.importInvalid'),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: t('anon.importOk', {
          panel: result.panelImported ? 1 : 0,
          receipts: result.receiptsAdded,
          pending: result.pendingAdded,
        }),
      });
      setImportCode('');
      setInventory(anonInventory());
    } finally {
      setImporting(false);
    }
  }
  const { toast } = useToast();

  async function handleApkDownload() {
    setApkDownloading(true);
    const result = await downloadApk();
    if (result === "unavailable") {
      toast({ title: t('android.notAvailable'), variant: "destructive" });
    } else if (result === "failed") {
      toast({ title: "Download failed", variant: "destructive" });
    }
    setApkDownloading(false);
  }

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
                <div className="rounded-lg border p-4 space-y-1.5 text-sm">
                  <p className="font-semibold text-base">
                    {effectiveUser.govgrVerified ? t('profile.verified') : t('profile.notVerified')}
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
                {!effectiveUser.govgrVerified && (
                  <>
                    <p className="text-sm text-muted-foreground">{t('profile.identityActionUnavailable')}</p>
                    <Button
                      onClick={() => setIsVerifyModalOpen(true)}
                      data-testid="button-verify-identity"
                      className="gap-2"
                    >
                      <Shield className="h-4 w-4" />
                      {t('profile.verifyIdentity')}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5 text-primary" />
                  {t('android.downloadTitle')}
                </CardTitle>
                <CardDescription>{t('android.downloadDescription')}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleApkDownload} disabled={apkDownloading} className="gap-2">
                  {apkDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  {t('android.downloadButton')}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="h-5 w-5 text-primary" />
                  {t('anon.transferTitle')}
                </CardTitle>
                <CardDescription>{t('anon.transferDescription')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t('anon.inventory', {
                    panel: inventory.hasPanel ? t('anon.panelYes') : t('anon.panelNo'),
                    receipts: inventory.receipts,
                    pending: inventory.pending,
                  })}
                </p>

                {!exportCode ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const code = exportAnonData();
                      if (code) setExportCode(code);
                      else toast({ title: t('anon.nothingToExport'), variant: "destructive" });
                    }}
                    data-testid="anon-export"
                  >
                    {t('anon.exportButton')}
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input readOnly value={exportCode} className="font-mono text-xs" />
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(exportCode);
                            toast({ title: t('media.linkCopied') });
                          } catch {
                            toast({ title: t('media.copyFailed'), variant: "destructive" });
                          }
                        }}
                      >
                        {t('panel.copy')}
                      </Button>
                    </div>
                    <p className="text-xs text-amber-700">{t('anon.exportWarning')}</p>
                  </div>
                )}

                <div className="border-t pt-4 space-y-2">
                  <p className="text-sm font-medium">{t('anon.importTitle')}</p>
                  <div className="flex gap-2">
                    <Input
                      value={importCode}
                      onChange={(e) => setImportCode(e.target.value)}
                      placeholder={t('anon.importPlaceholder')}
                      className="font-mono text-xs"
                      data-testid="anon-import-input"
                    />
                    <Button
                      size="sm"
                      className="shrink-0"
                      disabled={!importCode.trim() || importing}
                      onClick={handleAnonImport}
                      data-testid="anon-import"
                    >
                      {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : t('anon.importButton')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-destructive" />
                  {t('profile.accountDangerZone')}
                </CardTitle>
                <CardDescription>{t('profile.accountDeletionUnavailable')}</CardDescription>
              </CardHeader>
              <CardContent>
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
