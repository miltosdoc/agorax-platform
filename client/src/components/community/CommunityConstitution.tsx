/**
 * Community Constitution — read-only view of the document assembled by
 * server/utils/constitution.ts: the community's current rules (from its
 * settings) followed by every proposal that passed. Two versions:
 *
 *   - AI: each decision drafted by the LLM as an article citing its
 *     proposal (server/utils/constitution-ai.ts, generated in the
 *     background and cached);
 *   - Original: the adopted texts exactly as voted.
 *
 * The server lays out both versions; this component only prints the
 * layout it is given. Each version downloads as Markdown or as
 * print-ready HTML (Print → Save as PDF).
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useTranslation } from '@/hooks/use-translation';
import { api } from '@/lib/api';
import { ChevronDown, Download, Loader2, ScrollText, ShieldCheck, Sparkles } from 'lucide-react';

type Version = 'ai' | 'raw';

interface Block {
  heading: string;
  meta?: string;
  proposalId?: number;
  note?: string;
  body: string;
  result?: string;
  participation?: string;
}
interface Part { heading: string; intro?: string; blocks: Block[] }
interface Layout { notice?: string; parts: Part[]; fingerprint: string }

interface ConstitutionResponse {
  decisions: unknown[] | null;
  ai: { available: boolean; pending: number; articles: unknown[] } | null;
  layouts: { raw: Layout; ai: Layout | null };
}

const POLL_MS = 5000;

export function CommunityConstitution({ communityId }: { communityId: number }) {
  const { t, locale } = useTranslation();
  const lang = locale === 'en' ? 'en' : 'el';
  const [doc, setDoc] = useState<ConstitutionResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [version, setVersion] = useState<Version>('ai');

  const load = useCallback(async () => {
    try {
      const res = await api.get<ConstitutionResponse>(`/api/communities/${communityId}/constitution?lang=${lang}`);
      setDoc(res.data);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [communityId, lang]);

  useEffect(() => { void load(); }, [load]);

  // While the AI is still drafting articles, refresh so they appear as they land.
  const pending = doc?.ai?.pending ?? 0;
  useEffect(() => {
    if (pending === 0) return;
    const id = window.setTimeout(() => { void load(); }, POLL_MS);
    return () => window.clearTimeout(id);
  }, [pending, doc, load]);

  if (loadError) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-6">
          <p className="text-muted-foreground">{t('constitution.loadError')}</p>
          <Button variant="outline" size="sm" onClick={() => load()}>{t('library.retry')}</Button>
        </CardContent>
      </Card>
    );
  }
  if (!doc) return <p className="text-sm text-muted-foreground">{t('library.loading')}</p>;

  const hasAi = !!doc.layouts.ai;
  const shown: Version = hasAi ? version : 'raw';
  const view = shown === 'ai' ? doc.layouts.ai! : doc.layouts.raw;
  const total = doc.decisions?.length ?? 0;
  const ready = doc.ai?.articles.length ?? 0;
  const base = `/api/communities/${communityId}/constitution`;
  const dl = (v: Version, fmt: 'html' | 'md') => `${base}.${fmt}?lang=${lang}&version=${v}`;

  return (
    <div className="space-y-4" data-testid="constitution">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex items-center gap-2 text-lg">
                <ScrollText className="h-5 w-5 shrink-0" /> {t('constitution.title')}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t('constitution.intro')}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="constitution-download">
                  <Download className="h-4 w-4 mr-1.5" /> {t('constitution.download')}
                  <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                {hasAi && (
                  <>
                    <DropdownMenuLabel>{t('constitution.versionAi')}</DropdownMenuLabel>
                    <DropdownMenuItem asChild>
                      <a href={dl('ai', 'html')} download data-testid="constitution-download-ai-html">{t('constitution.downloadHtml')}</a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href={dl('ai', 'md')} download data-testid="constitution-download-ai-md">{t('constitution.downloadMd')}</a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuLabel>{t('constitution.versionRaw')}</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <a href={dl('raw', 'html')} download data-testid="constitution-download-raw-html">{t('constitution.downloadHtml')}</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={dl('raw', 'md')} download data-testid="constitution-download-raw-md">{t('constitution.downloadMd')}</a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {hasAi && total > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={shown}
                onValueChange={(v) => { if (v) setVersion(v as Version); }}
                data-testid="constitution-version"
              >
                <ToggleGroupItem value="ai" className="gap-1.5 px-3">
                  <Sparkles className="h-3.5 w-3.5" /> {t('constitution.versionAi')}
                </ToggleGroupItem>
                <ToggleGroupItem value="raw" className="px-3">{t('constitution.versionRaw')}</ToggleGroupItem>
              </ToggleGroup>
              {pending > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="constitution-progress">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('constitution.aiProgress').replace('{ready}', String(ready)).replace('{total}', String(total))}
                </span>
              )}
            </div>
          )}
          {view.notice && (
            <p className="border-l-2 border-muted-foreground/40 pl-3 text-xs italic text-muted-foreground">{view.notice}</p>
          )}
        </CardHeader>
      </Card>

      {view.parts.map((part, pi) => (
        <Card key={pi}>
          <CardHeader>
            <CardTitle className="text-base">{part.heading}</CardTitle>
            {part.intro && <p className="text-sm text-muted-foreground">{part.intro}</p>}
          </CardHeader>
          {part.blocks.length > 0 && (
            <CardContent className={pi === 0 ? 'space-y-4' : 'space-y-6'}>
              {part.blocks.map((b, bi) => (
                <section key={bi} className="space-y-2" data-testid={b.proposalId ? `constitution-block-${b.proposalId}` : undefined}>
                  <h3 className="font-medium">{b.heading}</h3>
                  {b.meta && b.proposalId && (
                    <p className="text-xs text-muted-foreground">
                      <Link href={`/proposals/${b.proposalId}`} className="underline underline-offset-2">{b.meta}</Link>
                    </p>
                  )}
                  {b.note && <p className="text-xs italic text-muted-foreground">{b.note}</p>}
                  <p className={pi === 0 ? 'text-sm leading-relaxed text-muted-foreground' : 'whitespace-pre-line text-sm leading-relaxed'}>
                    {b.body}
                  </p>
                  {b.result && (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span><b>{t('constitution.result')}:</b> {b.result}</span>
                      <span><b>{t('constitution.participation')}:</b> {b.participation}</span>
                    </div>
                  )}
                  {b.proposalId && (
                    <Link href={`/verify?proposal=${b.proposalId}`} className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2">
                      <ShieldCheck className="h-3.5 w-3.5" /> {t('constitution.verify')}
                    </Link>
                  )}
                </section>
              ))}
            </CardContent>
          )}
        </Card>
      ))}

      <p className="break-all px-1 text-xs text-muted-foreground">
        {t('constitution.fingerprint')}: <code>{view.fingerprint}</code>
      </p>
    </div>
  );
}
