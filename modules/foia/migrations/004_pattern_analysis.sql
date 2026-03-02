-- Govli AI FOIA Module: Pattern Analysis & Batch Processing
-- Migration 004: Tables for request patterns, batching, and transparency metrics

-- Request Patterns Table
-- Store identified patterns across FOIA requests
CREATE TABLE IF NOT EXISTS foia_request_patterns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  pattern_type VARCHAR(100) NOT NULL CHECK (
    pattern_type IN ('DUPLICATE', 'SIMILAR', 'SEASONAL', 'REQUESTER_PATTERN')
  ),
  pattern_signature TEXT NOT NULL, -- Hash or key identifying the pattern
  request_ids UUID[] NOT NULL, -- Array of related request IDs
  first_detected_at TIMESTAMP DEFAULT NOW(),
  last_updated_at TIMESTAMP DEFAULT NOW(),
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  metadata JSONB, -- Additional pattern-specific data

  CONSTRAINT foia_request_patterns_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_request_patterns_tenant ON foia_request_patterns(tenant_id);
CREATE INDEX idx_foia_request_patterns_type ON foia_request_patterns(pattern_type);
CREATE INDEX idx_foia_request_patterns_signature ON foia_request_patterns(pattern_signature);
CREATE INDEX idx_foia_request_patterns_detected ON foia_request_patterns(first_detected_at DESC);

-- Batch Processing Opportunities Table
-- AI-identified requests that can be processed together
CREATE TABLE IF NOT EXISTS foia_batch_opportunities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  group_id VARCHAR(100) NOT NULL UNIQUE,
  request_ids UUID[] NOT NULL,
  similarity_score DECIMAL(5, 2) NOT NULL,
  requester_name VARCHAR(255),
  recommended_action VARCHAR(50) NOT NULL CHECK (
    recommended_action IN ('MERGE', 'PARALLEL', 'COORDINATE')
  ),
  reason TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'PROCESSED')
  ),
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_batch_opportunities_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_batch_opportunities_tenant ON foia_batch_opportunities(tenant_id);
CREATE INDEX idx_foia_batch_opportunities_status ON foia_batch_opportunities(status);
CREATE INDEX idx_foia_batch_opportunities_score ON foia_batch_opportunities(similarity_score DESC);
CREATE INDEX idx_foia_batch_opportunities_created ON foia_batch_opportunities(created_at DESC);

-- Transparency Scores Table
-- Track agency transparency metrics over time
CREATE TABLE IF NOT EXISTS foia_transparency_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  response_time_score INTEGER NOT NULL CHECK (response_time_score BETWEEN 0 AND 25),
  on_time_rate_score INTEGER NOT NULL CHECK (on_time_rate_score BETWEEN 0 AND 25),
  proactive_disclosure_score INTEGER NOT NULL CHECK (proactive_disclosure_score BETWEEN 0 AND 20),
  denial_rate_score INTEGER NOT NULL CHECK (denial_rate_score BETWEEN 0 AND 15),
  appeal_reversal_score INTEGER NOT NULL CHECK (appeal_reversal_score BETWEEN 0 AND 15),
  peer_percentile DECIMAL(5, 2), -- vs same-state same-size peers
  calculation_period_start DATE NOT NULL,
  calculation_period_end DATE NOT NULL,
  calculated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_transparency_scores_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_transparency_scores_tenant ON foia_transparency_scores(tenant_id);
CREATE INDEX idx_foia_transparency_scores_score ON foia_transparency_scores(score DESC);
CREATE INDEX idx_foia_transparency_scores_period ON foia_transparency_scores(calculation_period_end DESC);

-- Workload Forecasts Table
-- AI-generated predictions for resource planning
CREATE TABLE IF NOT EXISTS foia_workload_forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  predicted_volume INTEGER NOT NULL,
  confidence_interval_low INTEGER NOT NULL,
  confidence_interval_high INTEGER NOT NULL,
  recommended_staff INTEGER NOT NULL,
  model_accuracy DECIMAL(5, 2), -- Historical accuracy of predictions
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_workload_forecasts_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_workload_forecasts_tenant ON foia_workload_forecasts(tenant_id);
CREATE INDEX idx_foia_workload_forecasts_period ON foia_workload_forecasts(period_start, period_end);
CREATE INDEX idx_foia_workload_forecasts_created ON foia_workload_forecasts(created_at DESC);

-- Consistency Alerts Table
-- Flag inconsistent exemption applications
CREATE TABLE IF NOT EXISTS foia_consistency_alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  current_request_id UUID NOT NULL,
  prior_request_id UUID NOT NULL,
  current_exemption VARCHAR(50) NOT NULL,
  prior_exemption VARCHAR(50) NOT NULL,
  similarity_score DECIMAL(5, 2) NOT NULL,
  flag VARCHAR(50) NOT NULL CHECK (
    flag IN ('INCONSISTENT', 'BORDERLINE', 'CONSISTENT')
  ),
  reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewer_notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,

  CONSTRAINT foia_consistency_alerts_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT foia_consistency_alerts_current_fk FOREIGN KEY (current_request_id)
    REFERENCES foia_requests(id) ON DELETE CASCADE,
  CONSTRAINT foia_consistency_alerts_prior_fk FOREIGN KEY (prior_request_id)
    REFERENCES foia_requests(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_consistency_alerts_tenant ON foia_consistency_alerts(tenant_id);
CREATE INDEX idx_foia_consistency_alerts_current ON foia_consistency_alerts(current_request_id);
CREATE INDEX idx_foia_consistency_alerts_flag ON foia_consistency_alerts(flag);
CREATE INDEX idx_foia_consistency_alerts_reviewed ON foia_consistency_alerts(reviewed);

-- Comments for documentation
COMMENT ON TABLE foia_request_patterns IS 'Identified patterns across FOIA requests';
COMMENT ON TABLE foia_batch_opportunities IS 'AI-identified opportunities for batch processing';
COMMENT ON TABLE foia_transparency_scores IS 'Transparency metrics calculated over time';
COMMENT ON TABLE foia_workload_forecasts IS 'AI predictions for workload and staffing';
COMMENT ON TABLE foia_consistency_alerts IS 'Alerts for inconsistent exemption applications';
