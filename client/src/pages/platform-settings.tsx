import React, { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/use-translation";
import { useAuth } from "@/hooks/use-auth";
import AppShell from "@/components/layout/AppShell";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { LogoLoader } from "@/components/brand/LogoLoader";
import { Button } from '@/components/ui/button';

interface PlatformSetting {
  id: number;
  key: string;
  value: string;
  description?: string;
  lastChangedBy?: number;
  lastChangedAt?: string;
}

type SettingType = "text" | "textarea" | "number" | "select" | "boolean";

interface SettingDef {
  key: string;
  label: string;
  type: SettingType;
  options?: string[];
  default: string;
}

interface SettingGroupDef {
  title: string;
  settings: SettingDef[];
}

const SETTINGS_GROUPS: SettingGroupDef[] = [
  {
    title: "platformSettings.general",
    settings: [
      { key: "platform_name", label: "platformSettings.platformName", type: "text", default: "Agora" },
      { key: "platform_description", label: "platformSettings.platformDescription", type: "textarea", default: "" },
      { key: "default_community_type", label: "platformSettings.defaultCommunityType", type: "select", options: ["autonomous", "managed"], default: "autonomous" },
      { key: "default_language", label: "platformSettings.defaultLanguage", type: "select", options: ["en", "el"], default: "el" },
    ],
  },
  {
    title: "platformSettings.proposals",
    settings: [
      { key: "proposal_min_participation", label: "platformSettings.minParticipation", type: "number", default: "10" },
      { key: "proposal_debate_period_days", label: "platformSettings.debatePeriodDays", type: "number", default: "7" },
      { key: "proposal_voting_period_days", label: "platformSettings.votingPeriodDays", type: "number", default: "5" },
      { key: "proposal_sortition_size", label: "platformSettings.sortitionSize", type: "number", default: "20" },
    ],
  },
  {
    title: "platformSettings.sortition",
    settings: [
      { key: "sortition_response_deadline_hours", label: "platformSettings.responseDeadlineHours", type: "number", default: "72" },
      { key: "sortition_min_score_pass", label: "platformSettings.minScorePass", type: "number", default: "60" },
      { key: "sortition_max_members", label: "platformSettings.maxSortitionMembers", type: "number", default: "50" },
    ],
  },
  {
    title: "platformSettings.notifications",
    settings: [
      { key: "notifications_email_enabled", label: "platformSettings.emailEnabled", type: "boolean", default: "true" },
      { key: "notifications_inapp_enabled", label: "platformSettings.inAppEnabled", type: "boolean", default: "true" },
    ],
  },
];

const ALL_DEFAULTS: Record<string, string> = SETTINGS_GROUPS
  .flatMap((g) => g.settings)
  .reduce((acc, s) => ({ ...acc, [s.key]: s.default }), {} as Record<string, string>);

export function PlatformSettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, string>>(ALL_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    setLoadFailed(false);
    try {
      const res = await api.get<PlatformSetting[]>("/api/platform-settings");
      const next: Record<string, string> = { ...ALL_DEFAULTS };
      for (const s of res.data || []) {
        next[s.key] = s.value;
      }
      setValues(next);
      setDirty(false);
    } catch (err) {
      console.error("Failed to load settings:", err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (loadFailed || !dirty) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      for (const [key, value] of Object.entries(values)) {
        await api.patch("/api/platform-settings", { key, value });
      }
      setSaved(true);
      setDirty(false);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setError(t("platformSettings.saveError"));
    } finally {
      setSaving(false);
    }
  }

  function handleChange(key: string, value: string) {
    setValues(prev => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  }

  // These are platform-wide settings, not account ones, so a member who
  // reaches the URL directly is told plainly rather than shown a form whose
  // every save the server will refuse.
  if (!user?.isAdmin) {
    return (
      <AppShell title={t("platformSettings.title")}>
        <div className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-6" data-testid="platform-settings-denied">
          <p className="text-base leading-relaxed text-ink-soft">{t('platformSettings.adminOnly')}</p>
        </div>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell title={t("platformSettings.title")}>
        <div className="flex items-center justify-center py-12">
          <LogoLoader className="h-10 w-auto text-kyanos" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t("platformSettings.title")}>
      <div className="mx-auto max-w-3xl space-y-5">
        <p className="text-base leading-relaxed text-muted-foreground">{t('redesign.personal.settingsIntro')}</p>
        {loadFailed && <div role="alert" className="space-y-3 rounded-lg border p-5">
          <p>{t('redesign.personal.settingsLoadFailed')}</p>
          <Button variant="outline" onClick={loadSettings}>{t('redesign.personal.tryAgain')}</Button>
        </div>}
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
        {saved && (
          <div role="status" className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            {t("platformSettings.saved")}
          </div>
        )}

        <fieldset disabled={saving || loadFailed} className="space-y-4">
        {SETTINGS_GROUPS.map((group, index) => (
          <details key={group.title} open={index === 0} className="overflow-hidden rounded-xl border bg-surface">
            <summary className="cursor-pointer bg-muted/30 px-5 py-5 text-lg font-semibold">{t(group.title)}</summary>
            <div className="divide-y divide-border border-t">
              {group.settings.map((setting) => (
                <div key={setting.key} className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <label className="flex-1 text-base font-medium" htmlFor={`setting-${setting.key}`}>
                    {t(setting.label)}
                  </label>
                  {setting.type === "textarea" ? (
                    <textarea
                      id={`setting-${setting.key}`}
                      className="w-full sm:flex-1 rounded-lg border border-input bg-background px-3 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                      rows={3}
                      value={values[setting.key] ?? ""}
                      onChange={(e) => handleChange(setting.key, e.target.value)}
                    />
                  ) : setting.type === "select" ? (
                    <select
                      id={`setting-${setting.key}`}
                      className="min-h-11 w-full sm:w-auto rounded-lg border border-input bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                      value={values[setting.key] ?? ""}
                      onChange={(e) => handleChange(setting.key, e.target.value)}
                    >
                      {setting.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt === 'autonomous' || opt === 'managed' ? t(`community.type_${opt}`) : opt === 'el' ? 'Ελληνικά' : opt === 'en' ? 'English' : opt}
                        </option>
                      ))}
                    </select>
                  ) : setting.type === "boolean" ? (
                    <Switch
                      id={`setting-${setting.key}`}
                      data-testid={`toggle-${setting.key}`}
                      checked={values[setting.key] === "true"}
                      disabled={saving || loadFailed}
                      onCheckedChange={(checked) => handleChange(setting.key, checked ? "true" : "false")}
                    />
                  ) : (
                    <input
                      id={`setting-${setting.key}`}
                      type={setting.type}
                      className="min-h-11 w-full sm:w-48 rounded-lg border border-input bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                      value={values[setting.key] ?? ""}
                      onChange={(e) => handleChange(setting.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </details>
        ))}
        </fieldset>

        <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/95 p-4 shadow-sm sm:bottom-4">
          <p role="status" className="text-sm text-muted-foreground">{dirty && t('redesign.personal.unsaved')}</p>
          <Button
            onClick={handleSave}
            disabled={saving || !dirty || loadFailed}
          >
            {saving ? t("platformSettings.saving") : t("platformSettings.save")}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
