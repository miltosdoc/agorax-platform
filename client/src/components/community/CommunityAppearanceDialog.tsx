import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { IconPalette, IconUpload } from "@tabler/icons-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/hooks/use-translation";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiUpload } from "@/lib/queryClient";
import { Thumbnail, ThumbnailPicker } from "@/components/thumbnails/Thumbnail";

const CATEGORIES = [
  "koinonia", "perivallon", "politiki", "politismos",
  "oikonomia", "allilengyi", "ygeia",
] as const;

/**
 * One image slot: shows what is there now, uploads a replacement, or clears
 * back to the generated catalogue picture.
 *
 * Sends the file as a raw body with its content-type — the same shape the
 * community library upload already uses, so there is one upload convention in
 * this codebase rather than two.
 */
function ImageSlotField({
  communityId,
  slot,
  label,
  hint,
  ratio,
  currentPath,
  thumbnailKey,
  onChanged,
}: {
  communityId: number;
  slot: "avatar" | "cover";
  label: string;
  hint: string;
  ratio: "1:1" | "2:1";
  currentPath: string | null | undefined;
  thumbnailKey: string | null | undefined;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const res = await apiUpload(`/api/communities/${communityId}/image?slot=${slot}`, file);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "" }));
        throw new Error(body.message || t('appearance.uploadFailed'));
      }
      toast({ title: t('appearance.uploaded') });
      onChanged();
    } catch (error) {
      toast({ title: (error as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await apiRequest("DELETE", `/api/communities/${communityId}/image?slot=${slot}`);
      toast({ title: t('appearance.imageCleared') });
      onChanged();
    } catch {
      toast({ title: t('appearance.uploadFailed'), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-2 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </p>
      <div className="flex items-start gap-3 rounded-md border border-line bg-sunken p-3">
        <div className={ratio === "2:1" ? "w-32 flex-shrink-0" : "w-16 flex-shrink-0"}>
          <Thumbnail
            src={currentPath ? `/media/${currentPath}` : undefined}
            thumbnailKey={thumbnailKey}
            seed={`community-${slot === "avatar" ? "avatar-" : ""}${communityId}`}
            subject="community"
            ratio={ratio}
            compact={ratio === "1:1"}
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs leading-relaxed text-ink-soft">{hint}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file);
                e.target.value = "";
              }}
              data-testid={`input-${slot}-file`}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              data-testid={`button-upload-${slot}`}
            >
              <IconUpload size={14} stroke={1.75} className="mr-1.5" />
              {t('appearance.upload')}
            </Button>
            {currentPath && (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={clear}>
                {t('appearance.clearImage')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface AppearanceValues {
  avatarPath?: string | null;
  coverPath?: string | null;
  thumbnailKey?: string | null;
  tagline?: string | null;
  category?: string | null;
  region?: string | null;
  website?: string | null;
  username?: string | null;
}

/**
 * The officer's control over how a community presents itself.
 *
 * Separate from the settings page on purpose: everything there is either
 * vote-governed or changes how deliberation behaves. Nothing in this dialog
 * touches either — it is the community's face, and it should not take a ballot
 * to change a picture.
 */
export function CommunityAppearanceDialog({
  communityId,
  current,
}: {
  communityId: number;
  current: AppearanceValues;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const [values, setValues] = useState<AppearanceValues>({
    thumbnailKey: current.thumbnailKey ?? null,
    tagline: current.tagline ?? "",
    category: current.category ?? "",
    region: current.region ?? "",
    website: current.website ?? "",
    username: current.username ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/communities/${communityId}/appearance`, values);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "" }));
        throw new Error(body.message || "failed");
      }
      return res.json();
    },
    onSuccess: () => {
      // The card, the rail and the page all read the community row.
      queryClient.invalidateQueries({ queryKey: ["/api/communities"] });
      queryClient.invalidateQueries({ queryKey: [`/api/communities/${communityId}/summary`] });
      setOpen(false);
      toast({ title: t('appearance.saved') });
      // The dashboard holds the community in local state, not the query cache.
      window.location.reload();
    },
    onError: (error: Error) => {
      toast({ title: error.message || t('appearance.failed'), variant: "destructive" });
    },
  });

  const field = "mt-1 w-full";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full" data-testid="button-edit-appearance">
          <IconPalette size={15} stroke={1.75} className="mr-2" aria-hidden="true" />
          {t('appearance.edit')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-normal">{t('appearance.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <ImageSlotField
            communityId={communityId}
            slot="avatar"
            label={t('appearance.logo')}
            hint={t('appearance.logoHint')}
            ratio="1:1"
            currentPath={current.avatarPath}
            thumbnailKey={values.thumbnailKey}
            onChanged={() => { queryClient.invalidateQueries({ queryKey: ["/api/communities"] }); window.location.reload(); }}
          />

          <ImageSlotField
            communityId={communityId}
            slot="cover"
            label={t('appearance.cover')}
            hint={t('appearance.coverHint')}
            ratio="2:1"
            currentPath={current.coverPath}
            thumbnailKey={values.thumbnailKey}
            onChanged={() => { queryClient.invalidateQueries({ queryKey: ["/api/communities"] }); window.location.reload(); }}
          />

          <ThumbnailPicker
            value={values.thumbnailKey}
            onChange={(key) => setValues((v) => ({ ...v, thumbnailKey: key }))}
            seed={`community-${communityId}`}
            label={t('appearance.thumbnail')}
          />
          <p className="text-xs leading-relaxed text-ink-faint">{t('appearance.thumbnailHint')}</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-ink">{t('appearance.handle')}</span>
              <Input
                className={field}
                value={values.username ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, username: e.target.value }))}
                placeholder="kathari_poli"
                data-testid="input-appearance-handle"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-ink">{t('communities.region')}</span>
              <Input
                className={field}
                value={values.region ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, region: e.target.value }))}
                data-testid="input-appearance-region"
              />
            </label>

            <label className="block text-sm">
              <span className="font-medium text-ink">{t('appearance.category')}</span>
              <select
                className={`${field} h-10 rounded-sm border border-line bg-surface px-3 text-sm text-ink`}
                value={values.category ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, category: e.target.value }))}
                data-testid="select-appearance-category"
              >
                <option value="">—</option>
                {CATEGORIES.map((key) => (
                  <option key={key} value={key}>{t(`category.${key}`)}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="font-medium text-ink">{t('communities.website')}</span>
              <Input
                className={field}
                type="url"
                value={values.website ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, website: e.target.value }))}
                placeholder="https://"
                data-testid="input-appearance-website"
              />
            </label>
          </div>

          <label className="block text-sm">
            <span className="font-medium text-ink">{t('appearance.tagline')}</span>
            <Input
              className={field}
              value={values.tagline ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, tagline: e.target.value }))}
              maxLength={200}
              data-testid="input-appearance-tagline"
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-appearance">
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
