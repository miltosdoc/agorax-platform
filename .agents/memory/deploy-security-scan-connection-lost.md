---
name: Security scan connection-lost deploy failure
description: Publish fails at the "Security scan" step with "connection lost" — how to tell it's infra-side vs a code issue.
---

## Symptom
Every publish fails within ~14 seconds. Build logs contain only 4 lines and end with:
`warn: Security scan skipped: connection lost`. The build never reaches the compile/install phase.

## What it is
A Replit-side infrastructure failure in the deployment security-scanner service — it drops
its connection before scanning the code. The consistent ~14s timing is a fixed timeout, not
a code path.

## How to tell it's NOT a code problem
- A genuine block shows `403 Blocked by Security Policy` AFTER the scan runs, not "connection lost".
- The failure is identical (same message, same ~14s) no matter what changes are made to the repo/lockfile.
- Fixing real lockfile inconsistencies (orphaned root deps, missing entries) did NOT change the outcome.

**Why:** Spent a session chasing lockfile bugs (missing `vitest` entry; orphaned `puppeteer` /
`@playwright/test` refs left in the lockfile root after a dependency removal). Those were real bugs
worth fixing, but they were not the cause — the scanner crashes before reading them.

## How to apply
- Confirm the pattern with `getDeploymentBuild({buildId})` — if logs are ~4 lines ending in
  "connection lost", stop making code changes.
- Do not keep re-triggering publish; it will fail the same way.
- The only fix is Replit support (the scanner runs on their infra). Give them the deployment ID,
  the "connection lost" message, and the failure timeline.
