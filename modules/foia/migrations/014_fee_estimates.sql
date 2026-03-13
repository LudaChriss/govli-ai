/**
 * AI-8: Real-Time Fee Estimator - Database Migration
 *
 * Creates tables for storing fee estimates, schedules, and accuracy tracking.
 */

-- ============================================================================
-- Table: FoiaFeeSchedules
-- Agency-specific fee schedules and policies
-- ============================================================================

CREATE TABLE IF NOT EXISTS "FoiaFeeSchedules" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  agency_id VARCHAR(255) NOT NULL,
  agency_name VARCHAR(500) NOT NULL,

  -- Rates
  search_rate_per_hour DECIMAL(10, 2) NOT NULL DEFAULT 25.00,
  review_rate_per_hour DECIMAL(10, 2) NOT NULL DEFAULT 40.00,
  copy_rate_per_page DECIMAL(10, 2) NOT NULL DEFAULT 0.10,

  -- Exemptions by requester category
  first_two_hours_free_general BOOLEAN DEFAULT true,
  first_100_pages_free_general BOOLEAN DEFAULT true,
  first_100_pages_free_media BOOLEAN DEFAULT true,
  commercial_review_required BOOLEAN DEFAULT true,

  -- Thresholds
  fee_waiver_threshold DECIMAL(10, 2) DEFAULT 15.00,
  advance_payment_threshold DECIMAL(10, 2) DEFAULT 25.00,

  -- Metadata
  effective_date TIMESTAMP DEFAULT NOW(),
  superseded_at TIMESTAMP,
  created_by VARCHAR(255),

  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- Table: FoiaFeeEstimates
-- AI-generated fee estimates for FOIA requests
-- ============================================================================

CREATE TABLE IF NOT EXISTS "FoiaFeeEstimates" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  foia_request_id UUID NOT NULL,

  -- Requester context
  requester_category VARCHAR(50) NOT NULL, -- commercial, news_media, educational, general_public

  -- Estimates
  fee_estimate_low DECIMAL(10, 2) NOT NULL,
  fee_estimate_high DECIMAL(10, 2) NOT NULL,
  likely_fee DECIMAL(10, 2) NOT NULL,
  likely_fee_waiver_eligible BOOLEAN DEFAULT false,

  -- Breakdown (stored as JSONB)
  fee_breakdown JSONB NOT NULL, -- { search_hours, search_cost, review_hours, review_cost, estimated_pages, copy_cost, subtotal, exemptions_applied, total }

  -- Explanation
  plain_english_explanation TEXT NOT NULL,
  waiver_application_url VARCHAR(500),

  -- Estimation metadata
  estimated_at TIMESTAMP DEFAULT NOW(),
  estimation_confidence VARCHAR(20) DEFAULT 'medium', -- low, medium, high
  model_used VARCHAR(100), -- e.g., 'ml-v1.0' or 'fallback'
  estimation_method VARCHAR(50), -- 'ml_model', 'agency_average', 'default'

  -- Accuracy tracking
  actual_fee DECIMAL(10, 2), -- Filled in after case closes
  actual_search_hours DECIMAL(10, 2),
  actual_pages INTEGER,
  accuracy_percentage DECIMAL(5, 2), -- Calculated: (1 - |estimated - actual| / actual) * 100
  accuracy_tracked BOOLEAN DEFAULT false,
  tracked_at TIMESTAMP,

  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),

  CONSTRAINT fk_foia_request
    FOREIGN KEY (foia_request_id)
    REFERENCES "FoiaRequests"(id)
    ON DELETE CASCADE
);

-- ============================================================================
-- Table: FoiaHistoricalFeeCases
-- Historical data for training ML models
-- ============================================================================

CREATE TABLE IF NOT EXISTS "FoiaHistoricalFeeCases" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,
  foia_request_id UUID NOT NULL,

  -- Request characteristics
  record_type VARCHAR(255),
  date_range_years INTEGER,
  requester_category VARCHAR(50),
  estimated_volume VARCHAR(50), -- low, moderate, high, very_high

  -- Actual values
  actual_search_hours DECIMAL(10, 2) NOT NULL,
  actual_review_hours DECIMAL(10, 2),
  actual_pages INTEGER NOT NULL,
  actual_fee DECIMAL(10, 2) NOT NULL,

  -- Metadata
  closed_at TIMESTAMP NOT NULL,

  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- Table: FoiaFeeAccuracyMetrics
-- Aggregated accuracy metrics for monitoring
-- ============================================================================

CREATE TABLE IF NOT EXISTS "FoiaFeeAccuracyMetrics" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id VARCHAR(255) NOT NULL,

  -- Time period
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,

  -- Metrics
  total_estimates INTEGER DEFAULT 0,
  estimates_with_actuals INTEGER DEFAULT 0,
  avg_accuracy_percentage DECIMAL(5, 2),
  median_accuracy_percentage DECIMAL(5, 2),

  -- Accuracy buckets
  within_10_percent INTEGER DEFAULT 0,
  within_25_percent INTEGER DEFAULT 0,
  within_50_percent INTEGER DEFAULT 0,
  over_50_percent_off INTEGER DEFAULT 0,

  -- Bias tracking
  overestimates INTEGER DEFAULT 0,
  underestimates INTEGER DEFAULT 0,
  avg_overestimate_amount DECIMAL(10, 2),
  avg_underestimate_amount DECIMAL(10, 2),

  -- Model performance
  ml_model_accuracy DECIMAL(5, 2),
  fallback_accuracy DECIMAL(5, 2),

  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Fee schedules
CREATE INDEX IF NOT EXISTS idx_fee_schedules_tenant_agency
  ON "FoiaFeeSchedules"(tenant_id, agency_id);

CREATE INDEX IF NOT EXISTS idx_fee_schedules_effective
  ON "FoiaFeeSchedules"(effective_date)
  WHERE superseded_at IS NULL;

-- Fee estimates
CREATE INDEX IF NOT EXISTS idx_fee_estimates_tenant
  ON "FoiaFeeEstimates"(tenant_id);

CREATE INDEX IF NOT EXISTS idx_fee_estimates_request
  ON "FoiaFeeEstimates"(foia_request_id);

CREATE INDEX IF NOT EXISTS idx_fee_estimates_category
  ON "FoiaFeeEstimates"(requester_category);

CREATE INDEX IF NOT EXISTS idx_fee_estimates_confidence
  ON "FoiaFeeEstimates"(estimation_confidence);

CREATE INDEX IF NOT EXISTS idx_fee_estimates_untracked
  ON "FoiaFeeEstimates"(accuracy_tracked)
  WHERE accuracy_tracked = false;

-- Historical cases
CREATE INDEX IF NOT EXISTS idx_historical_cases_tenant_type
  ON "FoiaHistoricalFeeCases"(tenant_id, record_type);

CREATE INDEX IF NOT EXISTS idx_historical_cases_category
  ON "FoiaHistoricalFeeCases"(requester_category);

CREATE INDEX IF NOT EXISTS idx_historical_cases_closed
  ON "FoiaHistoricalFeeCases"(closed_at DESC);

-- Accuracy metrics
CREATE INDEX IF NOT EXISTS idx_accuracy_metrics_tenant_period
  ON "FoiaFeeAccuracyMetrics"(tenant_id, period_start, period_end);

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE "FoiaFeeSchedules" IS 'AI-8: Agency-specific fee schedules and policies';
COMMENT ON TABLE "FoiaFeeEstimates" IS 'AI-8: AI-generated fee estimates for FOIA requests';
COMMENT ON TABLE "FoiaHistoricalFeeCases" IS 'AI-8: Historical data for training ML models';
COMMENT ON TABLE "FoiaFeeAccuracyMetrics" IS 'AI-8: Aggregated accuracy metrics for monitoring';

COMMENT ON COLUMN "FoiaFeeEstimates".fee_breakdown IS 'JSONB: { search_hours, search_cost, review_hours, review_cost, estimated_pages, copy_cost, subtotal, exemptions_applied[], total }';
COMMENT ON COLUMN "FoiaFeeEstimates".accuracy_percentage IS 'Calculated as: (1 - |estimated - actual| / actual) * 100';
COMMENT ON COLUMN "FoiaFeeEstimates".model_used IS 'ML model version (e.g., ml-v1.0) or fallback method';

-- ============================================================================
-- Sample Data: Default Fee Schedule
-- ============================================================================

-- Insert default fee schedule for testing
-- In production, this would be populated via admin interface
INSERT INTO "FoiaFeeSchedules" (
  tenant_id,
  agency_id,
  agency_name,
  search_rate_per_hour,
  review_rate_per_hour,
  copy_rate_per_page,
  first_two_hours_free_general,
  first_100_pages_free_general,
  first_100_pages_free_media,
  commercial_review_required,
  fee_waiver_threshold,
  advance_payment_threshold
) VALUES (
  'default',
  'default-agency',
  'Default Agency',
  25.00,
  40.00,
  0.10,
  true,
  true,
  true,
  true,
  15.00,
  25.00
) ON CONFLICT DO NOTHING;
