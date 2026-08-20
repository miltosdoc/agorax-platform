-- AgoraX Demo Data Seed
-- Creates sample users, communities, and memberships for local review.
-- Proposal/deliberation rows are intentionally not seeded: proposals should
-- be created through the real product flow, not fake staged mockups.

-- Demo Users
INSERT INTO users (id, username, name, email, password) VALUES
  (1, 'dimitris', 'Δημήτρης Παπαδόπουλος', 'dimitris@agorax.gr', '$2b$10$demo'),
  (2, 'elena', 'Ελένα Παπαδοπούλου', 'elena@agorax.gr', '$2b$10$demo'),
  (3, 'giorgos', 'Γιώργος Νικολάου', 'giorgos@agorax.gr', '$2b$10$demo'),
  (4, 'maria', 'Μαρία Κωνσταντίνου', 'maria@agorax.gr', '$2b$10$demo'),
  (5, 'kostas', 'Κώστας Αλεβίζος', 'kostas@agorax.gr', '$2b$10$demo')
ON CONFLICT DO NOTHING;

-- Demo Communities
INSERT INTO communities (id, name, description, type, governance_model, creator_id, created_at, sortition_size, democracy_score) VALUES
  (1, 'Δήμος Αθηναίων', 'Η ψηφιακή κοινότητα των Αθηναίων πολιτών για συμμετοχική διακυβέρνηση', 'managed', 'admin_founded', 1, NOW() - interval '30 days', 15, 72.5),
  (2, 'Περιβάλλον & Κλίμα', 'Κοινότητα για περιβαλλοντικές πολιτικές και κλιματική δράση', 'autonomous', 'no_admin', 2, NOW() - interval '25 days', 10, 85.0),
  (3, 'Εκπαίδευση Αύριο', 'Συζήτηση για το μέλλον της εκπαίδευσης στην Ελλάδα', 'hybrid', 'admin_guided', 4, NOW() - interval '20 days', 12, 67.3)
ON CONFLICT DO NOTHING;

-- Community Members
INSERT INTO community_members (community_id, user_id, role, joined_at) VALUES
  (1, 1, 'founder', NOW() - interval '30 days'),
  (1, 2, 'member', NOW() - interval '28 days'),
  (1, 3, 'member', NOW() - interval '25 days'),
  (1, 4, 'admin', NOW() - interval '20 days'),
  (1, 5, 'member', NOW() - interval '15 days'),
  (2, 2, 'founder', NOW() - interval '25 days'),
  (2, 1, 'member', NOW() - interval '20 days'),
  (2, 3, 'member', NOW() - interval '18 days'),
  (2, 5, 'member', NOW() - interval '12 days'),
  (3, 4, 'founder', NOW() - interval '20 days'),
  (3, 1, 'member', NOW() - interval '15 days'),
  (3, 2, 'member', NOW() - interval '12 days'),
  (3, 3, 'admin', NOW() - interval '10 days')
ON CONFLICT DO NOTHING;

-- Fix sequences
SELECT setval('users_id_seq', (SELECT COALESCE(MAX(id), 1) FROM users));
SELECT setval('communities_id_seq', (SELECT COALESCE(MAX(id), 1) FROM communities));
SELECT setval('community_members_id_seq', (SELECT COALESCE(MAX(id), 1) FROM community_members));
