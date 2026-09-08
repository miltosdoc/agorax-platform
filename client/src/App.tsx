import { useEffect } from "react";
import { Switch, Route, Redirect, Router, useParams } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import HomePage from "@/pages/home-page";
import LandingPage from "@/pages/landing-page";
import AuthPage from "@/pages/auth-page";
import Header from "@/components/layout/header";
import Footer from "@/components/layout/footer";
import ProfilePage from "@/pages/profile-page";
import HowItWorksPage from "@/pages/how-it-works";
import FAQPage from "@/pages/faq";
import TermsPage from "@/pages/terms";
import PrivacyPage from "@/pages/privacy";
import AnalyticsDashboard from "@/pages/analytics-dashboard";
import AdminAccountsPage from "@/pages/admin-accounts";
import CommunityDashboardPage from "@/pages/community-dashboard";
import CommunitiesPage from "@/pages/communities";
import MediaLibraryPage from "@/pages/media-library";
import BookmarksPage from "@/pages/bookmarks";
import AppearancePage from "@/pages/appearance";
import SupportPage from "@/pages/support";
import NewsletterConfirmPage from "@/pages/newsletter-confirm";
import ConferenceRoomPage from "@/pages/conference-room";
import ResetPasswordPage from "@/pages/reset-password";
import ForgotPasswordPage from "@/pages/forgot-password";
import VerifyEmailPage from "@/pages/verify-email";
import UnsubscribePage from "@/pages/unsubscribe";
import { LocaleSync } from "@/components/auth/LocaleSync";
import { ThemeSync } from "@/components/auth/ThemeSync";
import VerifyBallotPage from "@/pages/verify-ballot";
import InviteAcceptPage from "@/pages/invite-accept";
import CommunitySettingsPage from "@/pages/community-settings";
import { PlatformSettingsPage } from "@/pages/platform-settings";
import NotificationsPage from "@/pages/notifications";
import NotificationSettingsPage from "@/pages/notification-settings";
import ProposalDetailPage from "@/pages/proposal-detail";
import ProposalsPage from "@/pages/proposals-page";
import FeedPage from "@/pages/feed-page";
import SortitionScoringPage from "@/pages/sortition-scoring";
import SortitionSynthesisPage from "@/pages/sortition-synthesis";
import SortitionDashboardPage from "@/pages/sortition-dashboard";
import SortitionBodyDetailPage from "@/pages/sortition-body-detail";
import SortitionCeremonyPage from "@/pages/sortition-ceremony";
import AmendmentAuthorReview from "@/pages/amendment-author-review";
import AmendmentCommunitySignal from "@/pages/amendment-community-signal";
import DeliberationWalkthrough from "@/pages/deliberation-walkthrough";
import DemocracyPointsPage from "@/pages/democracy-points";
import SurveysPage from "@/pages/surveys-page";
import SurveyCreatePage from "@/pages/survey-create";
import SurveyDetailPage from "@/pages/survey-detail";
import SurveyTakePage from "@/pages/survey-take";
import PanelOnboardingPage from "@/pages/panel-onboarding";
import SurveyTrendsPage from "@/pages/survey-trends";
import { CommunityForm } from "@/components/community/community-form";
import { CommunityList } from "@/components/community/community-list";
import { ProposalForm } from "@/components/proposal/proposal-form";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import { useMobileAuthDeepLink } from "./hooks/use-mobile-auth";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { I18nProvider } from "./hooks/use-translation";
import { ProtectedRoute } from "./lib/protected-route";
import BottomNav from "@/components/layout/bottom-nav";

function EditProposalFormPage() {
  const params = useParams();
  const editId = params.id && /^\d+$/.test(params.id) ? parseInt(params.id, 10) : undefined;
  return <ProposalFormPage editId={editId} />;
}

function ProposalFormPage({ editId }: { editId?: number }) {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('community');
  const communityId = raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : undefined;
  // A community forum topic being turned into a proposal arrives prefilled.
  const fromPostRaw = params.get('fromPost');
  const fromPostId = fromPostRaw && /^\d+$/.test(fromPostRaw) ? parseInt(fromPostRaw, 10) : undefined;
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="container mx-auto py-6 px-4 max-w-3xl flex-grow">
        <ProposalForm communityId={communityId} editProposalId={editId} fromPostId={fromPostId} />
      </div>
      <Footer />
    </div>
  );
}

function CommunityFormPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="container mx-auto py-6 px-4 max-w-3xl flex-grow">
        <CommunityForm />
      </div>
      <Footer />
    </div>
  );
}

// Complete any anonymous ballots whose privacy delay elapsed while the app
// was closed — opening AgoraX anywhere finishes the vote.
function usePendingBallotSweep() {
  useEffect(() => {
    import('@/lib/anonymous-vote')
      .then(m => m.castMaturedPendingBallots())
      .catch(() => { /* best-effort */ });
  }, []);
}

function AppRouter() {
  const { user } = useAuth();
  useMobileAuthDeepLink();
  usePendingBallotSweep();

  return (
    <Router>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/forgot-password" component={ForgotPasswordPage} />
        {/* Reached from a link in an email, so they must work signed out. */}
        <Route path="/unsubscribe" component={UnsubscribePage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <ProtectedRoute path="/home" component={HomePage} />
        <Route path="/my-polls">
          <Redirect to="/home" />
        </Route>
        <Route path="/submit">
          <Redirect to="/proposals/new" />
        </Route>
        <Route path="/polls/create">
          <Redirect to="/proposals/new" />
        </Route>
        <Route path="/polls/:id">
          <Redirect to="/home" />
        </Route>
        <Route path="/polls/:id/edit">
          <Redirect to="/home" />
        </Route>
        <Route path="/polls/:id/extend">
          <Redirect to="/home" />
        </Route>
        {/* Polling module — registered BEFORE the legacy redirects below. */}
        <Route path="/surveys" component={SurveysPage} />
        <ProtectedRoute path="/surveys/new" component={SurveyCreatePage} />
        <ProtectedRoute path="/surveys/trends" component={SurveyTrendsPage} />
        <ProtectedRoute path="/panel" component={PanelOnboardingPage} />
        <Route path="/surveys/:id/take" component={SurveyTakePage} />
        <Route path="/surveys/create">
          <Redirect to="/proposals/new" />
        </Route>
        <Route path="/surveys/:id/edit">
          <Redirect to="/home" />
        </Route>
        <Route path="/surveys/:id" component={SurveyDetailPage} />
        <ProtectedRoute path="/analytics" component={AnalyticsDashboard} />
        <ProtectedRoute path="/admin/accounts" component={AdminAccountsPage} />
        <ProtectedRoute path="/profile" component={ProfilePage} />
        <Route path="/groups">
          <Redirect to="/communities" />
        </Route>
        {/* Public shelves: a signed-out visitor may browse the media and the
            support page; only the saved list needs an account. */}
        <Route path="/podcasts">{() => <MediaLibraryPage kind="podcast" />}</Route>
        <Route path="/videos">{() => <MediaLibraryPage kind="video" />}</Route>
        <Route path="/support" component={SupportPage} />
        <Route path="/newsletter/confirm" component={NewsletterConfirmPage} />
        <ProtectedRoute path="/bookmarks" component={BookmarksPage} />
        <ProtectedRoute path="/communities" component={CommunitiesPage} />
        <ProtectedRoute path="/communities/new" component={CommunityFormPage} />
        <ProtectedRoute path="/communities/:id/settings" component={CommunitySettingsPage} />
        <ProtectedRoute path="/communities/:id" component={CommunityDashboardPage} />
        <Route path="/proposals" component={ProposalsPage} />
        <ProtectedRoute path="/proposals/new" component={ProposalFormPage} />
        <ProtectedRoute path="/proposals/:id/edit" component={EditProposalFormPage} />
        <ProtectedRoute path="/proposals/:id" component={ProposalDetailPage} />
        <ProtectedRoute path="/feed" component={FeedPage} />
        <ProtectedRoute path="/conference/:roomId" component={ConferenceRoomPage} />
        <ProtectedRoute path="/sortition" component={SortitionDashboardPage} />
        <ProtectedRoute path="/sortition/body/:bodyId" component={SortitionBodyDetailPage} />
        <ProtectedRoute path="/sortition/:bodyId/ceremony" component={SortitionCeremonyPage} />
        <ProtectedRoute path="/sortition/:id" component={SortitionScoringPage} />
        <ProtectedRoute path="/proposals/:id/sortition" component={SortitionSynthesisPage} />
        <ProtectedRoute path="/proposals/:id/amendments/review" component={AmendmentAuthorReview} />
        <ProtectedRoute path="/proposals/:id/amendments/signals" component={AmendmentCommunitySignal} />
        <ProtectedRoute path="/points" component={DemocracyPointsPage} />
        <ProtectedRoute path="/settings" component={PlatformSettingsPage} />
        <Route path="/appearance" component={AppearancePage} />
        <ProtectedRoute path="/notifications/settings" component={NotificationSettingsPage} />
        <ProtectedRoute path="/notifications" component={NotificationsPage} />
        <Route path="/walkthrough" component={DeliberationWalkthrough} />
        {/* Reachable only by the link printed on a ballot receipt
            (client/src/components/ceremony/BallotReceipt.tsx), which carries
            ?proposal=&hash= and verifies on load. Deliberately absent from
            every menu: it is a check you run against a certificate you were
            handed, not a page to browse to. The route stays because every
            receipt already issued points at it. */}
        <Route path="/verify" component={VerifyBallotPage} />
        {/* Public: an invitee must be able to read the invite before signing up. */}
        <Route path="/invite/:token" component={InviteAcceptPage} />
        <Route path="/how-it-works" component={HowItWorksPage} />
        <Route path="/faq" component={FAQPage} />
        <Route path="/terms" component={TermsPage} />
        <Route path="/privacy" component={PrivacyPage} />
        <Route component={NotFound} />
      </Switch>
      {user && <BottomNav user={user} />}
    </Router>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AuthProvider>
          <LocaleSync />
          <ThemeSync />
          <AppRouter />
          <FeedbackWidget />
          <Toaster />
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
