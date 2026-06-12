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
  Mic, Rss, Bell, Video
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
      title: t('walkthrough.step1_name') || "Submission",
      description: t('walkthrough.step1_desc'),
      features: [t('walkthrough.hiw_feature1_1'), t('walkthrough.hiw_feature1_2'), t('walkthrough.hiw_feature1_3')]
    },
    {
      step: 2,
      icon: CheckCircle,
      color: "green",
      title: t('walkthrough.step2_name') || "Validation",
      description: t('walkthrough.step2_desc'),
      features: [t('walkthrough.hiw_feature2_1'), t('walkthrough.hiw_feature2_2'), t('walkthrough.hiw_feature2_3')]
    },
    {
      step: 3,
      icon: Edit3,
      color: "indigo",
      title: t('walkthrough.step3_name') || "Author",
      description: t('walkthrough.step3_desc'),
      features: [t('walkthrough.hiw_feature3_1'), t('walkthrough.hiw_feature3_2'), t('walkthrough.hiw_feature3_3')]
    },
    {
      step: 4,
      icon: TrendingUp,
      color: "amber",
      title: t('walkthrough.step4_name') || "Community",
      description: t('walkthrough.step4_desc'),
      features: [t('walkthrough.hiw_feature4_1'), t('walkthrough.hiw_feature4_2'), t('walkthrough.hiw_feature4_3')]
    },
    {
      step: 5,
      icon: Users,
      color: "purple",
      title: t('walkthrough.step5_name') || "Sortition",
      description: t('walkthrough.step5_desc'),
      features: [t('walkthrough.hiw_feature5_1'), t('walkthrough.hiw_feature5_2'), t('walkthrough.hiw_feature5_3')]
    },
    {
      step: 6,
      icon: Vote,
      color: "emerald",
      title: t('walkthrough.step6_name') || "Vote",
      description: t('walkthrough.step6_desc'),
      features: [t('walkthrough.hiw_feature6_1'), t('walkthrough.hiw_feature6_2'), t('walkthrough.hiw_feature6_3')]
    },
    {
      step: 7,
      icon: CheckCircle,
      color: "teal",
      title: t('walkthrough.step7_name') || "Decided",
      description: t('walkthrough.step7_desc'),
      features: [t('walkthrough.hiw_feature7_1'), t('walkthrough.hiw_feature7_2'), t('walkthrough.hiw_feature7_3')]
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

                      {phase.step === 2 && (
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

                      {phase.step === 5 && (
                        <div className="mt-6 flex gap-4">
                          <div className="flex-1 p-4 bg-muted/30 rounded-lg border text-center">
                            <Users className="w-6 h-6 mx-auto mb-2 text-purple-600" />
                            <div className="text-lg font-bold">12</div>
                            <div className="text-xs text-muted-foreground">{t('walkthrough.hiw_step5_citizens')}</div>
                          </div>
                          <div className="flex-1 p-4 bg-muted/30 rounded-lg border text-center">
                            <Globe className="w-6 h-6 mx-auto mb-2 text-purple-600" />
                            <div className="text-lg font-bold">72h</div>
                            <div className="text-xs text-muted-foreground">{t('walkthrough.hiw_step5_deadline')}</div>
                          </div>
                          <div className="flex-1 p-4 bg-muted/30 rounded-lg border text-center">
                            <Lock className="w-6 h-6 mx-auto mb-2 text-purple-600" />
                            <div className="text-lg font-bold">{t('walkthrough.hiw_step5_anonymous')}</div>
                            <div className="text-xs text-muted-foreground">{t('walkthrough.hiw_step5_no_identity')}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
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
