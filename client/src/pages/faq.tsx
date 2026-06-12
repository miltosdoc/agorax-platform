import { useEffect } from "react";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import { useTranslation } from "@/hooks/use-translation";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export default function FAQPage() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  useEffect(() => {
    document.title = `AgoraX — ${t('footer.faq')}`;
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow pt-16 pb-16 sm:pb-6">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold mb-3">{t('footer.faq')}</h1>
            <p className="text-muted-foreground max-w-xl mx-auto">
              {t('faq.subtitle')}
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full space-y-3">
            <AccordionItem value="item-1" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q1_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q1_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-2" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q2_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q2_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-3" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q3_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q3_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-4" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q4_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q4_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-5" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q5_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q5_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-6" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q6_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q6_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-7" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q7_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q7_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-8" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q8_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q8_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-9" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q9_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q9_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-10" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q10_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q10_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-11" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q11_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q11_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-12" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q12_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q12_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-13" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q13_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q13_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-14" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q14_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q14_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-15" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q15_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q15_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-16" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q16_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q16_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-17" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q17_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q17_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-18" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q18_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q18_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-19" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q19_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q19_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-20" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q20_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q20_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-21" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q21_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q21_answer')}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="item-22" className="border rounded-lg px-4">
              <AccordionTrigger className="text-left font-medium text-base">
                {t('faq.q22_title')}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-4">
                {t('faq.q22_answer')}
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="mt-12 text-center p-8 bg-muted/30 rounded-lg border">
            <h2 className="text-xl font-semibold mb-3">{t('faq.no_answer_title')}</h2>
            <p className="text-muted-foreground mb-6">
              {t('faq.no_answer_text')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="outline" onClick={() => navigate("/how-it-works")}>
                {t('faq.how_it_works')}
              </Button>
              <Button onClick={() => navigate("/walkthrough")}>
                {t('faq.walkthrough')}
              </Button>
              <Button variant="secondary" onClick={() => navigate("/auth?tab=register")}>
                {t('faq.register')}
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
