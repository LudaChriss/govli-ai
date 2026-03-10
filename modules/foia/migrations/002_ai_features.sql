-- Govli AI FOIA Module: AI Features & Usage Tracking
-- Migration 002: AI usage audit and tracking tables (Updated for PascalCase schema)

-- AI Usage Audit Table
-- Tracks all AI API calls for cost monitoring and compliance
CREATE TABLE IF NOT EXISTS "FoiaAIUsage" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  foia_request_id UUID,
  feature_id VARCHAR(50) NOT NULL, -- 'ai-1' through 'ai-14'
  model_used VARCHAR(100) NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  thinking_tokens INTEGER NOT NULL DEFAULT 0,
  cost_estimate_usd DECIMAL(10, 6) NOT NULL DEFAULT 0.0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  cache_hit BOOLEAN NOT NULL DEFAULT false,
  batch_api BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_foia_ai_usage_request ON "FoiaAIUsage"(foia_request_id);
CREATE INDEX IF NOT EXISTS idx_foia_ai_usage_feature ON "FoiaAIUsage"(feature_id);
CREATE INDEX IF NOT EXISTS idx_foia_ai_usage_created ON "FoiaAIUsage"("createdAt");

-- Token Budget Management Table (Global, not tenant-specific)
CREATE TABLE IF NOT EXISTS "FoiaTokenBudgets" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  monthly_budget_usd DECIMAL(10, 2) NOT NULL DEFAULT 0.0, -- 0 = uncapped
  current_month_spend_usd DECIMAL(10, 6) NOT NULL DEFAULT 0.0,
  budget_alert_threshold DECIMAL(3, 2) NOT NULL DEFAULT 0.80, -- 80%
  budget_hard_stop DECIMAL(3, 2) NOT NULL DEFAULT 0.95, -- 95%
  last_reset_at TIMESTAMP DEFAULT NOW(),
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Model Routing Configuration Table (Global)
CREATE TABLE IF NOT EXISTS "FoiaModelRouting" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_low VARCHAR(50) NOT NULL DEFAULT 'claude-3-5-haiku-20241022',
  model_mid VARCHAR(50) NOT NULL DEFAULT 'claude-3-5-sonnet-20241022',
  model_high VARCHAR(50) NOT NULL DEFAULT 'claude-3-5-sonnet-20241022',
  model_critical VARCHAR(50) NOT NULL DEFAULT 'claude-opus-4-20250514',
  thinking_budget_low INTEGER NOT NULL DEFAULT 0,
  thinking_budget_mid INTEGER NOT NULL DEFAULT 5000,
  thinking_budget_high INTEGER NOT NULL DEFAULT 15000,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Complexity Scores Table
CREATE TABLE IF NOT EXISTS "FoiaComplexityScores" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  foia_request_id UUID NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  date_range_years DECIMAL(5, 2) NOT NULL DEFAULT 0,
  agency_count INTEGER NOT NULL DEFAULT 0,
  estimated_volume VARCHAR(20) NOT NULL CHECK (
    estimated_volume IN ('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH')
  ),
  requester_category VARCHAR(50) NOT NULL,
  keyword_complexity DECIMAL(5, 2) NOT NULL DEFAULT 0,
  calculated_at TIMESTAMP DEFAULT NOW(),
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_complexity_scores_request_fk FOREIGN KEY (foia_request_id)
    REFERENCES "FoiaRequests"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_foia_complexity_scores_request ON "FoiaComplexityScores"(foia_request_id);
CREATE INDEX IF NOT EXISTS idx_foia_complexity_scores_score ON "FoiaComplexityScores"(score);

-- Function to update budget spend (called after AI usage)
CREATE OR REPLACE FUNCTION update_token_budget_spend()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "FoiaTokenBudgets"
  SET
    current_month_spend_usd = current_month_spend_usd + NEW.cost_estimate_usd,
    "updatedAt" = NOW()
  WHERE id = (SELECT id FROM "FoiaTokenBudgets" ORDER BY "createdAt" DESC LIMIT 1);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_token_budget_spend ON "FoiaAIUsage";
CREATE TRIGGER trigger_update_token_budget_spend
  AFTER INSERT ON "FoiaAIUsage"
  FOR EACH ROW
  EXECUTE FUNCTION update_token_budget_spend();

-- Function to reset monthly budgets
CREATE OR REPLACE FUNCTION reset_monthly_budgets()
RETURNS void AS $$
BEGIN
  UPDATE "FoiaTokenBudgets"
  SET
    current_month_spend_usd = 0.0,
    last_reset_at = NOW(),
    "updatedAt" = NOW()
  WHERE EXTRACT(MONTH FROM last_reset_at) != EXTRACT(MONTH FROM NOW())
    OR EXTRACT(YEAR FROM last_reset_at) != EXTRACT(YEAR FROM NOW());
END;
$$ LANGUAGE plpgsql;

-- Insert default token budget if none exists
INSERT INTO "FoiaTokenBudgets" (id, monthly_budget_usd)
SELECT uuid_generate_v4(), 0.0
WHERE NOT EXISTS (SELECT 1 FROM "FoiaTokenBudgets");

-- Insert default model routing if none exists
INSERT INTO "FoiaModelRouting" (id)
SELECT uuid_generate_v4()
WHERE NOT EXISTS (SELECT 1 FROM "FoiaModelRouting");

-- Comments for documentation
COMMENT ON TABLE "FoiaAIUsage" IS 'Audit log of all AI API calls with token usage and costs';
COMMENT ON TABLE "FoiaTokenBudgets" IS 'Monthly token budget limits (global)';
COMMENT ON TABLE "FoiaModelRouting" IS 'Model selection configuration based on complexity';
COMMENT ON TABLE "FoiaComplexityScores" IS 'Calculated complexity scores for FOIA requests';
