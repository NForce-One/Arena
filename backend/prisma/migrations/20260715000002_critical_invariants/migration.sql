-- Critical invariants the PRD requires the DATABASE to enforce (not just code).
-- Hand-written: Prisma's schema language cannot express these.
-- ⚠ This is why `prisma db push` is forbidden on this project — it would drop
--   everything in this file. Migrations only.

-- btree_gist lets a GiST index mix equality (ground_id =) with range overlap (&&).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── Invariant 1: no double-booked ground ─────────────────────────────────────
-- No two CONFIRMED bookings on the same ground may overlap in time. Enforced
-- by the database itself, so two simultaneous confirmations can never both
-- succeed — one gets a 23P01 exclusion violation.
ALTER TABLE "ground_bookings"
  ADD CONSTRAINT "ground_bookings_no_overlap"
  EXCLUDE USING gist (
    "ground_id" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  )
  WHERE (status = 'confirmed');

-- ── Invariant 2: a registration belongs to exactly one entity ────────────────
-- Either a player (user_id) or a team (team_id) — never both, never neither.
ALTER TABLE "registrations"
  ADD CONSTRAINT "registrations_one_entity"
  CHECK (num_nonnulls("user_id", "team_id") = 1);

-- ── Invariant 3: one ACTIVE registration per (tournament, entity) ────────────
-- Partial unique indexes: withdrawn rows don't count, so an entity can
-- re-register after withdrawing. Two simultaneous registration attempts can
-- never both succeed — one gets a 23505 unique violation.
CREATE UNIQUE INDEX "registrations_active_user_uq"
  ON "registrations" ("tournament_id", "user_id")
  WHERE status <> 'withdrawn' AND "user_id" IS NOT NULL;

CREATE UNIQUE INDEX "registrations_active_team_uq"
  ON "registrations" ("tournament_id", "team_id")
  WHERE status <> 'withdrawn' AND "team_id" IS NOT NULL;

-- ── Invariant 4 (note): no double-booked umpire ──────────────────────────────
-- Cross-table (assignment status lives in umpire_assignments, times live in
-- fixtures), so it cannot be an exclusion constraint. Enforced in the
-- umpires/fixtures service layer inside a transaction — see schema.prisma
-- comment on UmpireAssignment.
