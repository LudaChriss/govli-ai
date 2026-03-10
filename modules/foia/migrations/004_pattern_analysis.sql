-- Govli AI FOIA Module: Pattern Analysis & Batch Processing
-- Migration 004: Tables for request patterns, batching, and transparency metrics (Updated for PascalCase schema)

-- Request Patterns Table
-- Store identified patterns across FOIA requests
CREATE TABLE IF NOT EXISTS "FoiaRequestPatterns" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pattern_type VARCHAR(100) NOT NULL CHECK (
    pattern_type IN ('DUPLICATE', 'SIMILAR', 'SEASONAL', 'REQUESTER_PATTERN')
  ),
  pattern_signature TEXT NOT NULL, -- Hash or key identifying the pattern
  request_ids UUID[] NOT NULL, -- Array of related request IDs
  first_detected_at TIMESTAMP DEFAULT NOW(),
  last_updated_at TIMESTAMP DEFAULT NOW(),
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  metadata JSONB, -- Additional pattern-specific data
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_foia_request_patterns_type ON "FoiaRequestPatterns"(pattern_type);
CREATE INDEX idx_foia_request_patterns_signature ON "FoiaRequestPatterns"(pattern_signature);
CREATE INDEX idx_foia_request_patterns_detected ON "FoiaRequestPatterns"(first_detected_at DESC);

-- Batch Processing Opportunities Table
-- AI-identified requests that can be processed together
CREATE TABLE IF NOT EXISTS "FoiaBatchOpportunities" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_foia_batch_opportunities_status ON "FoiaBatchOpportunities"(status);
CREATE INDEX idx_foia_batch_opportunities_score ON "FoiaBatchOpportunities"(similarity_score DESC);
CREATE INDEX idx_foia_batch_opportunities_created ON "FoiaBatchOpportunities"("createdAt" DESC);

-- Transparency Scores Table
-- Track agency transparency metrics over time
CREATE TABLE IF NOT EXISTS "FoiaTransparencyScores" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_foia_transparency_scores_score ON "FoiaTransparencyScores"(score DESC);
CREATE INDEX idx_foia_transparency_scores_period ON "FoiaTransparencyScores"(calculation_period_end DESC);

-- Workload Forecasts Table
-- AI-generated predictions for resource planning
CREATE TABLE IF NOT EXISTS "FoiaWorkloadForecasts" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  predicted_volume INTEGER NOT NULL,
  confidence_interval_low INTEGER NOT NULL,
  confidence_interval_high INTEGER NOT NULL,
  recommended_staff INTEGER NOT NULL,
  model_accuracy DECIMAL(5, 2), -- Historical accuracy of predictions
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_foia_workload_forecasts_period ON "FoiaWorkloadForecasts"(period_start, period_end);
CREATE INDEX idx_foia_workload_forecasts_created ON "FoiaWorkloadForecasts"("createdAt" DESC);

-- Consistency Alerts Table
-- Flag inconsistent exemption applications
CREATE TABLE IF NOT EXISTS "FoiaConsistencyAlerts" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,

  CONSTRAINT foia_consistency_alerts_current_fk FOREIGN KEY (current_request_id)
    REFERENCES "FoiaRequests"(id) ON DELETE CASCADE,
  CONSTRAINT foia_consistency_alerts_prior_fk FOREIGN KEY (prior_request_id)
    REFERENCES "FoiaRequests"(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_consistency_alerts_current ON "FoiaConsistencyAlerts"(current_request_id);
CREATE INDEX idx_foia_consistency_alerts_flag ON "FoiaConsistencyAlerts"(flag);
CREATE INDEX idx_foia_consistency_alerts_reviewed ON "FoiaConsistencyAlerts"(reviewed);

-- Comments for documentation
COMMENT ON TABLE "FoiaRequestPatterns" IS 'Identified patterns across FOIA requests';
COMMENT ON TABLE "FoiaBatchOpportunities" IS 'AI-identified opportunities for batch processing';
COMMENT ON TABLE "FoiaTransparencyScores" IS 'Transparency metrics calculated over time';
COMMENT ON TABLE "FoiaWorkloadForecasts" IS 'AI predictions for workload and staffing';
COMMENT ON TABLE "FoiaConsistencyAlerts" IS 'Alerts for inconsistent exemption applications';
