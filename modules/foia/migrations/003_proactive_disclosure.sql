-- Govli AI FOIA Module: Proactive Disclosure
-- Migration 003: Tables for proactive disclosure candidates and published records (Updated for PascalCase schema)

-- Proactive Disclosure Candidates Table
-- AI-identified records that are frequently requested and should be published
CREATE TABLE IF NOT EXISTS "FoiaProactiveCandidates" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_foia_proactive_candidates_status ON "FoiaProactiveCandidates"(status);
CREATE INDEX idx_foia_proactive_candidates_score ON "FoiaProactiveCandidates"(frequency_score DESC);
CREATE INDEX idx_foia_proactive_candidates_record_type ON "FoiaProactiveCandidates"(record_type);

-- Proactive Disclosure Library Table
-- Published records available for self-service
CREATE TABLE IF NOT EXISTS "FoiaProactiveLibrary" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_foia_proactive_library_category ON "FoiaProactiveLibrary"(category);
CREATE INDEX idx_foia_proactive_library_record_type ON "FoiaProactiveLibrary"(record_type);
CREATE INDEX idx_foia_proactive_library_published ON "FoiaProactiveLibrary"(published_date DESC);
CREATE INDEX idx_foia_proactive_library_downloads ON "FoiaProactiveLibrary"(download_count DESC);
CREATE INDEX idx_foia_proactive_library_search ON "FoiaProactiveLibrary" USING GIN(search_vector);
CREATE INDEX idx_foia_proactive_library_tags ON "FoiaProactiveLibrary" USING GIN(tags);

-- Deflection Log Table
-- Track when requesters find what they need in proactive disclosure
CREATE TABLE IF NOT EXISTS "FoiaDeflectionLog" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  deflection_id VARCHAR(100) NOT NULL,
  search_query TEXT NOT NULL,
  matched_record_id UUID,
  match_score DECIMAL(5, 2),
  deflected BOOLEAN NOT NULL DEFAULT false, -- Did user download instead of submitting?
  "createdAt" TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_deflection_log_record_fk FOREIGN KEY (matched_record_id)
    REFERENCES "FoiaProactiveLibrary"(id) ON DELETE SET NULL
);

CREATE INDEX idx_foia_deflection_log_deflected ON "FoiaDeflectionLog"(deflected);
CREATE INDEX idx_foia_deflection_log_created ON "FoiaDeflectionLog"("createdAt");

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
  BEFORE INSERT OR UPDATE ON "FoiaProactiveLibrary"
  FOR EACH ROW
  EXECUTE FUNCTION update_proactive_library_search_vector();

-- Function to increment download count
CREATE OR REPLACE FUNCTION increment_proactive_library_download()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE "FoiaProactiveLibrary"
  SET download_count = download_count + 1
  WHERE id = NEW.matched_record_id
    AND NEW.deflected = true;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_proactive_library_download
  AFTER INSERT ON "FoiaDeflectionLog"
  FOR EACH ROW
  WHEN (NEW.deflected = true)
  EXECUTE FUNCTION increment_proactive_library_download();

-- Comments for documentation
COMMENT ON TABLE "FoiaProactiveCandidates" IS 'AI-recommended records for proactive disclosure';
COMMENT ON TABLE "FoiaProactiveLibrary" IS 'Published records available for public self-service';
COMMENT ON TABLE "FoiaDeflectionLog" IS 'Track when users find records without submitting requests';
