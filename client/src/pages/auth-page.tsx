import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { ContactDialog } from "@/components/ContactDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { loginUserSchema, registerUserSchema } from "@shared/schema";
import { CURRENT_CONSENT_VERSION } from "@shared/consent";
import { FcGoogle } from "react-icons/fc";
import { useTranslation } from "@/hooks/use-translation";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CHECKBOX_CLASS,
  EYEBROW,
  INPUT_CLASS,
  LINK_CLASS,
} from "@/components/auth/auth-styles";
import { LanguageSwitcher } from "@/components/ui/language-switcher";
import logoImage from "../assets/logo.png";
import FingerprintJS from '@fingerprintjs/fingerprintjs';

// Inside the Capacitor Android wrapper, Google blocks OAuth in the webview,
// so the flow runs in the system browser with mobile=1: the callback then
// deep-links back into the app (agorax://auth?code=…) and the app exchanges
// the one-time code for a webview session (see use-mobile-auth.ts).
function isNativeApp(): boolean {
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

function startGoogleAuth() {
  const currentUrl = new URL(window.location.href);
  const returnToParam = currentUrl.searchParams.get('returnTo') || '/feed';
  const path = returnToParam.startsWith('http') ? new URL(returnToParam).pathname : returnToParam;
  const mobile = isNativeApp() ? '&mobile=1' : '';
  window.location.href = `/auth/google?returnTo=${encodeURIComponent(path)}${mobile}`;
}

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

// The institutional idiom now lives in components/auth/auth-styles.ts, shared
// with the password-reset, address-confirmation and unsubscribe pages — they
// are all signed-out pages reached from an email, and they have to look like
// the same platform.

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

  const handleAuthenticated = () => {
    const path = returnTo.startsWith('http') ? new URL(returnTo).pathname : returnTo;
    navigate(path);
  };

  const features = [
    { title: t('auth.heroFeature1Title'), desc: t('auth.heroFeature1Desc') },
    { title: t('auth.heroFeature2Title'), desc: t('auth.heroFeature2Desc') },
    { title: t('auth.heroFeature3Title'), desc: t('auth.heroFeature3Desc') },
    { title: t('auth.heroFeature4Title'), desc: t('auth.heroFeature4Desc') },
    { title: t('auth.heroFeature5Title'), desc: t('auth.heroFeature5Desc') },
  ];

  const tabClass = (active: boolean) =>
    `-mb-px border-b-2 pb-3 text-sm transition-colors duration-[120ms] ${
      active
        ? "border-ink font-semibold text-ink"
        : "border-transparent font-medium text-ink-faint hover:text-ink-soft"
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      {/* ————— Slim masthead strip: wordmark + language toggle ————— */}
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <a href="/" className="flex items-center gap-3">
            <img src={logoImage} alt="AgoraX Logo" className="h-9 w-auto" />
            <span className="flex items-baseline gap-1.5 leading-none">
              <span className="font-serif text-xl font-normal text-ink">
                AgoraX
              </span>
              {/* Shown before sign-up too: people deciding whether to join
                  should know the platform is still under construction. */}
              <span
                className="rounded-sm border border-kyanos/40 bg-kyanos-wash px-1 py-0.5 font-sans text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-kyanos"
                data-testid="badge-beta"
              >
                Beta
              </span>
            </span>
          </a>
          <div className="flex items-center gap-4">
            {/* Reachable before you have an account — the people who need help
                most are the ones who can't get in. */}
            <ContactDialog triggerClassName="font-mono text-xs uppercase tracking-wide text-ink-soft underline underline-offset-4 hover:text-ink" />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col lg:grid lg:grid-cols-2">
        {/* ————— Ink panel: statement band on mobile, full column on desktop ————— */}
        <aside className="border-b border-line-strong bg-ink text-paper lg:order-2 lg:border-b-0 lg:border-l lg:border-l-line-strong">
          <div className="mx-auto flex h-full w-full max-w-xl flex-col justify-center px-4 py-8 sm:px-6 lg:px-12 lg:py-16">
            <p className="text-xs uppercase tracking-[0.14em] font-semibold text-bc-ink-soft">
              AgoraX
            </p>
            <h1 className="mt-3 max-w-[22ch] text-balance font-serif text-2xl font-normal leading-tight text-paper sm:text-3xl lg:mt-5 lg:text-4xl">
              {t('auth.heroTitle')}
            </h1>
            <p className="mt-5 hidden max-w-prose text-base leading-relaxed text-bc-ink-soft lg:block">
              {t('auth.heroSubtitle')}
            </p>

            <div className="mt-10 hidden divide-y divide-bc-line border-y border-bc-line lg:block">
              {features.map((feature, index) => (
                <div key={index} className="flex gap-5 py-5">
                  <span
                    className="font-mono text-xs leading-6 tabular-nums text-bc-ink-soft"
                    aria-hidden="true"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-serif text-lg font-normal leading-6 text-paper">
                      {feature.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-bc-ink-soft">
                      {feature.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ————— Form column ————— */}
        <div className="flex flex-1 items-start justify-center px-4 py-10 sm:px-6 lg:order-1 lg:items-center lg:py-16">
          <div className="w-full max-w-md rounded-sm border border-line bg-surface p-6 sm:p-8">
            <p className={EYEBROW}>{t('header.digitalDemocracy')}</p>

            {/* Underline tab rail */}
            <div className="mt-5 flex gap-6 border-b border-line" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "login"}
                onClick={() => setTab("login")}
                className={tabClass(tab === "login")}
              >
                {t('auth.login')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "register"}
                onClick={() => setTab("register")}
                className={tabClass(tab === "register")}
              >
                {t('auth.register')}
              </button>
            </div>

            <div className="pt-6" role="tabpanel">
              {tab === "login" ? (
                <LoginForm
                  onSubmit={handleAuthenticated}
                  onSwitchToRegister={() => setTab("register")}
                />
              ) : (
                <RegisterForm
                  onSubmit={handleAuthenticated}
                  onSwitchToLogin={() => setTab("login")}
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function OrDivider() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
      <span className="text-[11px] uppercase tracking-[0.14em] text-ink-faint">
        {t('auth.orContinueWith')}
      </span>
      <span className="h-px flex-1 bg-line" aria-hidden="true" />
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
    const urlReturnTo = new URLSearchParams(window.location.search).get('returnTo') || '/feed';
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
              {/* Either identifier works. Reset is keyed on the address, so
                  a form that took only a username would strand everyone who
                  came back through it. */}
              <FormLabel>{t('auth.usernameOrEmail')}</FormLabel>
              <FormControl>
                <Input
                  className={INPUT_CLASS}
                  autoComplete="username"
                  placeholder={t('auth.usernameOrEmailPlaceholder') as string}
                  {...field}
                />
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
                <PasswordInput className={INPUT_CLASS} autoComplete="current-password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-center justify-between gap-3">
          <Link href="/forgot-password" className={LINK_CLASS}>
            {t('auth.forgotPassword')}
          </Link>
          <button type="button" className={LINK_CLASS} onClick={onSwitchToRegister}>
            {t('auth.noAccount')}
          </button>
        </div>
        <button
          type="submit"
          className={BUTTON_PRIMARY}
          disabled={loginMutation.isPending}
        >
          {loginMutation.isPending ? t('general.loading') + "..." : t('auth.login')}
        </button>

        <OrDivider />

        <button
          type="button"
          className={BUTTON_SECONDARY}
          onClick={startGoogleAuth}
        >
          <FcGoogle className="h-5 w-5" />
          {t('auth.signInWithGoogle')}
        </button>
      </form>
    </Form>
  );
}

function RegisterForm({ onSubmit, onSwitchToLogin }: { onSubmit: () => void; onSwitchToLogin: () => void }) {
  const { t, locale } = useTranslation();
  const { registerMutation } = useAuth();
  const [acceptTerms, setAcceptTerms] = useState(false);

  // confirmPassword is a form-only field — it must not reach the server, and
  // the shared schema is now enforced server-side, so it can't live there.
  const registerFormSchema = registerUserSchema
    .extend({ confirmPassword: z.string().min(1, { message: t('auth.confirmPasswordRequired') }) })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('auth.passwordsDoNotMatch'),
      path: ['confirmPassword'],
    });

  const form = useForm<z.infer<typeof registerFormSchema>>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      username: "",
      password: "",
      confirmPassword: "",
      name: "",
      email: "",
    },
  });

  const handleSubmit = async (values: z.infer<typeof registerFormSchema>) => {
    if (!acceptTerms) return;
    const deviceFingerprint = await getFingerprint();
    const urlReturnTo = new URLSearchParams(window.location.search).get('returnTo') || '/feed';
    const consentLocale: 'el' | 'en' = locale === 'en' ? 'en' : 'el';
    const { confirmPassword: _drop, ...payload } = values;
    registerMutation.mutate({
      ...payload,
      deviceFingerprint,
      // The language they are reading this form in becomes the language
      // AgoraX writes to them in — starting with the address-confirmation
      // email, which goes out before they could set a preference anywhere.
      locale,
      consent: { version: CURRENT_CONSENT_VERSION, locale: consentLocale },
      returnTo: urlReturnTo
    }, {
      onSuccess: onSubmit,
      // The server reports which field it rejected. Without this the only
      // signal was a toast reading "Invalid registration data", which told
      // nobody what to change.
      onError: (error: any) => {
        const fieldErrors = error?.errors as Record<string, string> | undefined;
        if (!fieldErrors) return;
        for (const [field, message] of Object.entries(fieldErrors)) {
          if (field in values) {
            form.setError(field as keyof z.infer<typeof registerFormSchema>, { type: 'server', message });
          }
        }
      },
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
                <Input className={INPUT_CLASS} placeholder={t('auth.fullNamePlaceholder') as string} {...field} />
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
                <Input className={INPUT_CLASS} type="email" placeholder={t('auth.emailPlaceholder') as string} {...field} />
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
                <Input className={INPUT_CLASS} placeholder={t('auth.usernamePlaceholder') as string} {...field} />
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
                <PasswordInput className={INPUT_CLASS} placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage className="text-xs">
                {t('auth.passwordMinLength')}
              </FormMessage>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('auth.confirmPassword')}</FormLabel>
              <FormControl>
                <PasswordInput className={INPUT_CLASS} placeholder="••••••••" {...field} data-testid="register-confirm-password" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* GDPR consent — legal micro-copy on a sunken panel */}
        <div className="rounded-sm border border-line bg-sunken p-3">
          <div className="flex items-start gap-3">
            <Checkbox
              id="terms"
              checked={acceptTerms}
              onCheckedChange={(checked) => setAcceptTerms(!!checked)}
              className={CHECKBOX_CLASS}
            />
            <label
              htmlFor="terms"
              className="font-mono text-xs leading-relaxed text-ink-soft peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {t('auth.acceptTerms')}{" "}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-kyanos transition-colors duration-[120ms] hover:underline underline-offset-2">
                {t('auth.termsOfService')}
              </a>{" "}
              {t('auth.and')}{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-kyanos transition-colors duration-[120ms] hover:underline underline-offset-2">
                {t('auth.privacyPolicy')}
              </a>
            </label>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" className={LINK_CLASS} onClick={onSwitchToLogin}>
            {t('auth.haveAccount')}
          </button>
        </div>
        <button
          type="submit"
          className={BUTTON_PRIMARY}
          disabled={registerMutation.isPending || !acceptTerms}
        >
          {registerMutation.isPending
            ? t('general.loading') + "..."
            : t('auth.register')}
        </button>

        <OrDivider />

        <button
          type="button"
          className={BUTTON_SECONDARY}
          onClick={startGoogleAuth}
        >
          <FcGoogle className="h-5 w-5" />
          {t('auth.signUpWithGoogle')}
        </button>
      </form>
    </Form>
  );
}
