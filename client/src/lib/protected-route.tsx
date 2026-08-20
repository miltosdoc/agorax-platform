import type { ComponentType } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

// DEMO MODE: Set to true to bypass auth for all pages
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

export function ProtectedRoute({
  path,
  component: Component,
}: {
  path: string;
  component: ComponentType;
}) {
  const { user, isLoading } = useAuth();

  if (DEMO_MODE) {
    // Bypass auth in demo mode
    return <Route path={path} component={Component as ComponentType<any>} />;
  }

  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-border" />
        </div>
      </Route>
    );
  }

  if (!user) {
    return (
      <Route path={path}>
        <Redirect to={`/auth?returnTo=${encodeURIComponent(path)}`} />
      </Route>
    );
  }

  return <Route path={path} component={Component as ComponentType<any>} />;
}
