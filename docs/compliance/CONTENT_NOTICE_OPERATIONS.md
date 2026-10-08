# Content notices: operating the public review channel

Version: 2026-10-08. This documents the notice workflow and its operational limits; it is not a legal compliance certification.

The public `/report-content` page accepts a precise local content link, an explanation, contact details and a good-faith declaration without a platform account. The child-safety category permits omission of identifying details. It accepts no attachments. A submission creates a durable case before attempting email and returns a reference and private tracking key. Only a hash of that key is stored. Public tracking reveals status and the case decision after checking the reference/key pair, without reporter or reviewer identity.

## Before release

Apply `migrations/0060_content_notices.sql` with the normal PostgreSQL migration procedure before starting the new server. These standalone migrations are not automatically applied on startup, and the historical Drizzle journal does not cover the current set. Build and restart through the existing release process.

Verify `/report-content` and its footer link while signed out, and `/admin/content-notices` with an individually assigned platform admin account. The backend checks `requireAdmin`; a community administrator role alone does not grant access. Configure the existing transactional SMTP service and check the outcome of a test notice using an address controlled by the tester. Tests must stub the mail transport and never contact real recipients.

Signed-in members see the versioned terms/privacy update notice. Dismissing it acknowledges only that the notice was shown; it does not record consent or agreement. The existing recorded consent version is not rewritten.

## Handling a case

1. A named platform administrator checks the inbox regularly and triages urgent threats immediately. Set the case to `under_review`; identify the specific item and its context without distributing the complaint unnecessarily. The channel does not automatically remove content, and legal handling is independent of community voting.
2. Distinguish lawful criticism from potentially unlawful conduct. Record the facts and the legal or terms basis. Seek legal assessment where required. Follow applicable authority orders and escalation duties; do not wait for a community vote when action is legally required.
3. Perform any necessary moderation or operator action before selecting `action_taken`. That option records a completed measure; it does not itself hide, delete or restrict the reported item. Verify the result while signed out and through direct links, downloads, feeds and share previews. Record the actual measure and scope. If no measure is warranted, select `no_action`; if further information is needed, select `more_information` and explain what is missing.
4. Identify the affected author's account where known and use the decision's affected-user field to communicate the reason and measure. Never place the reporter's name, email or private explanation into the decision. Reporter notifications contain the case reference; reasons are available through private tracking. Check delivery status. Retry failed or unavailable delivery after resolving SMTP configuration, or use another lawful contact channel and document it. SMTP acceptance is not proof of inbox delivery.
5. A reporter can request review through private tracking after a decision. An affected author can submit a separate notice with the original reference and their reasons, without needing the reporter's tracking key. A related reference grants no access to the original case. Review the new grounds and record a new reasoned decision.

Case history is the durable record of review and decisions. Privileged actions also use the platform admin audit log. Restrict database/backups to authorized operators. Do not log notice bodies, addresses or tracking keys; the key belongs in a URL fragment or POST body, never an API query string.

## Existing removal limits

The inbox does not introduce a universal content restriction system. Existing controls have limits that the reviewer must consider before claiming a measure is complete:

- Archiving a proposal keeps its text available. Ordinary deletion refuses proposals that already have votes; amendments and debate content do not have independent legal-hide flags.
- Forum hiding removes text from forum views, but ordinary community moderation and restoration can alter that state. A platform legal decision needs operator follow-through independent of those votes.
- Media `hidden` status removes listings but the existing public `/media` static handler can still serve file and thumbnail URLs. Metadata hiding alone does not establish byte-access removal, and old cache copies may survive.
- Surveys have no separate legal restriction state.

Where the ordinary UI cannot enforce a required measure, the operator must apply and verify an appropriate server/database/file-access intervention with an audit record. Do not label a case `action_taken` until that has occurred. A future independent restriction registry should cover direct reads, lists, derived content, byte access and restoration attempts.

## Retention review

At a regular manual review of closed cases, remove or anonymize unnecessary contact details and complaint material when review and legal-claim needs have ended. Document the reason for any continued retention, including authority orders or proceedings. The workflow has no automatic retention purge; operators must include case records, delivery history and backups in their existing retention process. Keep access and erasure requests separate from public disclosure of case data.

Legal references: [DSA, Articles 6–8, 14 and 16–18](https://eur-lex.europa.eu/eli/reg/2022/2065/oj/eng), [GDPR, Articles 5–6 and 13](https://eur-lex.europa.eu/eli/reg/2016/679).
