/**
 * Routes - Domain-Driven Architecture
 *
 * This file imports and registers domain-specific routers.
 * Each router handles its own domain:
 *   - Users: profile, location, Gov.gr verification
 *   - Communities: CRUD, members, merging
 *   - Proposals: lifecycle, amendments, voting
 *   - Amendments: review, rejection, similarity
 *   - Sortition: citizen selection, scoring, synthesis
 *   - Debate: arguments, support/oppose
 *   - Notifications: user & sortition notifications
 *   - Platform: settings, search
 *   - Ballot: PDF validation, signature verification
 *   - Admin: account management
 *   - Analytics: dashboards
 *   - Misc: health check, OG images, SEO
 *
 * Authentication routes are handled in auth.ts.
 */

import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";

// Domain routers
import { registerUsersRoutes } from "./routers/users";
import { registerCommunitiesRoutes } from "./routers/communities";
import { registerProposalsRoutes } from "./routers/proposals";
import { registerAmendmentsRoutes } from "./routers/amendments";
import { registerSortitionRoutes } from "./routers/sortition";
import { registerDebateRoutes } from "./routers/debate";
import { registerNotificationsRoutes } from "./routers/notifications";
import { registerPlatformRoutes } from "./routers/platform";
import { registerBallotRoutes } from "./routers/ballot";
import { registerAdminRoutes } from "./routers/admin";
import { registerAnalyticsRoutes } from "./routers/analytics";
import { registerEconomyRoutes } from "./routers/economy";
import { registerMediaRoutes } from "./routers/media";
import { registerLivekitRoutes } from "./routers/livekit";
import { registerPushRoutes } from "./routers/push";
import { registerMiscRoutes } from "./routers/misc";

/**
 * Register all application routes.
 * @returns HTTP server instance.
 */
export async function registerRoutes(app: Express): Promise<Server> {
  // Setup authentication routes
  setupAuth(app);

  // Register domain routers
  registerUsersRoutes(app);
  registerCommunitiesRoutes(app);
  registerProposalsRoutes(app);
  registerAmendmentsRoutes(app);
  registerSortitionRoutes(app);
  registerDebateRoutes(app);
  registerNotificationsRoutes(app);
  registerPlatformRoutes(app);
  registerBallotRoutes(app);
  registerAdminRoutes(app);
  registerAnalyticsRoutes(app);
  registerEconomyRoutes(app);
  registerMediaRoutes(app);
  registerLivekitRoutes(app);
  registerPushRoutes(app);
  registerMiscRoutes(app);

  // Create and return the server
  const server = createServer(app);
  return server;
}

