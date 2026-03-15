-- Govli AI FOIA Module: Multilingual Processing
-- Migration 016: AI-10 Translation Tables

-- Translations Table
-- Store all translation records for audit and quality tracking
CREATE TABLE IF NOT EXISTS "FoiaTranslations" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  foia_request_id UUID NOT NULL,
  translation_type VARCHAR(50) NOT NULL CHECK (
    translation_type IN ('REQUEST_INTAKE', 'COMMUNICATION', 'DOCUMENT')
  ),

  -- Language information
  source_language VARCHAR(10) NOT NULL,
  target_language VARCHAR(10) NOT NULL,

  -- Translation content
  original_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,

  -- Quality metrics
  confidence DECIMAL(3, 2) NOT NULL DEFAULT 0.75 CHECK (confidence >= 0 AND confidence <= 1),
  needs_professional_review BOOLEAN NOT NULL DEFAULT false,
  translation_notes TEXT,

  -- Context (for communications and documents)
  communication_type VARCHAR(50) CHECK (
    communication_type IS NULL OR
    communication_type IN ('acknowledgment', 'status_update', 'clarification', 'response', 'other')
  ),
  document_id UUID,

  -- Professional review tracking
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  approved BOOLEAN,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  CONSTRAINT foia_translations_request_fk FOREIGN KEY (foia_request_id)
    REFERENCES "FoiaRequests"(id) ON DELETE CASCADE,
  CONSTRAINT foia_translations_document_fk FOREIGN KEY (document_id)
    REFERENCES "FoiaDocuments"(id) ON DELETE CASCADE
);

CREATE INDEX idx_foia_translations_request ON "FoiaTranslations"(foia_request_id);
CREATE INDEX idx_foia_translations_type ON "FoiaTranslations"(translation_type);
CREATE INDEX idx_foia_translations_source_lang ON "FoiaTranslations"(source_language);
CREATE INDEX idx_foia_translations_target_lang ON "FoiaTranslations"(target_language);
CREATE INDEX idx_foia_translations_needs_review ON "FoiaTranslations"(needs_professional_review)
  WHERE needs_professional_review = true;
CREATE INDEX idx_foia_translations_document ON "FoiaTranslations"(document_id)
  WHERE document_id IS NOT NULL;
CREATE INDEX idx_foia_translations_created ON "FoiaTranslations"(created_at DESC);

-- Add translation tracking columns to FoiaRequests
ALTER TABLE "FoiaRequests"
  ADD COLUMN IF NOT EXISTS original_language VARCHAR(10),
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10),
  ADD COLUMN IF NOT EXISTS translation_available BOOLEAN DEFAULT false;

CREATE INDEX idx_foia_requests_original_language ON "FoiaRequests"(original_language)
  WHERE original_language IS NOT NULL;
CREATE INDEX idx_foia_requests_preferred_language ON "FoiaRequests"(preferred_language)
  WHERE preferred_language IS NOT NULL;

-- Function to update translation_available flag
CREATE OR REPLACE FUNCTION mark_translation_available()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.translation_type = 'REQUEST_INTAKE' THEN
    UPDATE "FoiaRequests"
    SET translation_available = true
    WHERE id = NEW.foia_request_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_mark_translation_available
  AFTER INSERT ON "FoiaTranslations"
  FOR EACH ROW
  EXECUTE FUNCTION mark_translation_available();

-- View: Translation Quality Metrics
CREATE OR REPLACE VIEW "TranslationQualityMetrics" AS
SELECT
  source_language,
  target_language,
  translation_type,
  COUNT(*) as total_translations,
  AVG(confidence) as avg_confidence,
  COUNT(*) FILTER (WHERE needs_professional_review) as needs_review_count,
  COUNT(*) FILTER (WHERE reviewed_by IS NOT NULL) as reviewed_count,
  COUNT(*) FILTER (WHERE approved = true) as approved_count,
  COUNT(*) FILTER (WHERE approved = false) as rejected_count
FROM "FoiaTranslations"
GROUP BY source_language, target_language, translation_type;

-- View: Requests Requiring Translation Review
CREATE OR REPLACE VIEW "RequestsNeedingTranslationReview" AS
SELECT
  r.id as request_id,
  r.confirmation_number,
  r.original_language,
  t.id as translation_id,
  t.translation_type,
  t.confidence,
  t.created_at as translation_created_at,
  t.translation_notes
FROM "FoiaRequests" r
JOIN "FoiaTranslations" t ON t.foia_request_id = r.id
WHERE t.needs_professional_review = true
  AND t.reviewed_by IS NULL
ORDER BY t.created_at ASC;

-- Comments for documentation
COMMENT ON TABLE "FoiaTranslations" IS 'AI-10: Store translation records with quality metrics and review tracking';
COMMENT ON COLUMN "FoiaTranslations"."confidence" IS 'AI-generated confidence score (0.0-1.0)';
COMMENT ON COLUMN "FoiaTranslations"."needs_professional_review" IS 'Flag for low-confidence translations requiring human review';
COMMENT ON COLUMN "FoiaRequests"."original_language" IS 'Detected language of original request (ISO 639-1 code)';
COMMENT ON COLUMN "FoiaRequests"."preferred_language" IS 'Requester preferred language for communications (ISO 639-1 code)';
COMMENT ON VIEW "TranslationQualityMetrics" IS 'Aggregated translation quality metrics by language pair and type';
COMMENT ON VIEW "RequestsNeedingTranslationReview" IS 'Translations flagged for professional review (staff queue)';
