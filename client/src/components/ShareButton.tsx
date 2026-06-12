/**
 * Universal share button — native share sheet (mobile) with clipboard
 * fallback (desktop). Used on proposals, polls, and the feed; media cards
 * keep their own handler because their share URL points at the /p/...
 * server-rendered player pages.
 */
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';
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

export default function ShareButton({ url, title, text, size = 'sm', variant = 'outline', iconOnly = false }: ShareButtonProps) {
  const { toast } = useToast();
  const { t } = useTranslation();

  async function share(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const absolute = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    if (typeof navigator !== 'undefined' && (navigator as any).share) {
      try {
        await (navigator as any).share({ title, text: text?.slice(0, 200), url: absolute });
        return;
      } catch { /* dismissed or unsupported payload — fall through */ }
    }
    try {
      await navigator.clipboard.writeText(absolute);
      toast({ title: t('media.linkCopied') });
    } catch {
      toast({ title: t('media.copyFailed'), variant: 'destructive' });
    }
  }

  return (
    <Button size={size} variant={variant} onClick={share} aria-label={t('media.share')}>
      <Share2 className="w-3.5 h-3.5" />
      {!iconOnly && <span className="ml-1">{t('media.share')}</span>}
    </Button>
  );
}
