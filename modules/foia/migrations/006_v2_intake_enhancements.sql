-- Govli AI FOIA Module: v2.0 Intake Enhancements
-- Migration 006: Add complexity_score and migration_source to FoiaRequests (Updated for PascalCase schema)

-- Add complexity_score column to FoiaRequests
-- Stores the calculated complexity score (0-100) for model routing
ALTER TABLE "FoiaRequests"
ADD COLUMN IF NOT EXISTS complexity_score INTEGER
  CHECK (complexity_score >= 0 AND complexity_score <= 100);

-- Add migration_source column to FoiaRequests
-- Tracks where the request originated from for legacy system migrations
ALTER TABLE "FoiaRequests"
ADD COLUMN IF NOT EXISTS migration_source VARCHAR(20)
  CHECK (migration_source IN (
    'govqa', 'nextrequest', 'justfoia', 'foiaxpress',
    'spreadsheet', 'email', NULL
  ));

-- Add index for complexity score queries (used by model router)
CREATE INDEX IF NOT EXISTS idx_foia_requests_complexity
  ON "FoiaRequests"(complexity_score)
  WHERE complexity_score IS NOT NULL;

-- Add index for migration source queries (useful for analytics)
CREATE INDEX IF NOT EXISTS idx_foia_requests_migration_source
  ON "FoiaRequests"(migration_source)
  WHERE migration_source IS NOT NULL;

-- Add is_public column to FoiaRequests for smart deflection
-- Determines if fulfilled request can be shown in public search results
ALTER TABLE "FoiaRequests"
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_foia_requests_public
  ON "FoiaRequests"(is_public, status)
  WHERE is_public = true;

-- Create FoiaFAQs table for smart deflection
CREATE TABLE IF NOT EXISTS "FoiaFAQs" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  view_count INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_foia_faqs_active ON "FoiaFAQs"(is_active) WHERE is_active = true;

-- Enable pg_trgm extension for text similarity searches (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN indexes for text similarity searches
CREATE INDEX IF NOT EXISTS idx_foia_faqs_text_similarity
  ON "FoiaFAQs" USING gin ((question || ' ' || answer) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_foia_requests_text_similarity
  ON "FoiaRequests" USING gin ((subject || ' ' || description) gin_trgm_ops);

-- Create settings table for webhook configuration (global, not tenant-specific)
CREATE TABLE IF NOT EXISTS "FoiaSettings" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key VARCHAR(100) NOT NULL UNIQUE,
  config JSONB NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_foia_settings_key ON "FoiaSettings"(key);

-- Comments for documentation
COMMENT ON COLUMN "FoiaRequests".complexity_score IS 'v2.0: Calculated complexity score (0-100) for AI model routing';
COMMENT ON COLUMN "FoiaRequests".migration_source IS 'v2.0: Source system for migrated requests (govqa, nextrequest, etc.)';
COMMENT ON COLUMN "FoiaRequests".is_public IS 'v2.0: Whether fulfilled request can be shown in public deflection results';
COMMENT ON TABLE "FoiaFAQs" IS 'v2.0: FAQ database for smart deflection feature';
COMMENT ON TABLE "FoiaSettings" IS 'v2.0: Global configuration including webhook URLs and feature flags';
