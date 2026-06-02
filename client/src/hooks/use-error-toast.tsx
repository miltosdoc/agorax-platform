/**
 * Error-toast helper: shows a destructive toast whose body is selectable
 * text plus a "Copy" button, so the user can grab the verbatim error
 * message instead of having to retype it from a transient notification.
 *
 * The toast stays open longer than the default (12s) and the close-on-
 * action behaviour is suppressed by putting the button inside the
 * description rather than into the Radix Action slot, which would
 * auto-dismiss on click.
 */

import { useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

function CopyErrorBody({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Best-effort fallback so even sandboxed contexts don't lose the text.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
      document.body.removeChild(ta);
    }
  };
  return (
    <div className="flex flex-col gap-2 select-text">
      <span className="whitespace-pre-wrap break-words select-text" data-testid="error-toast-message">
        {text}
      </span>
      <button
        type="button"
        onClick={onCopy}
        className="self-start inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-current/30 hover:bg-white/10 transition-colors"
        data-testid="error-toast-copy"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Αντιγράφηκε' : 'Αντιγραφή κειμένου'}
      </button>
    </div>
  );
}

export function useErrorToast() {
  const { toast } = useToast();
  return useCallback(
    (title: string, message?: string) => {
      const text = message && message.trim() ? message : title;
      toast({
        title,
        description: <CopyErrorBody text={text} />,
        variant: 'destructive',
        duration: 12_000,
      });
    },
    [toast],
  );
}
