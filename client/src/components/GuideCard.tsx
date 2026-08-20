/**
 * Mini onboarding — a dismissible three-step card shown on the feed until
 * the user closes it (remembered per browser). One glance teaches the loop
 * (ask → shape → decide) and links to the story walkthrough for more.
 */

import { useState } from 'react';
import { Link } from 'wouter';
import { X, BarChart3, MessageSquarePlus, Vote, ArrowRight } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';

const KEY = 'agorax-guide-dismissed-v1';

export function GuideCard() {
  const { locale } = useTranslation();
  const el = locale !== 'en';
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
  });
  if (dismissed) return null;

  const steps = [
    { icon: BarChart3, label: el ? 'Ρώτησε' : 'Ask', hint: el ? 'ανώνυμη δημοσκόπηση' : 'anonymous poll' },
    { icon: MessageSquarePlus, label: el ? 'Συνδιαμόρφωσε' : 'Shape it', hint: el ? 'πρόταση + τροπολογίες, ζωντανό κείμενο AI' : 'proposal + amendments, live AI text' },
    { icon: Vote, label: el ? 'Αποφάσισε' : 'Decide', hint: el ? 'ανώνυμη, επαληθεύσιμη ψήφος' : 'anonymous, verifiable vote' },
  ];

  return (
    <div className="mt-6 rounded-lg border bg-muted/30 p-4 relative" data-testid="guide-card">
      <button
        type="button"
        aria-label={el ? 'Κλείσιμο' : 'Dismiss'}
        className="absolute top-2.5 right-2.5 p-1 rounded hover:bg-muted text-muted-foreground"
        onClick={() => { setDismissed(true); try { localStorage.setItem(KEY, '1'); } catch { /* private mode */ } }}
        data-testid="guide-dismiss"
      >
        <X className="w-4 h-4" />
      </button>
      <p className="text-sm font-medium mb-3">
        {el ? 'Νέος/α εδώ; Έτσι αποφασίζει μια κοινότητα:' : 'New here? This is how a community decides:'}
      </p>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        {steps.map((st, i) => (
          <div key={i} className="flex items-center gap-2 flex-1 min-w-0">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary shrink-0">
              <st.icon className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium">{st.label}</div>
              <div className="text-xs text-muted-foreground truncate">{st.hint}</div>
            </div>
            {i < steps.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground hidden sm:block shrink-0 ml-auto" />}
          </div>
        ))}
      </div>
      <Link href="/walkthrough" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-3">
        {el ? 'Δες το με ένα παράδειγμα (1 λεπτό)' : 'See it with an example (1 minute)'}
        <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
