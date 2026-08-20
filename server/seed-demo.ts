/**
 * Seed script for AgoraX demo data.
 *
 * Creates: communities, users, proposals, sortition bodies, amendments, debates.
 * Run with: npx tsx server/seed-demo.ts
 */

import { db } from './db';
import {
  users,
  communities,
  communityMembers,
  platformSettings,
  proposals,
  proposalAmendments,
  proposalVotes,
  debateArguments,
  sortitionBodies,
  sortitionMembers,
  adminActions,
} from '../shared/schema';
import { eq } from 'drizzle-orm';
import { getVotingBackend } from './voting';

async function seed() {
  console.log('🌱 Seeding demo data...\n');

  // Idempotency: if the canonical demo admin already exists, assume the
  // demo data has already been seeded and exit cleanly so the entrypoint
  // can continue to start the server.
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, 'demo_admin'))
    .limit(1);
  if (existing.length > 0) {
    console.log('  ℹ️  Demo data already present — skipping seed.');
    process.exit(0);
  }

  // ─── Users ────────────────────────────────────────────────────────────────
  const [user1] = await db
    .insert(users)
    .values({
      username: 'demo_admin',
      name: 'Δημοκράτης Παπαδόπουλος',
      email: 'demo@agorax.gr',
      password: '$2b$10$dummyhash',
      isAdmin: true,
    })
    .returning();

  const [user2] = await db
    .insert(users)
    .values({
      username: 'demo_citizen1',
      name: 'Μαρία Κωνσταντίνου',
      email: 'maria@demo.gr',
      password: '$2b$10$dummyhash',
    })
    .returning();

  const [user3] = await db
    .insert(users)
    .values({
      username: 'demo_citizen2',
      name: 'Γιώργος Δημητρίου',
      email: 'giorgos@demo.gr',
      password: '$2b$10$dummyhash',
    })
    .returning();

  console.log(`  ✅ 3 users created`);

  // ─── Communities ──────────────────────────────────────────────────────────
  const [community1] = await db
    .insert(communities)
    .values({
      name: 'Δήμος Αθηναίων',
      description: 'Η κοινότητα του Δήμου Αθηναίων για συμμετοχική διακυβέρνηση',
      type: 'managed',
      governanceModel: 'hybrid',
      creatorId: user1.id,
      sortitionSize: 20,
      sortitionResponseHours: 72,
      democracyScore: '72',
      createdAt: new Date(),
    })
    .returning();

  const [community2] = await db
    .insert(communities)
    .values({
      name: 'Περιφέρεια Αττικής',
      description: 'Συμμετοχική πλατφόρμα για την Περιφέρεια Αττικής',
      type: 'managed',
      governanceModel: 'hybrid',
      creatorId: user1.id,
      sortitionSize: 30,
      sortitionResponseHours: 72,
      democracyScore: '85',
      createdAt: new Date(),
    })
    .returning();

  const [community3] = await db
    .insert(communities)
    .values({
      name: 'Πολίτες για το Περιβάλλον',
      description: 'Αυτόνομη κοινότητα πολιτών για περιβαλλοντικά θέματα',
      type: 'autonomous',
      governanceModel: 'no_admin',
      creatorId: user2.id,
      sortitionSize: 10,
      sortitionResponseHours: 48,
      democracyScore: '58',
      createdAt: new Date(),
    })
    .returning();

  // ─── General community (catch-all) ────────────────────────────────────────
  // The General community is the instance-wide default that every user
  // belongs to. It owns platform-wide settings as proposals (sortition body
  // size, validation model, etc.) so changes to the defaults go through the
  // same deliberation cycle as any other proposal.
  const [generalCommunity] = await db
    .insert(communities)
    .values({
      name: 'Γενική Κοινότητα',
      description: 'Η καθολική κοινότητα της πλατφόρμας — εδώ ψηφίζονται οι πλατφορμικές ρυθμίσεις.',
      type: 'managed',
      governanceModel: 'admin_team',
      creatorId: user1.id,
      adminIds: [user1.id],
      isGeneral: true,
      sortitionSize: 20,
      sortitionResponseHours: 72,
      democracyScore: '90',
      createdAt: new Date(),
    })
    .returning();

  console.log(`  ✅ 4 communities created (incl. General)`);

  const day = 24 * 60 * 60 * 1000;

  // ─── Community Members ────────────────────────────────────────────────────
  await db.insert(communityMembers).values([
    // General community: every user is a member; user1 is the admin.
    { communityId: generalCommunity.id, userId: user1.id, role: 'admin', joinedAt: new Date() },
    { communityId: generalCommunity.id, userId: user2.id, role: 'member', joinedAt: new Date() },
    { communityId: generalCommunity.id, userId: user3.id, role: 'member', joinedAt: new Date() },
    { communityId: community1.id, userId: user1.id, role: 'founder', joinedAt: new Date() },
    { communityId: community1.id, userId: user2.id, role: 'member', joinedAt: new Date() },
    { communityId: community1.id, userId: user3.id, role: 'member', joinedAt: new Date() },
    { communityId: community2.id, userId: user1.id, role: 'founder', joinedAt: new Date() },
    { communityId: community2.id, userId: user2.id, role: 'member', joinedAt: new Date() },
    { communityId: community3.id, userId: user2.id, role: 'founder', joinedAt: new Date() },
    { communityId: community3.id, userId: user3.id, role: 'member', joinedAt: new Date() },
  ]);

  console.log(`  ✅ 10 community memberships created`);

  // ─── Platform Settings (καθολικές ρυθμίσεις) ───────────────────────────────
  await db.insert(platformSettings).values([
    {
      key: 'min_participation_pct',
      value: '10',
      description: 'Ελάχιστο ποσοστό συμμετοχής (%) για να θεωρηθεί έγκυρη μια ψηφοφορία',
      lastChangedBy: user1.id,
    },
    {
      key: 'sortition_body_size',
      value: '20',
      description: 'Προεπιλεγμένο μέγεθος κληρωτού σώματος',
      lastChangedBy: user1.id,
    },
    {
      key: 'proposal_validation_model',
      value: 'nvidia/nemotron-3-nano-30b-a3b:free',
      description: 'Μοντέλο LLM για την αξιολόγηση προτάσεων',
      lastChangedBy: user1.id,
    },
    {
      key: 'amendment_similarity_threshold',
      value: '0.7',
      description: 'Κατώφλι ομοιότητας για ομαδοποίηση διπλών αντιπροτάσεων',
      lastChangedBy: user1.id,
    },
  ]);

  console.log(`  ✅ 4 platform settings seeded`);

  // ─── Platform Setting Proposals (στη Γενική Κοινότητα) ────────────────────
  // Each setting is mirrored as a proposal so members can move the value
  // through the standard deliberation lifecycle. They start as drafts —
  // the demo data deliberately avoids advancing them so the General
  // community always has open governance proposals to work on.
  await db.insert(proposals).values([
    {
      communityId: generalCommunity.id,
      authorId: user1.id,
      question: 'Ελάχιστο ποσοστό συμμετοχής στις ψηφοφορίες',
      solution: 'Ορισμός ελάχιστου ποσοστού συμμετοχής στο 10% των μελών για κάθε δεσμευτική ψηφοφορία.',
      status: 'draft',
      category: 'platform_settings',
      createdAt: new Date(Date.now() - 1 * day),
    },
    {
      communityId: generalCommunity.id,
      authorId: user1.id,
      question: 'Προεπιλεγμένο μέγεθος κληρωτού σώματος',
      solution: 'Ορισμός προεπιλεγμένου μεγέθους κληρωτού σώματος στα 20 μέλη.',
      status: 'draft',
      category: 'platform_settings',
      createdAt: new Date(Date.now() - 1 * day),
    },
    {
      communityId: generalCommunity.id,
      authorId: user1.id,
      question: 'Μοντέλο LLM για αξιολόγηση προτάσεων',
      solution: 'Χρήση του NVIDIA Nemotron (free tier) για την προ-αξιολόγηση προτάσεων.',
      status: 'draft',
      category: 'platform_settings',
      createdAt: new Date(Date.now() - 1 * day),
    },
    {
      communityId: generalCommunity.id,
      authorId: user1.id,
      question: 'Κατώφλι ομοιότητας αντιπροτάσεων',
      solution: 'Ορισμός κατωφλίου ομοιότητας (TF-IDF cosine) στο 0.7 για ομαδοποίηση διπλών αντιπροτάσεων.',
      status: 'draft',
      category: 'platform_settings',
      createdAt: new Date(Date.now() - 1 * day),
    },
  ]);

  console.log(`  ✅ 4 platform-setting proposals seeded in General community`);

  // ─── Proposals ────────────────────────────────────────────────────────────
  // Seed one proposal per canonical lifecycle state defined in
  // server/utils/proposal-state-machine.ts so the demo dashboard exercises
  // every branch of the UI:
  //   draft → review → author_review → community_signal →
  //     sortition_synthesis → voting → decided / archived

  await db.insert(proposals).values({
    communityId: community1.id,
    authorId: user2.id,
    question: 'Δημιουργία γειτονιάς χωρίς αυτοκίνητα στο κέντρο της Αθήνας',
    solution: 'Πιλοτικός πεζόδρομος σε 4 οικοδομικά τετράγωνα γύρω από την πλατεία Εξαρχείων, με σταδιακή επέκταση μετά από αξιολόγηση 12 μηνών.',
    status: 'draft',
    createdAt: new Date(Date.now() - 1 * day),
  });

  await db.insert(proposals).values({
    communityId: community1.id,
    authorId: user3.id,
    question: 'Αναβάθμιση δημοτικών παιδικών χαρών με προσβάσιμο εξοπλισμό',
    solution: 'Πρόγραμμα ανακαίνισης 25 παιδικών χαρών εντός 2 ετών με εξοπλισμό προσβάσιμο σε παιδιά με κινητικές δυσκολίες.',
    status: 'review',
    llmScore: '78',
    llmFeedback: 'Ξεκάθαρος στόχος και χρονοδιάγραμμα. Χρειάζεται εκτίμηση κόστους και πηγής χρηματοδότησης.',
    llmValidatedAt: new Date(Date.now() - 1 * day),
    createdAt: new Date(Date.now() - 2 * day),
  });

  await db.insert(proposals).values({
    communityId: community1.id,
    authorId: user2.id,
    question: 'Επέκταση ωραρίου δημοτικών βιβλιοθηκών το Σαββατοκύριακο',
    solution: 'Παροχή πρόσβασης στις δημοτικές βιβλιοθήκες κάθε Σάββατο και Κυριακή, 10:00–18:00, με μερική στελέχωση από εθελοντές.',
    status: 'author_review',
    llmScore: '81',
    llmFeedback: 'Χρήσιμη υπηρεσία. Διευκρινίστε το πλαίσιο εθελοντισμού και τυχόν πρόσθετο κόστος.',
    llmValidatedAt: new Date(Date.now() - 4 * day),
    createdAt: new Date(Date.now() - 5 * day),
  });

  const [proposal1] = await db
    .insert(proposals)
    .values({
      communityId: community1.id,
      authorId: user2.id,
      question: 'Εγκατάσταση ηλεκτρικών σταθμών φόρτισης σε δημόσιους χώρους',
      solution: 'Ο Δήμος Αθηναίων θα εγκαταστήσει 50 ηλεκτρικούς σταθμούς φόρτισης σε κεντρικές περιοχές της Αθήνας έως το 2027.',
      status: 'community_signal',
      llmScore: '72',
      llmFeedback: 'Η πρόταση είναι καλά δομημένη με σαφή στόχο και χρονοδιάγραμμα. Προτείνεται να προστεθούν λεπτομέρειες για τη χρηματοδότηση και τις τοποθεσίες.',
      llmValidatedAt: new Date(Date.now() - 6 * day),
      createdAt: new Date(Date.now() - 7 * day),
    })
    .returning();

  const [proposal2] = await db
    .insert(proposals)
    .values({
      communityId: community1.id,
      authorId: user3.id,
      question: 'Δημιουργία ποδηλατοδρόμων στη Θεσσαλονίκη',
      solution: 'Δημιουργία δικτύου 120 χλμ ποδηλατοδρόμων στη Θεσσαλονίκη με προϋπολογισμό 15 εκατ. ευρώ.',
      status: 'sortition_synthesis',
      llmScore: '85',
      llmFeedback: 'Εξαιρετικά τεκμηριωμένη πρόταση με συγκεκριμένο προϋπολογισμό και έκταση. Απαιτείται επιπλέον τεκμηρίωση για τις πηγές χρηματοδότησης.',
      llmValidatedAt: new Date(Date.now() - 2 * day),
      createdAt: new Date(Date.now() - 3 * day),
    })
    .returning();

  const [proposal3] = await db
    .insert(proposals)
    .values({
      communityId: community2.id,
      authorId: user2.id,
      question: 'Μείωση των αέριων ρύπων στην Αττική',
      solution: 'Εισαγωγή ζώνης χαμηλών εκπομπών στην Αττική με σταδιακή εφαρμογή 2025-2030.',
      status: 'decided',
      llmScore: '92',
      llmFeedback: 'Υψηλής ποιότητας πρόταση με σαφές χρονοδιάγραμμα και μετρήσιμους στόχους.',
      llmValidatedAt: new Date(Date.now() - 13 * day),
      createdAt: new Date(Date.now() - 14 * day),
    })
    .returning();

  const [proposal4] = await db
    .insert(proposals)
    .values({
      communityId: community3.id,
      authorId: user3.id,
      question: 'Προστασία των υγροτόπων της Μεσογαίας',
      solution: 'Δημιουργία προστατευόμενης περιοχής NATURA 2000 για τα υγρότοπα της Μεσογαίας με πρόγραμμα παρακολούθησης βιοποικιλότητας.',
      status: 'voting',
      llmScore: '68',
      llmFeedback: 'Η πρόταση έχει περιβαλλοντική αξία αλλά χρειάζεται περισσότερη τεκμηρίωση για τις οικονομικές επιπτώσεις στους κατοίκους της περιοχής.',
      llmValidatedAt: new Date(Date.now() - 4 * day),
      createdAt: new Date(Date.now() - 5 * day),
    })
    .returning();

  await db.insert(proposals).values({
    communityId: community3.id,
    authorId: user2.id,
    question: 'Καθολική απαγόρευση κυνηγιού στην Αττική',
    solution: 'Πλήρης απαγόρευση κυνηγετικής δραστηριότητας σε όλη την Αττική χωρίς εξαιρέσεις ή μεταβατική περίοδο.',
    status: 'archived',
    llmScore: '34',
    llmFeedback: 'Η πρόταση χρειάζεται μεγαλύτερη τεκμηρίωση επιπτώσεων και διαβούλευση με εμπλεκόμενες ομάδες πριν προχωρήσει.',
    llmValidatedAt: new Date(Date.now() - 20 * day),
    createdAt: new Date(Date.now() - 21 * day),
  });

  console.log(`  ✅ 8 proposals created (one per lifecycle state)`);

  // ─── Amendments ───────────────────────────────────────────────────────────
  await db.insert(proposalAmendments).values([
    {
      proposalId: proposal1.id,
      authorId: user3.id,
      type: 'improvement',
      text: 'Πρόταση επέκτασης: Να συμπεριληφθούν και σταθμοί φόρτισης σε προαστιακούς σταθμούς.',
      status: 'pending',
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
    {
      proposalId: proposal2.id,
      authorId: user2.id,
      type: 'improvement',
      text: 'Πρόταση τροποποίησης: Να προστεθεί πρόγραμμα εκπαίδευσης ποδηλασίας για παιδιά σχολείων.',
      status: 'accepted',
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
  ]);

  console.log(`  ✅ 2 amendments created`);

  // ─── Debate Arguments ─────────────────────────────────────────────────────
  await db.insert(debateArguments).values([
    {
      proposalId: proposal4.id,
      authorId: user2.id,
      side: 'for',
      text: 'Η προστασία των υγροτόπων είναι κρίσιμη για τη βιοποικιλότητα και την προσαρμογή στην κλιματική αλλαγή.',
      supportCount: 12,
      oppositionCount: 3,
      createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      proposalId: proposal4.id,
      authorId: user3.id,
      side: 'against',
      text: 'Η δημιουργία προστατευόμενης περιοχής μπορεί να περιορίσει την οικονομική δραστηριότητα των κατοίκων.',
      supportCount: 5,
      oppositionCount: 8,
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
  ]);

  console.log(`  ✅ 2 debate arguments created`);

  // ─── Proposal Votes (final ratification) ──────────────────────────────────
  // Voters must be members of the proposal's community (cf. routes.ts cast
  // handler). proposal4 lives in community3 (members: user2, user3). proposal3
  // lives in community2 (members: user1, user2). Votes go through the
  // configured VotingBackend so the seed exercises the same path as the
  // app — and so demo data is a valid election regardless of backend.
  const voting = getVotingBackend();
  await voting.castSignedBallot({ proposalId: proposal4.id, userId: user2.id, choice: 'yes' });
  await voting.castSignedBallot({ proposalId: proposal4.id, userId: user3.id, choice: 'abstain' });
  await voting.castSignedBallot({ proposalId: proposal3.id, userId: user1.id, choice: 'yes' });
  await voting.castSignedBallot({ proposalId: proposal3.id, userId: user2.id, choice: 'yes' });

  console.log(`  ✅ 4 proposal votes recorded via ${voting.name} backend`);

  // ─── Sortition Bodies ─────────────────────────────────────────────────────
  const [sortition1] = await db
    .insert(sortitionBodies)
    .values({
      communityId: community1.id,
      purpose: 'scoring',
      proposalId: proposal2.id,
      size: 5,
      responseHours: 72,
      status: 'active',
      selectedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    })
    .returning();

  await db.insert(sortitionMembers).values([
    { bodyId: sortition1.id, userId: user1.id, responded: true, score: '7', scoredAt: new Date() },
    { bodyId: sortition1.id, userId: user2.id, responded: false },
    { bodyId: sortition1.id, userId: user3.id, responded: true, score: '9', scoredAt: new Date() },
  ]);

  console.log(`  ✅ 1 sortition body with 3 members created`);

  // ─── Admin Actions (skipped — table not in migrations yet) ────────────────
  // await db.insert(adminActions).values([...]);
  // console.log(`  ✅ 2 admin actions logged`);

  console.log('\n✅ Demo data seeded successfully!\n');
  console.log('Demo credentials:');
  console.log('  Admin: demo_admin / (any password)');
  console.log('  Citizen: demo_citizen1 / (any password)');
  console.log('  Citizen: demo_citizen2 / (any password)');
  console.log('\nCommunities:');
  console.log(`  - Δήμος Αθηναίων (ID: ${community1.id})`);
  console.log(`  - Περιφέρεια Αττικής (ID: ${community2.id})`);
  console.log(`  - Πολίτες για το Περιβάλλον (ID: ${community3.id})`);

  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});