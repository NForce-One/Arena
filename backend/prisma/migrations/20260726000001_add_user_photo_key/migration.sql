-- Profile photo: we store the STORAGE KEY, never a URL. Read URLs are minted
-- signed-and-expiring at request time (see adapters/storage), so no durable
-- link to the object is ever persisted.
-- Nullable + no default, so existing rows stay valid with no backfill.
ALTER TABLE "users" ADD COLUMN "photo_key" TEXT;
