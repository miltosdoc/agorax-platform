import { useState } from "react";
import { Bookmark, Share2, Check } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/hooks/use-translation";
import { useToast } from "@/hooks/use-toast";

export type BookmarkKind = "community" | "proposal" | "survey" | "media" | "post";

const actionButton =
  "inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-sm border border-line bg-surface text-ink-soft transition-colors duration-[120ms] hover:border-line-strong hover:bg-sunken hover:text-ink disabled:opacity-50";

/**
 * The save icon that sits on every card in the AGORA 2026 comps.
 *
 * Optimistic: the icon fills the instant it is pressed and rolls back only if
 * the server disagrees. A bookmark is not a decision anyone else sees, so the
 * honest trade is instant feedback over a spinner.
 */
export function SaveButton({
  entityType,
  entityId,
  initialSaved = false,
  className = "",
}: {
  entityType: BookmarkKind;
  entityId: number;
  initialSaved?: boolean;
  className?: string;
}) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(initialSaved);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/bookmarks/toggle", { entityType, entityId });
      return (await res.json()) as { saved: boolean };
    },
    onMutate: () => {
      const previous = saved;
      setSaved(!previous);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context) setSaved(context.previous);
    },
    onSuccess: (data) => {
      setSaved(data.saved);
      queryClient.invalidateQueries({ queryKey: ["/api/bookmarks"] });
    },
  });

  if (!user) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        // Cards are links; saving must not navigate.
        e.preventDefault();
        e.stopPropagation();
        mutation.mutate();
      }}
      disabled={mutation.isPending}
      aria-pressed={saved}
      aria-label={saved ? t('bookmark.remove') : t('bookmark.save')}
      title={saved ? t('bookmark.remove') : t('bookmark.save')}
      className={`${actionButton} ${saved ? "border-kyanos/40 bg-kyanos-wash text-kyanos" : ""} ${className}`}
      data-testid={`button-save-${entityType}-${entityId}`}
    >
      <Bookmark className="h-4 w-4" fill={saved ? "currentColor" : "none"} />
    </button>
  );
}

/**
 * Share. Uses the native share sheet where the browser offers one — that is
 * the whole feature on a phone — and falls back to copying the link, which is
 * what the desktop comps imply.
 */
export function ShareButton({
  url,
  title,
  className = "",
}: {
  url: string;
  title?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function handleShare(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const absolute = url.startsWith("http") ? url : `${window.location.origin}${url}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, url: absolute });
        return;
      } catch {
        // Dismissing the sheet throws; fall through to the copy path rather
        // than reporting a failure the reader caused on purpose.
      }
    }

    try {
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      toast({ title: t('share.copied') });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is permission-gated and can simply refuse.
      toast({ title: absolute });
    }
  }

  return (
    <button
      type="button"
      onClick={handleShare}
      aria-label={t('share.label')}
      title={t('share.label')}
      className={`${actionButton} ${className}`}
      data-testid="button-share"
    >
      {copied ? <Check className="h-4 w-4 text-yper" /> : <Share2 className="h-4 w-4" />}
    </button>
  );
}
