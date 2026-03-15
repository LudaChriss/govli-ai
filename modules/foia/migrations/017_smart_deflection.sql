-- Govli AI FOIA Module: Smart Reading Room Deflection
-- Migration 017: AI-12 Vector Embeddings and Deflection Tracking

-- Enable pgvector extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Deflection Log Table
-- Track all deflection attempts and outcomes
CREATE TABLE IF NOT EXISTS "FoiaDeflectionLog" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  search_text TEXT NOT NULL,
  match_count INT DEFAULT 0,
  top_score DECIMAL(5, 4) DEFAULT 0.0,
  matched_record_id TEXT,
  outcome VARCHAR(20) CHECK (
    outcome IS NULL OR
    outcome IN ('downloaded', 'dismissed', 'submitted_anyway')
  ),
  outcome_recorded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_foia_deflection_log_tenant ON "FoiaDeflectionLog"(tenant_id);
CREATE INDEX idx_foia_deflection_log_created ON "FoiaDeflectionLog"(created_at DESC);
CREATE INDEX idx_foia_deflection_log_outcome ON "FoiaDeflectionLog"(outcome)
  WHERE outcome IS NOT NULL;
CREATE INDEX idx_foia_deflection_log_matched_record ON "FoiaDeflectionLog"(matched_record_id)
  WHERE matched_record_id IS NOT NULL;

-- Reading Room Table with Vector Embedding
CREATE TABLE IF NOT EXISTS "FoiaReadingRoom" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  agency_id UUID,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  url TEXT,
  document_type VARCHAR(100),
  published_date DATE,
  embedding vector(1536),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_foia_reading_room_tenant ON "FoiaReadingRoom"(tenant_id);
CREATE INDEX idx_foia_reading_room_agency ON "FoiaReadingRoom"(agency_id)
  WHERE agency_id IS NOT NULL;

-- Vector similarity index using HNSW (Hierarchical Navigable Small World)
CREATE INDEX idx_foia_reading_room_embedding ON "FoiaReadingRoom"
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- FAQ Entries Table with Vector Embedding
CREATE TABLE IF NOT EXISTS "FoiaFaqEntries" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  agency_id UUID,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(100),
  view_count INT DEFAULT 0,
  embedding vector(1536),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_foia_faq_entries_tenant ON "FoiaFaqEntries"(tenant_id);
CREATE INDEX idx_foia_faq_entries_agency ON "FoiaFaqEntries"(agency_id)
  WHERE agency_id IS NOT NULL;
CREATE INDEX idx_foia_faq_entries_category ON "FoiaFaqEntries"(category)
  WHERE category IS NOT NULL;

-- Vector similarity index for FAQ entries
CREATE INDEX idx_foia_faq_entries_embedding ON "FoiaFaqEntries"
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- Add embedding column to existing FoiaRequests table
ALTER TABLE "FoiaRequests"
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Vector similarity index for requests
CREATE INDEX IF NOT EXISTS idx_foia_requests_embedding ON "FoiaRequests"
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

-- View: Deflection Success Metrics
CREATE OR REPLACE VIEW "DeflectionSuccessMetrics" AS
SELECT
  DATE_TRUNC('day', created_at) as date,
  tenant_id,
  COUNT(*) as total_searches,
  COUNT(*) FILTER (WHERE match_count > 0) as searches_with_matches,
  COUNT(*) FILTER (WHERE outcome = 'downloaded') as successful_deflections,
  COUNT(*) FILTER (WHERE outcome = 'submitted_anyway') as submissions_despite_matches,
  COUNT(*) FILTER (WHERE outcome = 'dismissed') as dismissed,
  AVG(top_score) as avg_top_score,
  AVG(match_count) as avg_match_count
FROM "FoiaDeflectionLog"
GROUP BY DATE_TRUNC('day', created_at), tenant_id
ORDER BY date DESC;

-- View: Most Valuable Deflection Records
CREATE OR REPLACE VIEW "MostValuableDeflectionRecords" AS
SELECT
  dl.matched_record_id,
  rr.title,
  rr.document_type,
  COUNT(*) as deflection_count,
  COUNT(*) FILTER (WHERE dl.outcome = 'downloaded') as download_count,
  AVG(dl.top_score) as avg_similarity_score
FROM "FoiaDeflectionLog" dl
LEFT JOIN "FoiaReadingRoom" rr ON rr.id::text = dl.matched_record_id
WHERE dl.matched_record_id IS NOT NULL
  AND dl.outcome IS NOT NULL
GROUP BY dl.matched_record_id, rr.title, rr.document_type
ORDER BY deflection_count DESC;

-- Comments for documentation
COMMENT ON TABLE "FoiaDeflectionLog" IS 'AI-12: Track deflection searches and outcomes for analytics';
COMMENT ON TABLE "FoiaReadingRoom" IS 'Public records and documents available for deflection matching';
COMMENT ON TABLE "FoiaFaqEntries" IS 'Frequently asked questions with semantic search support';
COMMENT ON COLUMN "FoiaDeflectionLog"."match_count" IS 'Number of similar records found above threshold';
COMMENT ON COLUMN "FoiaDeflectionLog"."top_score" IS 'Highest similarity score (0.0-1.0) from search results';
COMMENT ON COLUMN "FoiaDeflectionLog"."outcome" IS 'User action: downloaded, dismissed, or submitted_anyway';
COMMENT ON COLUMN "FoiaReadingRoom"."embedding" IS 'Vector embedding (1536 dims) for semantic search';
COMMENT ON COLUMN "FoiaFaqEntries"."embedding" IS 'Vector embedding (1536 dims) for semantic search';
COMMENT ON COLUMN "FoiaRequests"."embedding" IS 'Vector embedding (1536 dims) for similarity matching';
COMMENT ON VIEW "DeflectionSuccessMetrics" IS 'Daily deflection performance metrics';
COMMENT ON VIEW "MostValuableDeflectionRecords" IS 'Reading room records that most frequently deflect requests';
