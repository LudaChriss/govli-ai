-- Govli AI FOIA Module: Proactive Disclosure
-- Migration 003: Tables for proactive disclosure candidates and published records

-- Proactive Disclosure Candidates Table
-- AI-identified records that are frequently requested and should be published
CREATE TABLE IF NOT EXISTS foia_proactive_candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  record_type VARCHAR(255) NOT NULL,
  frequency_score DECIMAL(5, 2) NOT NULL, -- How often requested
  request_count INTEGER NOT NULL DEFAULT 0,
  last_requested_at TIMESTAMP,
  recommended_publish_date DATE,
  justification TEXT, -- AI-generated explanation
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (
    status IN ('PENDING', 'APPROVED', 'PUBLISHED', 'REJECTED')
  ),
  published_at TIMESTAMP,
  published_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_proactive_candidates_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_proactive_candidates_tenant ON foia_proactive_candidates(tenant_id);
CREATE INDEX idx_foia_proactive_candidates_status ON foia_proactive_candidates(status);
CREATE INDEX idx_foia_proactive_candidates_score ON foia_proactive_candidates(frequency_score DESC);
CREATE INDEX idx_foia_proactive_candidates_record_type ON foia_proactive_candidates(record_type);

-- Proactive Disclosure Library Table
-- Published records available for self-service
CREATE TABLE IF NOT EXISTS foia_proactive_library (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  record_type VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  tags TEXT[], -- Array of searchable tags
  file_url TEXT NOT NULL,
  file_size_bytes BIGINT,
  file_type VARCHAR(50),
  download_count INTEGER NOT NULL DEFAULT 0,
  search_vector tsvector, -- Full-text search
  published_date DATE NOT NULL,
  last_updated_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_proactive_library_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_proactive_library_tenant ON foia_proactive_library(tenant_id);
CREATE INDEX idx_foia_proactive_library_category ON foia_proactive_library(category);
CREATE INDEX idx_foia_proactive_library_record_type ON foia_proactive_library(record_type);
CREATE INDEX idx_foia_proactive_library_published ON foia_proactive_library(published_date DESC);
CREATE INDEX idx_foia_proactive_library_downloads ON foia_proactive_library(download_count DESC);
CREATE INDEX idx_foia_proactive_library_search ON foia_proactive_library USING GIN(search_vector);
CREATE INDEX idx_foia_proactive_library_tags ON foia_proactive_library USING GIN(tags);

-- Deflection Log Table
-- Track when requesters find what they need in proactive disclosure
CREATE TABLE IF NOT EXISTS foia_deflection_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  deflection_id VARCHAR(100) NOT NULL,
  search_query TEXT NOT NULL,
  matched_record_id UUID,
  match_score DECIMAL(5, 2),
  deflected BOOLEAN NOT NULL DEFAULT false, -- Did user download instead of submitting?
  created_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_deflection_log_tenant_fk FOREIGN KEY (tenant_id)
    REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT foia_deflection_log_record_fk FOREIGN KEY (matched_record_id)
    REFERENCES foia_proactive_library(id) ON DELETE SET NULL
);

CREATE INDEX idx_foia_deflection_log_tenant ON foia_deflection_log(tenant_id);
CREATE INDEX idx_foia_deflection_log_deflected ON foia_deflection_log(deflected);
CREATE INDEX idx_foia_deflection_log_created ON foia_deflection_log(created_at);

-- Function to update search vector on insert/update
CREATE OR REPLACE FUNCTION update_proactive_library_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english',
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(NEW.record_type, '') || ' ' ||
    COALESCE(NEW.category, '') || ' ' ||
    COALESCE(array_to_string(NEW.tags, ' '), '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_proactive_library_search_vector
  BEFORE INSERT OR UPDATE ON foia_proactive_library
  FOR EACH ROW
  EXECUTE FUNCTION update_proactive_library_search_vector();

-- Function to increment download count
CREATE OR REPLACE FUNCTION increment_proactive_library_download()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE foia_proactive_library
  SET download_count = download_count + 1
  WHERE id = NEW.matched_record_id
    AND NEW.deflected = true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_proactive_library_download
  AFTER INSERT ON foia_deflection_log
  FOR EACH ROW
  WHEN (NEW.deflected = true)
  EXECUTE FUNCTION increment_proactive_library_download();

-- Comments for documentation
COMMENT ON TABLE foia_proactive_candidates IS 'AI-recommended records for proactive disclosure';
COMMENT ON TABLE foia_proactive_library IS 'Published records available for public self-service';
COMMENT ON TABLE foia_deflection_log IS 'Track when users find records without submitting requests';
