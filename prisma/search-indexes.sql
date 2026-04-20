-- ─────────────────────────────────────────────────────────────────────────────
-- Search Indexing Strategy
--
-- Apply with: psql $DATABASE_URL -f prisma/search-indexes.sql
-- Or add the body of each block to a Prisma migration:
--   prisma migrate dev --create-only --name add_search_indexes
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── PHASE 1: Computed tsvector column (no app code change needed) ─────────────
--
-- Replaces inline to_tsvector() calls with a pre-computed, indexed column.
-- ts_rank() and @@ are ~10-100× faster once the GIN index is in place.
--
-- English dictionary handles stemming: "running" matches "run", "runs".
-- Add 'B' weight for username mentions if you store them separately.

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_search_vector_gin
  ON posts USING gin(search_vector);

-- After this migration, update search.service.ts searchPosts() to use:
--   WHERE p.search_vector @@ tsq.v
-- instead of:
--   WHERE to_tsvector('english', p.content) @@ tsq.v


-- ─── PHASE 2: Trigram indexes for fuzzy user / tag search ─────────────────────
--
-- pg_trgm enables ILIKE '%keyword%' to use an index (GIN or GIST).
-- Without it, display_name ILIKE '%alice%' is a full table scan.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS users_username_trgm
  ON users USING gin(username gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS users_display_name_trgm
  ON users USING gin(display_name gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS tags_name_trgm
  ON tags USING gin(name gin_trgm_ops);


-- ─── PHASE 3: Composite indexes for feed + trending queries ───────────────────
--
-- Trending query joins post_tags → posts filtered by created_at.
-- This partial index covers the hot path (non-deleted, recent posts).

CREATE INDEX CONCURRENTLY IF NOT EXISTS posts_created_at_not_deleted
  ON posts (created_at DESC)
  WHERE is_deleted = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS post_tags_tag_post
  ON post_tags (tag_id, post_id);


-- ─── PHASE 4 (optional): Meilisearch sync trigger ─────────────────────────────
--
-- If you adopt Meilisearch, remove the phases above (except pg_trgm for users)
-- and instead sync post/user documents via:
--
--   - An outbox table populated by a AFTER INSERT/UPDATE trigger
--   - A NestJS worker (BullMQ job) that reads the outbox and indexes to Meilisearch
--   - Meilisearch index config:
--
--     POST /indexes/posts/settings
--     {
--       "searchableAttributes": ["content"],
--       "filterableAttributes": ["authorId", "type", "isDeleted", "tags"],
--       "sortableAttributes": ["createdAt", "likeCount"],
--       "rankingRules": ["words", "typo", "proximity", "attribute", "sort", "exactness"]
--     }
--
--     POST /indexes/users/settings
--     {
--       "searchableAttributes": ["username", "displayName", "bio"],
--       "filterableAttributes": ["isActive", "isVerified"],
--       "sortableAttributes": ["createdAt"]
--     }
--
-- Meilisearch tradeoffs vs native PostgreSQL FTS:
--   PRO  — typo tolerance, faceted filtering, sub-10ms latency at scale
--   PRO  — no schema migrations; indexing is async and non-blocking
--   CON  — extra infrastructure (Docker container or cloud service)
--   CON  — eventual consistency (index lags writes by seconds)
--   CON  — need to handle index resyncs after bulk data changes
--
-- Recommendation: ship with native FTS (Phases 1-3), migrate to Meilisearch
-- once post volume exceeds ~1M rows or search latency becomes noticeable.
