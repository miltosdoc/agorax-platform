import { useTranslation } from "@/hooks/use-translation";
import logoImage from "../../assets/logo.png";

export default function Footer() {
  const { t } = useTranslation();

  const navigate = (path: string) => {
    window.location.href = path;
  };

  return (
    <footer className="border-t border-line-strong bg-ink text-paper">
      <div className="container mx-auto px-4">
        {/* ── Colophon grid ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-y-12 py-16 md:grid-cols-12 md:gap-x-8">
          {/* Wordmark & tagline */}
          <div className="md:col-span-6">
            <div
              className="inline-flex cursor-pointer items-center gap-3"
              role="button"
              tabIndex={0}
              aria-label="Go to home page"
              onClick={() => navigate("/")}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate("/"); }}
            >
              <img src={logoImage} alt="AgoraX logo" className="h-9 w-auto" />
              <span className="font-serif text-4xl font-normal leading-none text-paper">
                AgoraX
              </span>
            </div>
            <p className="mt-5 max-w-[40ch] text-sm leading-relaxed text-bc-ink-soft">
              {t('footer.tagline')}
            </p>
          </div>

          {/* Useful links */}
          <div className="md:col-span-3">
            <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-bc-ink-soft">
              {t('footer.usefulLinks')}
            </h3>
            <ul className="mt-4 divide-y divide-bc-line border-t border-bc-line">
              <li>
                <button
                  className="block w-full py-2.5 text-left text-sm text-bc-ink-soft transition-colors duration-[120ms] hover:text-paper"
                  onClick={() => navigate("/how-it-works")}
                >
                  {t('footer.howItWorks')}
                </button>
              </li>
              <li>
                <button
                  className="block w-full py-2.5 text-left text-sm text-bc-ink-soft transition-colors duration-[120ms] hover:text-paper"
                  onClick={() => navigate("/faq")}
                >
                  {t('footer.faq')}
                </button>
              </li>
              <li>
                <button
                  className="block w-full py-2.5 text-left text-sm text-bc-ink-soft transition-colors duration-[120ms] hover:text-paper"
                  onClick={() => navigate("/terms")}
                >
                  {t('footer.terms')}
                </button>
              </li>
              <li>
                <button
                  className="block w-full py-2.5 text-left text-sm text-bc-ink-soft transition-colors duration-[120ms] hover:text-paper"
                  onClick={() => navigate("/privacy")}
                >
                  {t('footer.privacy')}
                </button>
              </li>
            </ul>
          </div>

        </div>

        {/* ── Legal row ─────────────────────────────────────────────── */}
        <div className="border-t border-bc-line py-6">
          <p className="font-mono text-xs tabular-nums text-bc-ink-soft">
            © {new Date().getFullYear()} AgoraX — {t('general.digitalDemocracy')}
          </p>
        </div>
      </div>
    </footer>
  );
}
