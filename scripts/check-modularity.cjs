#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

// Domain boundaries - what each domain owns
const DOMAINS = {
  proposals: {
    router: "routers/proposals.ts",
    storage: "storage/proposals.ts",
    utils: ["proposal-state-machine.ts", "proposal-structuring.ts", "amendment-processor.ts"]
  },
  amendments: {
    router: "routers/amendments.ts",
    storage: "storage/amendments.ts",
    utils: ["amendment-merger.ts", "amendment-similarity.ts"]
  },
  sortition: {
    router: "routers/sortition.ts",
    storage: "storage/sortition.ts",
    utils: ["sortition.ts", "sortition-timeout.ts"]
  },
  voting: {
    router: null,
    storage: "storage/voting.ts",
    utils: ["ballot-client.ts"]
  },
  debate: {
    router: "routers/debate.ts",
    storage: "storage/debate.ts",
    utils: ["debate.ts"]
  },
  communities: {
    router: "routers/communities.ts",
    storage: "storage/communities.ts",
    utils: ["community-manager.ts"]
  },
  users: {
    router: "routers/users.ts",
    storage: "storage/users.ts",
    utils: ["location-validator.ts", "geo-region-detector.ts", "reverse-geocoding.ts"]
  },
  notifications: {
    router: "routers/notifications.ts",
    storage: "storage/notifications.ts",
    utils: ["notifications.ts"]
  },
  analytics: {
    router: "routers/analytics.ts",
    storage: null,
    utils: ["democracy-score.ts"]
  },
  platform: {
    router: "routers/platform.ts",
    storage: "storage/platform.ts",
    utils: []
  },
  admin: {
    router: "routers/admin.ts",
    storage: null,
    utils: ["admin-action-logger.ts"]
  }
};

// Shared infrastructure - allowed for all domains
const SHARED = [
  "auth.ts", "storage.ts", "db.ts", "schema.ts", "types.ts",
  "job-queue.ts", "job-handlers.ts", "llm-validation.ts", "osm-seed.ts",
  "storage/types.ts"
];

function getDomainForModule(moduleName) {
  for (const [domain, config] of Object.entries(DOMAINS)) {
    if (config.storage && moduleName.includes(config.storage)) return domain;
    if (config.utils.some(u => moduleName.includes(u))) return domain;
  }
  return null;
}

function checkImports(filePath, domain) {
  const content = fs.readFileSync(filePath, "utf8");
  const imports = content.match(/from\s+['"]([^'"]+)['"]/g) || [];
  const violations = [];
  
  for (const imp of imports) {
    const module = imp.match(/from\s+['"]([^'"]+)['"]/)[1];
    if (!module.startsWith(".")) continue;
    if (SHARED.some(s => module.includes(s))) continue;
    
    const moduleDomain = getDomainForModule(module);
    if (moduleDomain && moduleDomain !== domain) {
      violations.push({ import: module, fromDomain: moduleDomain, toDomain: domain });
    }
  }
  
  return violations;
}

let totalViolations = 0;

for (const [domain, config] of Object.entries(DOMAINS)) {
  if (!config.router) continue;
  
  const routerPath = path.join(__dirname, "..", "server", config.router);
  if (!fs.existsSync(routerPath)) continue;
  
  const violations = checkImports(routerPath, domain);
  
  if (violations.length > 0) {
    console.log("\n❌ " + domain + " router has " + violations.length + " cross-domain violations:");
    for (const v of violations) {
      console.log("   - imports from " + v.fromDomain + " domain: " + v.import);
    }
    totalViolations += violations.length;
  } else {
    console.log("✓ " + domain + " - clean");
  }
}

console.log("\n" + (totalViolations === 0 ? "✓ All domains pass boundary checks" : "❌ " + totalViolations + " violations found"));
process.exit(totalViolations > 0 ? 1 : 0);
