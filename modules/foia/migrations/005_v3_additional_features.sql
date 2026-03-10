-- Govli AI FOIA Module: v3.0 Additional Features
-- Migration 005: Migration tracking, response cloning, copilot, and compatibility (Updated for PascalCase schema)

-- Migration Records Table
-- Track legacy system data migrations
CREATE TABLE IF NOT EXISTS "FoiaMigrationRecords" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  migration_source VARCHAR(50) NOT NULL CHECK (
    migration_source IN ('govqa', 'nextrequest', 'justfoia', 'foiaxpress', 'spreadsheet', 'email')
  ),
  legacy_id VARCHAR(255) NOT NULL,
  legacy_status VARCHAR(100),
  govli_request_id UUID NOT NULL,
  validation_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (
    validation_status IN ('PENDING', 'VALID', 'NEEDS_REVIEW')
  ),
  migration_metadata JSONB, -- Store legacy system specific data
  migrated_at TIMESTAMP DEFAULT NOW(),
  validated_at TIMESTAMP,
  validator_notes TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_migration_records_request_fk FOREIGN KEY (govli_request_id)
    REFERENCES "FoiaRequests"(id) ON DELETE CASCADE,
  CONSTRAINT unique_legacy_record UNIQUE (migration_source, legacy_id)
);

CREATE INDEX idx_foia_migration_records_source ON "FoiaMigrationRecords"(migration_source);
CREATE INDEX idx_foia_migration_records_legacy_id ON "FoiaMigrationRecords"(legacy_id);
CREATE INDEX idx_foia_migration_records_govli_id ON "FoiaMigrationRecords"(govli_request_id);
CREATE INDEX idx_foia_migration_records_status ON "FoiaMigrationRecords"(validation_status);

-- Response Clone Table
-- Track cloned/templated responses
CREATE TABLE IF NOT EXISTS "FoiaResponseClones" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_request_id UUID NOT NULL,
  target_request_id UUID NOT NULL,
  cloned_sections TEXT[] NOT NULL, -- e.g., ['introduction', 'exemptions', 'closing']
  customizations_required TEXT[], -- Sections that need manual editing
  clone_metadata JSONB,
  created_by UUID NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  last_modified_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_response_clones_source_fk FOREIGN KEY (source_request_id)
    REFERENCES "FoiaRequests"(id) ON DELETE CASCADE,
  CONSTRAINT foia_response_clones_target_fk FOREIGN KEY (target_request_id)
    REFERENCES "FoiaRequests"(id) ON DELETE CASCADE,
  CONSTRAINT foia_response_clones_user_fk FOREIGN KEY (created_by)
    REFERENCES "Users"(id) ON DELETE SET NULL
);

CREATE INDEX idx_foia_response_clones_source ON "FoiaResponseClones"(source_request_id);
CREATE INDEX idx_foia_response_clones_target ON "FoiaResponseClones"(target_request_id);
CREATE INDEX idx_foia_response_clones_created_by ON "FoiaResponseClones"(created_by);
CREATE INDEX idx_foia_response_clones_created_at ON "FoiaResponseClones"("createdAt" DESC);

-- Copilot Sessions Table
-- AI-assisted conversation sessions for staff
CREATE TABLE IF NOT EXISTS "FoiaCopilotSessions" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL,
  user_id UUID NOT NULL,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of {role, content, timestamp}
  context_data JSONB, -- Additional context for AI
  started_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP,
  total_messages INTEGER NOT NULL DEFAULT 0,
  ai_suggestions_accepted INTEGER NOT NULL DEFAULT 0,
  ai_suggestions_rejected INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_copilot_sessions_request_fk FOREIGN KEY (request_id)
    REFERENCES "FoiaRequests"(id) ON DELETE CASCADE,
  CONSTRAINT foia_copilot_sessions_user_fk FOREIGN KEY (user_id)
    REFERENCES "Users"(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_copilot_sessions_request ON "FoiaCopilotSessions"(request_id);
CREATE INDEX idx_foia_copilot_sessions_user ON "FoiaCopilotSessions"(user_id);
CREATE INDEX idx_foia_copilot_sessions_started ON "FoiaCopilotSessions"(started_at DESC);
CREATE INDEX idx_foia_copilot_sessions_active ON "FoiaCopilotSessions"(ended_at)
  WHERE ended_at IS NULL;

-- Compatibility API Requests Table
-- Log requests from legacy system integrations
CREATE TABLE IF NOT EXISTS "FoiaCompatRequests" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  legacy_system VARCHAR(50) NOT NULL CHECK (
    legacy_system IN ('govqa', 'nextrequest', 'justfoia', 'foiaxpress', 'spreadsheet', 'email')
  ),
  endpoint VARCHAR(255) NOT NULL,
  request_method VARCHAR(10) NOT NULL,
  request_data JSONB NOT NULL,
  response_data JSONB,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'COMPLETED', 'FAILED')
  ),
  error_message TEXT,
  processing_time_ms INTEGER,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  CONSTRAINT valid_http_method CHECK (
    request_method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
  )
);

CREATE INDEX idx_foia_compat_requests_legacy_system ON "FoiaCompatRequests"(legacy_system);
CREATE INDEX idx_foia_compat_requests_endpoint ON "FoiaCompatRequests"(endpoint);
CREATE INDEX idx_foia_compat_requests_status ON "FoiaCompatRequests"(status);
CREATE INDEX idx_foia_compat_requests_created ON "FoiaCompatRequests"("createdAt" DESC);

-- Function to update copilot message count
CREATE OR REPLACE FUNCTION update_copilot_message_count()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_messages := jsonb_array_length(NEW.messages);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_copilot_message_count
  BEFORE INSERT OR UPDATE ON "FoiaCopilotSessions"
  FOR EACH ROW
  EXECUTE FUNCTION update_copilot_message_count();

-- Function to track compat API performance
CREATE OR REPLACE FUNCTION complete_compat_request()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'COMPLETED' OR NEW.status = 'FAILED' THEN
    NEW.completed_at := NOW();
    NEW.processing_time_ms := EXTRACT(EPOCH FROM (NOW() - NEW."createdAt")) * 1000;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_complete_compat_request
  BEFORE UPDATE ON "FoiaCompatRequests"
  FOR EACH ROW
  WHEN (OLD.status = 'PENDING' AND (NEW.status = 'COMPLETED' OR NEW.status = 'FAILED'))
  EXECUTE FUNCTION complete_compat_request();

-- Scoping Suggestions Table
-- Store AI-generated scoping recommendations
CREATE TABLE IF NOT EXISTS "FoiaScopingSuggestions" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL,
  original_description TEXT NOT NULL,
  suggested_refinement TEXT NOT NULL,
  scoping_flags TEXT[] NOT NULL, -- e.g., ['TOO_BROAD', 'MISSING_DATE']
  confidence_score DECIMAL(5, 2) NOT NULL,
  accepted BOOLEAN,
  staff_feedback TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,

  CONSTRAINT foia_scoping_suggestions_request_fk FOREIGN KEY (request_id)
    REFERENCES "FoiaRequests"(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_scoping_suggestions_request ON "FoiaScopingSuggestions"(request_id);
CREATE INDEX idx_foia_scoping_suggestions_accepted ON "FoiaScopingSuggestions"(accepted);
CREATE INDEX idx_foia_scoping_suggestions_created ON "FoiaScopingSuggestions"("createdAt" DESC);

-- Triage Scores Table
-- AI relevance and triage scoring
CREATE TABLE IF NOT EXISTS "FoiaTriageScores" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL,
  document_id UUID, -- Optional: can score documents too
  relevance_score DECIMAL(5, 2) NOT NULL CHECK (relevance_score BETWEEN 0 AND 100),
  confidence_score DECIMAL(5, 2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  bucket VARCHAR(50) NOT NULL CHECK (
    bucket IN ('LIKELY_RESPONSIVE', 'POSSIBLY_RESPONSIVE', 'REVIEW_NEEDED')
  ),
  reasoning TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_triage_scores_request_fk FOREIGN KEY (request_id)
    REFERENCES "FoiaRequests"(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_triage_scores_request ON "FoiaTriageScores"(request_id);
CREATE INDEX idx_foia_triage_scores_bucket ON "FoiaTriageScores"(bucket);
CREATE INDEX idx_foia_triage_scores_relevance ON "FoiaTriageScores"(relevance_score DESC);

-- Comments for documentation
COMMENT ON TABLE "FoiaMigrationRecords" IS 'Track legacy system data migrations';
COMMENT ON TABLE "FoiaResponseClones" IS 'Response templates cloned from similar requests';
COMMENT ON TABLE "FoiaCopilotSessions" IS 'AI copilot conversation sessions';
COMMENT ON TABLE "FoiaCompatRequests" IS 'Legacy system API compatibility layer';
COMMENT ON TABLE "FoiaScopingSuggestions" IS 'AI-generated request scoping recommendations';
COMMENT ON TABLE "FoiaTriageScores" IS 'AI relevance and triage scoring';
