-- Announcements can target several roles at once (a union, not "must hold
-- all"), not just one — the admin UI previously could only pick a single
-- role per announcement even though the eligibility check underneath
-- (`users.listIds(role)`) always operated per-role anyway.
ALTER TABLE "announcements" ADD COLUMN "target_roles" "RoleName"[] NOT NULL DEFAULT '{}';

UPDATE "announcements" SET "target_roles" = ARRAY["target_role"] WHERE "target_role" IS NOT NULL;

ALTER TABLE "announcements" DROP COLUMN "target_role";
