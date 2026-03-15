/**
 * AI-14: Compliance Copilot Migration
 *
 * Creates tables and indexes for the conversational FOIA compliance assistant
 */

-- =====================================================
-- Table: FoiaCopilotSessions
-- =====================================================
-- Stores copilot conversation sessions with officers

CREATE TABLE IF NOT EXISTS "FoiaCopilotSessions" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE,
  tenant_id UUID NOT NULL REFERENCES "FoiaTenants"(id) ON DELETE CASCADE,
  officer_id VARCHAR(255) NOT NULL, -- User ID from auth system
  messages JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {role, content}
  model_used VARCHAR(30), -- Last model used: 'haiku' or 'sonnet'
  total_tokens INTEGER DEFAULT 0,
  total_cost DECIMAL(10, 6) DEFAULT 0.00, -- Total cost in USD
  latency_ms INTEGER, -- Last request latency
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for session lookup
CREATE INDEX idx_foia_copilot_sessions_session_id
  ON "FoiaCopilotSessions"(session_id);

-- Index for tenant filtering
CREATE INDEX idx_foia_copilot_sessions_tenant_id
  ON "FoiaCopilotSessions"(tenant_id);

-- Index for officer filtering
CREATE INDEX idx_foia_copilot_sessions_officer_id
  ON "FoiaCopilotSessions"(officer_id);

-- Index for date range queries
CREATE INDEX idx_foia_copilot_sessions_created_at
  ON "FoiaCopilotSessions"(created_at DESC);

-- Index for model filtering
CREATE INDEX idx_foia_copilot_sessions_model_used
  ON "FoiaCopilotSessions"(model_used);

-- Composite index for tenant + officer queries
CREATE INDEX idx_foia_copilot_sessions_tenant_officer
  ON "FoiaCopilotSessions"(tenant_id, officer_id);

-- =====================================================
-- Update FoiaTenants: Add jurisdiction_config column
-- =====================================================
-- Stores jurisdiction-specific FOIA knowledge for copilot

ALTER TABLE "FoiaTenants"
  ADD COLUMN IF NOT EXISTS jurisdiction_config JSONB;

COMMENT ON COLUMN "FoiaTenants".jurisdiction_config IS
  'Jurisdiction-specific FOIA knowledge: statutes, exemptions, fee schedules, routing rules';

-- =====================================================
-- View: CopilotUsageByOfficer
-- =====================================================
-- Analytics: Copilot usage statistics by officer

CREATE OR REPLACE VIEW "CopilotUsageByOfficer" AS
SELECT
  tenant_id,
  officer_id,
  COUNT(*) as session_count,
  SUM(jsonb_array_length(messages)) as total_messages,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost) as total_cost,
  COUNT(*) FILTER (WHERE model_used = 'haiku') as haiku_sessions,
  COUNT(*) FILTER (WHERE model_used = 'sonnet') as sonnet_sessions,
  MIN(created_at) as first_session,
  MAX(updated_at) as last_session
FROM "FoiaCopilotSessions"
GROUP BY tenant_id, officer_id;

COMMENT ON VIEW "CopilotUsageByOfficer" IS
  'Copilot usage analytics by officer: session counts, tokens, costs, model distribution';

-- =====================================================
-- View: CopilotUsageByMonth
-- =====================================================
-- Analytics: Monthly copilot usage trends

CREATE OR REPLACE VIEW "CopilotUsageByMonth" AS
SELECT
  tenant_id,
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as session_count,
  SUM(jsonb_array_length(messages)) as total_messages,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost) as total_cost,
  COUNT(*) FILTER (WHERE model_used = 'haiku') as haiku_sessions,
  COUNT(*) FILTER (WHERE model_used = 'sonnet') as sonnet_sessions,
  COUNT(DISTINCT officer_id) as unique_officers
FROM "FoiaCopilotSessions"
GROUP BY tenant_id, DATE_TRUNC('month', created_at)
ORDER BY month DESC;

COMMENT ON VIEW "CopilotUsageByMonth" IS
  'Monthly copilot usage trends: sessions, messages, tokens, costs, active officers';

-- =====================================================
-- View: CopilotModelDistribution
-- =====================================================
-- Analytics: Model routing distribution (complexity detection)

CREATE OR REPLACE VIEW "CopilotModelDistribution" AS
SELECT
  tenant_id,
  model_used,
  COUNT(*) as session_count,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost) as total_cost,
  AVG(total_cost) as avg_cost_per_session,
  AVG(latency_ms) as avg_latency_ms
FROM "FoiaCopilotSessions"
WHERE model_used IS NOT NULL
GROUP BY tenant_id, model_used;

COMMENT ON VIEW "CopilotModelDistribution" IS
  'Model routing distribution: shows how often Haiku vs Sonnet is used and cost implications';

-- =====================================================
-- Sample jurisdiction config for Texas
-- =====================================================
-- This can be used to populate jurisdiction_config for testing

/*
Example jurisdiction_config JSON structure:

{
  "state_name": "Texas",
  "statutes": [
    {
      "section": "§ 552.001",
      "title": "Policy; Construction",
      "text": "Public information is available to the public at a minimum..."
    },
    {
      "section": "§ 552.003",
      "title": "Definitions",
      "text": "In this chapter: (1) 'Governmental body' means..."
    },
    {
      "section": "§ 552.221",
      "title": "Exception: Certain Personnel Information",
      "text": "Information is excepted from disclosure if it is..."
    }
  ],
  "exemptions": [
    {
      "code": "§ 552.101",
      "description": "Information confidential by law",
      "case_law": "See Texas Attorney General Opinion JC-0351"
    },
    {
      "code": "§ 552.108",
      "description": "Certain law enforcement records",
      "case_law": "See Texas Attorney General Opinion GA-0023"
    }
  ],
  "fee_schedule": {
    "per_page_copy": 0.10,
    "per_hour_search": 15.00,
    "minimum_fee": 0
  },
  "routing_rules": [
    "Requests for personnel records → HR department",
    "Requests involving litigation → Legal counsel review required"
  ]
}
*/
