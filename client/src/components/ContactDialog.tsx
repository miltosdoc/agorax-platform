/**
 * Contact form that works without an account.
 *
 * The feedback widget requires a session, so anyone stuck at registration —
 * exactly the people most likely to need help — had no way to reach anyone.
 * privacy.tsx and terms.tsx both say to "contact the administration through
 * the platform"; this is that channel.
 *
 * Submissions land in feedback/ on the server as JSON. Nothing is emailed:
 * no mail service is configured, so someone has to read them. The success
 * text promises a reply, not an instant one.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { useErrorToast } from '@/hooks/use-error-toast';

const MIN_MESSAGE = 10;
const MAX_MESSAGE = 3000;

export function ContactDialog({ triggerClassName }: { triggerClassName?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const errorToast = useErrorToast();
  const [open, setOpen] = useState(false);
  const [replyTo, setReplyTo] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const tooShort = message.trim().length < MIN_MESSAGE;

  const send = async () => {
    if (tooShort) return;
    setSending(true);
    try {
      await api.post('/api/contact', { message: message.trim(), replyTo: replyTo.trim() });
      toast({ title: t('contact.sent'), description: t('contact.sentBody') });
      setMessage('');
      setReplyTo('');
      setOpen(false);
    } catch (err: any) {
      errorToast(t('contact.failed'), err?.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={triggerClassName} data-testid="contact-open">
          {t('contact.trigger')}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('contact.title')}</DialogTitle>
          <DialogDescription>{t('contact.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="contact-reply">{t('contact.replyToLabel')}</Label>
            <Input
              id="contact-reply"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder={t('contact.replyToPlaceholder')}
              maxLength={200}
              data-testid="contact-replyto"
            />
            <p className="text-xs text-muted-foreground">{t('contact.replyToHint')}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact-message">{t('contact.messageLabel')}</Label>
            <Textarea
              id="contact-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('contact.messagePlaceholder')}
              rows={5}
              maxLength={MAX_MESSAGE}
              data-testid="contact-message"
            />
            <p className="text-xs text-muted-foreground">
              {message.trim().length}/{MAX_MESSAGE}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" onClick={send} disabled={sending || tooShort} data-testid="contact-send">
            {t('contact.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
