import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { Search, Loader2, FileText, Users, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useTranslation } from '@/hooks/use-translation';

interface SearchProposal {
  id: number;
  question: string;
  status: string;
  communityId: number;
  category: string | null;
}

interface SearchMember {
  id: number;
  username: string;
  profilePicture: string | null;
}

interface SearchCommunity {
  id: number;
  name: string;
  description: string | null;
}

interface SearchResults {
  proposals: SearchProposal[];
  members: SearchMember[];
  communities: SearchCommunity[];
}

type Item =
  | { kind: 'proposal'; data: SearchProposal }
  | { kind: 'member'; data: SearchMember }
  | { kind: 'community'; data: SearchCommunity };

function flatten(results: SearchResults): Item[] {
  return [
    ...(results.communities ?? []).map((data) => ({ kind: 'community' as const, data })),
    ...(results.proposals ?? []).map((data) => ({ kind: 'proposal' as const, data })),
    ...(results.members ?? []).map((data) => ({ kind: 'member' as const, data })),
  ];
}

function itemPath(item: Item): string {
  switch (item.kind) {
    case 'proposal': return `/proposals/${item.data.id}`;
    case 'member': return `/profile`;
    case 'community': return `/communities/${item.data.id}`;
  }
}

export default function SearchBar() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        const resp = await api.get<SearchResults>(`/api/search?q=${encodeURIComponent(query.trim())}`);
        setResults(resp.data);
        setHighlight(0);
      } catch {
        setResults({ proposals: [], members: [], communities: [] });
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const items = results ? flatten(results) : [];

  function pick(item: Item) {
    setOpen(false);
    setQuery('');
    navigate(itemPath(item));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, Math.max(0, items.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (items[highlight]) {
        e.preventDefault();
        pick(items[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('search.placeholder')}
          className="pl-8 pr-8 h-9"
          aria-label={t('search.placeholder')}
          data-testid="search-input"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div
          className="absolute left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-96 overflow-y-auto"
          data-testid="search-dropdown"
        >
          {!loading && items.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center">
              {t('search.noResults')}
            </div>
          ) : (
            <ul role="listbox">
              {items.map((item, idx) => (
                <li
                  key={`${item.kind}-${item.data.id}`}
                  role="option"
                  aria-selected={highlight === idx}
                  onMouseEnter={() => setHighlight(idx)}
                  onClick={() => pick(item)}
                  className={`px-3 py-2 cursor-pointer flex items-start gap-2 text-sm ${highlight === idx ? 'bg-muted' : ''}`}
                  data-testid={`search-result-${item.kind}-${item.data.id}`}
                >
                  {item.kind === 'proposal' && <FileText className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />}
                  {item.kind === 'member' && <User className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />}
                  {item.kind === 'community' && <Users className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />}
                  <div className="min-w-0 flex-1">
                    {item.kind === 'proposal' && (
                      <>
                        <div className="font-medium truncate">{item.data.question}</div>
                        <div className="text-xs text-muted-foreground">{t('search.kind.proposal')} · {item.data.status}</div>
                      </>
                    )}
                    {item.kind === 'member' && (
                      <>
                        <div className="font-medium truncate">@{item.data.username}</div>
                        <div className="text-xs text-muted-foreground">{t('search.kind.member')} · @{item.data.username}</div>
                      </>
                    )}
                    {item.kind === 'community' && (
                      <>
                        <div className="font-medium truncate">{item.data.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {t('search.kind.community')}{item.data.description ? ` · ${item.data.description}` : ''}
                        </div>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
