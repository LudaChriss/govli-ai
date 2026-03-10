-- Govli AI FOIA Module: v2.0 Processing Enhancements
-- Migration 007: Batch jobs, redaction tables, and confidence calibration (Updated for PascalCase schema)

-- Batch Jobs Table
-- For queuing high-volume redaction/processing tasks
CREATE TABLE IF NOT EXISTS "FoiaBatchJobs" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL,
  job_type VARCHAR(50) NOT NULL CHECK (
    job_type IN ('REDACTION', 'TRIAGE', 'REVIEW', 'RESPONSE_DRAFT')
  ),
  document_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'QUEUED' CHECK (
    status IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')
  ),
  metadata JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_batch_jobs_request_fk FOREIGN KEY (request_id)
    REFERENCES "FoiaRequests"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_foia_batch_jobs_request ON "FoiaBatchJobs"(request_id);
CREATE INDEX IF NOT EXISTS idx_foia_batch_jobs_status ON "FoiaBatchJobs"(status) WHERE status != 'COMPLETED';
CREATE INDEX IF NOT EXISTS idx_foia_batch_jobs_created ON "FoiaBatchJobs"("createdAt");

-- Redaction Suggestions Table
-- Stores AI-generated redaction suggestions
CREATE TABLE IF NOT EXISTS "FoiaRedactionSuggestions" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL,
  text TEXT NOT NULL,
  exemption_code VARCHAR(20) NOT NULL,
  start_position INTEGER NOT NULL,
  end_position INTEGER NOT NULL,
  confidence DECIMAL(3, 2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  rationale TEXT,
  officer_action VARCHAR(20) CHECK (
    officer_action IN ('accept', 'reject', 'modify', NULL)
  ),
  officer_id UUID,
  reviewed_at TIMESTAMP,
  created_by UUID,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_redaction_suggestions_document_fk FOREIGN KEY (document_id)
    REFERENCES "FoiaDocuments"(id) ON DELETE CASCADE,
  CONSTRAINT foia_redaction_suggestions_officer_fk FOREIGN KEY (officer_id)
    REFERENCES "Users"(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_foia_redaction_suggestions_document ON "FoiaRedactionSuggestions"(document_id);
CREATE INDEX IF NOT EXISTS idx_foia_redaction_suggestions_confidence ON "FoiaRedactionSuggestions"(confidence);
CREATE INDEX IF NOT EXISTS idx_foia_redaction_suggestions_action ON "FoiaRedactionSuggestions"(officer_action);

-- Redaction Overrides Table (v2.0 Confidence Calibration)
-- Tracks when officers accept/reject/modify AI suggestions
-- Used to calibrate AI confidence scores over time
CREATE TABLE IF NOT EXISTS "FoiaRedactionOverrides" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  suggestion_id UUID NOT NULL,
  document_id UUID NOT NULL,
  officer_id UUID NOT NULL,
  ai_confidence DECIMAL(3, 2) NOT NULL,
  ai_exemption VARCHAR(20) NOT NULL,
  officer_action VARCHAR(20) NOT NULL CHECK (
    officer_action IN ('accept', 'reject', 'modify')
  ),
  officer_exemption VARCHAR(20),
  notes TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_redaction_overrides_suggestion_fk FOREIGN KEY (suggestion_id)
    REFERENCES "FoiaRedactionSuggestions"(id) ON DELETE CASCADE,
  CONSTRAINT foia_redaction_overrides_document_fk FOREIGN KEY (document_id)
    REFERENCES "FoiaDocuments"(id) ON DELETE CASCADE,
  CONSTRAINT foia_redaction_overrides_officer_fk FOREIGN KEY (officer_id)
    REFERENCES "Users"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_foia_redaction_overrides_suggestion ON "FoiaRedactionOverrides"(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_foia_redaction_overrides_officer ON "FoiaRedactionOverrides"(officer_id);
CREATE INDEX IF NOT EXISTS idx_foia_redaction_overrides_action ON "FoiaRedactionOverrides"(officer_action);
CREATE INDEX IF NOT EXISTS idx_foia_redaction_overrides_created ON "FoiaRedactionOverrides"("createdAt");

-- Confidence Calibration Summary View
-- Aggregates AI confidence vs officer decisions for model tuning
CREATE OR REPLACE VIEW "FoiaConfidenceCalibration" AS
SELECT
  ai_exemption,
  ROUND(ai_confidence, 1) as confidence_bucket,
  COUNT(*) as total_suggestions,
  SUM(CASE WHEN officer_action = 'accept' THEN 1 ELSE 0 END) as accepted_count,
  SUM(CASE WHEN officer_action = 'reject' THEN 1 ELSE 0 END) as rejected_count,
  SUM(CASE WHEN officer_action = 'modify' THEN 1 ELSE 0 END) as modified_count,
  ROUND(
    SUM(CASE WHEN officer_action = 'accept' THEN 1 ELSE 0 END)::DECIMAL / COUNT(*),
    2
  ) as acceptance_rate
FROM "FoiaRedactionOverrides"
GROUP BY ai_exemption, ROUND(ai_confidence, 1);

-- Comments for documentation
COMMENT ON TABLE "FoiaBatchJobs" IS 'v2.0: Queue for high-volume processing tasks (>20 documents)';
COMMENT ON TABLE "FoiaRedactionSuggestions" IS 'v2.0: AI-generated redaction suggestions with confidence scores';
COMMENT ON TABLE "FoiaRedactionOverrides" IS 'v2.0: Officer overrides for confidence calibration tracking';
COMMENT ON VIEW "FoiaConfidenceCalibration" IS 'v2.0: Aggregated AI confidence vs officer decisions for model tuning';

-- AI Model Overrides Table (for feature-specific model routing)
CREATE TABLE IF NOT EXISTS "FoiaAIModelOverrides" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feature_id VARCHAR(50) NOT NULL UNIQUE,
  model_name VARCHAR(100) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_foia_ai_model_overrides_feature ON "FoiaAIModelOverrides"(feature_id);

COMMENT ON TABLE "FoiaAIModelOverrides" IS 'v2.0: Feature-specific AI model routing overrides';
