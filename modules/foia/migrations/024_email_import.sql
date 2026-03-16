-- Migration: Email Import Engine
-- Description: Creates tables for FOIA request import from email
-- Date: 2026-03-15

-- =====================================================
-- Table: FoiaEmailImports
-- Purpose: Tracks all incoming emails and their parsing status
-- =====================================================
CREATE TABLE IF NOT EXISTS "FoiaEmailImports" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  from_email VARCHAR(255) NOT NULL,
  to_email VARCHAR(255) NOT NULL,
  subject VARCHAR(500),
  body_text TEXT NOT NULL,
  body_html TEXT,
  parsed_data JSONB NOT NULL,
  is_foia BOOLEAN NOT NULL,
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  request_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMP,
  rejected_at TIMESTAMP,
  rejection_reason TEXT
);

-- Index for tenant lookups
CREATE INDEX idx_email_imports_tenant
  ON "FoiaEmailImports"(tenant_id);

-- Index for status queries
CREATE INDEX idx_email_imports_status
  ON "FoiaEmailImports"(tenant_id, status);

-- Index for FOIA classification
CREATE INDEX idx_email_imports_is_foia
  ON "FoiaEmailImports"(tenant_id, is_foia);

-- Index for request lookups
CREATE INDEX idx_email_imports_request
  ON "FoiaEmailImports"(request_id)
  WHERE request_id IS NOT NULL;

-- Index for analytics queries
CREATE INDEX idx_email_imports_analytics
  ON "FoiaEmailImports"(tenant_id, is_foia, status, created_at);

-- Foreign key to FoiaRequests (if exists)
ALTER TABLE "FoiaEmailImports"
  ADD CONSTRAINT fk_email_imports_request
  FOREIGN KEY (request_id) REFERENCES "FoiaRequests"(id)
  ON DELETE SET NULL;

COMMENT ON TABLE "FoiaEmailImports" IS
  'Tracks incoming emails sent to import@{subdomain}.govli.ai and their AI parsing results';
COMMENT ON COLUMN "FoiaEmailImports".parsed_data IS
  'AI-extracted FOIA request data (JSON format from Claude Sonnet 4.5)';
COMMENT ON COLUMN "FoiaEmailImports".is_foia IS
  'Whether AI classified email as a FOIA request (true) or not (false)';
COMMENT ON COLUMN "FoiaEmailImports".confidence IS
  'AI confidence score (0.0-1.0) for classification and extraction';
COMMENT ON COLUMN "FoiaEmailImports".status IS
  'Import status: PENDING (awaiting review), APPROVED (finalized as request), REJECTED (not a valid FOIA request)';

-- =====================================================
-- View: Email Import Stats by Tenant
-- Purpose: Quick analytics overview
-- =====================================================
CREATE OR REPLACE VIEW "EmailImportStats" AS
SELECT
  tenant_id,
  COUNT(*) as total_emails,
  COUNT(*) FILTER (WHERE is_foia = true) as parsed_as_foia,
  COUNT(*) FILTER (WHERE is_foia = false) as parsed_as_non_foia,
  COUNT(*) FILTER (WHERE status = 'APPROVED') as approved_count,
  COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected_count,
  COUNT(*) FILTER (WHERE status = 'PENDING') as pending_count,
  AVG(confidence) as avg_confidence,
  ROUND(
    (COUNT(*) FILTER (WHERE is_foia = true AND status = 'REJECTED')::DECIMAL /
     NULLIF(COUNT(*) FILTER (WHERE is_foia = true), 0) * 100),
    2
  ) as false_positive_rate_pct,
  MIN(created_at) as first_email,
  MAX(created_at) as last_email
FROM "FoiaEmailImports"
GROUP BY tenant_id;

COMMENT ON VIEW "EmailImportStats" IS
  'Analytics summary for email import quality and volume by tenant';

-- =====================================================
-- Function: Get Pending Review Count
-- Purpose: Quick count of emails awaiting admin review
-- =====================================================
CREATE OR REPLACE FUNCTION get_pending_email_imports(
  p_tenant_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM "FoiaEmailImports"
  WHERE tenant_id = p_tenant_id
    AND is_foia = true
    AND status = 'PENDING';

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_pending_email_imports IS
  'Returns count of email imports awaiting admin review for a tenant';

-- =====================================================
-- Function: Get Low Confidence Imports
-- Purpose: Find emails with low AI confidence for training
-- =====================================================
CREATE OR REPLACE FUNCTION get_low_confidence_imports(
  p_tenant_id UUID,
  p_confidence_threshold DECIMAL DEFAULT 0.7
) RETURNS TABLE(
  id UUID,
  from_email VARCHAR,
  subject VARCHAR,
  confidence DECIMAL,
  is_foia BOOLEAN,
  status VARCHAR,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ei.id,
    ei.from_email,
    ei.subject,
    ei.confidence,
    ei.is_foia,
    ei.status,
    ei.created_at
  FROM "FoiaEmailImports" ei
  WHERE ei.tenant_id = p_tenant_id
    AND ei.confidence < p_confidence_threshold
  ORDER BY ei.created_at DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_low_confidence_imports IS
  'Returns email imports with AI confidence below threshold for quality review';

-- =====================================================
-- Grants (adjust based on your role structure)
-- =====================================================
-- Grant read access to foia_admin role
GRANT SELECT ON "FoiaEmailImports" TO foia_admin;
GRANT SELECT ON "EmailImportStats" TO foia_admin;
GRANT EXECUTE ON FUNCTION get_pending_email_imports TO foia_admin;
GRANT EXECUTE ON FUNCTION get_low_confidence_imports TO foia_admin;

-- Grant write access to email_import role (used by email webhook service)
GRANT SELECT, INSERT, UPDATE ON "FoiaEmailImports" TO email_import;
GRANT SELECT ON "EmailImportStats" TO email_import;
GRANT EXECUTE ON FUNCTION get_pending_email_imports TO email_import;
