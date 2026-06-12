/**
 * Public Landing Page (/)
 *
 * The unauthenticated front door. Authenticated visitors get redirected
 * to /feed; everyone else sees the platform pitch and a Get Started CTA.
 */

import { useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import AppShell from '@/components/layout/AppShell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  CheckCircle,
  Lightbulb,
  MessageSquare,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';

export default function LandingPage() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (user) {
      navigate('/feed');
    }
  }, [user, navigate]);

  if (user) return null;

  const features = [
    {
      icon: MessageSquare,
      title: t('landing.feature1Title'),
      description: t('landing.feature1Desc'),
    },
    {
      icon: Users,
      title: t('landing.feature2Title'),
      description: t('landing.feature2Desc'),
    },
    {
      icon: Lightbulb,
      title: t('landing.feature3Title'),
      description: t('landing.feature3Desc'),
    },
    {
      icon: CheckCircle,
      title: t('landing.feature4Title'),
      description: t('landing.feature4Desc'),
    },
  ];

  return (
    <AppShell>
      <section className="-mx-4 sm:-mx-6 lg:-mx-8 mb-12 px-4 sm:px-6 lg:px-8 py-12 sm:py-16 rounded-xl bg-gradient-to-br from-slate-900 via-blue-900 to-slate-800 text-white">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl sm:text-5xl font-bold mb-6 tracking-tight" data-testid="landing-hero-title">
            {t('landing.heroTitle')}
          </h1>
          <p className="text-lg sm:text-xl text-blue-100 mb-8 leading-relaxed">
            {t('landing.heroSubtitle')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              size="lg"
              className="bg-white text-blue-900 hover:bg-blue-50"
              onClick={() => navigate('/auth?tab=register')}
              data-testid="landing-get-started"
            >
              {t('landing.getStarted')}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white text-white hover:bg-white/10 bg-transparent"
              onClick={() => navigate('/auth')}
              data-testid="landing-sign-in"
            >
              {t('landing.signIn')}
            </Button>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8">
          {t('landing.featuresTitle')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card key={feature.title}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-blue-100 text-blue-600 flex-shrink-0">
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{feature.title}</h3>
                      <p className="text-sm text-muted-foreground">{feature.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mb-8">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-8 text-center">
            <ShieldCheck className="w-10 h-10 text-blue-600 mx-auto mb-3" />
            <h2 className="text-2xl font-bold mb-2">{t('home.readyTitle')}</h2>
            <p className="text-muted-foreground mb-6">{t('home.readyDesc')}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={() => navigate('/auth?tab=register')} data-testid="landing-cta-register">
                {t('auth.register')}
              </Button>
              <Link href="/proposals">
                <Button variant="outline" data-testid="landing-cta-browse">
                  {t('dashboard.viewAllProposals')}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </AppShell>
  );
}
