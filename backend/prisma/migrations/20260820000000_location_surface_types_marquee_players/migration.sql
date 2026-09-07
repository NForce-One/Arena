-- Optional city/state location, alongside the existing free-text fields —
-- both nullable, no backfill needed since existing tournaments simply have
-- no location on file.
ALTER TABLE "tournaments"
  ADD COLUMN "location_city" TEXT,
  ADD COLUMN "location_state" TEXT;

-- Surface types (Turf, Astro Turf, …) are an organizer-owned catalog, same
-- "organizer_id NULL = permanent platform default" idiom as age_groups —
-- EXCEPT this one supports a real, permanent delete (not hide): a surface
-- type carries no eligibility semantics, so there's no historical-data
-- reason to keep a withdrawn one around. The FK below is ON DELETE
-- RESTRICT, which is what actually enforces "can't delete one a tournament
-- still uses" — the service never needs its own check-then-delete race.
CREATE TABLE "surface_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizer_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "surface_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "surface_types_name_key" ON "surface_types"("name");

ALTER TABLE "surface_types"
  ADD CONSTRAINT "surface_types_organizer_id_fkey"
  FOREIGN KEY ("organizer_id") REFERENCES "users"("id");

ALTER TABLE "tournaments"
  ADD COLUMN "surface_type_id" TEXT,
  ADD COLUMN "max_marquee_players" INTEGER;

ALTER TABLE "tournaments"
  ADD CONSTRAINT "tournaments_surface_type_id_fkey"
  FOREIGN KEY ("surface_type_id") REFERENCES "surface_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
