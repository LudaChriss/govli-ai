-- Govli AI FOIA Module: Appeal Coach
-- Migration 015: AI-9 Appeal Coach Tables

-- Appeal Coach Sessions Table
-- Track appeal coach usage and rate limiting
CREATE TABLE IF NOT EXISTS "FoiaAppealCoachSessions" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  foia_request_id UUID NOT NULL,
  confirmation_number VARCHAR(50) NOT NULL,
  analysis_result JSONB NOT NULL,
  draft_generated BOOLEAN NOT NULL DEFAULT false,
  draft_letter TEXT,
  appeal_submitted BOOLEAN NOT NULL DEFAULT false,
  appeal_submitted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_appeal_coach_sessions_request_fk FOREIGN KEY (foia_request_id)
    REFERENCES "FoiaRequests"(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_appeal_coach_sessions_request ON "FoiaAppealCoachSessions"(foia_request_id);
CREATE INDEX idx_foia_appeal_coach_sessions_confirmation ON "FoiaAppealCoachSessions"(confirmation_number);
CREATE INDEX idx_foia_appeal_coach_sessions_created ON "FoiaAppealCoachSessions"(created_at DESC);
CREATE INDEX idx_foia_appeal_coach_sessions_appeal_submitted ON "FoiaAppealCoachSessions"(appeal_submitted)
  WHERE appeal_submitted = true;

-- Add columns to FoiaRequests for appeal tracking
ALTER TABLE "FoiaRequests"
  ADD COLUMN IF NOT EXISTS response_letter TEXT,
  ADD COLUMN IF NOT EXISTS response_date TIMESTAMP,
  ADD COLUMN IF NOT EXISTS exemptions_applied TEXT[],
  ADD COLUMN IF NOT EXISTS appeal_coach_used BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS appeal_status VARCHAR(50) CHECK (
    appeal_status IN (NULL, 'PENDING', 'UNDER_REVIEW', 'GRANTED', 'DENIED', 'PARTIALLY_GRANTED')
  ),
  ADD COLUMN IF NOT EXISTS appeal_submitted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS appeal_decision_date TIMESTAMP;

-- Add columns to FoiaDocuments for exemptions tracking
CREATE TABLE IF NOT EXISTS "FoiaDocuments" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL,
  title VARCHAR(500),
  fully_withheld BOOLEAN NOT NULL DEFAULT false,
  redacted BOOLEAN NOT NULL DEFAULT false,
  exemptions_applied TEXT[],
  redaction_summary TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_documents_request_fk FOREIGN KEY (request_id)
    REFERENCES "FoiaRequests"(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_documents_request ON "FoiaDocuments"(request_id);
CREATE INDEX idx_foia_documents_withheld ON "FoiaDocuments"(fully_withheld)
  WHERE fully_withheld = true;
CREATE INDEX idx_foia_documents_redacted ON "FoiaDocuments"(redacted)
  WHERE redacted = true;

-- Function to update appeal_coach_used flag
CREATE OR REPLACE FUNCTION mark_appeal_coach_used()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "FoiaRequests"
  SET appeal_coach_used = true
  WHERE id = NEW.foia_request_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mark_appeal_coach_used
  AFTER INSERT ON "FoiaAppealCoachSessions"
  FOR EACH ROW
  EXECUTE FUNCTION mark_appeal_coach_used();

-- Function to track appeal submission
CREATE OR REPLACE FUNCTION track_appeal_submission()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.appeal_submitted = true AND OLD.appeal_submitted = false THEN
    NEW.appeal_submitted_at := NOW();

    -- Update request table
    UPDATE "FoiaRequests"
    SET appeal_submitted_at = NOW(),
        appeal_status = 'PENDING'
    WHERE id = NEW.foia_request_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_track_appeal_submission
  BEFORE UPDATE ON "FoiaAppealCoachSessions"
  FOR EACH ROW
  WHEN (NEW.appeal_submitted <> OLD.appeal_submitted)
  EXECUTE FUNCTION track_appeal_submission();

-- Comments for documentation
COMMENT ON TABLE "FoiaAppealCoachSessions" IS 'AI-9: Track Appeal Coach sessions and rate limiting';
COMMENT ON TABLE "FoiaDocuments" IS 'Track documents and their exemption status for appeal analysis';
COMMENT ON COLUMN "FoiaRequests"."appeal_coach_used" IS 'Flag for appeals submitted via Appeal Coach (helps staff prioritize)';
COMMENT ON COLUMN "FoiaRequests"."exemptions_applied" IS 'Array of exemption codes used in the response';
COMMENT ON COLUMN "FoiaRequests"."response_letter" IS 'Agency response letter text (public-safe)';
