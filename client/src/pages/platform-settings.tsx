import React, { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/use-translation";
import { useAuth } from "@/hooks/use-auth";
import AppShell from "@/components/layout/AppShell";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";

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
      { key: "platform_name", label: "platformSettings.platformName", type: "text", default: "AgoraX" },
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

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const res = await api.get<PlatformSetting[]>("/api/platform-settings");
      const next: Record<string, string> = { ...ALL_DEFAULTS };
      for (const s of res.data || []) {
        next[s.key] = s.value;
      }
      setValues(next);
    } catch (err) {
      console.error("Failed to load settings:", err);
      // Fall back to defaults so the page is still usable on a fresh DB.
      setValues({ ...ALL_DEFAULTS });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      for (const [key, value] of Object.entries(values)) {
        await api.patch("/api/platform-settings", { key, value });
      }
      setSaved(true);
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
  }

  if (loading) {
    return (
      <AppShell title={t("platformSettings.title")}>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t("platformSettings.title")}>
      <div className="max-w-4xl space-y-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            {t("platformSettings.saved")}
          </div>
        )}

        {SETTINGS_GROUPS.map((group) => (
          <div key={group.title} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">{t(group.title)}</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {group.settings.map((setting) => (
                <div key={setting.key} className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <label className="flex-1 text-sm font-medium text-gray-700" htmlFor={`setting-${setting.key}`}>
                    {t(setting.label)}
                  </label>
                  {setting.type === "textarea" ? (
                    <textarea
                      id={`setting-${setting.key}`}
                      className="w-full sm:flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      rows={2}
                      value={values[setting.key] ?? ""}
                      onChange={(e) => handleChange(setting.key, e.target.value)}
                    />
                  ) : setting.type === "select" ? (
                    <select
                      id={`setting-${setting.key}`}
                      className="w-full sm:w-auto rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      value={values[setting.key] ?? ""}
                      onChange={(e) => handleChange(setting.key, e.target.value)}
                    >
                      {setting.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : setting.type === "boolean" ? (
                    <Switch
                      id={`setting-${setting.key}`}
                      data-testid={`toggle-${setting.key}`}
                      checked={values[setting.key] === "true"}
                      onCheckedChange={(checked) => handleChange(setting.key, checked ? "true" : "false")}
                    />
                  ) : (
                    <input
                      id={`setting-${setting.key}`}
                      type={setting.type}
                      className="w-full sm:w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                      value={values[setting.key] ?? ""}
                      onChange={(e) => handleChange(setting.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex justify-end gap-3 pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? t("platformSettings.saving") : t("platformSettings.save")}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
