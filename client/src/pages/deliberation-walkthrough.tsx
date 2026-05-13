/**
 * Deliberation Walkthrough v3
 * 
 * Interactive guided tour through the AgoraX deliberative democracy platform.
 * Uses real demo data, links to working pages, and is designed for
 * users AND investors to understand the full pipeline.
 * 
 * 7-phase flow:
 * 1. Proposal Submission
 * 2. LLM Validation
 * 3. Author Review (accepts/rejects amendments)
 * 4. Community Signal (⬆️/⬇️ on rejected amendments)
 * 5. Sortition Synthesis (composes final text)
 * 6. Ratification Vote
 * 7. Verified Ballot (Gov.gr + cryptographic verification)
 */

import { useState } from 'react';
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  FileText, CheckCircle, Users, MessageSquare, Vote,
  ArrowRight, ThumbsUp, ThumbsDown,
  Edit3, Shield, PenTool, TrendingUp,
  Zap, Lock, BarChart3, ExternalLink
} from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { Link } from 'wouter';

// ─── Step Config ────────────────────────────────────────────────────────────

function useStepData() {
  const { t } = useTranslation();
  return [
    { id: 1, name: t('walkthrough.step1_name'), icon: FileText, color: 'blue', route: '/proposals/new' },
    { id: 2, name: t('walkthrough.step2_name'), icon: CheckCircle, color: 'green', route: null },
    { id: 3, name: t('walkthrough.step3_name'), icon: Edit3, color: 'indigo', route: '/proposals/3/amendments/review' },
    { id: 4, name: t('walkthrough.step4_name'), icon: TrendingUp, color: 'amber', route: '/proposals/5/amendments/signals' },
    { id: 5, name: t('walkthrough.step5_name'), icon: Users, color: 'purple', route: '/proposals/1/sortition' },
    { id: 6, name: t('walkthrough.step6_name'), icon: Vote, color: 'emerald', route: '/proposals/2' },
    { id: 7, name: t('walkthrough.step7_name'), icon: Shield, color: 'red', route: null },
  ];
}

// ─── Color helpers ──────────────────────────────────────────────────────────

const colorMap: Record<string, { bg: string; border: string; text: string; badge: string; btn: string }> = {
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',  badge: 'bg-blue-100 text-blue-700',  btn: 'bg-blue-600 hover:bg-blue-700' },
  green:   { bg: 'bg-green-50',   border: 'border-green-200',  text: 'text-green-700', badge: 'bg-green-100 text-green-700', btn: 'bg-green-600 hover:bg-green-700' },
  indigo:  { bg: 'bg-indigo-50',  border: 'border-indigo-200', text: 'text-indigo-700', badge: 'bg-indigo-100 text-indigo-700', btn: 'bg-indigo-600 hover:bg-indigo-700' },
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',  text: 'text-amber-700', badge: 'bg-amber-100 text-amber-700', btn: 'bg-amber-600 hover:bg-amber-700' },
  purple:  { bg: 'bg-purple-50',  border: 'border-purple-200', text: 'text-purple-700', badge: 'bg-purple-100 text-purple-700', btn: 'bg-purple-600 hover:bg-purple-700' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200',text: 'text-emerald-700',badge: 'bg-emerald-100 text-emerald-700', btn: 'bg-emerald-600 hover:bg-emerald-700' },
  red:     { bg: 'bg-red-50',     border: 'border-red-200',    text: 'text-red-700',   badge: 'bg-red-100 text-red-700',    btn: 'bg-red-600 hover:bg-red-700' },
};

// ─── Step 1: Proposal Submission ────────────────────────────────────────────

function StepProposal() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg bg-blue-50 border-blue-200">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-blue-700">{t('walkthrough.demo_proposal')}</span>
        </div>
        <p className="text-sm text-muted-foreground">{t('walkthrough.demo_proposal_desc')}</p>
      </div>

      <div className="p-4 border rounded-lg bg-muted/30">
        <label className="text-sm font-medium mb-2 block">{t('proposal.question_label')} *</label>
        <div className="p-3 bg-background rounded border text-sm">
          {t('walkthrough.demo_question')}
        </div>
      </div>
      <div className="p-4 border rounded-lg bg-muted/30">
        <label className="text-sm font-medium mb-2 block">{t('proposal.solution_label')} *</label>
        <div className="p-3 bg-background rounded border text-sm">
          {t('walkthrough.demo_solution')}
        </div>
      </div>
      <div className="p-4 border rounded-lg bg-muted/30">
        <label className="text-sm font-medium mb-2 block">{t('proposal.category_label')}</label>
        <Badge variant="secondary">{t('proposal.category_infrastructure')}</Badge>
      </div>
      
      <Separator />
      
      <div className="grid grid-cols-2 gap-3">
        <Card className="bg-muted/30">
          <CardContent className="p-3 text-center">
            <Users className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-sm font-medium">{t('walkthrough.demo_community')}</div>
            <div className="text-xs text-muted-foreground">5 {t('community.members')} · 72.5 {t('community.score')}</div>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="p-3 text-center">
            <Zap className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
            <div className="text-sm font-medium">{t('walkthrough.auto_routed')}</div>
            <div className="text-xs text-muted-foreground">{t('walkthrough.auto_routed_desc')}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button asChild className="bg-blue-600 hover:bg-blue-700">
          <Link to="/proposals/new">
            {t('walkthrough.try_submit')} <ArrowRight className="ml-2 w-4 h-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2: LLM Validation ─────────────────────────────────────────────────

function StepValidation() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg bg-green-50 border-green-200">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-5 h-5 text-green-600" />
          <span className="font-semibold text-green-700">{t('walkthrough.validation_complete')}</span>
        </div>
        <p className="text-sm text-muted-foreground mb-3">{t('walkthrough.validation_explanation')}</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-2 bg-white rounded">
            <span className="text-muted-foreground">{t('walkthrough.score_structure')}:</span>
            <span className="ml-2 font-medium">8/10</span>
          </div>
          <div className="p-2 bg-white rounded">
            <span className="text-muted-foreground">{t('walkthrough.score_specificity')}:</span>
            <span className="ml-2 font-medium">9/10</span>
          </div>
          <div className="p-2 bg-white rounded">
            <span className="text-muted-foreground">{t('walkthrough.score_feasibility')}:</span>
            <span className="ml-2 font-medium">7/10</span>
          </div>
          <div className="p-2 bg-white rounded">
            <span className="text-muted-foreground">{t('walkthrough.score_completeness')}:</span>
            <span className="ml-2 font-medium">8/10</span>
          </div>
          <div className="p-2 bg-white rounded">
            <span className="text-muted-foreground">{t('walkthrough.score_clarity')}:</span>
            <span className="ml-2 font-medium">9/10</span>
          </div>
          <div className="p-2 bg-white rounded">
            <span className="text-muted-foreground">{t('proposal.category_label')}:</span>
            <span className="ml-2 font-medium">{t('proposal.category_infrastructure')}</span>
          </div>
        </div>
      </div>
      <div className="p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium">{t('walkthrough.total_score')}</span>
          <span className="text-2xl font-bold text-green-600">82/100</span>
        </div>
        <Progress value={82} className="h-3" />
        <div className="mt-3 text-sm space-y-1">
          <div className="flex items-center gap-2 text-red-600">
            <span className="w-16 text-xs">&lt;20:</span>
            <span>{t('walkthrough.threshold_return')}</span>
          </div>
          <div className="flex items-center gap-2 text-yellow-600">
            <span className="w-16 text-xs">20-90:</span>
            <span>{t('walkthrough.threshold_sortition')}</span>
            <Badge variant="outline" className="text-xs ml-auto">{t('walkthrough.current')}</Badge>
          </div>
          <div className="flex items-center gap-2 text-green-600">
            <span className="w-16 text-xs">&gt;90:</span>
            <span>{t('walkthrough.threshold_auto')}</span>
          </div>
        </div>
      </div>
      
      <div className="p-3 border rounded-lg bg-blue-50 border-blue-200">
        <div className="flex items-start gap-2">
          <Zap className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-800">
            <strong>{t('walkthrough.key_innovation')}:</strong> {t('walkthrough.llm_innovation_desc')}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step 3: Author Review ──────────────────────────────────────────────────

function StepAuthorReview() {
  const { t } = useTranslation();
  const [reviewed, setReviewed] = useState(0);
  
  const amendments = [
    { id: 1, author: 'Ε.Π.', type: t('walkthrough.amendment_improvement'), text: t('walkthrough.demo_amendment_1'), reviewed: true, decision: 'accepted' },
    { id: 2, author: 'Γ.Ν.', type: t('walkthrough.amendment_addition'), text: t('walkthrough.demo_amendment_2'), reviewed: true, decision: 'rejected', reason: t('walkthrough.demo_rejection_reason_1') },
    { id: 3, author: 'Μ.Κ.', type: t('walkthrough.amendment_counter'), text: t('walkthrough.demo_amendment_3'), reviewed: false, decision: null },
  ];

  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg bg-indigo-50 border-indigo-200">
        <div className="flex items-center gap-2 mb-2">
          <Edit3 className="w-5 h-5 text-indigo-600" />
          <span className="font-semibold text-indigo-700">{t('walkthrough.author_review')}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('walkthrough.author_review_description')}
        </p>
        <div className="mt-2 text-sm">
          <span className="text-indigo-600 font-medium">{reviewed}/{amendments.length}</span> {t('walkthrough.reviewed_count')}
        </div>
      </div>
      
      {amendments.map((amendment) => (
        <div key={amendment.id} className={`p-4 border rounded-lg ${
          amendment.reviewed 
            ? amendment.decision === 'accepted' 
              ? 'bg-green-50 border-green-200' 
              : 'bg-red-50 border-red-200'
            : 'bg-muted/30'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{t('common.from')}: {amendment.author}</span>
              <Badge variant="outline">{amendment.type}</Badge>
            </div>
            {amendment.reviewed && (
              <Badge variant={amendment.decision === 'accepted' ? 'default' : 'secondary'} className={
                amendment.decision === 'accepted' ? 'bg-green-600' : ''
              }>
                {amendment.decision === 'accepted' ? `✓ ${t('walkthrough.accepted')}` : `✗ ${t('walkthrough.rejected')}`}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mb-3">{amendment.text}</p>
          
          {amendment.reviewed && amendment.decision === 'rejected' && amendment.reason && (
            <div className="p-2 bg-white rounded border text-xs text-muted-foreground mb-3">
              <strong>{t('walkthrough.justification')}:</strong> {amendment.reason}
            </div>
          )}
          
          {!amendment.reviewed && (
            <div className="space-y-2">
              <Textarea placeholder={t('walkthrough.justification_placeholder')} className="min-h-[40px] text-sm" />
              <div className="flex gap-2">
                <Button size="sm" className="bg-green-600 hover:bg-green-700 flex-1" onClick={() => setReviewed(r => r + 1)}>
                  ✓ {t('walkthrough.accept')}
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => setReviewed(r => r + 1)}>
                  ✗ {t('walkthrough.reject')}
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
      
      <div className="flex justify-between">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          {t('walkthrough.live_demo')}: <Link to="/proposals/3/amendments/review" className="text-blue-600 underline">{t('walkthrough.proposal_3')}</Link>
        </div>
        <Button asChild className="bg-indigo-600 hover:bg-indigo-700" disabled={reviewed < amendments.length}>
          <span>
            {t('walkthrough.complete_review')} <ArrowRight className="ml-2 w-4 h-4 inline" />
          </span>
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4: Community Signal ───────────────────────────────────────────────

function StepCommunitySignal() {
  const { t } = useTranslation();
  const [upvoted, setUpvoted] = useState<number[]>([]);
  
  const rejectedAmendments = [
    { 
      id: 1, 
      author: 'Γ.Ν.', 
      text: t('walkthrough.demo_amendment_2'),
      authorReason: t('walkthrough.demo_rejection_reason_1'),
      upvotes: 18, 
      downvotes: 4,
      threshold: 0.5,
    },
    { 
      id: 2, 
      author: 'Κ.Α.', 
      text: t('walkthrough.demo_amendment_4'),
      authorReason: t('walkthrough.demo_rejection_reason_2'),
      upvotes: 3, 
      downvotes: 11,
      threshold: 0.5,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg bg-amber-50 border-amber-200">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-5 h-5 text-amber-600" />
          <span className="font-semibold text-amber-700">{t('walkthrough.community_signal')}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('walkthrough.community_signal_description')}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {t('walkthrough.community_threshold')}
        </p>
      </div>
      
      {rejectedAmendments.map(amendment => {
        const netScore = amendment.upvotes - amendment.downvotes;
        const totalVotes = amendment.upvotes + amendment.downvotes;
        // Matches server/utils/amendment-processor.ts: upvote share above
        // the community's amendmentThreshold flags the amendment for sortition.
        const ratio = totalVotes > 0 ? amendment.upvotes / totalVotes : 0;
        const flagged = ratio >= amendment.threshold;
        const userUpvoted = upvoted.includes(amendment.id);

        return (
          <div key={amendment.id} className={`p-4 border rounded-lg ${
            flagged ? 'bg-green-50 border-green-300' : 'bg-muted/30'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t('common.from')}: {amendment.author}</span>
              </div>
              {flagged && (
                <Badge className="bg-green-600">✓ {t('walkthrough.flagged_for_sortition')}</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mb-2">{amendment.text}</p>
            <div className="p-2 bg-white rounded border text-xs text-muted-foreground mb-3">
              <strong>{t('walkthrough.author_justification')}:</strong> {amendment.authorReason}
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  variant={userUpvoted ? "default" : "outline"}
                  className={userUpvoted ? "bg-green-600" : ""}
                  onClick={() => userUpvoted ? setUpvoted(upvoted.filter(id => id !== amendment.id)) : setUpvoted([...upvoted, amendment.id])}
                >
                  ⬆️ {t('walkthrough.disagree_rejection')} ({amendment.upvotes + (userUpvoted ? 1 : 0)})
                </Button>
                <Button size="sm" variant="outline" className="text-red-600">
                  ⬇️ {t('walkthrough.agree_rejection')} ({amendment.downvotes})
                </Button>
              </div>
              <div className="text-sm">
                <span className={`font-medium ${flagged ? 'text-green-600' : 'text-muted-foreground'}`}>
                  Net: {netScore > 0 ? '+' : ''}{netScore} ({(ratio * 100).toFixed(0)}%)
                </span>
              </div>
            </div>
          </div>
        );
      })}
      
      <div className="flex justify-between items-center">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          {t('walkthrough.live_demo')}: <Link to="/proposals/5/amendments/signals" className="text-blue-600 underline">{t('walkthrough.proposal_5')}</Link>
        </div>
      </div>
    </div>
  );
}

// ─── Step 5: Sortition Synthesis ────────────────────────────────────────────

function StepSortitionSynthesis() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg bg-purple-50 border-purple-200">
        <div className="flex items-center gap-2 mb-2">
          <PenTool className="w-5 h-5 text-purple-600" />
          <span className="font-semibold text-purple-700">{t('walkthrough.sortition_synthesis')}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('walkthrough.sortition_synthesis_description')}
        </p>
      </div>

      {/* Sortition body info — illustrative; actual size = community.sortitionSize */}
      <div className="p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">{t('walkthrough.sortition_body_info')}</span>
          <Badge>{t('walkthrough.active')}</Badge>
        </div>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="p-2 bg-background rounded text-center">
            <div className="font-bold text-lg">12</div>
            <div className="text-muted-foreground text-xs">{t('walkthrough.selected_citizens')}</div>
          </div>
          <div className="p-2 bg-background rounded text-center">
            <div className="font-bold text-lg">9/12</div>
            <div className="text-muted-foreground text-xs">{t('walkthrough.responded')}</div>
          </div>
          <div className="p-2 bg-background rounded text-center">
            <div className="font-bold text-lg">72h</div>
            <div className="text-muted-foreground text-xs">{t('walkthrough.remaining')}</div>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('walkthrough.sortition_size_note') || 'Το μέγεθος και το χρονικό περιθώριο ορίζονται ανά κοινότητα στις Ρυθμίσεις. Default: 12 μέλη, 72 ώρες.'}
        </p>
      </div>

      {/* AI pre-merge baseline (Phase 2 of the merge pipeline) */}
      <div className="p-4 border rounded-lg bg-purple-50 border-purple-200">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-purple-600" />
          <span className="text-sm font-medium text-purple-800">
            {t('walkthrough.ai_premerge_title') || 'AI-merged baseline (αυτόματη αφετηρία)'}
          </span>
        </div>
        <p className="text-xs text-purple-700">
          {t('walkthrough.ai_premerge_desc') || 'Το LLM ενσωματώνει τις τροπολογίες που αποδέχθηκε ο συγγραφέας — και όσες υπερβαίνουν το όριο δημοφιλίας της κοινότητας (amendmentInclusionThreshold) — σε ρέοντα κείμενο. Το κληρωτό σώμα ξεκινά από αυτό αντί για άδειο πεδίο.'}
        </p>
      </div>

      <div className="p-4 border rounded-lg bg-muted/30">
        <label className="text-sm font-medium mb-2 block">{t('walkthrough.author_proposal_accepted')}</label>
        <div className="p-3 bg-background rounded border text-sm space-y-2">
          <p>{t('walkthrough.demo_solution')}</p>
          <div className="border-l-2 border-green-500 pl-3 text-green-700 text-xs">
            [{t('walkthrough.accepted')}] {t('walkthrough.demo_amendment_accepted')}
          </div>
        </div>
      </div>
      
      <div className="p-4 border rounded-lg bg-green-50 border-green-200">
        <label className="text-sm font-medium mb-2 block">{t('walkthrough.flagged_amendments_community')}</label>
        <div className="p-3 bg-white rounded border text-sm">
          <p className="text-muted-foreground">
            {t('walkthrough.demo_amendment_flagged')}
          </p>
          <div className="mt-1 text-xs text-green-600">
            ✓ {t('walkthrough.community_overrode')} (Net: +14, 78%)
          </div>
        </div>
      </div>
      
      <div className="p-4 border rounded-lg bg-muted/30">
        <label className="text-sm font-medium mb-2 block">{t('walkthrough.final_text_compose')}</label>
      <Textarea 
          className="min-h-[100px] text-sm"
          defaultValue={t('walkthrough.demo_final_text')}
        />
      </div>
      
      <div className="flex justify-between items-center">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          {t('walkthrough.live_demo')}: <Link to="/proposals/1/sortition" className="text-blue-600 underline">{t('walkthrough.proposal_1_sortition')}</Link>
        </div>
        <Button className="bg-purple-600 hover:bg-purple-700">
          {t('walkthrough.submit_final_text')} <ArrowRight className="ml-2 w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 6: Ratification Vote ──────────────────────────────────────────────

function StepRatificationVote() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg bg-emerald-50 border-emerald-200">
        <div className="flex items-center gap-2 mb-2">
          <Vote className="w-5 h-5 text-emerald-600" />
          <span className="font-semibold text-emerald-700">{t('walkthrough.ratification_vote')}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('walkthrough.ratification_description')}
        </p>
      </div>
      
      <div className="p-4 border rounded-lg bg-muted/30">
        <label className="text-sm font-medium mb-2 block">{t('walkthrough.final_text')}</label>
        <div className="p-3 bg-background rounded border text-sm">
          {t('walkthrough.demo_final_text')}
        </div>
      </div>

      {/* Live demo data: Proposal 2 (forest fires) is in voting state */}
      <div className="p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center justify-between mb-4">
          <span className="font-medium">{t('walkthrough.live_results')}</span>
          <Badge variant="secondary">1,247 {t('walkthrough.votes')}</Badge>
        </div>
        
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-green-600 font-medium">{t('walkthrough.for')}</span>
              <span className="font-bold">68%</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-4">
              <div className="bg-green-600 h-4 rounded-full transition-all" style={{ width: '68%' }} />
            </div>
            <span className="text-xs text-muted-foreground">848 {t('walkthrough.votes')}</span>
          </div>
          
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-red-600 font-medium">{t('walkthrough.against')}</span>
              <span className="font-bold">32%</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-4">
              <div className="bg-red-600 h-4 rounded-full transition-all" style={{ width: '32%' }} />
            </div>
            <span className="text-xs text-muted-foreground">399 {t('walkthrough.votes')}</span>
          </div>
        </div>
      </div>

      {/* Debate preview */}
      <div className="p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t('walkthrough.debate_preview')}</span>
        </div>
        <div className="space-y-2">
          <div className="p-2 bg-green-50 rounded border border-green-100 text-xs">
            <span className="text-green-700 font-medium">{t('walkthrough.for')} — Γ.Ν.:</span> {t('walkthrough.demo_debate_for')}
          </div>
          <div className="p-2 bg-red-50 rounded border border-red-100 text-xs">
            <span className="text-red-700 font-medium">{t('walkthrough.against')} — Κ.Α.:</span> {t('walkthrough.demo_debate_against')}
          </div>
        </div>
      </div>
      
      <div className="flex justify-between items-center">
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          {t('walkthrough.live_demo')}: <Link to="/proposals/2" className="text-blue-600 underline">{t('walkthrough.proposal_2_vote')}</Link>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button className="bg-green-600 hover:bg-green-700">
            <ThumbsUp className="mr-2 w-4 h-4" /> {t('walkthrough.for')}
          </Button>
          <Button variant="outline" className="text-red-600">
            <ThumbsDown className="mr-2 w-4 h-4" /> {t('walkthrough.against')}
          </Button>
          <Button variant="outline">
            {t('proposal.abstain') || 'Abstain'}
          </Button>
        </div>
      </div>

      <div className="p-3 border rounded-lg bg-blue-50 border-blue-200 text-xs text-blue-900">
        {t('walkthrough.vote_quorum_note') || 'Η ψηφοφορία οριστικοποιείται από τον συγγραφέα (ή έναν διαχειριστή της κοινότητας). Αν η συμμετοχή πέσει κάτω από το minParticipationPct της κοινότητας ή δεν υπάρχει αποφασιστική ψήφος, η πρόταση αρχειοθετείται αντί να εγκριθεί.'}
      </div>
    </div>
  );
}

// ─── Step 7: Verified Ballot ────────────────────────────────────────────────

function StepVerifiedBallot() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg bg-red-50 border-red-200">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-5 h-5 text-red-600" />
          <span className="font-semibold text-red-700">{t('walkthrough.verified_ballot')}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('walkthrough.verified_ballot_desc')}
        </p>
      </div>

      {/* Gov.gr flow */}
      <div className="p-4 border rounded-lg bg-muted/30">
        <label className="text-sm font-medium mb-3 block">{t('walkthrough.identity_flow')}</label>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="bg-blue-100 text-blue-700 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shrink-0">1</div>
            <div>
              <div className="text-sm font-medium">{t('walkthrough.govgr_declaration')}</div>
              <div className="text-xs text-muted-foreground">{t('walkthrough.govgr_declaration_desc')}</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-green-100 text-green-700 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shrink-0">2</div>
            <div>
              <div className="text-sm font-medium">{t('walkthrough.pdf_upload')}</div>
              <div className="text-xs text-muted-foreground">{t('walkthrough.pdf_upload_desc')}</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-purple-100 text-purple-700 rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold shrink-0">3</div>
            <div>
              <div className="text-sm font-medium">{t('walkthrough.four_gate_validation')}</div>
              <div className="text-xs text-muted-foreground">{t('walkthrough.four_gate_desc')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Security features */}
      <div className="p-4 border rounded-lg bg-muted/30">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium">{t('walkthrough.security')}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 bg-background rounded text-xs">
            <CheckCircle className="w-3 h-3 text-green-600 inline mr-1" />
            {t('walkthrough.security_one_vote')}
          </div>
          <div className="p-2 bg-background rounded text-xs">
            <CheckCircle className="w-3 h-3 text-green-600 inline mr-1" />
            {t('walkthrough.security_public_results')}
          </div>
          <div className="p-2 bg-background rounded text-xs">
            <CheckCircle className="w-3 h-3 text-green-600 inline mr-1" />
            {t('walkthrough.security_encrypted')}
          </div>
          <div className="p-2 bg-background rounded text-xs">
            <CheckCircle className="w-3 h-3 text-green-600 inline mr-1" />
            {t('walkthrough.security_afm')}
          </div>
        </div>
      </div>

      {/* Platform highlights for investors */}
      <div className="p-4 border rounded-lg bg-blue-50 border-blue-200">
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-800">{t('walkthrough.platform_highlights')}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-white rounded">
            <div className="text-lg font-bold text-blue-700">4</div>
            <div className="text-xs text-muted-foreground">{t('walkthrough.gate_validation')}</div>
          </div>
          <div className="p-2 bg-white rounded">
            <div className="text-lg font-bold text-blue-700">3</div>
            <div className="text-xs text-muted-foreground">{t('walkthrough.vote_types')}</div>
          </div>
          <div className="p-2 bg-white rounded">
            <div className="text-lg font-bold text-blue-700">24h</div>
            <div className="text-xs text-muted-foreground">{t('walkthrough.ballot_turnaround')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function DeliberationWalkthrough() {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const STEPS = useStepData();
  
  const currentStepData = STEPS.find(s => s.id === currentStep);
  const Icon = currentStepData?.icon || FileText;
  const colors = colorMap[currentStepData?.color || 'blue'];
  
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="flex-grow flex items-start justify-center py-6">
      <Card className="w-full max-w-4xl mx-auto">

        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Icon className="w-5 h-5" />
              {currentStepData?.name}
            </CardTitle>
            <Badge className={colors.badge}>
              {t('walkthrough.step')} {currentStep}/7
            </Badge>
          </div>
          <CardDescription>
            {currentStep === 1 && t('walkthrough.step1_desc')}
            {currentStep === 2 && t('walkthrough.step2_desc')}
            {currentStep === 3 && t('walkthrough.step3_desc')}
            {currentStep === 4 && t('walkthrough.step4_desc')}
            {currentStep === 5 && t('walkthrough.step5_desc')}
            {currentStep === 6 && t('walkthrough.step6_desc')}
            {currentStep === 7 && t('walkthrough.step7_desc')}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Step navigation pills */}
          <div className="flex items-center justify-center gap-1.5 mb-6 overflow-x-auto pb-2">
            {STEPS.map(step => {
              const StepIcon = step.icon;
              const stepColors = colorMap[step.color];
              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(step.id)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                    currentStep === step.id
                      ? `${stepColors.btn} text-white shadow-sm`
                      : currentStep > step.id
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  <StepIcon className="w-3.5 h-3.5" />
                  {step.name}
                </button>
              );
            })}
          </div>

          {/* Step content */}
          {currentStep === 1 && <StepProposal />}
          {currentStep === 2 && <StepValidation />}
          {currentStep === 3 && <StepAuthorReview />}
          {currentStep === 4 && <StepCommunitySignal />}
          {currentStep === 5 && <StepSortitionSynthesis />}
          {currentStep === 6 && <StepRatificationVote />}
          {currentStep === 7 && <StepVerifiedBallot />}
        </CardContent>

        {/* Navigation */}
        <div className="px-6 pb-4 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(s => Math.max(1, s - 1))}
            disabled={currentStep === 1}
          >
            ← {t('walkthrough.previous')}
          </Button>
          <div className="flex items-center gap-1">
            {STEPS.map(step => (
              <div
                key={step.id}
                onClick={() => setCurrentStep(step.id)}
                className={`w-2 h-2 rounded-full cursor-pointer transition-all ${
                  currentStep === step.id ? 'bg-primary w-4' : currentStep > step.id ? 'bg-primary/40' : 'bg-muted'
                }`}
              />
            ))}
          </div>
          <Button
            onClick={() => setCurrentStep(s => Math.min(STEPS.length, s + 1))}
            disabled={currentStep === STEPS.length}
          >
            {t('walkthrough.next')} →
          </Button>
        </div>

        {/* Pipeline overview */}
        <div className="px-6 pb-6">
          <Separator className="mb-4" />
          <div className="p-4 bg-muted/30 rounded-lg">
            <h4 className="font-medium mb-3 text-sm">{t('walkthrough.pipeline_overview')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-7 gap-1">
              {STEPS.map((step, i) => {
                const StepIcon = step.icon;
                const stepColors = colorMap[step.color];
                const isActive = currentStep === step.id;
                return (
                  <button
                    key={step.id}
                    onClick={() => setCurrentStep(step.id)}
                    className={`flex flex-col items-center p-2 rounded-lg transition-all text-center ${
                      isActive ? `${stepColors.bg} ${stepColors.border} border-2` : 'hover:bg-background'
                    }`}
                  >
                    <StepIcon className={`w-4 h-4 mb-1 ${isActive ? stepColors.text : 'text-muted-foreground'}`} />
                    <span className={`text-[10px] leading-tight ${isActive ? 'font-semibold' : 'text-muted-foreground'}`}>
                      {i === 0 && t('walkthrough.summary_submit')}
                      {i === 1 && t('walkthrough.summary_validate')}
                      {i === 2 && t('walkthrough.summary_author')}
                      {i === 3 && t('walkthrough.summary_community')}
                      {i === 4 && t('walkthrough.summary_sortition')}
                      {i === 5 && t('walkthrough.summary_ratify')}
                      {i === 6 && t('walkthrough.summary_ballot')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Card>
      </div>
      <Footer />
    </div>
  );
}
