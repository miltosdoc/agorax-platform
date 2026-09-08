import { Check, Palette } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/hooks/use-auth";
import { previewTheme, useTheme } from "@/hooks/use-theme";
import { useTranslation } from "@/hooks/use-translation";
import { api } from "@/lib/api";
import { ACCENT_THEMES, type AccentTheme } from "@shared/theme";

/**
 * The theme gallery: one card per palette, each rendered in its own colours.
 *
 * Nothing here is a picture. The card body is a miniature of the real
 * header, a proposal card and a ballot strip, painted from the same tokens
 * the live page uses — a wrapper carrying `data-accent` scopes the palette
 * to the card — so the preview cannot drift from what choosing it does.
 *
 * Hovering a card paints the whole page in that theme (Quick Look) and
 * leaving restores the chosen one; only the button commits.
 */

const SWATCHES: { token: string; name: string }[] = [
  { token: "--ink", name: "ink" },
  { token: "--ink-soft", name: "ink-soft" },
  { token: "--kyanos", name: "accent" },
  { token: "--kyanos-wash", name: "wash" },
  { token: "--sunken", name: "sunken" },
  { token: "--paper", name: "paper" },
];

function Miniature() {
  const { t } = useTranslation();
  return (
    <div className="overflow-hidden rounded-sm border border-line bg-paper text-ink" aria-hidden="true">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-line px-3 py-2">
        <span className="font-serif text-sm leading-none">AgoraX</span>
        <span className="ml-auto flex items-center gap-2.5 text-[10px] text-ink-soft">
          <span>{t('nav.home')}</span>
          <span className="border-b-2 border-kyanos pb-0.5 font-medium text-ink">{t('nav.proposals')}</span>
          <span>{t('nav.communities')}</span>
        </span>
        <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium text-paper">{t('auth.login')}</span>
      </div>
      {/* card */}
      <div className="p-3">
        <div className="rounded-sm border border-line bg-surface p-3">
          <div className="flex items-center gap-2">
            <span className="rounded-sm bg-kyanos-wash px-1.5 py-0.5 font-sans text-[9px] font-semibold uppercase tracking-[0.12em] text-kyanos">
              {t('themes.mockTag')}
            </span>
            <span className="ml-auto font-mono text-[9px] text-ink-faint">08/2026</span>
          </div>
          <div className="mt-1.5 font-serif text-[13px] leading-snug">{t('themes.mockTitle')}</div>
          <div className="mt-1 text-[10px] leading-relaxed text-ink-soft">{t('themes.mockBody')}</div>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="rounded-sm bg-ink px-2 py-1 text-[10px] font-medium text-paper">{t('rail.learnMore')}</span>
            <span className="text-[10px] font-medium text-kyanos">{t('rail.more')} ›</span>
          </div>
        </div>
        {/* ballot strip — the one thing that does not change between themes */}
        <div className="mt-3 flex items-center gap-2 font-mono text-[9px] uppercase tracking-wide">
          <span className="text-yper">{t('themes.mockYes')}</span>
          <span className="h-1.5 flex-[3] rounded-full bg-yper" />
          <span className="h-1.5 flex-[1] rounded-full bg-kata" />
          <span className="text-kata">{t('themes.mockNo')}</span>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({
  theme,
  active,
  onChoose,
}: {
  theme: AccentTheme;
  active: boolean;
  onChoose: (theme: AccentTheme) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      data-accent={theme}
      onMouseEnter={() => previewTheme(theme)}
      onMouseLeave={() => previewTheme(null)}
      className={`flex flex-col rounded-sm border bg-surface p-4 transition-colors duration-[120ms] ${
        active ? "border-kyanos ring-1 ring-kyanos" : "border-line hover:border-line-strong"
      }`}
      data-testid={`appearance-card-${theme}`}
    >
      <Miniature />

      <div className="mt-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="font-serif text-lg leading-tight text-ink">{t(`theme.${theme}`)}</h2>
            <span className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              {t(`theme.${theme}.mood`)}
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{t(`theme.${theme}.about`)}</p>
        </div>
      </div>

      <div className="mt-3 flex gap-1" aria-hidden="true">
        {SWATCHES.map((s) => (
          <span
            key={s.token}
            title={s.name}
            className="h-5 flex-1 rounded-sm border border-line"
            style={{ backgroundColor: `var(${s.token})` }}
          />
        ))}
      </div>

      <div className="mt-4">
        {active ? (
          <span className="inline-flex h-9 items-center gap-2 rounded-sm bg-kyanos-wash px-4 text-sm font-medium text-kyanos" data-testid="appearance-current">
            <Check className="h-4 w-4" />
            {t('themes.current')}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onChoose(theme)}
            className="inline-flex h-9 items-center gap-2 rounded-sm bg-ink px-4 text-sm font-medium text-paper transition-colors duration-[120ms] hover:bg-kyanos-deep"
            data-testid={`appearance-apply-${theme}`}
          >
            {t('themes.apply')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function AppearancePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();

  const choose = (next: AccentTheme) => {
    setTheme(next);
    if (user) {
      void api.put('/api/user/theme', { theme: next }).catch(() => undefined);
    }
  };

  return (
    <AppShell breadcrumb={[{ label: t('themes.title') }]}>
      <section className="mb-8 rounded-sm border border-line bg-kyanos-wash px-6 py-10 sm:px-10">
        <Palette className="mb-4 h-8 w-8 text-kyanos" aria-hidden="true" />
        <h1 className="font-serif text-3xl leading-tight text-ink sm:text-4xl">{t('themes.title')}</h1>
        <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-ink-soft sm:text-base">{t('themes.intro')}</p>
        <p className="mt-2 text-xs text-ink-faint">{t('themes.hoverHint')}</p>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ACCENT_THEMES.map((option) => (
          <ThemeCard key={option} theme={option} active={theme === option} onChoose={choose} />
        ))}
      </div>

      <p className="mt-6 text-xs text-ink-faint">
        {user ? t('themes.savedToAccount') : t('themes.savedToDevice')}
      </p>
    </AppShell>
  );
}
