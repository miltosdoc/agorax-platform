const DEFAULT_OR_WEAK_VALUES = new Set([
  "changeme",
  "changeme_ballot_salt",
  "change-me-in-production",
  "change-this-database-password",
  "change-this-jwt-secret-32-plus-chars",
  "change-this-session-secret-32-plus-chars",
  "change-this-ballot-salt-32-plus-chars",
  "demo-secret",
  "demo-session-secret",
  "CHANGE_ME_IN_PRODUCTION_abc123xyz",
]);

function isProductionLike() {
  return process.env.APP_ENV === "production";
}

function requireStrongSecret(name: string, minLength = 32) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  if (isProductionLike() && (value.length < minLength || DEFAULT_OR_WEAK_VALUES.has(value))) {
    throw new Error(`${name} must be a non-default secret with at least ${minLength} characters in production`);
  }
}

export function validateRuntimeConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  // In production, the DB connection must use TLS. Postgres reads sslmode
  // from the URL query string or PGSSLMODE; accept any of the modes that
  // actually enforce encryption. Local docker-network targets (e.g.
  // `postgres://...@db:5432/...`) are allowed without sslmode only when
  // PGSSLMODE_DISABLE_INSECURE=1 is explicitly set — making the insecure
  // case an explicit opt-in rather than a silent default.
  if (isProductionLike()) {
    const enforcingModes = new Set(['require', 'verify-ca', 'verify-full']);
    const queryMatch = databaseUrl.match(/[?&]sslmode=([^&]+)/i);
    const urlMode = queryMatch?.[1]?.toLowerCase();
    const envMode = process.env.PGSSLMODE?.toLowerCase();
    const effectiveMode = urlMode ?? envMode;
    const isExplicitInsecure = process.env.ALLOW_INSECURE_DB === '1';
    if (!isExplicitInsecure && (!effectiveMode || !enforcingModes.has(effectiveMode))) {
      throw new Error(
        "DATABASE_URL must enforce TLS in production " +
        "(sslmode=require | verify-ca | verify-full, in the URL or PGSSLMODE). " +
        "Set ALLOW_INSECURE_DB=1 to override (e.g. local-network Postgres).",
      );
    }
  }

  requireStrongSecret("SESSION_SECRET");

  if (process.env.JWT_SECRET) {
    requireStrongSecret("JWT_SECRET");
  }

  if (isProductionLike() && process.env.DEMO_MODE === "true") {
    throw new Error("DEMO_MODE=true is not allowed when APP_ENV=production");
  }

  // External LLM gate was removed for Art. 9 reasons in
  // docs/compliance/02_DATA_MINIMIZATION_AUDIT.md §4.2. If an LLM key is
  // set in production it likely means someone is about to re-enable a
  // removed external-disclosure path — fail loud so the controller decides.
  if (
    isProductionLike() &&
    (process.env.LLM_API_KEY || process.env.OPENROUTER_API_KEY)
  ) {
    throw new Error(
      "LLM_API_KEY / OPENROUTER_API_KEY is set in production but the external " +
      "LLM gate has been removed per GDPR audit. Unset the env var, or re-run " +
      "the §4.2 audit decision before re-enabling.",
    );
  }
}
