/**
 * Migration: AI-16: Public Transparency Dashboard & Score
 *
 * Creates transparency scoring system with public dashboards
 */

-- ============================================================================
-- 1. CREATE FoiaTransparencyScores TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "FoiaTransparencyScores" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES "FoiaTenants"(id) ON DELETE CASCADE,

  -- Score data
  score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
  components JSONB NOT NULL, -- { response_time, on_time_rate, proactive_disclosure, denial_rate, appeal_reversal }
  peer_percentile INTEGER NOT NULL CHECK (peer_percentile >= 0 AND peer_percentile <= 100),

  -- Metadata
  calculated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transparency_scores_tenant
  ON "FoiaTransparencyScores"(tenant_id, calculated_at DESC);

CREATE INDEX IF NOT EXISTS idx_transparency_scores_calculated
  ON "FoiaTransparencyScores"(calculated_at DESC);

CREATE INDEX IF NOT EXISTS idx_transparency_scores_score
  ON "FoiaTransparencyScores"(score DESC);

-- ============================================================================
-- 2. ADD TRANSPARENCY COLUMNS TO FoiaTenants
-- ============================================================================

-- Add transparency dashboard settings
ALTER TABLE "FoiaTenants"
  ADD COLUMN IF NOT EXISTS transparency_dashboard_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS transparency_public BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS slug VARCHAR(255),
  ADD COLUMN IF NOT EXISTS state VARCHAR(2),
  ADD COLUMN IF NOT EXISTS size_tier VARCHAR(20);

-- Add index for public dashboard lookups
CREATE INDEX IF NOT EXISTS idx_tenants_slug
  ON "FoiaTenants"(slug) WHERE transparency_public = true;

CREATE INDEX IF NOT EXISTS idx_tenants_transparency
  ON "FoiaTenants"(transparency_dashboard_enabled) WHERE transparency_dashboard_enabled = true;

-- ============================================================================
-- 3. CREATE ANALYTICS VIEWS
-- ============================================================================

-- View: Transparency Score History
CREATE OR REPLACE VIEW "TransparencyScoreHistory" AS
SELECT
  t.id as tenant_id,
  t.name as agency_name,
  t.state,
  t.size_tier,
  ts.score,
  ts.components,
  ts.peer_percentile,
  ts.calculated_at,
  DATE_TRUNC('month', ts.calculated_at) as month
FROM "FoiaTransparencyScores" ts
JOIN "FoiaTenants" t ON ts.tenant_id = t.id
ORDER BY ts.calculated_at DESC;

-- View: Peer Rankings (by state and size tier)
CREATE OR REPLACE VIEW "TransparencyPeerRankings" AS
WITH latest_scores AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id,
    score,
    peer_percentile,
    calculated_at
  FROM "FoiaTransparencyScores"
  ORDER BY tenant_id, calculated_at DESC
)
SELECT
  t.id as tenant_id,
  t.name as agency_name,
  t.state,
  t.size_tier,
  ls.score,
  ls.peer_percentile,
  ls.calculated_at,
  RANK() OVER (PARTITION BY t.state, t.size_tier ORDER BY ls.score DESC) as rank,
  COUNT(*) OVER (PARTITION BY t.state, t.size_tier) as total_peers
FROM latest_scores ls
JOIN "FoiaTenants" t ON ls.tenant_id = t.id
WHERE t.transparency_dashboard_enabled = true;

-- View: Score Component Breakdown
CREATE OR REPLACE VIEW "TransparencyComponentBreakdown" AS
WITH latest_scores AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id,
    score,
    components,
    calculated_at
  FROM "FoiaTransparencyScores"
  ORDER BY tenant_id, calculated_at DESC
)
SELECT
  t.id as tenant_id,
  t.name as agency_name,
  ls.score as total_score,
  (ls.components->>'response_time')::INTEGER as response_time_score,
  (ls.components->>'on_time_rate')::INTEGER as on_time_rate_score,
  (ls.components->>'proactive_disclosure')::INTEGER as proactive_disclosure_score,
  (ls.components->>'denial_rate')::INTEGER as denial_rate_score,
  (ls.components->>'appeal_reversal')::INTEGER as appeal_reversal_score,
  ls.calculated_at
FROM latest_scores ls
JOIN "FoiaTenants" t ON ls.tenant_id = t.id
WHERE t.transparency_dashboard_enabled = true;

-- View: State Averages
CREATE OR REPLACE VIEW "TransparencyStateAverages" AS
WITH latest_scores AS (
  SELECT DISTINCT ON (tenant_id)
    tenant_id,
    score,
    calculated_at
  FROM "FoiaTransparencyScores"
  ORDER BY tenant_id, calculated_at DESC
)
SELECT
  t.state,
  COUNT(DISTINCT t.id) as agency_count,
  ROUND(AVG(ls.score), 1) as avg_score,
  MIN(ls.score) as min_score,
  MAX(ls.score) as max_score,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ls.score) as median_score
FROM latest_scores ls
JOIN "FoiaTenants" t ON ls.tenant_id = t.id
WHERE t.transparency_dashboard_enabled = true
GROUP BY t.state
ORDER BY avg_score DESC;

-- ============================================================================
-- 4. CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function: Get latest transparency score for a tenant
CREATE OR REPLACE FUNCTION get_latest_transparency_score(p_tenant_id UUID)
RETURNS TABLE (
  score INTEGER,
  components JSONB,
  peer_percentile INTEGER,
  calculated_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT ts.score, ts.components, ts.peer_percentile, ts.calculated_at
  FROM "FoiaTransparencyScores" ts
  WHERE ts.tenant_id = p_tenant_id
  ORDER BY ts.calculated_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function: Get score trend (last 12 months)
CREATE OR REPLACE FUNCTION get_transparency_score_trend(p_tenant_id UUID)
RETURNS TABLE (
  month DATE,
  score INTEGER,
  peer_percentile INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    DATE_TRUNC('month', ts.calculated_at)::DATE as month,
    AVG(ts.score)::INTEGER as score,
    AVG(ts.peer_percentile)::INTEGER as peer_percentile
  FROM "FoiaTransparencyScores" ts
  WHERE ts.tenant_id = p_tenant_id
    AND ts.calculated_at >= NOW() - INTERVAL '12 months'
  GROUP BY DATE_TRUNC('month', ts.calculated_at)
  ORDER BY month DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. SEED DEFAULT SLUGS (Generate slugs from tenant names)
-- ============================================================================

-- Update slugs for existing tenants
UPDATE "FoiaTenants"
SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

-- ============================================================================
-- 6. GRANT PERMISSIONS (if using role-based access)
-- ============================================================================

-- Grant read access to public endpoints
-- GRANT SELECT ON "FoiaTransparencyScores" TO public_role;
-- GRANT SELECT ON "TransparencyScoreHistory" TO public_role;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON TABLE "FoiaTransparencyScores" IS 'AI-16: Stores transparency scores calculated daily for public dashboards';
COMMENT ON VIEW "TransparencyScoreHistory" IS 'AI-16: Historical view of transparency scores with tenant info';
COMMENT ON VIEW "TransparencyPeerRankings" IS 'AI-16: Rankings of agencies by state and size tier';
COMMENT ON VIEW "TransparencyComponentBreakdown" IS 'AI-16: Breakdown of score components for analysis';
COMMENT ON VIEW "TransparencyStateAverages" IS 'AI-16: Average transparency scores by state';
