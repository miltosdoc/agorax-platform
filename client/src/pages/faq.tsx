/**
 * Frequently asked questions (/faq).
 *
 * Members found the old page a single long list where nothing stood out. It
 * is now built for scanning: a search box that filters as you type (accents
 * and final sigma ignored), the three most asked questions answered up front,
 * one section per topic with its own icon and colour, and in every answer the
 * short answer first, in bold on an accent rule, with the details below.
 * Each question has its own link (#q-<id>) that opens it.
 *
 * The content lives in components/faq/faq-content.ts, in both languages.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  ArrowRight,
  BarChart3,
  Check,
  LifeBuoy,
  MessagesSquare,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Vote,
  X,
  type LucideIcon,
} from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ContactDialog } from '@/components/ContactDialog';
import { useTranslation } from '@/hooks/use-translation';
import { FAQ_COPY, type FaqItem, type TopicId } from '@/components/faq/faq-content';

/** Each topic's icon and accent, from the palette every theme restates. */
const TOPIC_LOOK: Record<TopicId, { icon: LucideIcon; tint: string; rule: string }> = {
  basics: { icon: Sparkles, tint: 'bg-kyanos-wash text-kyanos', rule: 'border-kyanos' },
  votes: { icon: Vote, tint: 'bg-antip-wash text-antip', rule: 'border-antip' },
  security: { icon: ShieldCheck, tint: 'bg-bronze-wash text-bronze', rule: 'border-bronze' },
  communities: { icon: Users, tint: 'bg-warn-wash text-warn', rule: 'border-warn' },
  tools: { icon: MessagesSquare, tint: 'bg-kyanos-wash text-kyanos', rule: 'border-kyanos' },
  polls: { icon: BarChart3, tint: 'bg-antip-wash text-antip', rule: 'border-antip' },
  account: { icon: LifeBuoy, tint: 'bg-apochi-wash text-apochi', rule: 'border-apochi' },
};

/** Lower case, no accents, final sigma as sigma: how Greek is typed in a hurry. */
const fold = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ');

const LINK_BTN =
  'inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm font-medium text-kyanos transition-colors hover:border-kyanos hover:bg-kyanos-wash';

export default function FAQPage() {
  const { t, locale } = useTranslation();
  const copy = FAQ_COPY[locale === 'en' ? 'en' : 'el'];
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string[]>([]);

  useEffect(() => {
    document.title = `AgoraX — ${copy.title}`;
  }, [copy.title]);

  // Text of an item as the reader sees it, including answers from locale keys.
  const tx = (key: string) => t(key as Parameters<typeof t>[0]);
  const question = (item: FaqItem) => (item.keys ? tx(item.keys.q) : item.q);
  const haystack = (item: FaqItem) =>
    fold(
      [
        question(item),
        item.short,
        ...(item.body ?? []),
        ...(item.bullets ?? []),
        ...(item.points ?? []).flatMap((n) => [tx(`faq.q15_p${n}_title`), tx(`faq.q15_p${n}_body`)]),
        item.keys ? tx(item.keys.body) : '',
      ].join(' '),
    );

  const words = fold(query).split(/\s+/).filter((w) => w.length > 1);
  const topics = useMemo(
    () =>
      copy.topics
        .map((topic) => ({
          ...topic,
          items: words.length ? topic.items.filter((item) => words.every((w) => haystack(item).includes(w))) : topic.items,
        }))
        .filter((topic) => topic.items.length > 0),
    // haystack reads t(), which only changes with the locale
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [copy, query],
  );
  const found = topics.reduce((n, topic) => n + topic.items.length, 0);
  const searching = words.length > 0;
  const shown = searching ? topics.flatMap((topic) => topic.items.map((i) => i.id)) : open;

  // A link to #q-<id> opens that question and brings it into view.
  const reveal = (id: string) => {
    setQuery('');
    setOpen((o) => (o.includes(id) ? o : [...o, id]));
    requestAnimationFrame(() => document.getElementById(`q-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  useEffect(() => {
    const id = window.location.hash.replace(/^#q-/, '');
    if (id && id !== window.location.hash) reveal(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = new Map(copy.topics.flatMap((topic) => topic.items.map((item) => [item.id, { item, topic: topic.id }] as const)));

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl pb-10">
        {/* ── heading and search ── */}
        <header className="pb-8 pt-4 sm:pt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-kyanos">{copy.eyebrow}</p>
          <h1 className="mt-3 font-serif text-4xl text-ink sm:text-5xl">{copy.title}</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-soft sm:text-lg">{copy.lede}</p>
          <div className="relative mt-7">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={copy.search}
              aria-label={copy.search}
              className="h-14 w-full rounded-sm border border-line-strong bg-surface pl-12 pr-28 text-base text-ink placeholder:text-ink-faint focus:border-kyanos focus:outline-none focus:ring-2 focus:ring-kyanos"
              data-testid="faq-search"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-sm px-2 py-1 text-sm text-ink-soft hover:bg-sunken"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                {copy.clear}
              </button>
            )}
          </div>
          {searching && (
            <p className="mt-3 text-sm text-ink-soft" aria-live="polite">
              {found > 0 ? copy.found(found) : copy.none}
            </p>
          )}
        </header>

        {!searching && (
          <>
            {/* ── the three most asked, answered up front ── */}
            <section aria-labelledby="faq-popular" className="mb-10">
              <h2 id="faq-popular" className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
                {copy.popular}
              </h2>
              <div className="grid gap-4 md:grid-cols-3">
                {copy.popularIds.map((id) => {
                  const hit = byId.get(id);
                  if (!hit) return null;
                  const look = TOPIC_LOOK[hit.topic];
                  const Icon = look.icon;
                  return (
                    <article key={id} className="flex flex-col rounded-sm border border-line bg-surface p-5">
                      <span className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full ${look.tint}`}>
                        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                      </span>
                      <h3 className="font-serif text-xl leading-snug text-ink">{question(hit.item)}</h3>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-soft">{hit.item.short}</p>
                      <a
                        href={`#q-${id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          reveal(id);
                        }}
                        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-kyanos hover:text-kyanos-deep"
                      >
                        {copy.more} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </article>
                  );
                })}
              </div>
            </section>

            {/* ── topics at a glance ── */}
            <nav aria-label={copy.title} className="mb-12 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {copy.topics.map((topic) => {
                const look = TOPIC_LOOK[topic.id];
                const Icon = look.icon;
                return (
                  <a
                    key={topic.id}
                    href={`#t-${topic.id}`}
                    className="group flex items-center gap-3 rounded-sm border border-line bg-surface px-3 py-3 transition-colors hover:border-kyanos"
                  >
                    <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${look.tint}`}>
                      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-tight text-ink group-hover:text-kyanos">{topic.title}</span>
                      <span className="block text-xs text-ink-faint">{copy.found(topic.items.length)}</span>
                    </span>
                  </a>
                );
              })}
            </nav>
          </>
        )}

        {/* ── one section per topic ── */}
        <Accordion type="multiple" value={shown} onValueChange={setOpen} className="space-y-12">
          {topics.map((topic) => {
            const look = TOPIC_LOOK[topic.id];
            const Icon = look.icon;
            return (
              <section key={topic.id} id={`t-${topic.id}`} aria-labelledby={`t-${topic.id}-title`} className="scroll-mt-24">
                <div className="mb-4 flex items-center gap-4">
                  <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${look.tint}`}>
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 id={`t-${topic.id}-title`} className="font-serif text-2xl text-ink sm:text-3xl">
                      {topic.title}
                    </h2>
                    <p className="text-sm text-ink-soft">{topic.blurb}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {topic.items.map((item) => (
                    <AccordionItem
                      key={item.id}
                      value={item.id}
                      id={`q-${item.id}`}
                      className="scroll-mt-24 rounded-sm border border-line bg-surface px-4 transition-colors data-[state=open]:border-line-strong sm:px-5"
                    >
                      <AccordionTrigger className="gap-4 py-4 text-left text-[1.05rem] font-normal text-ink hover:no-underline sm:text-lg">
                        {question(item)}
                      </AccordionTrigger>
                      <AccordionContent className="pb-5 text-[0.95rem] leading-relaxed text-ink-soft">
                        <p className={`border-l-4 ${look.rule} pl-3 text-base font-semibold leading-relaxed text-ink`}>{item.short}</p>
                        {item.keys && <p className="mt-3">{tx(item.keys.body)}</p>}
                        {item.body?.map((para) => (
                          <p key={para} className="mt-3">
                            {para}
                          </p>
                        ))}
                        {item.bullets && (
                          <ul className="mt-3 space-y-2">
                            {item.bullets.map((b) => (
                              <li key={b} className="flex gap-2.5">
                                <Check className="mt-1 h-4 w-4 shrink-0 text-kyanos" aria-hidden="true" />
                                <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {item.points && (
                          <ol className="mt-4 space-y-3">
                            {item.points.map((n, k) => (
                              <li key={n} className="flex gap-3 rounded-sm bg-sunken p-3">
                                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-bold text-ink">
                                  {k + 1}
                                </span>
                                <span>
                                  <span className="font-semibold text-ink">{tx(`faq.q15_p${n}_title`)}</span> {tx(`faq.q15_p${n}_body`)}
                                </span>
                              </li>
                            ))}
                          </ol>
                        )}
                        {item.summary && (
                          <p className="mt-4 rounded-sm bg-kyanos-wash p-3 text-ink">
                            <span className="font-semibold">{tx('faq.q15_summary_title')}:</span> {tx('faq.q15_summary')}
                          </p>
                        )}
                        {item.links && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {item.links.map((l) => (
                              <Link key={l.href} href={l.href} className={LINK_BTN}>
                                {l.label} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                              </Link>
                            ))}
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </div>
              </section>
            );
          })}
        </Accordion>

        {/* ── still stuck ── */}
        <section className="mt-14 rounded-sm border border-line bg-sunken p-6 text-center sm:p-8">
          <h2 className="font-serif text-2xl text-ink">{copy.stillTitle}</h2>
          <p className="mx-auto mt-2 max-w-xl text-ink-soft">{copy.stillText}</p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/walkthrough"
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-ink px-5 py-2.5 text-sm font-medium text-paper hover:bg-kyanos-deep"
            >
              {copy.guide} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center justify-center rounded-sm border border-ink px-5 py-2.5 text-sm font-medium text-ink hover:bg-surface"
            >
              {copy.how}
            </Link>
            <ContactDialog triggerClassName="inline-flex items-center justify-center rounded-sm border border-line-strong px-5 py-2.5 text-sm font-medium text-ink hover:bg-surface" />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
