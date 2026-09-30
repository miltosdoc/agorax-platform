/**
 * Community Constitution — a read-only document assembled from what the
 * community has already decided:
 *
 *   Part I  — Rules: the community's current governance settings, written
 *             out as articles. These are the rules the platform enforces.
 *   Part II — Decisions: every decided proposal whose vote passed, with the
 *             enacted text and the result.
 *
 * Nothing here is stored; the document is rebuilt on each request so it can
 * never drift from the settings and votes it describes. A SHA-256
 * fingerprint over the content (not the generation time) lets anyone check
 * that a downloaded copy matches what the platform shows.
 *
 * "Passed" is computed exactly as the vote panel does (computeVoteResults),
 * i.e. against the community's CURRENT threshold and quorum.
 */

import { createHash } from 'crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '../db';
import { communities, proposalAmendments, proposals } from '@shared/schema';
import {
  PROPOSAL_KINDS, majorityFraction, proposalKindOf, voteRulesFor, type MajorityRule, type ProposalKind,
} from '@shared/proposal-kinds';
import { constitutionKinds, synthesisJuryTerms } from '@shared/community-settings';
import { adoptedText, isArticleBallot } from '@shared/article-ballot';
import { sectionText, statuteSections } from '@shared/statute-articles';
import { canViewCommunityContentById } from './community-visibility';
import { aiAvailable, ensureArticles, getCachedArticles, pendingCount, type AiArticle } from './constitution-ai';

export type Lang = 'el' | 'en';

export interface Article {
  title: string;
  body: string;
}

export interface Decision {
  proposalId: number;
  kind: ProposalKind;
  question: string;
  text: string;
  /** e.g. "Yes 12 · No 3 · Abstain 1" or "Final proposal 9 · No change 2". */
  result: string;
  participation: string;
  date: string; // ISO
}

export interface Constitution {
  communityId: number;
  communityName: string;
  description: string | null;
  lang: Lang;
  articles: Article[];
  /** null when the viewer may not see this community's content. */
  decisions: Decision[] | null;
  /** AI-written articles for the decisions that have one so far. */
  ai: {
    available: boolean;
    /** Decisions still queued for an article. */
    pending: number;
    articles: AiArticle[];
    fingerprint: string;
  } | null;
  /** Fingerprint of the original-text version. */
  fingerprint: string;
  generatedAt: string;
}

export type Version = 'ai' | 'raw';

const L = {
  el: {
    title: 'Σύνταγμα',
    part1: 'Μέρος Α — Κανόνες',
    part1Intro: 'Οι ισχύοντες κανόνες λειτουργίας της κοινότητας. Εφαρμόζονται αυτόματα από την πλατφόρμα.',
    part2: 'Μέρος Β — Αποφάσεις',
    part2Intro: 'Κάθε πρόταση που εγκρίθηκε με ψηφοφορία, με το κείμενο που υιοθετήθηκε.',
    statutePart: 'Μέρος Β — Καταστατικό',
    statuteIntro: 'Το ισχύον κείμενο: κάθε άρθρο στην τελευταία εγκεκριμένη διατύπωσή του, με την απόφαση από την οποία προέρχεται.',
    decisionsAfterStatute: 'Μέρος Γ — Αποφάσεις',
    articlesAdopted: (n: number, total: number) => `εγκρίθηκαν ${n} από ${total} άρθρα`,
    noDecisions: 'Δεν έχει εγκριθεί ακόμη καμία πρόταση.',
    decisionsHidden: 'Οι αποφάσεις είναι ορατές μόνο στα μέλη της κοινότητας.',
    article: 'Άρθρο',
    decision: 'Απόφαση',
    result: 'Αποτέλεσμα',
    participation: 'Συμμετοχή',
    date: 'Ημερομηνία',
    proposal: 'Πρόταση',
    verify: 'Επαλήθευση ψηφοφορίας',
    fingerprint: 'Αποτύπωμα περιεχομένου (SHA-256)',
    generated: 'Δημιουργήθηκε',
    readOnly: 'Το έγγραφο συντίθεται αυτόματα από τις ρυθμίσεις και τις ψηφοφορίες της κοινότητας.',
    yes: 'Ναι', no: 'Όχι', abstain: 'Αποχή',
    ofMembers: (n: number, pct: string) => `${n} ψηφοφόροι (${pct} των μελών)`,
    aiPart2: 'Μέρος Β — Άρθρα από τις αποφάσεις',
    aiPart3: 'Μέρος Γ — Άρθρα από τις αποφάσεις',
    aiPart2Intro: 'Κάθε εγκεκριμένη απόφαση, γραμμένη ως άρθρο. Κάθε άρθρο παραπέμπει στην πρόταση από την οποία προέρχεται.',
    appendix: 'Παράρτημα — Άλλες αποφάσεις',
    appendixIntro: 'Αποφάσεις που δεν θεσπίζουν κανόνα (δημοσκοπήσεις, δοκιμές, καλέσματα για ιδέες).',
    source: 'Πηγή',
    aiNotice: 'Τα άρθρα του Μέρους Β τα συνέταξε AI από τα κείμενα που εγκρίθηκαν. Δεσμευτικό είναι το αυθεντικό κείμενο κάθε απόφασης, στην πρόταση που αναφέρεται.',
    aiPendingItem: 'Η σύνθεση AI εκκρεμεί· παρατίθεται το αυθεντικό κείμενο.',
  },
  en: {
    title: 'Constitution',
    part1: 'Part I — Rules',
    part1Intro: 'The community\'s current operating rules. The platform enforces them automatically.',
    part2: 'Part II — Decisions',
    part2Intro: 'Every proposal approved by vote, with the text that was adopted.',
    statutePart: 'Part II — Statute',
    statuteIntro: 'The text in force: each article in its latest approved wording, with the decision it comes from.',
    decisionsAfterStatute: 'Part III — Decisions',
    articlesAdopted: (n: number, total: number) => `${n} of ${total} articles adopted`,
    noDecisions: 'No proposal has been approved yet.',
    decisionsHidden: 'Decisions are visible to community members only.',
    article: 'Article',
    decision: 'Decision',
    result: 'Result',
    participation: 'Participation',
    date: 'Date',
    proposal: 'Proposal',
    verify: 'Verify the vote',
    fingerprint: 'Content fingerprint (SHA-256)',
    generated: 'Generated',
    readOnly: 'This document is assembled automatically from the community\'s settings and votes.',
    yes: 'Yes', no: 'No', abstain: 'Abstain',
    ofMembers: (n: number, pct: string) => `${n} voters (${pct} of members)`,
    aiPart2: 'Part II — Articles from decisions',
    aiPart3: 'Part III — Articles from decisions',
    aiPart2Intro: 'Every approved decision, written as an article. Each article cites the proposal it comes from.',
    appendix: 'Appendix — Other decisions',
    appendixIntro: 'Decisions that set no rule (polls, tests, calls for ideas).',
    source: 'Source',
    aiNotice: 'The articles in Part II were drafted by AI from the approved texts. The original text of each decision, in the proposal cited, is authoritative.',
    aiPendingItem: 'AI drafting pending; the original text is shown.',
  },
} as const;

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

function hours(h: number | null | undefined, lang: Lang): string {
  const v = Number(h ?? 0);
  if (v === 0) return lang === 'el' ? 'χωρίς όριο' : 'no limit';
  if (v % 24 === 0) {
    const d = v / 24;
    return lang === 'el' ? `${d} ${d === 1 ? 'ημέρα' : 'ημέρες'}` : `${d} day${d === 1 ? '' : 's'}`;
  }
  return lang === 'el' ? `${v} ώρες` : `${v} hours`;
}

type CommunityRow = typeof communities.$inferSelect;

/** Part I: the rules, read from the community's settings. Exported for tests. */
export function buildArticles(c: CommunityRow, lang: Lang): Article[] {
  const el = lang === 'el';
  const inclusion = Number(c.amendmentInclusionThreshold ?? 0.6);
  const maxAm = c.maxAmendmentsPerProposal ?? -1;

  const governance = c.type === 'managed'
    ? (el ? 'Η κοινότητα είναι διαχειριζόμενη: τη διοικεί ομάδα διαχειριστών.'
          : 'The community is managed: it is run by an admin team.')
    : (el ? 'Η κοινότητα είναι αυτόνομη: δεν έχει διαχειριστές. Οι κανόνες της αλλάζουν μόνο με ψηφοφορία των μελών.'
          : 'The community is autonomous: it has no admins. Its rules change only by a vote of the members.');

  const join = {
    open: el ? 'Οποιοσδήποτε μπορεί να γίνει μέλος.' : 'Anyone may join.',
    approval: el ? 'Η ένταξη νέων μελών χρειάζεται έγκριση.' : 'New members need approval to join.',
    invite_only: el ? 'Νέα μέλη εντάσσονται μόνο με πρόσκληση.' : 'New members join by invitation only.',
  }[c.joinPolicy] ?? c.joinPolicy;

  const verified = c.requireGovgrVerification
    ? (el ? ' Απαιτείται επαλήθευση ταυτότητας μέσω gov.gr.' : ' Identity verification through gov.gr is required.')
    : '';

  const submit = {
    all_members: el ? 'Κάθε μέλος μπορεί να υποβάλει πρόταση.' : 'Every member may submit a proposal.',
    admins: el ? 'Προτάσεις υποβάλλουν μόνο οι διαχειριστές.' : 'Only admins may submit proposals.',
    founder: el ? 'Προτάσεις υποβάλλει μόνο ο ιδρυτής.' : 'Only the founder may submit proposals.',
  }[c.proposalPolicy] ?? c.proposalPolicy;
  const submitTail = el
    ? ' Τη συζήτηση, τις τροποποιήσεις και την ψηφοφορία μπορούν να τις κάνουν όλα τα μέλη.'
    : ' Every member may take part in discussion, amendments and voting.';

  const vis = (v: string) => v === 'members'
    ? (el ? 'μόνο τα μέλη' : 'members only')
    : (el ? 'όλοι' : 'everyone');

  // One sentence per kind of vote, from the same terms the form and the
  // server enforce (voteRulesFor), so the charter can never promise a rule
  // the platform does not apply.
  const kindName = (k: ProposalKind) => ({
    decision: el ? 'Απόφαση' : 'Decision',
    statute: el ? 'Καταστατικό' : 'Statute',
    election: el ? 'Εκλογή' : 'Election',
    poll: el ? 'Δημοσκόπηση κοινότητας' : 'Community poll',
  }[k]);
  const majorityText = (m: MajorityRule) => {
    const [num, den] = majorityFraction(m);
    return m === 'simple'
      ? (el ? 'περισσότερα από τα μισά «Ναι»' : 'more than half Yes')
      : (el ? `τουλάχιστον ${num}/${den} «Ναι»` : `at least ${num}/${den} Yes`);
  };
  const quorumText = (q: number | null) => !q
    ? ''
    : (el ? `, με απαρτία το ${q}% των μελών` : `, with a quorum of ${q}% of members`);
  const kindRule = (k: ProposalKind): string | null => {
    const r = voteRulesFor(c as unknown as Record<string, unknown>, k);
    if (!r.enabled) return null;
    const span = el
      ? `διαρκεί από ${hours(r.minHours, lang)} έως ${hours(r.maxHours, lang)}`
      : `runs ${hours(r.minHours, lang)} to ${hours(r.maxHours, lang)}`;
    const outcome = k === 'election'
      ? (el ? 'εκλέγεται όποιος πάρει τις περισσότερες ψήφους' : 'the candidate with the most votes is elected')
      : k === 'poll'
        ? (el ? 'δεν δεσμεύει την κοινότητα' : 'does not bind the community')
        : (el ? `εγκρίνεται με ${majorityText(r.majority ?? 'simple')} (οι αποχές δεν μετρούν)` : `passes with ${majorityText(r.majority ?? 'simple')} (abstentions do not count)`);
    // An election or a poll may open by collecting its options.
    const phase = r.codrafting && k === 'election'
      ? (el ? ' Μπορεί να προηγηθεί φάση υποψηφιοτήτων, όπου τα μέλη δηλώνουν ή προτείνουν υποψηφίους.' : ' It may open with a candidacy phase, in which members stand or put someone forward.')
      : r.codrafting && k === 'poll'
        ? (el ? ' Μπορεί να προηγηθεί φάση όπου τα μέλη προτείνουν απαντήσεις.' : ' It may open with a phase in which members suggest answers.')
        : '';
    return `${kindName(k)}: ${span}· ${outcome}${quorumText(r.quorumPct)}.${phase}`;
  };
  const off = PROPOSAL_KINDS.filter((k) => !voteRulesFor(c as unknown as Record<string, unknown>, k).enabled);
  const decisionRule = [
    ...PROPOSAL_KINDS.map(kindRule).filter(Boolean),
    ...(off.length
      ? [el ? `Δεν επιτρέπεται: ${off.map(kindName).join(', ')}.` : `Not allowed: ${off.map(kindName).join(', ')}.`]
      : []),
    el
      ? 'Όταν το ψηφοδέλτιο έχει επιλογές ή αντιπροτάσεις, νικά η επιλογή με τις περισσότερες ψήφους.'
      : 'When the ballot offers options or counter-proposals, the option with the most votes wins.',
    el
      ? 'Ένα καταστατικό γραμμένο σε άρθρα ψηφίζεται κατ\' άρθρο και στο σύνολο: ένα άρθρο ισχύει μόνο αν εγκριθεί το ίδιο και το σύνολο, και όπου υπάρχουν εκδοχές ισχύει όποια πάρει τις περισσότερες ψήφους.'
      : 'A statute written in articles is voted article by article and on the whole: an article takes effect only if it and the whole are approved, and where there are versions, the one with most votes applies.',
    el
      ? `Το Σύνταγμα καταγράφει: ${scopeText(c.constitutionScope, lang)}.`
      : `The constitution records: ${scopeText(c.constitutionScope, lang)}.`,
  ].join(' ');

  const timeline = el
    ? `Ο συντάκτης επιλέγει διάρκεια συνδιαμόρφωσης από ${hours(c.deliberationMinHours, lang)} έως ${hours(c.deliberationMaxHours, lang)} `
      + `και διάρκεια ψηφοφορίας μέσα στα όρια κάθε τύπου. Ο συντάκτης έχει ${hours(c.authorReviewHours, lang)} για να κρίνει τις τροποποιήσεις `
      + `και ${hours(c.finalReviewHours, lang)} για να δει το τελικό κείμενο πριν ανοίξει η κάλπη.`
    : `The author chooses a co-drafting period of ${hours(c.deliberationMinHours, lang)} to ${hours(c.deliberationMaxHours, lang)} `
      + `and a voting period within the limits of each kind. The author has ${hours(c.authorReviewHours, lang)} to judge amendments `
      + `and ${hours(c.finalReviewHours, lang)} to review the final text before the ballot opens.`;

  // Mirrors ai-merger.ts: unjudged amendments enter at >= inclusion
  // popularity (upvotes / all votes on it); author-rejected ones only at
  // >= max(inclusion, 70%). inclusion = 1 means "author decides".
  const override = Math.max(inclusion, 0.7);
  const amendments = (el
    ? `Κάθε μέλος μπορεί να προτείνει βελτιώσεις ή αντιπροτάσεις${maxAm > 0 ? ` (έως ${maxAm} ανά πρόταση)` : ''}. Ο συντάκτης αποδέχεται ή απορρίπτει καθεμία. `
      + (inclusion < 1 ? `Μια τροποποίηση που δεν έκρινε μπαίνει στο τελικό κείμενο αν τη στηρίζει τουλάχιστον το ${pct(inclusion)} όσων ψήφισαν γι' αυτήν. ` : '')
      + `Μια τροποποίηση που απέρριψε μπαίνει παρ' όλα αυτά αν τη στηρίζει τουλάχιστον το ${pct(override)} όσων ψήφισαν γι' αυτήν.`
    : `Any member may propose improvements or counter-proposals${maxAm > 0 ? ` (up to ${maxAm} per proposal)` : ''}. The author accepts or rejects each one. `
      + (inclusion < 1 ? `An amendment the author did not judge enters the final text if at least ${pct(inclusion)} of those who voted on it support it. ` : '')
      + `An amendment the author rejected still enters if at least ${pct(override)} of those who voted on it support it.`);

  // The jury, when there is one: the terms handleCreateSortition draws with,
  // and the trigger shouldDrawSynthesisJury applies. A rejected amendment is
  // flagged when (up − down) / all votes on it >= amendmentThreshold with at
  // least 3 votes, i.e. when at least (1 + threshold) / 2 of them support it.
  const jury = synthesisJuryTerms(c);
  const flagShare = (1 + Number(c.amendmentThreshold ?? 0.5)) / 2;
  const jurySize = jury.mode === 'percentage'
    ? (el ? `με το ${Math.min(jury.size, 100)}% των μελών (τουλάχιστον 3)` : `of ${Math.min(jury.size, 100)}% of the members (at least 3)`)
    : (el ? `${jury.size} μελών` : `of ${jury.size} members`);
  const merged = el
    ? 'το τελικό κείμενο συντίθεται αυτόματα από την αρχική πρόταση και τις τροποποιήσεις που έγιναν δεκτές.'
    : 'the final text is merged automatically from the original proposal and the accepted amendments.';
  const synthesis = c.synthesisMode === 'sortition'
    ? (el
        ? `Όταν κλείνει η συνδιαμόρφωση, αν μια τροποποίηση που απέρριψε ο συντάκτης τη στηρίζει τουλάχιστον το ${pct(flagShare)} όσων ψήφισαν γι' αυτήν (με τουλάχιστον 3 ψήφους), κληρώνεται σώμα ${jurySize} για να γράψει το τελικό κείμενο. `
          + `Αν τα διαθέσιμα μέλη είναι λιγότερα, κληρώνονται όλα. Το σώμα έχει ${hours(jury.responseHours, lang)}· μόλις ένα μέλος του υποβάλει το κείμενο, ανοίγει η ψηφοφορία. `
          + `Σε κάθε άλλη περίπτωση, ή αν το σώμα δεν σχηματιστεί ή δεν υποβάλει κείμενο εγκαίρως, ${merged}`
        : `When co-drafting closes, if at least ${pct(flagShare)} of those who voted on an amendment the author rejected support it (with at least 3 votes), a jury ${jurySize} is drawn by lot to write the final text. `
          + `If fewer members are available, all of them are drawn. The jury has ${hours(jury.responseHours, lang)}; as soon as one of its members submits the text, the vote opens. `
          + `Otherwise, or if the jury cannot form or submits no text in time, ${merged}`)
    : (el
        ? 'Το τελικό κείμενο συντίθεται αυτόματα από την αρχική πρόταση και τις τροποποιήσεις που έγιναν δεκτές.'
        : 'The final text is merged automatically from the original proposal and the accepted amendments.');

  const secrecy = el
    ? 'Οι ψηφοφορίες είναι μυστικές από προεπιλογή: ο server δεν μπορεί να συνδέσει την ψήφο με τον ψηφοφόρο. Κάθε κάλπη μπορεί να επαληθευτεί δημόσια στη σελίδα /verify.'
    : 'Votes are secret by default: the server cannot link a ballot to its voter. Every ballot box can be verified publicly on the /verify page.';

  return [
    { title: el ? 'Διακυβέρνηση' : 'Governance', body: governance },
    { title: el ? 'Μέλη' : 'Membership', body: join + verified },
    { title: el ? 'Ορατότητα' : 'Visibility', body: el
        ? `Τη λίστα μελών τη βλέπουν ${vis(c.memberListVisibility)}. Το περιεχόμενο (προτάσεις, συζητήσεις, ψηφοφορίες) το βλέπουν ${vis(c.contentVisibility)}.`
        : `The member list is visible to ${vis(c.memberListVisibility)}. Content (proposals, discussions, votes) is visible to ${vis(c.contentVisibility)}.` },
    { title: el ? 'Υποβολή προτάσεων' : 'Submitting proposals', body: submit + submitTail },
    { title: el ? 'Τροποποιήσεις' : 'Amendments', body: amendments },
    { title: el ? 'Τελικό κείμενο' : 'Final text', body: synthesis },
    { title: el ? 'Χρόνοι' : 'Timelines', body: timeline },
    { title: el ? 'Κανόνες ψηφοφορίας' : 'Voting rules', body: decisionRule },
    { title: el ? 'Μυστικότητα ψήφου' : 'Secret ballot', body: secrecy },
  ];
}

/** What the constitution records under a community's scope, in words. */
function scopeText(scope: unknown, lang: Lang): string {
  const el = lang === 'el';
  switch (scope) {
    case 'statute_decisions': return el ? 'το καταστατικό και τις αποφάσεις' : 'the statute and decisions';
    case 'statute': return el ? 'μόνο το καταστατικό' : 'the statute only';
    case 'decisions': return el ? 'μόνο τις αποφάσεις' : 'decisions only';
    default: return el ? 'ό,τι αποφασίστηκε — καταστατικό, αποφάσεις, εκλογές' : 'everything decided — statute, decisions, elections';
  }
}

async function buildDecisions(communityId: number, lang: Lang, kinds: readonly ProposalKind[]): Promise<Decision[]> {
  const s = L[lang];
  const rows = await db.select().from(proposals)
    .where(and(eq(proposals.communityId, communityId), eq(proposals.status, 'decided')))
    .orderBy(asc(proposals.updatedAt), asc(proposals.id));
  if (rows.length === 0) return [];

  const { getVotingBackend } = await import('../voting');
  const { computeVoteResults } = await import('../routers/proposals');
  const backend = getVotingBackend();

  // Counter-proposals that may have won an option ballot.
  const counterIds = rows
    .map((p) => p.winningOption?.startsWith('counter_') ? parseInt(p.winningOption.slice(8), 10) : NaN)
    .filter(Number.isFinite);
  const counters = counterIds.length
    ? await db.select().from(proposalAmendments).where(inArray(proposalAmendments.id, counterIds))
    : [];
  const counterText = new Map(counters.map((a) => [a.id, a.restyledText || a.text]));

  const out: Decision[] = [];
  for (const p of rows) {
    const view = await backend.getVoterView({ proposalId: p.id });
    const r = await computeVoteResults(p, view);
    // A poll records opinion; it never becomes a rule of the community.
    if (!r.passes || !r.binding) continue;
    // The community decides what its constitution records.
    const kind = proposalKindOf(p.kind);
    if (!kinds.includes(kind)) continue;

    let text = p.finalText || p.solution;
    let result: string;
    if (r.articles && isArticleBallot(p.articleBallot)) {
      // Voted article by article: only the adopted articles, each in the
      // version that won.
      text = adoptedText(p.articleBallot, r.articles);
      if (!text) continue;
      const adopted = r.articles.filter((a) => a.adopted).length;
      result = `${s.yes} ${r.yes} · ${s.no} ${r.no} · ${s.abstain} ${r.abstain} — ${s.articlesAdopted(adopted, r.articles.length)}`;
    } else if (r.ballotOptions && r.counts) {
      const winner = r.ballotOptions.find((o) => o.id === r.winner);
      if (r.winner?.startsWith('counter_')) {
        text = counterText.get(parseInt(r.winner.slice(8), 10)) ?? text;
      } else if (r.winner && r.winner !== 'final') {
        // Plain option poll: the adopted "text" is the winning option.
        text = winner?.label ?? text;
      }
      result = r.ballotOptions.map((o) => `${o.label} ${r.counts![o.id] ?? 0}`).join(' · ');
    } else {
      result = `${s.yes} ${r.yes} · ${s.no} ${r.no} · ${s.abstain} ${r.abstain}`;
    }

    out.push({
      proposalId: p.id,
      kind,
      question: p.question,
      text: text.trim(),
      result,
      participation: s.ofMembers(r.participants, pct(r.participationPct)),
      date: (p.phaseDeadline ?? p.updatedAt).toISOString(),
    });
  }
  // Chronological by decision date (updatedAt alone drifts on later edits).
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.proposalId - b.proposalId);
}

export async function buildConstitution(
  communityId: number,
  viewerId: number | undefined,
  lang: Lang,
): Promise<Constitution | null> {
  const [c] = await db.select().from(communities).where(eq(communities.id, communityId));
  if (!c) return null;

  const articles = buildArticles(c, lang);
  const visible = await canViewCommunityContentById(communityId, viewerId);
  const decisions = visible ? await buildDecisions(communityId, lang, constitutionKinds(c.constitutionScope)) : null;

  let ai: Constitution['ai'] = null;
  if (decisions) {
    // A statute written in articles is already articles: both versions show
    // it as the statute in force, verbatim, so it is never sent to the AI.
    const { from } = consolidatedStatute(decisions);
    const toWrite = decisions.filter((d) => !from.has(d.proposalId));
    const have = await getCachedArticles(toWrite, lang);
    ensureArticles(toWrite, lang, c.name, have);
    ai = {
      available: aiAvailable(),
      pending: pendingCount(toWrite, lang),
      articles: toWrite.map((d) => have.get(d.proposalId)).filter((a): a is AiArticle => !!a),
      fingerprint: '',
    };
  }

  const doc: Constitution = {
    communityId: c.id,
    communityName: c.name,
    description: c.description,
    lang,
    articles,
    decisions,
    ai,
    fingerprint: '',
    generatedAt: new Date().toISOString(),
  };
  doc.fingerprint = sha256(renderMarkdownBody(layout(doc, 'raw')));
  if (doc.ai) doc.ai.fingerprint = sha256(renderMarkdownBody(layout(doc, 'ai')));
  return doc;
}

const sha256 = (t: string) => createHash('sha256').update(t).digest('hex');

// ─── Layout (shared by both renderers) ───────────────────────────────────────

const fmtDate = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleDateString(lang === 'el' ? 'el-GR' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

export interface Block {
  heading: string;
  meta?: string;           // date / source line
  proposalId?: number;     // link target for the source line
  note?: string;           // e.g. "AI drafting pending"
  body: string;
  result?: string;
  participation?: string;
}

export interface Part { heading: string; intro?: string; blocks: Block[] }

export interface Layout {
  lang: Lang;
  title: string;
  communityName: string;
  description: string | null;
  notice?: string;
  parts: Part[];
  fingerprint: string;
}

/**
 * The statute in force, from the approved statutes written in articles:
 * each article in the wording of the latest decision that adopted it, in
 * article order. `from` holds the decisions it was built from, which the
 * layout then leaves out of the list of decisions.
 */
function consolidatedStatute(decisions: Decision[]): {
  blocks: Array<Omit<Block, 'meta'> & { decision: Decision }>;
  from: Set<number>;
} {
  const latest = new Map<string, { heading: string; body: string; decision: Decision }>();
  const from = new Set<number>();
  for (const d of decisions) { // chronological, so a later wording replaces an earlier one
    if (d.kind !== 'statute') continue;
    const sections = statuteSections(d.text);
    if (!sections) continue;
    from.add(d.proposalId);
    for (const section of sections) {
      if (!section.heading) continue;
      const text = sectionText(d.text, section);
      latest.set(section.ref, { heading: section.heading, body: text.slice(section.heading.length).trim(), decision: d });
    }
  }
  const order = (ref: string) => {
    const n = parseInt(ref, 10);
    return [Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER, ref] as const;
  };
  const blocks = [...latest.entries()]
    .sort(([a], [b]) => {
      const [na, ra] = order(a);
      const [nb, rb] = order(b);
      return na - nb || ra.localeCompare(rb, 'el');
    })
    .map(([, a]) => ({ heading: a.heading, proposalId: a.decision.proposalId, body: a.body, decision: a.decision }));
  return { blocks, from };
}

/** Arrange the document for one version. Both renderers and the tab print this as-is. */
export function layout(doc: Constitution, version: Version): Layout {
  const s = L[doc.lang];
  const rules: Part = {
    heading: s.part1,
    intro: s.part1Intro,
    blocks: doc.articles.map((a, i) => ({ heading: `${s.article} ${i + 1} — ${a.title}`, body: a.body })),
  };
  const sourceLine = (d: Decision) => `${s.source}: ${s.proposal} #${d.proposalId} · ${fmtDate(d.date, doc.lang)}`;

  if (doc.decisions === null) {
    return {
      lang: doc.lang, title: s.title, communityName: doc.communityName, description: doc.description,
      parts: [rules, { heading: version === 'ai' ? s.aiPart2 : s.part2, intro: s.decisionsHidden, blocks: [] }],
      fingerprint: '',
    };
  }
  if (doc.decisions.length === 0) {
    return {
      lang: doc.lang, title: s.title, communityName: doc.communityName, description: doc.description,
      parts: [rules, { heading: version === 'ai' ? s.aiPart2 : s.part2, intro: s.noDecisions, blocks: [] }],
      fingerprint: '',
    };
  }

  if (version === 'raw' || !doc.ai) {
    // Statutes written in articles read as one statute in force: each
    // article in its latest approved wording. Everything else stays a list
    // of decisions.
    const statute = consolidatedStatute(doc.decisions);
    const others = doc.decisions.filter((d) => !statute.from.has(d.proposalId));
    const parts: Part[] = [rules];
    if (statute.blocks.length > 0) {
      parts.push({
        heading: s.statutePart,
        intro: s.statuteIntro,
        blocks: statute.blocks.map(({ decision, ...b }) => ({ ...b, meta: sourceLine(decision) })),
      });
    }
    if (others.length > 0 || statute.blocks.length === 0) {
      parts.push({
        heading: statute.blocks.length > 0 ? s.decisionsAfterStatute : s.part2,
        intro: s.part2Intro,
        blocks: others.map((d, i) => ({
          heading: `${s.decision} ${i + 1} — ${d.question}`,
          meta: `${s.date}: ${fmtDate(d.date, doc.lang)} · ${s.proposal} #${d.proposalId}`,
          proposalId: d.proposalId,
          body: d.text,
          result: d.result,
          participation: d.participation,
        })),
      });
    }
    return {
      lang: doc.lang, title: s.title, communityName: doc.communityName, description: doc.description,
      parts,
      fingerprint: doc.fingerprint,
    };
  }
  // AI version: the statute in force as it stands (it is already written
  // in articles); the other normative decisions continue the article
  // numbering after Part I; the rest go to the appendix. A decision without
  // an article yet appears with its original text so the document is never
  // incomplete.
  const statute = consolidatedStatute(doc.decisions);
  const byId = new Map(doc.ai.articles.map((a) => [a.proposalId, a]));
  const main: Block[] = [];
  const appendix: Block[] = [];
  let n = doc.articles.length;
  for (const d of doc.decisions.filter((x) => !statute.from.has(x.proposalId))) {
    const a = byId.get(d.proposalId);
    if (a && !a.normative) {
      appendix.push({ heading: a.title, meta: sourceLine(d), proposalId: d.proposalId, body: a.body });
      continue;
    }
    n += 1;
    main.push(a
      ? { heading: `${s.article} ${n} — ${a.title}`, meta: sourceLine(d), proposalId: d.proposalId, body: a.body }
      : { heading: `${s.article} ${n} — ${d.question}`, meta: sourceLine(d), proposalId: d.proposalId, note: s.aiPendingItem, body: d.text });
  }
  const parts: Part[] = [rules];
  if (statute.blocks.length > 0) {
    parts.push({
      heading: s.statutePart,
      intro: s.statuteIntro,
      blocks: statute.blocks.map(({ decision, ...b }) => ({ ...b, meta: sourceLine(decision) })),
    });
  }
  if (main.length > 0 || statute.blocks.length === 0) {
    parts.push({ heading: statute.blocks.length > 0 ? s.aiPart3 : s.aiPart2, intro: s.aiPart2Intro, blocks: main });
  }
  if (appendix.length) parts.push({ heading: s.appendix, intro: s.appendixIntro, blocks: appendix });
  return {
    lang: doc.lang, title: s.title, communityName: doc.communityName, description: doc.description,
    notice: s.aiNotice, parts, fingerprint: doc.ai.fingerprint,
  };
}

// ─── Renderers ─────────────────────────────────────────────────────────────

/** Markdown without the footer — this is what the fingerprint covers. */
function renderMarkdownBody(l: Layout, origin = ''): string {
  const s = L[l.lang];
  const lines: string[] = [`# ${l.title} — ${l.communityName}`, ''];
  if (l.description) lines.push(`> ${l.description.replace(/\n/g, '\n> ')}`, '');
  if (l.notice) lines.push(`*${l.notice}*`, '');
  for (const p of l.parts) {
    lines.push(`## ${p.heading}`, '');
    if (p.intro) lines.push(p.intro, '');
    for (const b of p.blocks) {
      lines.push(`### ${b.heading}`, '');
      if (b.meta) lines.push(`*${b.meta}* — ${origin}/proposals/${b.proposalId}`, '');
      if (b.note) lines.push(`*${b.note}*`, '');
      lines.push(b.body, '');
      if (b.result) lines.push(`**${s.result}:** ${b.result}  `);
      if (b.participation) lines.push(`**${s.participation}:** ${b.participation}  `);
      if (b.proposalId && b.result) lines.push(`${s.verify}: ${origin}/verify?proposal=${b.proposalId}`, '');
    }
  }
  return lines.join('\n');
}

function footer(doc: Constitution, l: Layout) {
  const s = L[doc.lang];
  return { readOnly: s.readOnly, generated: `${s.generated}: ${new Date(doc.generatedAt).toISOString()}`, fp: `${s.fingerprint}: ${l.fingerprint}` };
}

export function renderMarkdown(doc: Constitution, version: Version, origin: string): string {
  const l = layout(doc, version);
  const f = footer(doc, l);
  return renderMarkdownBody(l, origin) + `\n---\n\n${f.readOnly}  \n${f.generated}  \n${f.fp}\n`;
}

const esc = (t: string) => t
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Paragraphs from plain/markdown-ish text: blank lines split, single newlines break. */
const paras = (t: string) => t.split(/\n{2,}/)
  .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');

/** Self-contained, print-ready HTML (File → Print → Save as PDF). */
export function renderHtml(doc: Constitution, version: Version, origin: string): string {
  const l = layout(doc, version);
  const f = footer(doc, l);
  const s = L[doc.lang];
  const parts = l.parts.map((p) => `
<h2>${esc(p.heading)}</h2>
${p.intro ? `<p class="muted">${esc(p.intro)}</p>` : ''}
${p.blocks.map((b) => `<section>
  <h3>${esc(b.heading)}</h3>
  ${b.meta ? `<p class="meta"><a href="${origin}/proposals/${b.proposalId}">${esc(b.meta)}</a></p>` : ''}
  ${b.note ? `<p class="meta"><i>${esc(b.note)}</i></p>` : ''}
  ${paras(b.body)}
  ${b.result ? `<p class="meta"><b>${s.result}:</b> ${esc(b.result)}<br><b>${s.participation}:</b> ${esc(b.participation ?? '')}<br>
  <a href="${origin}/verify?proposal=${b.proposalId}">${s.verify}</a></p>` : ''}
</section>`).join('\n')}`).join('\n');

  return `<!doctype html>
<html lang="${doc.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${s.title} — ${esc(doc.communityName)}</title>
<style>
  body{font:16px/1.6 Georgia,'Times New Roman',serif;color:#1a1917;background:#fff;max-width:760px;margin:40px auto;padding:0 16px}
  h1{font-size:2rem;margin:0 0 .25rem}h2{margin-top:2.5rem;border-bottom:1px solid #ccc;padding-bottom:.25rem}
  h3{font-size:1.1rem;margin:1.5rem 0 .25rem}.muted,.meta{color:#555}.meta{font-size:.9rem}
  .notice{border-left:3px solid #999;padding:.25rem .75rem;color:#444;font-style:italic}
  blockquote{margin:0;color:#555;font-style:italic}footer{margin-top:3rem;border-top:1px solid #ccc;padding-top:1rem;font-size:.8rem;color:#555;word-break:break-all}
  section{break-inside:avoid-page}a{color:inherit}
</style></head><body>
<h1>${s.title}</h1><p class="muted">${esc(doc.communityName)}</p>
${doc.description ? `<blockquote>${paras(doc.description)}</blockquote>` : ''}
${l.notice ? `<p class="notice">${esc(l.notice)}</p>` : ''}
${parts}
<footer>${esc(f.readOnly)}<br>${esc(f.generated)}<br>${esc(f.fp)}</footer>
</body></html>`;
}
