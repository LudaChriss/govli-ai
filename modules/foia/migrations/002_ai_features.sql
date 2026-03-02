-- Govli AI FOIA Module: AI Features & Usage Tracking
-- Migration 002: AI usage audit and tracking tables

-- AI Usage Audit Table
-- Tracks all AI API calls for cost monitoring and compliance
CREATE TABLE IF NOT EXISTS foia_ai_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
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
  created_at TIMESTAMP DEFAULT NOW(),

  -- Indexes for analytics queries
  CONSTRAINT foia_ai_usage_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_ai_usage_tenant ON foia_ai_usage(tenant_id);
CREATE INDEX idx_foia_ai_usage_request ON foia_ai_usage(foia_request_id);
CREATE INDEX idx_foia_ai_usage_feature ON foia_ai_usage(feature_id);
CREATE INDEX idx_foia_ai_usage_created ON foia_ai_usage(created_at);
CREATE INDEX idx_foia_ai_usage_tenant_created ON foia_ai_usage(tenant_id, created_at);

-- Token Budget Management Table
CREATE TABLE IF NOT EXISTS foia_token_budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL UNIQUE,
  monthly_budget_usd DECIMAL(10, 2) NOT NULL DEFAULT 0.0, -- 0 = uncapped
  current_month_spend_usd DECIMAL(10, 6) NOT NULL DEFAULT 0.0,
  budget_alert_threshold DECIMAL(3, 2) NOT NULL DEFAULT 0.80, -- 80%
  budget_hard_stop DECIMAL(3, 2) NOT NULL DEFAULT 0.95, -- 95%
  last_reset_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_token_budgets_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_token_budgets_tenant ON foia_token_budgets(tenant_id);

-- Model Routing Configuration Table
CREATE TABLE IF NOT EXISTS foia_model_routing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL UNIQUE,
  model_low VARCHAR(50) NOT NULL DEFAULT 'claude-3-5-haiku-20241022',
  model_mid VARCHAR(50) NOT NULL DEFAULT 'claude-3-5-sonnet-20241022',
  model_high VARCHAR(50) NOT NULL DEFAULT 'claude-3-5-sonnet-20241022',
  model_critical VARCHAR(50) NOT NULL DEFAULT 'claude-opus-4-20250514',
  thinking_budget_low INTEGER NOT NULL DEFAULT 0,
  thinking_budget_mid INTEGER NOT NULL DEFAULT 5000,
  thinking_budget_high INTEGER NOT NULL DEFAULT 15000,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_model_routing_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_model_routing_tenant ON foia_model_routing(tenant_id);

-- Complexity Scores Table
CREATE TABLE IF NOT EXISTS foia_complexity_scores (
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

  CONSTRAINT foia_complexity_scores_request_fk FOREIGN KEY (foia_request_id)
    REFERENCES foia_requests(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_complexity_scores_request ON foia_complexity_scores(foia_request_id);
CREATE INDEX idx_foia_complexity_scores_score ON foia_complexity_scores(score);

-- Function to update budget spend (called after AI usage)
CREATE OR REPLACE FUNCTION update_token_budget_spend()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE foia_token_budgets
  SET
    current_month_spend_usd = current_month_spend_usd + NEW.cost_estimate_usd,
    updated_at = NOW()
  WHERE tenant_id = NEW.tenant_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_token_budget_spend
  AFTER INSERT ON foia_ai_usage
  FOR EACH ROW
  EXECUTE FUNCTION update_token_budget_spend();

-- Function to reset monthly budgets
CREATE OR REPLACE FUNCTION reset_monthly_budgets()
RETURNS void AS $$
BEGIN
  UPDATE foia_token_budgets
  SET
    current_month_spend_usd = 0.0,
    last_reset_at = NOW(),
    updated_at = NOW()
  WHERE EXTRACT(MONTH FROM last_reset_at) != EXTRACT(MONTH FROM NOW())
    OR EXTRACT(YEAR FROM last_reset_at) != EXTRACT(YEAR FROM NOW());
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE foia_ai_usage IS 'Audit log of all AI API calls with token usage and costs';
COMMENT ON TABLE foia_token_budgets IS 'Monthly token budget limits per tenant';
COMMENT ON TABLE foia_model_routing IS 'Model selection configuration based on complexity';
COMMENT ON TABLE foia_complexity_scores IS 'Calculated complexity scores for FOIA requests';
