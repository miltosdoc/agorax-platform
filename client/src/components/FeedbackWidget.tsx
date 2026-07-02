/**
 * Early-user feedback widget.
 *
 * A floating button (bottom-right) that opens a small dialog: message +
 * optional screenshot. Submissions land in feedback/ on the server for
 * periodic developer review — there is no in-app inbox.
 *
 * Users can hide the widget via the toggle inside the dialog (persisted
 * in localStorage); it can be re-enabled from the profile page.
 */
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MessageSquarePlus, ImagePlus, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useAuth } from '@/hooks/use-auth';

const TOGGLE_KEY = 'agorax_feedback_widget';

export function isFeedbackWidgetEnabled(): boolean {
  try { return localStorage.getItem(TOGGLE_KEY) !== 'off'; } catch { return true; }
}

export function setFeedbackWidgetEnabled(on: boolean): void {
  try { localStorage.setItem(TOGGLE_KEY, on ? 'on' : 'off'); } catch { /* noop */ }
  // Let the mounted widget react immediately (e.g. toggled from Profile).
  window.dispatchEvent(new Event('agorax-feedback-toggle'));
}

export function FeedbackWidget() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [enabled, setEnabled] = useState(isFeedbackWidgetEnabled);

  useEffect(() => {
    const sync = () => setEnabled(isFeedbackWidgetEnabled());
    window.addEventListener('agorax-feedback-toggle', sync);
    return () => window.removeEventListener('agorax-feedback-toggle', sync);
  }, []);

  if (!user || !enabled) return null;

  async function submit() {
    if (message.trim().length < 3 || sending) return;
    setSending(true);
    try {
      const form = new FormData();
      form.append('message', message.trim());
      form.append('page', window.location.pathname + window.location.search);
      if (file) form.append('screenshot', file);
      // CSRF: mirror the cookie manually — FormData bypasses the api helper.
      const csrf = document.cookie.split(';').map(s => s.trim()).find(s => s.startsWith('agorax_csrf='))?.split('=')[1];
      const res = await fetch('/api/feedback', {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'X-CSRF-Token': csrf } : undefined,
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `HTTP ${res.status}`);
      }
      toast({ title: t('feedback.thanks') });
      setMessage('');
      setFile(null);
      setOpen(false);
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : 'Failed to send feedback', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="fixed bottom-20 sm:bottom-6 right-4 z-40 shadow-lg gap-2"
        onClick={() => setOpen(true)}
        data-testid="feedback-open"
      >
        <MessageSquarePlus className="w-4 h-4" />
        {t('feedback.button')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('feedback.title')}</DialogTitle>
            <DialogDescription>{t('feedback.description')}</DialogDescription>
          </DialogHeader>

          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('feedback.placeholder')}
            rows={5}
            maxLength={5000}
            data-testid="feedback-message"
          />

          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm px-3 py-2 border rounded-md cursor-pointer hover:bg-muted">
              <ImagePlus className="w-4 h-4" />
              {file ? file.name : t('feedback.attach')}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {file && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setFile(null)}>✕</Button>
            )}
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <Label htmlFor="feedback-toggle" className="text-xs text-muted-foreground">
              {t('feedback.toggleLabel')}
            </Label>
            <Switch
              id="feedback-toggle"
              checked={enabled}
              onCheckedChange={(on) => {
                setFeedbackWidgetEnabled(on);
                setEnabled(on);
                if (!on) setOpen(false);
              }}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              onClick={submit}
              disabled={sending || message.trim().length < 3}
              data-testid="feedback-submit"
            >
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t('feedback.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
