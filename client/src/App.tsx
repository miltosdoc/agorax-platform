import { Switch, Route, Redirect, Router } from "wouter";
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
import CommunitySettingsPage from "@/pages/community-settings";
import { PlatformSettingsPage } from "@/pages/platform-settings";
import NotificationsPage from "@/pages/notifications";
import ProposalDetailPage from "@/pages/proposal-detail";
import ProposalsPage from "@/pages/proposals-page";
import SortitionScoringPage from "@/pages/sortition-scoring";
import SortitionSynthesisPage from "@/pages/sortition-synthesis";
import SortitionDashboardPage from "@/pages/sortition-dashboard";
import SortitionBodyDetailPage from "@/pages/sortition-body-detail";
import SortitionCeremonyPage from "@/pages/sortition-ceremony";
import AmendmentAuthorReview from "@/pages/amendment-author-review";
import AmendmentCommunitySignal from "@/pages/amendment-community-signal";
import DeliberationWalkthrough from "@/pages/deliberation-walkthrough";
import { CommunityForm } from "@/components/community/community-form";
import { CommunityList } from "@/components/community/community-list";
import { ProposalForm } from "@/components/proposal/proposal-form";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import { I18nProvider } from "./hooks/use-translation";
import { ProtectedRoute } from "./lib/protected-route";
import BottomNav from "@/components/layout/bottom-nav";

function CommunitiesPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="container mx-auto py-6 px-4 max-w-6xl flex-grow">
        <CommunityList />
      </div>
      <Footer />
    </div>
  );
}

function ProposalFormPage() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('community');
  const communityId = raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : undefined;
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <div className="container mx-auto py-6 px-4 max-w-3xl flex-grow">
        <ProposalForm communityId={communityId} />
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

function AppRouter() {
  const { user } = useAuth();

  return (
    <Router>
      <Switch>
        <Route path="/" component={LandingPage} />
        <Route path="/auth" component={AuthPage} />
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
        <Route path="/surveys/create">
          <Redirect to="/proposals/new" />
        </Route>
        <Route path="/surveys/:id/edit">
          <Redirect to="/home" />
        </Route>
        <ProtectedRoute path="/analytics" component={AnalyticsDashboard} />
        <ProtectedRoute path="/admin/accounts" component={AdminAccountsPage} />
        <ProtectedRoute path="/profile" component={ProfilePage} />
        <Route path="/groups">
          <Redirect to="/communities" />
        </Route>
        <ProtectedRoute path="/communities" component={CommunitiesPage} />
        <ProtectedRoute path="/communities/new" component={CommunityFormPage} />
        <ProtectedRoute path="/communities/:id/settings" component={CommunitySettingsPage} />
        <ProtectedRoute path="/communities/:id" component={CommunityDashboardPage} />
        <Route path="/proposals" component={ProposalsPage} />
        <ProtectedRoute path="/proposals/new" component={ProposalFormPage} />
        <ProtectedRoute path="/proposals/:id" component={ProposalDetailPage} />
        <ProtectedRoute path="/sortition" component={SortitionDashboardPage} />
        <ProtectedRoute path="/sortition/body/:bodyId" component={SortitionBodyDetailPage} />
        <ProtectedRoute path="/sortition/:bodyId/ceremony" component={SortitionCeremonyPage} />
        <ProtectedRoute path="/sortition/:id" component={SortitionScoringPage} />
        <ProtectedRoute path="/proposals/:id/sortition" component={SortitionSynthesisPage} />
        <ProtectedRoute path="/proposals/:id/amendments/review" component={AmendmentAuthorReview} />
        <ProtectedRoute path="/proposals/:id/amendments/signals" component={AmendmentCommunitySignal} />
        <ProtectedRoute path="/settings" component={PlatformSettingsPage} />
        <ProtectedRoute path="/notifications" component={NotificationsPage} />
        <Route path="/walkthrough" component={DeliberationWalkthrough} />
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
          <AppRouter />
          <Toaster />
        </AuthProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
