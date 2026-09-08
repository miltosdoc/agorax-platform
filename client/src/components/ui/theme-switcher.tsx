/**
 * Colour theme picker for the header: one of the four logo accents.
 *
 * Applies instantly and locally, then saves to the account when signed in —
 * the same fire-and-forget contract as the language switcher, and for the
 * same reason: the interface has already changed, so a failed save costs
 * the member nothing now, and the next pick retries.
 */

import { Check, LayoutGrid, Palette } from 'lucide-react';
import { useLocation } from 'wouter';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/hooks/use-translation';
import { api } from '@/lib/api';
import { ACCENT_THEMES, THEME_SWATCH, type AccentTheme } from '@shared/theme';

export function ThemeSwitcher({ className = '' }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  const choose = (next: AccentTheme) => {
    setTheme(next);
    if (user) {
      void api.put('/api/user/theme', { theme: next }).catch(() => undefined);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`relative inline-flex h-9 w-9 items-center justify-center rounded-sm text-ink-soft transition-colors duration-[120ms] hover:bg-sunken hover:text-ink ${className}`}
          aria-label={t('theme.label')}
          title={t('theme.label')}
          data-testid="button-theme"
        >
          <Palette className="h-[18px] w-[18px]" />
          <span
            aria-hidden
            className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full ring-2 ring-paper"
            style={{ backgroundColor: THEME_SWATCH[theme] }}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="mt-2 w-48 rounded-sm border-line">
        <DropdownMenuLabel className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
          {t('theme.label')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ACCENT_THEMES.map((option) => (
          <DropdownMenuItem
            key={option}
            onClick={() => choose(option)}
            className="cursor-pointer gap-2.5"
            data-testid={`theme-${option}`}
          >
            <span
              aria-hidden
              className="h-3.5 w-3.5 rounded-full ring-1 ring-line"
              style={{ backgroundColor: THEME_SWATCH[option] }}
            />
            <span className="flex-1">{t(`theme.${option}`)}</span>
            {theme === option && <Check className="h-4 w-4 text-kyanos" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/appearance')} className="cursor-pointer gap-2.5" data-testid="theme-all">
          <LayoutGrid className="h-3.5 w-3.5 text-ink-faint" />
          <span>{t('theme.allThemes')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
