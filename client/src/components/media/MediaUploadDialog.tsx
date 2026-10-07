import { ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { FileUp, Loader2, Upload, Video, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { useCommunityDirectory } from '@/hooks/use-community-membership';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { uploadProposalFile } from '@/lib/upload-media';

interface UploadProposal { id: number; question: string; communityId: number; }

export interface MediaUploadDialogProps {
  kind?: 'video' | 'podcast';
  communityId?: number;
  proposalId?: number;
  onUploaded?: () => void;
  trigger?: ReactNode;
}

/** Upload keeps the reader on the page, with an explicit community/proposal destination. */
export function MediaUploadDialog({ kind: initialKind = 'video', communityId, proposalId, onUploaded, trigger }: MediaUploadDialogProps) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'video' | 'podcast'>(initialKind);
  const [selectedCommunity, setSelectedCommunity] = useState(communityId ? String(communityId) : '');
  const [destination, setDestination] = useState<'community' | 'proposal'>(proposalId ? 'proposal' : 'community');
  const [selectedProposal, setSelectedProposal] = useState(proposalId ? String(proposalId) : '');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: communityRows, isLoading: loadingCommunities, isError: communitiesError } = useCommunityDirectory();
  const { data: fixedProposal } = useQuery<UploadProposal>({
    queryKey: [`/api/proposals/${proposalId}`, { viewerId: user?.id ?? 0 }],
    queryFn: async () => { const response = await fetch(`/api/proposals/${proposalId}`, { credentials: 'include' }); if (!response.ok) throw new Error('proposal unavailable'); return response.json(); }, enabled: !!proposalId && !communityId && open,
  });
  const communities = (communityRows ?? []).filter((community) => community.viewerIsMember || user?.isAdmin);
  const { data: proposals = [], isLoading: loadingProposals, isError: proposalsError, refetch: reloadProposals } = useQuery<UploadProposal[]>({
    queryKey: [`/api/communities/${selectedCommunity}/proposals`, { viewerId: user?.id ?? 0 }],
    queryFn: async () => { const response = await fetch(`/api/communities/${selectedCommunity}/proposals`, { credentials: 'include' }); if (!response.ok) throw new Error('proposals unavailable'); return response.json(); },
    enabled: !!user && open && !!selectedCommunity && destination === 'proposal',
  });
  useEffect(() => { setKind(initialKind); setFile(null); if (inputRef.current) inputRef.current.value = ''; }, [initialKind]);

  // A component mounted inside a community may already know its destination.
  useEffect(() => {
    if (communityId || fixedProposal?.communityId) setSelectedCommunity(String(communityId ?? fixedProposal?.communityId));
    if (proposalId) { setDestination('proposal'); setSelectedProposal(String(proposalId)); }
  }, [communityId, proposalId, fixedProposal?.communityId]);

  function pickFile(nextFile: File | null) {
    setError(null);
    if (!nextFile) { setFile(null); return; }
    const allowed = kind === 'video' ? /\.(mp4|mov)$/i : /\.(mp3|m4a)$/i;
    if (!allowed.test(nextFile.name)) { setFile(null); setError(t('redesignMedia.invalidFile')); return; }
    if (nextFile.size === 0) { setFile(null); setError(t('redesignMedia.emptyFile')); return; }
    if (nextFile.size > 120 * 1024 * 1024) { setFile(null); setError(t('redesignMedia.fileTooLarge', { limit: 120 })); return; }
    setFile(nextFile);
  }

  async function publish(event: React.FormEvent) {
    event.preventDefault();
    if (uploading) return;
    if (!selectedCommunity || !title.trim() || !file) { setError(t('redesignMedia.requiredFields')); return; }
    if (destination === 'proposal' && !selectedProposal) { setError(t('redesignMedia.proposalRequired')); return; }
    if (destination === 'proposal' && !proposals.some((proposal) => String(proposal.id) === selectedProposal)) { setError(t('redesignMedia.proposalRequired')); return; }
    const member = communities.some((community) => String(community.id) === selectedCommunity);
    if (!member) { setError(t('redesignMedia.noCommunities')); return; }
    setUploading(true);
    setError(null);
    try {
      const url = destination === 'proposal'
        ? `/api/proposals/${selectedProposal}/media?kind=${kind}`
        : `/api/communities/${selectedCommunity}/media?kind=${kind}`;
      await uploadProposalFile(file, url, title.trim());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['/api/feed'] }),
        queryClient.invalidateQueries({ queryKey: ['/api/activity-feed'] }),
        queryClient.invalidateQueries({ queryKey: [`/api/communities/${selectedCommunity}/media`] }),
        ...(selectedProposal ? [queryClient.invalidateQueries({ queryKey: [`/api/proposals/${selectedProposal}/media`] })] : []),
      ]);
      toast({ title: t('redesignMedia.success'), description: t(destination === 'proposal' ? 'redesignMedia.successProposal' : 'redesignMedia.successLibrary') });
      setTitle(''); setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      setOpen(false);
      onUploaded?.();
    } catch (err: unknown) {
      setError(t('redesignMedia.uploadError'));
      toast({ title: t('redesignMedia.uploadError'), description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally { setUploading(false); }
  }

  if (!user) return null;
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!uploading) { setOpen(next); if (!next) setError(null); } }}>
      <DialogTrigger asChild>
        {trigger ?? <Button data-testid={`button-upload-${initialKind}`}><Upload className="h-4 w-4" />{t(initialKind === 'video' ? 'redesignMedia.uploadVideo' : 'redesignMedia.uploadPodcast')}</Button>}
      </DialogTrigger>
      <DialogContent closeDisabled={uploading} className="max-w-xl" onInteractOutside={(event) => { if (uploading) event.preventDefault(); }} onEscapeKeyDown={(event) => { if (uploading) event.preventDefault(); }} onPointerDownOutside={(event) => { if (uploading) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>{t('redesignMedia.uploadTitle')}</DialogTitle>
          <DialogDescription>{t('redesignMedia.uploadIntro')}</DialogDescription>
        </DialogHeader>
        {loadingCommunities ? <p role="status" className="text-sm text-ink-faint">{t('shell.loadingCommunities')}</p> : communitiesError ? (
          <p role="alert" className="text-sm text-kata">{t('redesignMedia.loadError')}</p>
        ) : communities.length === 0 ? (
          <div className="space-y-4 rounded-xl border border-line bg-kyanos-wash p-5">
            <p className="m-0 text-base text-ink-soft">{t('redesignMedia.noCommunities')}</p>
            <Button asChild variant="outline"><Link href="/communities?view=discover" onClick={() => setOpen(false)}>{t('redesignMedia.explore')}</Link></Button>
          </div>
        ) : (
          <form onSubmit={publish} className="space-y-5" aria-busy={uploading}>
            <fieldset disabled={uploading} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor={`${formId}-kind`}>{t('redesignMedia.kind')}</Label>
                <Select disabled={uploading} value={kind} onValueChange={(value) => { setKind(value as 'video' | 'podcast'); setFile(null); setError(null); if (inputRef.current) inputRef.current.value = ''; }}>
                  <SelectTrigger id={`${formId}-kind`} data-testid="upload-kind-select"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="video"><span className="flex items-center gap-2"><Video className="h-4 w-4" />{t('nav.videos')}</span></SelectItem><SelectItem value="podcast"><span className="flex items-center gap-2"><Mic className="h-4 w-4" />{t('nav.podcasts')}</span></SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${formId}-community`}>{t('redesignMedia.community')}</Label>
                <Select value={selectedCommunity} onValueChange={(value) => { setSelectedCommunity(value); setSelectedProposal(''); setError(null); }} disabled={uploading || !!proposalId}>
                  <SelectTrigger id={`${formId}-community`} data-testid="upload-community-select"><SelectValue placeholder={t('redesignMedia.chooseCommunity')} /></SelectTrigger>
                  <SelectContent>{communities.map((community) => <SelectItem key={community.id} value={String(community.id)}>{community.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${formId}-destination`}>{t('redesignMedia.destination')}</Label>
                <Select value={destination} onValueChange={(value) => { setDestination(value as 'community' | 'proposal'); setSelectedProposal(''); setError(null); }} disabled={uploading || !!proposalId}>
                  <SelectTrigger id={`${formId}-destination`} data-testid="upload-destination-select"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="community">{t('redesignMedia.communityLibrary')}</SelectItem><SelectItem value="proposal">{t('redesignMedia.proposalMedia')}</SelectItem></SelectContent>
                </Select>
              </div>
              {destination === 'proposal' && (
                <div className="space-y-2">
                  <Label htmlFor={`${formId}-proposal`}>{t('redesignMedia.selectProposal')}</Label>
                  <Select value={selectedProposal} onValueChange={setSelectedProposal} disabled={uploading || !selectedCommunity || loadingProposals || !!proposalId}>
                    <SelectTrigger id={`${formId}-proposal`} data-testid="upload-proposal-select"><SelectValue placeholder={loadingProposals ? t('redesignMedia.loading') : t('redesignMedia.chooseProposal')} /></SelectTrigger>
                    <SelectContent>{proposals.map((proposal) => <SelectItem key={proposal.id} value={String(proposal.id)}>{proposal.question}</SelectItem>)}</SelectContent>
                  </Select>
                  {proposalsError ? <div className="text-sm text-kata">{t('redesignMedia.loadProposalsError')} <Button type="button" variant="link" onClick={() => reloadProposals()}>{t('redesignMedia.retry')}</Button></div> : selectedCommunity && !loadingProposals && proposals.length === 0 ? <p className="m-0 text-sm text-ink-faint">{t('redesignMedia.noProposals')}</p> : null}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor={`${formId}-title`}>{t('redesignMedia.fileTitle')}</Label>
                <Input id={`${formId}-title`} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} placeholder={t('redesignMedia.fileTitleHint')} data-testid="upload-media-title" />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`${formId}-file`}>{t('redesignMedia.chooseFile')}</Label>
                <input id={`${formId}-file`} ref={inputRef} type="file" accept={kind === 'video' ? '.mp4,.mov,video/mp4,video/quicktime' : '.mp3,.m4a,audio/mpeg,audio/mp4'} onChange={(event) => pickFile(event.target.files?.[0] ?? null)} className="hidden" data-testid="upload-media-file" />
                <Button type="button" variant="outline" className="w-full justify-start font-normal" onClick={() => inputRef.current?.click()} aria-label={t('redesignMedia.chooseFile')} aria-describedby={`${formId}-limit`} data-testid="upload-media-choose-file"><FileUp className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : t('redesignMedia.chooseFile')}</span></Button>
                <p id={`${formId}-limit`} className="m-0 text-sm text-ink-faint">{t(kind === 'video' ? 'redesignMedia.videoLimit' : 'redesignMedia.podcastLimit')}</p>
              </div>
            </fieldset>
            {error && <p role="alert" className="m-0 rounded-lg bg-kata-wash p-3 text-sm text-kata" data-testid="upload-media-error">{error}</p>}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={uploading}>{t('redesignMedia.cancel')}</Button>
              <Button type="submit" disabled={uploading || !selectedCommunity || !title.trim() || !file || (destination === 'proposal' && (!selectedProposal || proposalsError || loadingProposals))} data-testid="upload-media-submit">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}{t(uploading ? 'redesignMedia.publishing' : 'redesignMedia.publish')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
