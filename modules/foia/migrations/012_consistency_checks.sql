-- Govli AI FOIA Module: AI-4 Exemption Consistency Analyzer
-- Migration 012: Consistency checks table

-- Consistency Checks Table
-- Stores results of exemption consistency analysis
CREATE TABLE IF NOT EXISTS "FoiaConsistencyChecks" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,

  -- Related Entities
  foia_response_id UUID NOT NULL,
  foia_request_id UUID NOT NULL,

  -- Request Context
  record_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  department VARCHAR(200),
  requester_category VARCHAR(100),
  exemptions_proposed JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of exemption codes

  -- Analysis Results
  is_consistent BOOLEAN NOT NULL DEFAULT true,
  overall_risk VARCHAR(20) NOT NULL CHECK (overall_risk IN ('LOW', 'MEDIUM', 'HIGH')),
  alerts JSONB DEFAULT '[]'::jsonb, -- Array of ConsistencyAlert objects
  summary TEXT NOT NULL,
  prior_cases_reviewed INTEGER NOT NULL DEFAULT 0,

  -- Status & Decision
  status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED' CHECK (
    status IN ('PENDING', 'COMPLETED', 'FAILED', 'OVERRIDDEN')
  ),
  checked_by UUID,
  checked_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Override (for HIGH risk)
  overridden_by UUID,
  overridden_at TIMESTAMP,
  override_justification TEXT,

  -- AI Metadata
  model_used VARCHAR(100) NOT NULL,
  confidence_score DECIMAL(5, 4) CHECK (confidence_score BETWEEN 0 AND 1),

  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_foia_consistency_tenant ON "FoiaConsistencyChecks"(tenant_id);
CREATE INDEX IF NOT EXISTS idx_foia_consistency_response ON "FoiaConsistencyChecks"(foia_response_id);
CREATE INDEX IF NOT EXISTS idx_foia_consistency_request ON "FoiaConsistencyChecks"(foia_request_id);
CREATE INDEX IF NOT EXISTS idx_foia_consistency_risk ON "FoiaConsistencyChecks"(overall_risk);
CREATE INDEX IF NOT EXISTS idx_foia_consistency_status ON "FoiaConsistencyChecks"(status);
CREATE INDEX IF NOT EXISTS idx_foia_consistency_checked_at ON "FoiaConsistencyChecks"(checked_at);
CREATE INDEX IF NOT EXISTS idx_foia_consistency_department ON "FoiaConsistencyChecks"(department);

-- Index for HIGH risk pending checks (supervisor queue)
CREATE INDEX IF NOT EXISTS idx_foia_consistency_high_risk_pending
ON "FoiaConsistencyChecks"(tenant_id, overall_risk, status)
WHERE overall_risk = 'HIGH' AND status = 'PENDING';

-- Monthly Consistency Reports Table
-- Auto-generated monthly reports for supervisor review
CREATE TABLE IF NOT EXISTS "FoiaConsistencyReports" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  report_month DATE NOT NULL, -- First day of month

  -- Summary Metrics
  total_checks INTEGER NOT NULL DEFAULT 0,
  high_risk_count INTEGER NOT NULL DEFAULT 0,
  medium_risk_count INTEGER NOT NULL DEFAULT 0,
  low_risk_count INTEGER NOT NULL DEFAULT 0,
  override_count INTEGER NOT NULL DEFAULT 0,

  -- Consistency Metrics
  overall_consistency_rate DECIMAL(5, 2),
  most_inconsistent_exemptions JSONB DEFAULT '[]'::jsonb, -- Array of exemption codes
  departments_with_issues JSONB DEFAULT '[]'::jsonb, -- Array of department names

  -- Findings & Recommendations
  critical_findings JSONB DEFAULT '[]'::jsonb, -- Array of finding strings
  recommendations JSONB DEFAULT '[]'::jsonb, -- Array of recommendation strings

  -- Report Metadata
  generated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  generated_by UUID,
  sent_to JSONB DEFAULT '[]'::jsonb, -- Array of user IDs

  "createdAt" TIMESTAMP DEFAULT NOW(),

  UNIQUE(tenant_id, report_month)
);

CREATE INDEX IF NOT EXISTS idx_foia_reports_tenant ON "FoiaConsistencyReports"(tenant_id);
CREATE INDEX IF NOT EXISTS idx_foia_reports_month ON "FoiaConsistencyReports"(report_month);

-- Comments for documentation
COMMENT ON TABLE "FoiaConsistencyChecks" IS 'AI-4: Exemption consistency analysis results';
COMMENT ON TABLE "FoiaConsistencyReports" IS 'Monthly consistency reports for supervisor review';

COMMENT ON COLUMN "FoiaConsistencyChecks".overall_risk IS 'HIGH blocks approval, MEDIUM shows warning, LOW passes silently';
COMMENT ON COLUMN "FoiaConsistencyChecks".status IS 'PENDING for HIGH risk awaiting override, OVERRIDDEN when supervisor approves';
COMMENT ON COLUMN "FoiaConsistencyChecks".alerts IS 'JSON array of ConsistencyAlert objects identifying specific inconsistencies';
