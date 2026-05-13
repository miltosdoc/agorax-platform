import { useTranslation } from "@/hooks/use-translation";
import logoImage from "../../assets/logo.png";

export default function Footer() {
  const { t } = useTranslation();

  const navigate = (path: string) => {
    window.location.href = path;
  };

  return (
    <footer className="bg-slate-900 text-slate-300 py-12">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Logo & Tagline */}
          <div>
            <div className="flex items-center gap-2 mb-4 cursor-pointer" onClick={() => navigate("/")}>
              <img src={logoImage} alt="" className="h-8 w-auto" />
              <span className="text-white text-xl font-bold">AgoraX</span>
            </div>
            <p className="text-sm text-slate-400">
              {t('footer.tagline')}
            </p>
          </div>

          {/* Useful Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">{t('footer.usefulLinks')}</h3>
            <ul className="space-y-2 text-sm">
              <li><button className="hover:text-white transition-colors text-left text-sm" onClick={() => navigate("/how-it-works")}>{t('footer.howItWorks')}</button></li>
              <li><button className="hover:text-white transition-colors text-left text-sm" onClick={() => navigate("/faq")}>{t('footer.faq')}</button></li>
              <li><button className="hover:text-white transition-colors text-left text-sm" onClick={() => navigate("/terms")}>{t('footer.terms')}</button></li>
              <li><button className="hover:text-white transition-colors text-left text-sm" onClick={() => navigate("/privacy")}>{t('footer.privacy')}</button></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white font-semibold mb-4">{t('footer.contact')}</h3>
            <p className="text-sm text-slate-400">info@agorax.gr</p>
          </div>
        </div>

        <div className="border-t border-slate-700 mt-8 pt-8 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} AgoraX — {t('general.digitalDemocracy')}
        </div>
      </div>
    </footer>
  );
}
