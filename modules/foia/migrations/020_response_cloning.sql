/**
 * AI-15: Response Cloning Migration
 *
 * Creates tables and indexes for one-click response cloning
 */

-- =====================================================
-- Table: FoiaResponseClones
-- =====================================================
-- Tracks response cloning from source to target requests

CREATE TABLE IF NOT EXISTS "FoiaResponseClones" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES "FoiaTenants"(id) ON DELETE CASCADE,
  source_request_id UUID NOT NULL REFERENCES "FoiaRequests"(id) ON DELETE CASCADE,
  target_request_id UUID NOT NULL REFERENCES "FoiaRequests"(id) ON DELETE CASCADE,
  similarity_score DECIMAL(5,4) NOT NULL, -- 0.0000 to 1.0000
  clone_status VARCHAR(20) NOT NULL CHECK (clone_status IN ('SUGGESTED', 'EXECUTED', 'APPROVED', 'REJECTED')),
  edit_delta_pct DECIMAL(5,4), -- How much officer modified the clone (0.00 to 1.00)
  rejection_reason TEXT,
  cloned_at TIMESTAMP WITH TIME ZONE,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_foia_response_clones_target
  ON "FoiaResponseClones"(target_request_id);

CREATE INDEX idx_foia_response_clones_source
  ON "FoiaResponseClones"(source_request_id);

CREATE INDEX idx_foia_response_clones_tenant
  ON "FoiaResponseClones"(tenant_id);

CREATE INDEX idx_foia_response_clones_status
  ON "FoiaResponseClones"(clone_status);

CREATE INDEX idx_foia_response_clones_cloned_at
  ON "FoiaResponseClones"(cloned_at DESC) WHERE clone_status IN ('EXECUTED', 'APPROVED');

-- Composite index for tenant + status queries
CREATE INDEX idx_foia_response_clones_tenant_status
  ON "FoiaResponseClones"(tenant_id, clone_status);

-- =====================================================
-- Add columns to FoiaRequests for clone tracking
-- =====================================================

ALTER TABLE "FoiaRequests"
  ADD COLUMN IF NOT EXISTS description_embedding vector(1536);

COMMENT ON COLUMN "FoiaRequests".description_embedding IS
  'Semantic embedding of request description for clone detection (reuses pgvector from AI-12)';

-- Index for similarity search
CREATE INDEX IF NOT EXISTS idx_foia_requests_embedding
  ON "FoiaRequests" USING hnsw (description_embedding vector_cosine_ops)
  WHERE description_embedding IS NOT NULL AND status = 'CLOSED';

-- =====================================================
-- Tables for response data (if not already exist)
-- =====================================================

CREATE TABLE IF NOT EXISTS "FoiaResponseLetters" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES "FoiaRequests"(id) ON DELETE CASCADE,
  template_id VARCHAR(100),
  letter_text TEXT NOT NULL,
  created_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "FoiaRedactionDecisions" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES "FoiaRequests"(id) ON DELETE CASCADE,
  document_id UUID NOT NULL,
  exemption_code VARCHAR(50) NOT NULL,
  start_position INTEGER,
  end_position INTEGER,
  reason TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "FoiaExemptionCitations" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES "FoiaRequests"(id) ON DELETE CASCADE,
  exemption_code VARCHAR(50) NOT NULL,
  statute_section VARCHAR(100),
  case_law TEXT,
  rationale TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- View: CloneSavingsSummary
-- =====================================================
-- Monthly cloning analytics with time savings

CREATE OR REPLACE VIEW "CloneSavingsSummary" AS
SELECT
  DATE_TRUNC('month', cloned_at) as month,
  tenant_id,
  COUNT(*) FILTER (WHERE clone_status = 'EXECUTED') as clones_executed,
  COUNT(*) FILTER (WHERE clone_status = 'APPROVED') as clones_approved,
  COUNT(*) FILTER (WHERE clone_status = 'REJECTED') as clones_rejected,
  AVG(edit_delta_pct) FILTER (WHERE clone_status = 'APPROVED') as avg_edit_delta_pct,
  -- Estimated hours saved: approved clones * 3.5 hours
  (COUNT(*) FILTER (WHERE clone_status = 'APPROVED') * 3.5) as estimated_hours_saved
FROM "FoiaResponseClones"
WHERE cloned_at IS NOT NULL
GROUP BY DATE_TRUNC('month', cloned_at), tenant_id
ORDER BY month DESC;

COMMENT ON VIEW "CloneSavingsSummary" IS
  'Monthly response cloning statistics with time savings calculations';

-- =====================================================
-- View: TopClonedRequestTypes
-- =====================================================
-- Most frequently cloned request types

CREATE OR REPLACE VIEW "TopClonedRequestTypes" AS
SELECT
  r.tenant_id,
  r.request_type,
  r.department,
  COUNT(*) as clone_count,
  AVG(c.similarity_score) as avg_similarity_score
FROM "FoiaResponseClones" c
JOIN "FoiaRequests" r ON c.target_request_id = r.id
WHERE c.clone_status = 'APPROVED'
GROUP BY r.tenant_id, r.request_type, r.department
ORDER BY clone_count DESC;

COMMENT ON VIEW "TopClonedRequestTypes" IS
  'Request types most frequently cloned with approval';

-- =====================================================
-- View: CloneEfficiencyMetrics
-- =====================================================
-- Clone success rate and efficiency metrics

CREATE OR REPLACE VIEW "CloneEfficiencyMetrics" AS
SELECT
  tenant_id,
  COUNT(*) as total_suggestions,
  COUNT(*) FILTER (WHERE clone_status = 'EXECUTED') as executed_count,
  COUNT(*) FILTER (WHERE clone_status = 'APPROVED') as approved_count,
  COUNT(*) FILTER (WHERE clone_status = 'REJECTED') as rejected_count,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE clone_status = 'APPROVED') /
    NULLIF(COUNT(*) FILTER (WHERE clone_status IN ('APPROVED', 'REJECTED')), 0),
    2
  ) as approval_rate_pct,
  AVG(edit_delta_pct) FILTER (WHERE clone_status = 'APPROVED') as avg_edit_delta_pct,
  AVG(EXTRACT(EPOCH FROM (approved_at - cloned_at)) / 60.0) FILTER (WHERE clone_status = 'APPROVED') as avg_review_time_minutes
FROM "FoiaResponseClones"
GROUP BY tenant_id;

COMMENT ON VIEW "CloneEfficiencyMetrics" IS
  'Clone approval rates and efficiency metrics by tenant';

-- =====================================================
-- Function: Update description_embedding on insert
-- =====================================================
-- This would be called by the app, but can also be a trigger

-- Example trigger (optional - app handles this):
/*
CREATE OR REPLACE FUNCTION update_request_embedding()
RETURNS TRIGGER AS $$
BEGIN
  -- In production, this would call embedding generation
  -- For now, handled by app layer
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_embedding
  AFTER INSERT OR UPDATE OF description ON "FoiaRequests"
  FOR EACH ROW
  EXECUTE FUNCTION update_request_embedding();
*/
