/**
 * Migration: GovQA Compatibility API Layer
 *
 * Creates tables for tracking GovQA compatibility API usage
 */

-- ============================================================================
-- 1. CREATE FoiaCompatRequests TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS "FoiaCompatRequests" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES "FoiaTenants"(id) ON DELETE CASCADE,

  -- Request tracking
  endpoint VARCHAR(100) NOT NULL,
  govqa_case_number VARCHAR(50),
  govli_request_id UUID REFERENCES "FoiaRequests"(id) ON DELETE SET NULL,

  -- Request/response data
  request_body JSONB,
  response_code INTEGER,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_compat_requests_tenant
  ON "FoiaCompatRequests"(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_compat_requests_endpoint
  ON "FoiaCompatRequests"(endpoint);

CREATE INDEX IF NOT EXISTS idx_compat_requests_case_number
  ON "FoiaCompatRequests"(govqa_case_number) WHERE govqa_case_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_compat_requests_created
  ON "FoiaCompatRequests"(created_at DESC);

-- ============================================================================
-- 2. ADD MIGRATION TRACKING COLUMNS TO FoiaRequests
-- ============================================================================

ALTER TABLE "FoiaRequests"
  ADD COLUMN IF NOT EXISTS legacy_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS migration_source VARCHAR(50);

-- Index for legacy ID lookups
CREATE INDEX IF NOT EXISTS idx_requests_legacy_id
  ON "FoiaRequests"(legacy_id, migration_source)
  WHERE legacy_id IS NOT NULL;

-- ============================================================================
-- 3. CREATE ANALYTICS VIEWS
-- ============================================================================

-- View: Compatibility API Usage Summary
CREATE OR REPLACE VIEW "CompatApiUsageSummary" AS
SELECT
  tenant_id,
  endpoint,
  COUNT(*) as request_count,
  COUNT(DISTINCT govqa_case_number) as unique_cases,
  AVG(response_code) as avg_response_code,
  MAX(created_at) as last_used,
  DATE_TRUNC('month', created_at) as month
FROM "FoiaCompatRequests"
GROUP BY tenant_id, endpoint, DATE_TRUNC('month', created_at)
ORDER BY month DESC, request_count DESC;

-- View: Migration Progress by Tenant
CREATE OR REPLACE VIEW "MigrationProgressByTenant" AS
WITH compat_stats AS (
  SELECT
    tenant_id,
    COUNT(*) as total_compat_requests,
    COUNT(DISTINCT govqa_case_number) as unique_cases,
    MAX(created_at) as last_compat_request,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as recent_requests
  FROM "FoiaCompatRequests"
  GROUP BY tenant_id
),
request_stats AS (
  SELECT
    tenant_id,
    COUNT(*) FILTER (WHERE migration_source = 'govqa') as migrated_requests,
    COUNT(*) FILTER (WHERE migration_source IS NULL) as native_requests
  FROM "FoiaRequests"
  GROUP BY tenant_id
)
SELECT
  t.id as tenant_id,
  t.name as tenant_name,
  COALESCE(c.total_compat_requests, 0) as total_compat_requests,
  COALESCE(c.unique_cases, 0) as unique_cases,
  COALESCE(c.recent_requests, 0) as recent_requests,
  c.last_compat_request,
  COALESCE(r.migrated_requests, 0) as migrated_requests,
  COALESCE(r.native_requests, 0) as native_requests,
  CASE
    WHEN c.total_compat_requests IS NULL THEN 'COMPLETE'
    WHEN c.recent_requests > 0 THEN 'IN_PROGRESS'
    ELSE 'COMPLETE'
  END as migration_status
FROM "FoiaTenants" t
LEFT JOIN compat_stats c ON t.id = c.tenant_id
LEFT JOIN request_stats r ON t.id = r.tenant_id;

-- View: Endpoint Usage Over Time
CREATE OR REPLACE VIEW "CompatEndpointUsageOverTime" AS
SELECT
  DATE_TRUNC('day', created_at) as date,
  endpoint,
  COUNT(*) as request_count,
  COUNT(DISTINCT tenant_id) as tenant_count,
  AVG(response_code) as avg_response_code
FROM "FoiaCompatRequests"
WHERE created_at >= NOW() - INTERVAL '90 days'
GROUP BY DATE_TRUNC('day', created_at), endpoint
ORDER BY date DESC, request_count DESC;

-- ============================================================================
-- 4. CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function: Get migration status for a tenant
CREATE OR REPLACE FUNCTION get_migration_status(p_tenant_id UUID)
RETURNS TABLE (
  total_compat_requests BIGINT,
  recent_requests BIGINT,
  last_request TIMESTAMP,
  migration_status TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_compat_requests,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') as recent_requests,
    MAX(created_at) as last_request,
    CASE
      WHEN COUNT(*) = 0 THEN 'COMPLETE'
      WHEN COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') > 0 THEN 'IN_PROGRESS'
      ELSE 'COMPLETE'
    END as migration_status
  FROM "FoiaCompatRequests"
  WHERE tenant_id = p_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Get endpoint usage breakdown
CREATE OR REPLACE FUNCTION get_endpoint_usage(p_tenant_id UUID)
RETURNS TABLE (
  endpoint VARCHAR(100),
  call_count BIGINT,
  last_used TIMESTAMP,
  avg_response_code NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cr.endpoint,
    COUNT(*) as call_count,
    MAX(cr.created_at) as last_used,
    AVG(cr.response_code) as avg_response_code
  FROM "FoiaCompatRequests" cr
  WHERE cr.tenant_id = p_tenant_id
  GROUP BY cr.endpoint
  ORDER BY call_count DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. DATA CLEANUP POLICY (Optional)
-- ============================================================================

-- Create function to clean old compat logs (older than 18 months)
CREATE OR REPLACE FUNCTION cleanup_old_compat_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM "FoiaCompatRequests"
  WHERE created_at < NOW() - INTERVAL '18 months';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Example: Set up scheduled cleanup (using pg_cron if available)
-- SELECT cron.schedule('cleanup-compat-logs', '0 2 * * 0', 'SELECT cleanup_old_compat_logs()');

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

COMMENT ON TABLE "FoiaCompatRequests" IS 'Tracks GovQA compatibility API usage for migration monitoring';
COMMENT ON VIEW "CompatApiUsageSummary" IS 'Summary of compatibility API usage by endpoint and tenant';
COMMENT ON VIEW "MigrationProgressByTenant" IS 'Migration progress tracking for each tenant';
COMMENT ON VIEW "CompatEndpointUsageOverTime" IS 'Endpoint usage trends over time';
