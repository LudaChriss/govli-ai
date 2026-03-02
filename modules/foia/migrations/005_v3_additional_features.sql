-- Govli AI FOIA Module: v3.0 Additional Features
-- Migration 005: Migration tracking, response cloning, copilot, and compatibility

-- Migration Records Table
-- Track legacy system data migrations
CREATE TABLE IF NOT EXISTS foia_migration_records (
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

  CONSTRAINT foia_migration_records_request_fk FOREIGN KEY (govli_request_id)
    REFERENCES foia_requests(id) ON DELETE CASCADE,
  CONSTRAINT unique_legacy_record UNIQUE (migration_source, legacy_id)
);

CREATE INDEX idx_foia_migration_records_source ON foia_migration_records(migration_source);
CREATE INDEX idx_foia_migration_records_legacy_id ON foia_migration_records(legacy_id);
CREATE INDEX idx_foia_migration_records_govli_id ON foia_migration_records(govli_request_id);
CREATE INDEX idx_foia_migration_records_status ON foia_migration_records(validation_status);

-- Response Clone Table
-- Track cloned/templated responses
CREATE TABLE IF NOT EXISTS foia_response_clones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_request_id UUID NOT NULL,
  target_request_id UUID NOT NULL,
  cloned_sections TEXT[] NOT NULL, -- e.g., ['introduction', 'exemptions', 'closing']
  customizations_required TEXT[], -- Sections that need manual editing
  clone_metadata JSONB,
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  last_modified_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_response_clones_source_fk FOREIGN KEY (source_request_id)
    REFERENCES foia_requests(id) ON DELETE CASCADE,
  CONSTRAINT foia_response_clones_target_fk FOREIGN KEY (target_request_id)
    REFERENCES foia_requests(id) ON DELETE CASCADE,
  CONSTRAINT foia_response_clones_user_fk FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_foia_response_clones_source ON foia_response_clones(source_request_id);
CREATE INDEX idx_foia_response_clones_target ON foia_response_clones(target_request_id);
CREATE INDEX idx_foia_response_clones_created_by ON foia_response_clones(created_by);
CREATE INDEX idx_foia_response_clones_created_at ON foia_response_clones(created_at DESC);

-- Copilot Sessions Table
-- AI-assisted conversation sessions for staff
CREATE TABLE IF NOT EXISTS foia_copilot_sessions (
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

  CONSTRAINT foia_copilot_sessions_request_fk FOREIGN KEY (request_id)
    REFERENCES foia_requests(id) ON DELETE CASCADE,
  CONSTRAINT foia_copilot_sessions_user_fk FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_copilot_sessions_request ON foia_copilot_sessions(request_id);
CREATE INDEX idx_foia_copilot_sessions_user ON foia_copilot_sessions(user_id);
CREATE INDEX idx_foia_copilot_sessions_started ON foia_copilot_sessions(started_at DESC);
CREATE INDEX idx_foia_copilot_sessions_active ON foia_copilot_sessions(ended_at)
  WHERE ended_at IS NULL;

-- Compatibility API Requests Table
-- Log requests from legacy system integrations
CREATE TABLE IF NOT EXISTS foia_compat_requests (
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
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,

  CONSTRAINT valid_http_method CHECK (
    request_method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
  )
);

CREATE INDEX idx_foia_compat_requests_legacy_system ON foia_compat_requests(legacy_system);
CREATE INDEX idx_foia_compat_requests_endpoint ON foia_compat_requests(endpoint);
CREATE INDEX idx_foia_compat_requests_status ON foia_compat_requests(status);
CREATE INDEX idx_foia_compat_requests_created ON foia_compat_requests(created_at DESC);

-- Function to update copilot message count
CREATE OR REPLACE FUNCTION update_copilot_message_count()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_messages := jsonb_array_length(NEW.messages);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_copilot_message_count
  BEFORE INSERT OR UPDATE ON foia_copilot_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_copilot_message_count();

-- Function to track compat API performance
CREATE OR REPLACE FUNCTION complete_compat_request()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'COMPLETED' OR NEW.status = 'FAILED' THEN
    NEW.completed_at := NOW();
    NEW.processing_time_ms := EXTRACT(EPOCH FROM (NOW() - NEW.created_at)) * 1000;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_complete_compat_request
  BEFORE UPDATE ON foia_compat_requests
  FOR EACH ROW
  WHEN (OLD.status = 'PENDING' AND (NEW.status = 'COMPLETED' OR NEW.status = 'FAILED'))
  EXECUTE FUNCTION complete_compat_request();

-- Scoping Suggestions Table
-- Store AI-generated scoping recommendations
CREATE TABLE IF NOT EXISTS foia_scoping_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL,
  original_description TEXT NOT NULL,
  suggested_refinement TEXT NOT NULL,
  scoping_flags TEXT[] NOT NULL, -- e.g., ['TOO_BROAD', 'MISSING_DATE']
  confidence_score DECIMAL(5, 2) NOT NULL,
  accepted BOOLEAN,
  staff_feedback TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,

  CONSTRAINT foia_scoping_suggestions_request_fk FOREIGN KEY (request_id)
    REFERENCES foia_requests(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_scoping_suggestions_request ON foia_scoping_suggestions(request_id);
CREATE INDEX idx_foia_scoping_suggestions_accepted ON foia_scoping_suggestions(accepted);
CREATE INDEX idx_foia_scoping_suggestions_created ON foia_scoping_suggestions(created_at DESC);

-- Triage Scores Table
-- AI relevance and triage scoring
CREATE TABLE IF NOT EXISTS foia_triage_scores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL,
  document_id UUID, -- Optional: can score documents too
  relevance_score DECIMAL(5, 2) NOT NULL CHECK (relevance_score BETWEEN 0 AND 100),
  confidence_score DECIMAL(5, 2) NOT NULL CHECK (confidence_score BETWEEN 0 AND 100),
  bucket VARCHAR(50) NOT NULL CHECK (
    bucket IN ('LIKELY_RESPONSIVE', 'POSSIBLY_RESPONSIVE', 'REVIEW_NEEDED')
  ),
  reasoning TEXT,
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_triage_scores_request_fk FOREIGN KEY (request_id)
    REFERENCES foia_requests(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_triage_scores_request ON foia_triage_scores(request_id);
CREATE INDEX idx_foia_triage_scores_bucket ON foia_triage_scores(bucket);
CREATE INDEX idx_foia_triage_scores_relevance ON foia_triage_scores(relevance_score DESC);

-- Comments for documentation
COMMENT ON TABLE foia_migration_records IS 'Track legacy system data migrations';
COMMENT ON TABLE foia_response_clones IS 'Response templates cloned from similar requests';
COMMENT ON TABLE foia_copilot_sessions IS 'AI copilot conversation sessions';
COMMENT ON TABLE foia_compat_requests IS 'Legacy system API compatibility layer';
COMMENT ON TABLE foia_scoping_suggestions IS 'AI-generated request scoping recommendations';
COMMENT ON TABLE foia_triage_scores IS 'AI relevance and triage scoring';
