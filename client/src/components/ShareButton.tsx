/**
 * Universal share button — opens a popover with the social networks that
 * matter in Greece (X, Facebook, WhatsApp, Viber, Telegram, LinkedIn,
 * email), plus copy-link and the native share sheet where available.
 * Used on proposals, polls, and the feed; media cards share their /p/...
 * server-rendered player pages through the same component.
 */
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Share2, Link2, Mail, MoreHorizontal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';

interface ShareButtonProps {
  /** Path or absolute URL to share. Paths are resolved against the origin. */
  url: string;
  title: string;
  text?: string;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ghost' | 'default';
  /** Hide the label, icon-only. */
  iconOnly?: boolean;
}

// ─── Brand icons (inline SVG — lucide's brand set is deprecated/incomplete) ──

const X_ICON = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);
const FACEBOOK_ICON = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#1877F2" aria-hidden>
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);
const WHATSAPP_ICON = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#25D366" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);
const VIBER_ICON = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#7360F2" aria-hidden>
    <path d="M11.4 0C9.473.028 5.333.344 3.02 2.467 1.302 4.187.696 6.7.633 9.817.57 12.933.488 18.776 6.12 20.36h.003l-.004 2.416s-.037.977.61 1.177c.777.242 1.234-.5 1.98-1.302.407-.44.972-1.084 1.397-1.58 3.85.323 6.812-.416 7.15-.525.776-.252 5.176-.816 5.892-6.657.74-6.02-.36-9.83-2.34-11.546-.596-.55-3.006-2.3-8.375-2.323 0 0-.395-.025-1.037-.02zm.067 1.697c.545-.003.88.02.88.02 4.542.02 6.717 1.388 7.222 1.846 1.675 1.435 2.53 4.868 1.906 9.897v.002c-.596 4.878-4.174 5.184-4.832 5.395-.28.09-2.882.737-6.153.524 0 0-2.436 2.94-3.197 3.704-.12.12-.26.167-.352.144-.13-.033-.166-.188-.165-.414l.02-4.018c-4.762-1.32-4.485-6.292-4.43-8.895.054-2.604.543-4.738 1.996-6.173 1.96-1.773 5.474-2.018 7.11-2.032zm.36 2.6a.294.294 0 00-.302.29.3.3 0 00.29.302c.78.014 1.5.117 2.193.347a5.886 5.886 0 012.146 1.252c.596.547 1.06 1.224 1.388 2.01.33.79.502 1.658.547 2.6a.3.3 0 00.6-.028 8.123 8.123 0 00-.598-2.798 6.49 6.49 0 00-1.53-2.218 6.482 6.482 0 00-2.364-1.38 8.34 8.34 0 00-2.37-.376zm-3.954.69c-.20.002-.395.05-.573.146l-.018.01c-.452.262-.86.595-1.207.985-.002.004-.005.006-.007.01-.282.34-.443.673-.484 1.003a1.29 1.29 0 00.067.622l.02.014c.226.665.755 1.77 1.926 3.49.673.99 1.412 1.84 2.146 2.587l.087.087.087.088.088.087.088.087c.747.733 1.598 1.473 2.587 2.146 1.72 1.172 2.826 1.7 3.49 1.927l.014.02c.198.066.41.09.622.066.33-.04.663-.202 1.002-.484a.402.402 0 00.01-.007c.39-.347.723-.755.985-1.207l.01-.018c.24-.45.16-.875-.184-1.16a14.39 14.39 0 00-2.07-1.48c-.464-.257-.94-.1-1.13.15l-.407.513c-.21.26-.59.225-.59.225-2.834-.724-3.59-3.59-3.59-3.59s-.036-.38.224-.59l.512-.406c.252-.19.41-.666.152-1.13a14.385 14.385 0 00-1.48-2.07c-.18-.218-.42-.328-.66-.325zm4.473.89a.3.3 0 00-.03.598c.99.075 1.747.412 2.336.99.59.582.93 1.35 1.005 2.357a.3.3 0 00.598-.045c-.083-1.124-.473-2.04-1.182-2.74-.71-.697-1.62-1.084-2.728-1.16zm.486 1.582a.3.3 0 10-.073.595c.46.057.797.216 1.04.464.245.25.404.59.46 1.06a.3.3 0 10.596-.072c-.067-.564-.27-1.04-.626-1.404-.357-.364-.832-.575-1.396-.643z" />
  </svg>
);
const TELEGRAM_ICON = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#26A5E4" aria-hidden>
    <path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);
const LINKEDIN_ICON = (
  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#0A66C2" aria-hidden>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

// Capacitor bridge — injected by the Android wrapper at runtime; the web
// bundle has no @capacitor dependency (same pattern as the notifications
// hook, which owns the global Window.Capacitor declaration — hence the
// local cast here). When the native Share plugin is present we skip the
// popover and open the Android share sheet directly: that IS the organic
// experience.
interface CapacitorSharePlugin {
  share: (opts: { title?: string; text?: string; url?: string; dialogTitle?: string }) => Promise<unknown>;
}

function nativeSharePlugin(): CapacitorSharePlugin | null {
  const cap = typeof window !== 'undefined' ? (window as any).Capacitor : undefined;
  if (cap?.isNativePlatform?.() && cap.Plugins?.Share) return cap.Plugins.Share as CapacitorSharePlugin;
  return null;
}

export default function ShareButton({ url, title, text, size = 'sm', variant = 'outline', iconOnly = false }: ShareButtonProps) {
  const { toast } = useToast();
  const { t } = useTranslation();

  const absolute = url.startsWith('http')
    ? url
    : `${typeof window !== 'undefined' ? window.location.origin : ''}${url}`;
  const encodedUrl = encodeURIComponent(absolute);
  const shareText = `${title}${text ? ` — ${text.slice(0, 120)}` : ''}`;
  const encodedText = encodeURIComponent(shareText);

  const targets: Array<{ name: string; icon: JSX.Element; href: string }> = [
    { name: 'X', icon: X_ICON, href: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}` },
    { name: 'Facebook', icon: FACEBOOK_ICON, href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { name: 'WhatsApp', icon: WHATSAPP_ICON, href: `https://wa.me/?text=${encodedText}%0A${encodedUrl}` },
    { name: 'Viber', icon: VIBER_ICON, href: `viber://forward?text=${encodedText}%0A${encodedUrl}` },
    { name: 'Telegram', icon: TELEGRAM_ICON, href: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}` },
    { name: 'LinkedIn', icon: LINKEDIN_ICON, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}` },
    { name: 'Email', icon: <Mail className="w-4 h-4" aria-hidden />, href: `mailto:?subject=${encodeURIComponent(title)}&body=${encodedText}%0A%0A${encodedUrl}` },
  ];

  function open(href: string, e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    if (href.startsWith('viber:') || href.startsWith('mailto:')) {
      window.location.href = href;
    } else {
      window.open(href, '_blank', 'noopener,noreferrer,width=640,height=640');
    }
  }

  async function copyLink(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(absolute);
      toast({ title: t('media.linkCopied') });
    } catch {
      toast({ title: t('media.copyFailed'), variant: 'destructive' });
    }
  }

  async function nativeShare(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    try {
      await (navigator as any).share({ title, text: text?.slice(0, 200), url: absolute });
    } catch { /* dismissed */ }
  }

  const canNativeShare = typeof navigator !== 'undefined' && !!(navigator as any).share;

  // Android APK: one tap → the system share sheet (no popover detour).
  const capacitorShare = nativeSharePlugin();
  if (capacitorShare) {
    return (
      <Button
        size={size}
        variant={variant}
        aria-label={t('media.share')}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          capacitorShare.share({ title, text: shareText, url: absolute, dialogTitle: t('media.share') }).catch(() => {});
        }}
      >
        <Share2 className="w-3.5 h-3.5" />
        {!iconOnly && <span className="ml-1">{t('media.share')}</span>}
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size={size}
          variant={variant}
          aria-label={t('media.share')}
          onClick={(e) => e.stopPropagation()}
        >
          <Share2 className="w-3.5 h-3.5" />
          {!iconOnly && <span className="ml-1">{t('media.share')}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end" onClick={(e) => e.stopPropagation()}>
        <div className="grid gap-0.5">
          {targets.map((target) => (
            <button
              key={target.name}
              type="button"
              onClick={(e) => open(target.href, e)}
              className="flex items-center gap-3 rounded px-2 py-2 text-sm hover:bg-muted text-left"
            >
              {target.icon}
              {target.name}
            </button>
          ))}
          <div className="border-t my-1" />
          <button
            type="button"
            onClick={copyLink}
            className="flex items-center gap-3 rounded px-2 py-2 text-sm hover:bg-muted text-left"
          >
            <Link2 className="w-4 h-4" aria-hidden />
            {t('share.copyLink')}
          </button>
          {canNativeShare && (
            <button
              type="button"
              onClick={nativeShare}
              className="flex items-center gap-3 rounded px-2 py-2 text-sm hover:bg-muted text-left"
            >
              <MoreHorizontal className="w-4 h-4" aria-hidden />
              {t('share.more')}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
