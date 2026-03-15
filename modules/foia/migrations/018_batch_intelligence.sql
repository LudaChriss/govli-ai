-- Govli AI FOIA Module: Batch Request Optimization
-- Migration 018: AI-13 Batch Opportunities and Request Linking

-- Batch Opportunities Table
-- Track detected batch processing opportunities
CREATE TABLE IF NOT EXISTS "FoiaBatchOpportunities" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id VARCHAR(100) NOT NULL,
  tenant_id UUID NOT NULL,
  request_ids UUID[] NOT NULL,
  requester_ids TEXT[] NOT NULL,
  similarity_score DECIMAL(5, 4) NOT NULL,
  recommended_action VARCHAR(20) NOT NULL CHECK (
    recommended_action IN ('MERGE', 'PARALLEL', 'COORDINATE')
  ),
  actual_action VARCHAR(20) CHECK (
    actual_action IS NULL OR
    actual_action IN ('MERGE', 'PARALLEL', 'DISMISS')
  ),
  reason TEXT,
  primary_request_id UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE INDEX idx_foia_batch_opportunities_tenant ON "FoiaBatchOpportunities"(tenant_id);
CREATE INDEX idx_foia_batch_opportunities_group ON "FoiaBatchOpportunities"(group_id);
CREATE INDEX idx_foia_batch_opportunities_resolved ON "FoiaBatchOpportunities"(resolved_at)
  WHERE resolved_at IS NULL;
CREATE INDEX idx_foia_batch_opportunities_created ON "FoiaBatchOpportunities"(created_at DESC);
CREATE INDEX idx_foia_batch_opportunities_action ON "FoiaBatchOpportunities"(actual_action)
  WHERE actual_action IS NOT NULL;

-- Add batch-related columns to FoiaRequests
ALTER TABLE "FoiaRequests"
  ADD COLUMN IF NOT EXISTS merged_into_request_id UUID,
  ADD COLUMN IF NOT EXISTS parallel_group_id VARCHAR(100);

-- Foreign key for merged requests
ALTER TABLE "FoiaRequests"
  ADD CONSTRAINT foia_requests_merged_into_fk
  FOREIGN KEY (merged_into_request_id)
  REFERENCES "FoiaRequests"(id)
  ON DELETE SET NULL;

CREATE INDEX idx_foia_requests_merged_into ON "FoiaRequests"(merged_into_request_id)
  WHERE merged_into_request_id IS NOT NULL;

CREATE INDEX idx_foia_requests_parallel_group ON "FoiaRequests"(parallel_group_id)
  WHERE parallel_group_id IS NOT NULL;

-- View: Batch Savings Summary
CREATE OR REPLACE VIEW "BatchSavingsSummary" AS
SELECT
  DATE_TRUNC('month', created_at) as month,
  tenant_id,
  COUNT(*) FILTER (WHERE actual_action = 'MERGE') as merge_count,
  COUNT(*) FILTER (WHERE actual_action = 'PARALLEL') as parallel_count,
  COUNT(*) FILTER (WHERE actual_action = 'DISMISS') as dismiss_count,
  (COUNT(*) FILTER (WHERE actual_action = 'MERGE') * 3.5 +
   COUNT(*) FILTER (WHERE actual_action = 'PARALLEL') * 1.5) as estimated_hours_saved
FROM "FoiaBatchOpportunities"
WHERE actual_action IS NOT NULL
GROUP BY DATE_TRUNC('month', created_at), tenant_id
ORDER BY month DESC;

-- View: Merged Request Chains
CREATE OR REPLACE VIEW "MergedRequestChains" AS
WITH RECURSIVE request_chain AS (
  -- Base case: primary requests (not merged into anything)
  SELECT
    id,
    id as primary_id,
    confirmation_number,
    description,
    status,
    0 as depth
  FROM "FoiaRequests"
  WHERE merged_into_request_id IS NULL
    AND id IN (
      SELECT merged_into_request_id
      FROM "FoiaRequests"
      WHERE merged_into_request_id IS NOT NULL
    )

  UNION ALL

  -- Recursive case: secondary requests merged into primary
  SELECT
    r.id,
    rc.primary_id,
    r.confirmation_number,
    r.description,
    r.status,
    rc.depth + 1
  FROM "FoiaRequests" r
  INNER JOIN request_chain rc ON r.merged_into_request_id = rc.id
)
SELECT
  primary_id,
  COUNT(*) as total_merged_requests,
  ARRAY_AGG(confirmation_number ORDER BY depth) as confirmation_numbers,
  MAX(depth) as max_depth
FROM request_chain
GROUP BY primary_id;

-- View: Parallel Request Groups
CREATE OR REPLACE VIEW "ParallelRequestGroups" AS
SELECT
  parallel_group_id,
  COUNT(*) as request_count,
  ARRAY_AGG(id) as request_ids,
  ARRAY_AGG(confirmation_number) as confirmation_numbers,
  MIN(submitted_at) as first_submitted,
  MAX(submitted_at) as last_submitted
FROM "FoiaRequests"
WHERE parallel_group_id IS NOT NULL
GROUP BY parallel_group_id;

-- Comments for documentation
COMMENT ON TABLE "FoiaBatchOpportunities" IS 'AI-13: Detected batch processing opportunities';
COMMENT ON COLUMN "FoiaBatchOpportunities"."group_id" IS 'Unique identifier for batch group';
COMMENT ON COLUMN "FoiaBatchOpportunities"."recommended_action" IS 'AI-recommended action (MERGE/PARALLEL/COORDINATE)';
COMMENT ON COLUMN "FoiaBatchOpportunities"."actual_action" IS 'Staff-executed action (MERGE/PARALLEL/DISMISS)';
COMMENT ON COLUMN "FoiaRequests"."merged_into_request_id" IS 'For MERGE: points to primary request';
COMMENT ON COLUMN "FoiaRequests"."parallel_group_id" IS 'For PARALLEL: shared group identifier';
COMMENT ON VIEW "BatchSavingsSummary" IS 'Monthly batch processing time savings';
COMMENT ON VIEW "MergedRequestChains" IS 'Hierarchical view of merged request relationships';
COMMENT ON VIEW "ParallelRequestGroups" IS 'Groups of requests being processed in parallel';
