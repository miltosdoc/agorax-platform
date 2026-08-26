import { useEffect } from "react";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { useTranslation } from "@/hooks/use-translation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { POLL_HOW_SECTIONS } from "@/components/surveys/HowPollsWork";
import { Link, useLocation } from "wouter";
import {
  FileText, CheckCircle, Edit3, TrendingUp, Users, Vote,
  Shield, ArrowRight, Zap, Globe, Lock, Award,
  Mic, Rss, Bell, Video, Smartphone, Clock, Building2
} from "lucide-react";

export default function HowItWorksPage() {
  const { t, locale } = useTranslation();
  const [, navigate] = useLocation();

  useEffect(() => {
    document.title = `AgoraX — ${t('footer.howItWorks')}`;
  }, []);

  const phases = [
    {
      step: 1,
      icon: FileText,
      color: "blue",
      title: t('walkthrough.macro1_name') || "Submit & Check",
      description: t('walkthrough.macro1_desc'),
      features: [t('walkthrough.hiw_macro1_feature1'), t('walkthrough.hiw_macro1_feature2'), t('walkthrough.hiw_macro1_feature3')]
    },
    {
      step: 2,
      icon: Edit3,
      color: "amber",
      title: t('walkthrough.macro2_name') || "Deliberation",
      description: t('walkthrough.macro2_desc'),
      features: [t('walkthrough.hiw_macro2_feature1'), t('walkthrough.hiw_macro2_feature2'), t('walkthrough.hiw_macro2_feature3')]
    },
    {
      step: 3,
      icon: Vote,
      color: "emerald",
      title: t('walkthrough.macro3_name') || "Vote & Decision",
      description: t('walkthrough.macro3_desc'),
      features: [t('walkthrough.hiw_macro3_feature1'), t('walkthrough.hiw_macro3_feature2'), t('walkthrough.hiw_macro3_feature3')]
    }
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow pt-16 pb-16 sm:pb-6">
        <div className="container mx-auto px-4 max-w-5xl">

          {/* Hero */}
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4 text-sm">{t('footer.howItWorks')}</Badge>
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              {t('walkthrough.hiw_hero_title')}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t('walkthrough.hiw_hero_subtitle')}
            </p>
          </div>

          {/* Pipeline Overview */}
          <div className="mb-16">
            <div className="flex flex-wrap justify-center gap-3 md:gap-1">
              {phases.map((phase, i) => (
                <div key={phase.step} className="flex items-center">
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-full bg-${phase.color}-50 border border-${phase.color}-200`}>
                    <phase.icon className={`w-4 h-4 text-${phase.color}-600`} />
                    <span className="text-sm font-medium">{phase.step}</span>
                  </div>
                  {i < phases.length - 1 && (
                    <ArrowRight className="w-4 h-4 text-muted-foreground mx-1 md:mx-2 hidden sm:block" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Two tracks */}
          <div className="mb-16">
            <h2 className="text-2xl font-bold text-center mb-2">{t('hiw.tracks_title') || 'Δύο διαδρομές'}</h2>
            <p className="text-center text-muted-foreground mb-6 max-w-2xl mx-auto">{t('hiw.tracks_subtitle')}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
              <Card>
                <CardContent className="p-6">
                  <Users className="w-8 h-8 text-primary mb-3" />
                  <h3 className="font-semibold text-lg mb-2">{t('proposal.track_deliberation')}</h3>
                  <p className="text-sm text-muted-foreground">{t('proposal.track_deliberation_help')}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <Zap className="w-8 h-8 text-amber-500 mb-3" />
                  <h3 className="font-semibold text-lg mb-2">{t('proposal.track_vote')}</h3>
                  <p className="text-sm text-muted-foreground">{t('proposal.track_vote_help')}</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Detailed Phases */}
          <div className="space-y-12">
            {phases.map((phase) => (
              <Card key={phase.step} id={`step-${phase.step}`} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="grid md:grid-cols-12 gap-0">
                    {/* Left: Number & Title */}
                    <div className={`md:col-span-4 bg-${phase.color}-50 p-8 flex flex-col justify-center`}>
                      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full bg-${phase.color}-100 mb-4`}>
                        <phase.icon className={`w-6 h-6 text-${phase.color}-600`} />
                      </div>
                      <div className={`text-sm font-bold text-${phase.color}-600 mb-2`}>
                        {t('walkthrough.hiw_phase_label')} {phase.step}
                      </div>
                      <h2 className="text-2xl font-bold mb-4">{phase.title}</h2>
                      <div className="space-y-2">
                        {phase.features.map((feat, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm">
                            <div className={`w-1.5 h-1.5 rounded-full bg-${phase.color}-500 mt-1.5 shrink-0`} />
                            <span className="text-muted-foreground">{feat}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Right: Description */}
                    <div className="md:col-span-8 p-8">
                      <p className="text-muted-foreground leading-relaxed text-lg">
                        {phase.description}
                      </p>

                      {/* Specific content per phase */}
                      {phase.step === 1 && (
                        <div className="mt-6 p-4 bg-muted/30 rounded-lg border">
                          <div className="text-sm font-medium mb-2">{t('walkthrough.hiw_example_label')}</div>
                          <div className="space-y-2 text-sm text-muted-foreground">
                            <p><strong className="text-foreground">{t('walkthrough.hiw_example_question')}</strong> {t('walkthrough.hiw_example_question_text')}</p>
                            <p><strong className="text-foreground">{t('walkthrough.hiw_example_solution')}</strong> {t('walkthrough.hiw_example_solution_text')}</p>
                          </div>
                        </div>
                      )}

                      {phase.step === 1 && (
                        <div className="mt-6 grid grid-cols-5 gap-2">
                          {[
                            { label: t('walkthrough.hiw_score_structure'), score: "8/10" },
                            { label: t('walkthrough.hiw_score_specificity'), score: "9/10" },
                            { label: t('walkthrough.hiw_score_feasibility'), score: "7/10" },
                            { label: t('walkthrough.hiw_score_completeness'), score: "8/10" },
                            { label: t('walkthrough.hiw_score_transparency'), score: "9/10" },
                          ].map((item, i) => (
                            <div key={i} className="text-center p-2 bg-muted/30 rounded border">
                              <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                              <div className="font-bold text-green-600">{item.score}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {phase.step === 2 && (
                        <div className="mt-6 flex flex-wrap gap-3 items-center">
                          <div className="px-3 py-2 rounded-lg border bg-purple-50 border-purple-200 text-sm font-medium text-purple-700">
                            {t('proposal.final_review_title')}
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          <div className="px-3 py-2 rounded-lg border bg-muted/30 text-sm">
                            {t('proposal.final_review_alternatives_title')}
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                          <div className="px-3 py-2 rounded-lg border bg-muted/30 text-sm">
                            {t('proposal.final_review_status_quo')}
                          </div>
                        </div>
                      )}
                      {phase.step === 3 && (
                        <div className="mt-6 p-4 bg-muted/30 rounded-lg border text-sm text-muted-foreground">
                          {t('hiw.tracks_ballot_note')}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Communities — where proposals live, who may join, and who sets the
              rules. The kind (autonomous / managed) is the only choice that
              changes who decides; everything below is configured either way. */}
          <div className="mt-16 mb-16" id="communities">
            <h2 className="text-2xl font-bold text-center mb-2">{t('hiw.communities_title')}</h2>
            <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
              {t('hiw.communities_subtitle')}
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <Card>
                <CardContent className="p-6">
                  <Users className="w-8 h-8 text-primary mb-3" />
                  <h3 className="font-semibold text-lg mb-2">{t('hiw.communities_autonomous_title')}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{t('hiw.communities_autonomous_desc')}</p>
                  <ul className="space-y-2">
                    {[
                      t('hiw.communities_autonomous_point1'),
                      t('hiw.communities_autonomous_point2'),
                      t('hiw.communities_autonomous_point3'),
                    ].map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <Building2 className="w-8 h-8 text-amber-500 mb-3" />
                  <h3 className="font-semibold text-lg mb-2">{t('hiw.communities_managed_title')}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{t('hiw.communities_managed_desc')}</p>
                  <ul className="space-y-2">
                    {[
                      t('hiw.communities_managed_point1'),
                      t('hiw.communities_managed_point2'),
                      t('hiw.communities_managed_point3'),
                    ].map((point, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <Card className="max-w-3xl mx-auto mb-12">
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg mb-4">{t('hiw.communities_create_title')}</h3>
                <ol className="space-y-4">
                  {[
                    t('hiw.communities_create_step1'),
                    t('hiw.communities_create_step2'),
                    t('hiw.communities_create_step3'),
                    t('hiw.communities_create_step4'),
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm text-muted-foreground leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
                <div className="text-center mt-6">
                  <Link href="/communities">
                    <Button variant="outline" size="sm">{t('hiw.communities_cta')}</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            <h3 className="text-xl font-bold text-center mb-2">{t('hiw.communities_settings_title')}</h3>
            <p className="text-center text-muted-foreground mb-6 max-w-2xl mx-auto">
              {t('hiw.communities_settings_subtitle')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { icon: Globe, title: t('hiw.communities_setting_join_title'), desc: t('hiw.communities_setting_join_desc') },
                { icon: Lock, title: t('hiw.communities_setting_visibility_title'), desc: t('hiw.communities_setting_visibility_desc') },
                { icon: Clock, title: t('hiw.communities_setting_timing_title'), desc: t('hiw.communities_setting_timing_desc') },
                { icon: Zap, title: t('hiw.communities_setting_synthesis_title'), desc: t('hiw.communities_setting_synthesis_desc') },
                { icon: Edit3, title: t('hiw.communities_setting_amendments_title'), desc: t('hiw.communities_setting_amendments_desc') },
              ].map((item, i) => (
                <Card key={i}>
                  <CardContent className="p-5 flex items-start gap-3">
                    <item.icon className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <h4 className="font-medium mb-1">{item.title}</h4>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="mt-6 p-4 bg-muted/30 rounded-lg border text-sm text-muted-foreground max-w-3xl mx-auto">
              {t('hiw.communities_settings_note')}
            </div>
          </div>

          {/* Engagement tools — surfaces built on top of the lifecycle */}
          <div className="mt-16 mb-16">
            <h2 className="text-2xl font-bold text-center mb-2">{t('hiw.engagement_title')}</h2>
            <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
              {t('hiw.engagement_subtitle')}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-6">
                  <Video className="w-8 h-8 text-teal-500 mb-4" />
                  <h3 className="font-semibold text-lg mb-2">{t('hiw.engagement_conferences_title')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('hiw.engagement_conferences_desc')}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <Mic className="w-8 h-8 text-purple-500 mb-4" />
                  <h3 className="font-semibold text-lg mb-2">{t('hiw.engagement_media_title')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('hiw.engagement_media_desc')}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <Rss className="w-8 h-8 text-blue-500 mb-4" />
                  <h3 className="font-semibold text-lg mb-2">{t('hiw.engagement_feed_title')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('hiw.engagement_feed_desc')}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <Bell className="w-8 h-8 text-amber-500 mb-4" />
                  <h3 className="font-semibold text-lg mb-2">{t('hiw.engagement_notifications_title')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('hiw.engagement_notifications_desc')}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Android app — download & install (sideload) guide */}
          <div className="mt-16 mb-16" id="android-app">
            <h2 className="text-2xl font-bold text-center mb-2">{t('hiw.app_title')}</h2>
            <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
              {t('hiw.app_subtitle')}
            </p>
            <Card className="max-w-3xl mx-auto">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 shrink-0">
                    <Smartphone className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="text-sm text-muted-foreground">{t('hiw.app_note')}</div>
                </div>
                <ol className="space-y-4">
                  {[t('hiw.app_step1'), t('hiw.app_step2'), t('hiw.app_step3'), t('hiw.app_step4')].map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm text-muted-foreground leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>

          {/* Polls & anonymous panel */}
          <div className="mt-16 mb-16">
            <h2 className="text-2xl font-bold text-center mb-2">{t('hiw.polls_title')}</h2>
            <p className="text-center text-muted-foreground mb-8 max-w-2xl mx-auto">
              {t('hiw.polls_subtitle')}
            </p>
            <Card className="max-w-3xl mx-auto">
              <CardContent className="p-6">
                <Accordion type="single" collapsible>
                  {POLL_HOW_SECTIONS.map((s, i) => (
                    <AccordionItem key={i} value={`poll-${i}`}>
                      <AccordionTrigger className="text-sm text-left">
                        {s.title[locale === 'en' ? 'en' : 'el']}
                      </AccordionTrigger>
                      <AccordionContent className="text-sm text-muted-foreground">
                        {s.body[locale === 'en' ? 'en' : 'el']}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
                <div className="text-center mt-4">
                  <Link href="/surveys">
                    <Button variant="outline" size="sm">{t('hiw.polls_cta')}</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Key Innovations */}
          <div className="mt-16 mb-16">
            <h2 className="text-2xl font-bold text-center mb-8">{t('walkthrough.hiw_different_title')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardContent className="p-6">
                  <Zap className="w-8 h-8 text-amber-500 mb-4" />
                  <h3 className="font-semibold text-lg mb-2">{t('walkthrough.hiw_innovation1_title')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('walkthrough.hiw_innovation1_desc')}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <Users className="w-8 h-8 text-purple-500 mb-4" />
                  <h3 className="font-semibold text-lg mb-2">{t('walkthrough.hiw_innovation2_title')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('walkthrough.hiw_innovation2_desc')}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <Award className="w-8 h-8 text-amber-500 mb-4" />
                  <h3 className="font-semibold text-lg mb-2">{t('walkthrough.hiw_innovation3_title')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('walkthrough.hiw_innovation3_desc')}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-6">
                  <Lock className="w-8 h-8 text-cyan-500 mb-4" />
                  <h3 className="font-semibold text-lg mb-2">{t('walkthrough.hiw_innovation4_title')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('walkthrough.hiw_innovation4_desc')}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center">
            <Separator className="mb-8" />
            <h2 className="text-2xl font-bold mb-4">{t('walkthrough.hiw_cta_title')}</h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              {t('walkthrough.hiw_cta_desc')}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-primary hover:bg-primary/90" onClick={() => navigate("/walkthrough")}>
                <ArrowRight className="mr-2 h-4 w-4" />
                {t('walkthrough.hiw_cta_walkthrough')}
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate("/auth?tab=register")}>
                {t('walkthrough.hiw_cta_register')}
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
