# B3 Verification — DB-Grant Enforcement

**Date:** 2026-05-31
**Committer:** Hermes agent (on behalf of Miltos)

## What was done

Created a dedicated PostgreSQL role (`agorax_vote`) for the anonymous vote path
that physically cannot read identity tables. Separation enforced by PostgreSQL
grants, not code convention.

## REVOKE/GRANT statements

```sql
-- Create the vote-path role
CREATE ROLE agorax_vote WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- Revoke ALL default privileges
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM agorax_vote;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM agorax_vote;

-- Grant ONLY vote-side table access
GRANT SELECT, INSERT ON proposal_votes TO agorax_vote;
GRANT SELECT ON proposals TO agorax_vote;
GRANT SELECT ON blind_sig_keys TO agorax_vote;

-- Explicitly REVOKE identity tables (defense in depth)
REVOKE ALL ON blind_sig_issuance FROM agorax_vote;
REVOKE ALL ON users FROM agorax_vote;
REVOKE ALL ON user_sessions FROM agorax_vote;
REVOKE ALL ON account_activity FROM agorax_vote;
REVOKE ALL ON user_consents FROM agorax_vote;
REVOKE ALL ON community_members FROM agorax_vote;
REVOKE ALL ON groups FROM agorax_vote;
REVOKE ALL ON group_members FROM agorax_vote;

-- Grant schema usage and database connect
GRANT USAGE ON SCHEMA public TO agorax_vote;
GRANT CONNECT ON DATABASE agorax TO agorax_vote;
```

## Verification output

### agorax_vote CAN read proposal_votes (expected)

```
$ psql -h /tmp -U agorax_vote -d agorax -c "SELECT count(*) FROM proposal_votes;"
 count
-------
     1
(1 row)
```

### agorax_vote CANNOT read blind_sig_issuance (expected — permission denied)

```
$ psql -h /tmp -U agorax_vote -d agorax -c "SELECT * FROM blind_sig_issuance LIMIT 1;"
ERROR:  permission denied for table blind_sig_issuance
```

### agorax_vote CANNOT read users (expected — permission denied)

```
$ psql -h /tmp -U agorax_vote -d agorax -c "SELECT * FROM users LIMIT 1;"
ERROR:  permission denied for table users
```

### agorax_vote CANNOT read account_activity (expected — permission denied)

```
$ psql -h /tmp -U agorax_vote -d agorax -c "SELECT * FROM account_activity LIMIT 1;"
ERROR:  permission denied for table account_activity
```

## Code changes

1. `server/db.ts` — added `voteDb` (second connection pool using VOTE_DATABASE_URL)
2. `server/utils/vote-chain.ts` — `castAnonymousVoteWithChain` accepts optional `database` parameter
3. `server/routers/proposals.ts` — anonymous-vote handler passes `voteDb` to the function
4. `docker-compose.yml` — added `VOTE_DATABASE_URL` env var

## Result

B3 is now **grant-enforced**. The DB itself refuses the read — convention no
longer load-bearing. The anonymous vote path runs under `agorax_vote` which
cannot read `blind_sig_issuance`, `users`, `account_activity`, or any other
identity table.

**Status:** ✅ CLOSED — structural, not accepted risk.
