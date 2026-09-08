import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import AppShell from "@/components/layout/AppShell";
import { ProfileSummaryRail, MyProposalsRail } from '@/components/rails/personal-rails';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/hooks/use-translation";
import { useLocation } from "wouter";
import { ArrowLeft, BadgeCheck, Download, Fingerprint, KeyRound, Loader2, Shield, Smartphone, Trash2, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { anonInventory, exportAnonData, importAnonData } from "@/lib/anon-transfer";
import { DeleteAccount } from "@/components/user/delete-account";
import { useToast } from "@/hooks/use-toast";
import { downloadApk } from "@/lib/download-apk";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { api, ApiError } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { usernameChangeAvailableAt } from "@shared/user-identity";

/**
 * Editing the two identity fields.
 *
 * They are deliberately unalike. The handle is the label everyone else sees,
 * so it is unique, constrained and changed seldom; the display name is
 * account data that addresses the member's email and is shown to nobody, so
 * it is theirs to change freely.
 */
function IdentityEditor({ user }: { user: { username: string; name: string; usernameChangedAt?: string | null } }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [name, setName] = useState(user.name ?? '');
  const [username, setUsername] = useState(user.username ?? '');
  const [savingName, setSavingName] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);

  const lockedUntil = usernameChangeAvailableAt(user.usernameChangedAt ?? null);

  async function saveName() {
    setSavingName(true);
    try {
      await api.put('/api/user/name', { name: name.trim() });
      await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      toast({ title: t('profile.nameSaved') });
    } catch (e) {
      toast({
        title: e instanceof ApiError ? e.message : t('profile.saveFailed'),
        variant: 'destructive',
      });
    } finally {
      setSavingName(false);
    }
  }

  async function saveUsername() {
    setSavingUsername(true);
    try {
      await api.put('/api/user/username', { username: username.trim() });
      await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      toast({ title: t('profile.usernameSaved') });
    } catch (e) {
      toast({
        title: e instanceof ApiError ? e.message : t('profile.saveFailed'),
        variant: 'destructive',
      });
    } finally {
      setSavingUsername(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="profile-username" className="text-sm font-medium text-muted-foreground">
          {t('auth.username')}
        </label>
        <div className="flex gap-2">
          <Input
            id="profile-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={!!lockedUntil || savingUsername}
            data-testid="input-username"
            autoCapitalize="none"
            spellCheck={false}
          />
          <Button
            size="sm"
            onClick={saveUsername}
            disabled={!!lockedUntil || savingUsername || username.trim() === user.username}
            data-testid="button-save-username"
          >
            {savingUsername ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {lockedUntil
            ? t('profile.usernameLocked', { date: lockedUntil.toLocaleDateString() })
            : t('profile.usernameHelp')}
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="profile-name" className="text-sm font-medium text-muted-foreground">
          {t('profile.name')}
        </label>
        <div className="flex gap-2">
          <Input
            id="profile-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={savingName}
            data-testid="input-name"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={saveName}
            disabled={savingName || name.trim() === user.name}
            data-testid="button-save-name"
          >
            {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : t('common.save')}
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{t('profile.nameHelp')}</p>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
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
      {effectiveUser.isAdmin && (
        <Badge variant="outline" className="min-h-8 px-3">
          <Shield className="mr-1.5 h-4 w-4" />
          {t('profile.adminRole')}
        </Badge>
      )}
    </div>
  );

  return (
    <AppShell
      title={t('profile.accountSettings')}
      actions={headerActions}
      leftRail={<ProfileSummaryRail />}
      rightRail={<MyProposalsRail />}
    >
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
              {user ? (
                <IdentityEditor user={effectiveUser as any} />
              ) : (
                <>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('auth.username')}</p>
                    <p className="break-words font-medium">{effectiveUser.username}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">{t('profile.name')}</p>
                    <p className="break-words">{effectiveUser.name}</p>
                  </div>
                </>
              )}
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
    </AppShell>
  );
}
