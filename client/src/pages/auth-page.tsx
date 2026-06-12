import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { loginUserSchema, registerUserSchema } from "@shared/schema";
import { CURRENT_CONSENT_VERSION } from "@shared/consent";
import { FcGoogle } from "react-icons/fc";
import { useTranslation } from "@/hooks/use-translation";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import logoImage from "../assets/logo.png";
import FingerprintJS from '@fingerprintjs/fingerprintjs';

async function getFingerprint(): Promise<string | undefined> {
  try {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    return result.visitorId;
  } catch (error) {
    console.error('Failed to get device fingerprint:', error);
    return undefined;
  }
}

export default function AuthPage() {
  const { t } = useTranslation();
  const [location, navigate] = useLocation();
  const { user } = useAuth();

  // Extract URL parameters
  const params = new URLSearchParams(location.split("?")[1]);
  const returnTo = params.get("returnTo") || "/feed";

  const [tab, setTab] = useState(() => {
    // Check if URL has a tab parameter
    return params.get("tab") === "register" ? "register" : "login";
  });

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      const path = returnTo.startsWith('http') ? new URL(returnTo).pathname : returnTo;
      navigate(path);
    }
  }, [user, navigate, returnTo]);

  return (
    <div className="min-h-screen flex relative">
      {/* Top-right language toggle — visible on both halves.
          Wrapped in a translucent-white pill so it stays readable over
          the dark primary-colored hero column. */}
      <div className="absolute top-4 right-4 z-20 rounded-lg bg-white/90 text-gray-800 shadow-sm backdrop-blur-sm">
        <LanguageSwitcher />
      </div>

      {/* Left side - Auth forms */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex flex-col items-center">
              <img
                src={logoImage}
                alt="AgoraX Logo"
                className="h-20 w-auto mb-3"
              />
              <h1 className="text-3xl font-bold text-primary">AgoraX</h1>
              <p className="text-muted-foreground mt-2">
                {t('header.digitalDemocracy')}
              </p>
            </div>
          </div>

          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="login">{t('auth.login')}</TabsTrigger>
              <TabsTrigger value="register">{t('auth.register')}</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <LoginForm
                onSubmit={() => {
                  const path = returnTo.startsWith('http') ? new URL(returnTo).pathname : returnTo;
                  navigate(path);
                }}
                onSwitchToRegister={() => setTab("register")}
              />
            </TabsContent>
            <TabsContent value="register">
              <RegisterForm
                onSubmit={() => {
                  const path = returnTo.startsWith('http') ? new URL(returnTo).pathname : returnTo;
                  navigate(path);
                }}
                onSwitchToLogin={() => setTab("login")}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right side - Hero content */}
      <div className="hidden lg:w-1/2 lg:flex flex-col bg-primary text-white p-10 items-center justify-center">
        <div className="max-w-lg">
          <h2 className="text-4xl font-bold mb-6">
            {t('auth.heroTitle')}
          </h2>
          <p className="text-lg mb-8">
            {t('auth.heroSubtitle')}
          </p>
          <div className="space-y-4">
            <div className="flex items-start">
              <div className="bg-white/20 p-2 rounded-full mr-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                  <path d="M15 2v6h6" />
                  <path d="M10 12l4 0" />
                  <path d="M10 16l4 0" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-xl">{t('auth.heroFeature1Title')}</h3>
                <p>{t('auth.heroFeature1Desc')}</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="bg-white/20 p-2 rounded-full mr-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-xl">{t('auth.heroFeature2Title')}</h3>
                <p>{t('auth.heroFeature2Desc')}</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="bg-white/20 p-2 rounded-full mr-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                  <path d="M16 21v-2a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a2 2 0 0 0-2-2h-2.21" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-xl">{t('auth.heroFeature3Title')}</h3>
                <p>{t('auth.heroFeature3Desc')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginForm({ onSubmit, onSwitchToRegister }: { onSubmit: () => void; onSwitchToRegister: () => void }) {
  const { t } = useTranslation();
  const { loginMutation } = useAuth();

  const form = useForm<z.infer<typeof loginUserSchema>>({
    resolver: zodResolver(loginUserSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const handleSubmit = async (values: z.infer<typeof loginUserSchema>) => {
    const deviceFingerprint = await getFingerprint();
    const urlReturnTo = new URLSearchParams(window.location.search).get('returnTo') || '/home';
    loginMutation.mutate({
      ...values,
      deviceFingerprint,
      returnTo: urlReturnTo
    }, {
      onSuccess: onSubmit,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.username')}</FormLabel>
              <FormControl>
                <Input placeholder={t('auth.usernamePlaceholder') as string} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.password')}</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Button variant="link" className="px-0 text-sm" onClick={onSwitchToRegister}>
            {t('auth.noAccount')}
          </Button>
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? t('general.loading') + "..." : t('auth.login')}
        </Button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-2 text-sm text-muted-foreground">
              {t('auth.orContinueWith')}
            </span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full flex items-center justify-center gap-2"
          onClick={() => {
            const currentUrl = new URL(window.location.href);
            const returnToParam = currentUrl.searchParams.get('returnTo') || '/home';
            const path = returnToParam.startsWith('http') ? new URL(returnToParam).pathname : returnToParam;
            window.location.href = `/auth/google?returnTo=${encodeURIComponent(path)}`;
          }}
        >
          <FcGoogle className="h-5 w-5" />
          {t('auth.signInWithGoogle')}
        </Button>
      </form>
    </Form>
  );
}

function RegisterForm({ onSubmit, onSwitchToLogin }: { onSubmit: () => void; onSwitchToLogin: () => void }) {
  const { t, locale } = useTranslation();
  const { registerMutation } = useAuth();
  const [acceptTerms, setAcceptTerms] = useState(false);

  const form = useForm<z.infer<typeof registerUserSchema>>({
    resolver: zodResolver(registerUserSchema),
    defaultValues: {
      username: "",
      password: "",
      name: "",
      email: "",
    },
  });

  const handleSubmit = async (values: z.infer<typeof registerUserSchema>) => {
    if (!acceptTerms) return;
    const deviceFingerprint = await getFingerprint();
    const urlReturnTo = new URLSearchParams(window.location.search).get('returnTo') || '/home';
    const consentLocale: 'el' | 'en' = locale === 'en' ? 'en' : 'el';
    registerMutation.mutate({
      ...values,
      deviceFingerprint,
      consent: { version: CURRENT_CONSENT_VERSION, locale: consentLocale },
      returnTo: urlReturnTo
    }, {
      onSuccess: onSubmit,
    });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.fullName')}</FormLabel>
              <FormControl>
                <Input placeholder={t('auth.fullNamePlaceholder') as string} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.email')}</FormLabel>
              <FormControl>
                <Input type="email" placeholder={t('auth.emailPlaceholder') as string} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.username')}</FormLabel>
              <FormControl>
                <Input placeholder={t('auth.usernamePlaceholder') as string} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.password')}</FormLabel>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage className="text-xs">
                {t('auth.passwordMinLength')}
              </FormMessage>
            </FormItem>
          )}
        />
        <div className="flex items-center space-x-2">
          <Checkbox
            id="terms"
            checked={acceptTerms}
            onCheckedChange={(checked) => setAcceptTerms(!!checked)}
          />
          <label
            htmlFor="terms"
            className="text-sm text-muted-foreground leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {t('auth.acceptTerms')}{" "}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {t('auth.termsOfService')}
            </a>{" "}
            {t('auth.and')}{" "}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {t('auth.privacyPolicy')}
            </a>
          </label>
        </div>
        <div className="flex justify-end">
          <Button variant="link" className="px-0 text-sm" onClick={onSwitchToLogin}>
            {t('auth.haveAccount')}
          </Button>
        </div>
        <Button
          type="submit"
          className="w-full"
          disabled={registerMutation.isPending || !acceptTerms}
        >
          {registerMutation.isPending
            ? t('general.loading') + "..."
            : t('auth.register')}
        </Button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-background px-2 text-sm text-muted-foreground">
              {t('auth.orContinueWith')}
            </span>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full flex items-center justify-center gap-2"
          onClick={() => {
            const currentUrl = new URL(window.location.href);
            const returnToParam = currentUrl.searchParams.get('returnTo') || '/home';
            const path = returnToParam.startsWith('http') ? new URL(returnToParam).pathname : returnToParam;
            window.location.href = `/auth/google?returnTo=${encodeURIComponent(path)}`;
          }}
        >
          <FcGoogle className="h-5 w-5" />
          {t('auth.signUpWithGoogle')}
        </Button>
      </form>
    </Form>
  );
}
