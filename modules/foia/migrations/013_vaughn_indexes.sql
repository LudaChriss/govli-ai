-- Govli AI FOIA Module: AI-5 Vaughn Index Generator
-- Migration 013: Vaughn Index tables

-- Vaughn Indexes Table
-- Stores generated Vaughn Index documents for FOIA litigation
CREATE TABLE IF NOT EXISTS "FoiaVaughnIndexes" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  foia_request_id UUID NOT NULL,

  -- Index Metadata
  request_number VARCHAR(100) NOT NULL,
  requester_name VARCHAR(255) NOT NULL,
  litigation_hold_id UUID,

  -- Generation Details
  entry_count INTEGER NOT NULL DEFAULT 0,
  total_documents_withheld INTEGER NOT NULL DEFAULT 0,
  generated_by UUID NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Document Storage
  pdf_path VARCHAR(500),
  docx_path VARCHAR(500),

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (
    status IN ('DRAFT', 'IN_REVIEW', 'FINALIZED', 'FILED', 'SUPERSEDED')
  ),
  finalized_at TIMESTAMP,
  finalized_by UUID,

  -- AI Metadata
  model_used VARCHAR(100) NOT NULL,
  generation_time_ms INTEGER NOT NULL,

  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Vaughn Index Entries Table
-- Individual entries within a Vaughn Index (one per withheld document)
CREATE TABLE IF NOT EXISTS "FoiaVaughnEntries" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  vaughn_index_id UUID NOT NULL REFERENCES "FoiaVaughnIndexes"(id) ON DELETE CASCADE,
  entry_number INTEGER NOT NULL, -- Sequential number in index

  -- Document Description
  document_description TEXT NOT NULL, -- Type, date, author, recipient, subject
  document_date DATE,
  document_type VARCHAR(100) NOT NULL, -- email, memo, report, etc.

  -- Exemption Details
  exemption_code VARCHAR(10) NOT NULL,
  statutory_citation VARCHAR(500) NOT NULL,
  exemption_explanation TEXT NOT NULL, -- Specific, non-conclusory

  -- Withholding Details
  withheld_in_full BOOLEAN NOT NULL DEFAULT true,
  segregability_explanation TEXT, -- Why segregable portions couldn't be released

  -- Source Data
  source_document_id UUID,
  source_redaction_id UUID,
  ai_reasoning TEXT, -- Original AI reasoning from redaction

  -- Edit Tracking
  original_entry TEXT NOT NULL, -- Original AI-generated entry
  edited_entry TEXT, -- Human-edited version
  edited_by UUID,
  edited_at TIMESTAMP,
  edit_notes TEXT,
  version_history JSONB DEFAULT '[]'::jsonb, -- Array of VaughnEntryVersion objects

  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),

  UNIQUE(vaughn_index_id, entry_number)
);

-- Litigation Holds Table
-- Tracks litigation holds on FOIA requests
CREATE TABLE IF NOT EXISTS "FoiaLitigationHolds" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  foia_request_id UUID NOT NULL,

  -- Hold Details
  reason TEXT NOT NULL,
  placed_by UUID NOT NULL,
  placed_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Release
  released_at TIMESTAMP,
  released_by UUID,
  release_notes TEXT,

  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Vaughn Generation Prompts Table
-- Tracks prompts to generate Vaughn indexes when litigation holds are placed
CREATE TABLE IF NOT EXISTS "FoiaVaughnGenerationPrompts" (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,
  foia_request_id UUID NOT NULL,
  litigation_hold_id UUID NOT NULL REFERENCES "FoiaLitigationHolds"(id) ON DELETE CASCADE,

  -- Prompt Tracking
  prompt_shown_at TIMESTAMP NOT NULL DEFAULT NOW(),
  action_taken VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (
    action_taken IN ('GENERATED', 'DISMISSED', 'PENDING')
  ),
  action_taken_at TIMESTAMP,
  action_taken_by UUID,

  -- Generated Index Reference
  vaughn_index_id UUID REFERENCES "FoiaVaughnIndexes"(id),

  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_vaughn_indexes_tenant ON "FoiaVaughnIndexes"(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vaughn_indexes_request ON "FoiaVaughnIndexes"(foia_request_id);
CREATE INDEX IF NOT EXISTS idx_vaughn_indexes_status ON "FoiaVaughnIndexes"(status);
CREATE INDEX IF NOT EXISTS idx_vaughn_indexes_litigation_hold ON "FoiaVaughnIndexes"(litigation_hold_id);
CREATE INDEX IF NOT EXISTS idx_vaughn_indexes_generated_at ON "FoiaVaughnIndexes"(generated_at);

CREATE INDEX IF NOT EXISTS idx_vaughn_entries_index ON "FoiaVaughnEntries"(vaughn_index_id);
CREATE INDEX IF NOT EXISTS idx_vaughn_entries_document ON "FoiaVaughnEntries"(source_document_id);
CREATE INDEX IF NOT EXISTS idx_vaughn_entries_exemption ON "FoiaVaughnEntries"(exemption_code);

CREATE INDEX IF NOT EXISTS idx_litigation_holds_tenant ON "FoiaLitigationHolds"(tenant_id);
CREATE INDEX IF NOT EXISTS idx_litigation_holds_request ON "FoiaLitigationHolds"(foia_request_id);
CREATE INDEX IF NOT EXISTS idx_litigation_holds_active ON "FoiaLitigationHolds"(tenant_id, released_at)
  WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vaughn_prompts_hold ON "FoiaVaughnGenerationPrompts"(litigation_hold_id);
CREATE INDEX IF NOT EXISTS idx_vaughn_prompts_pending ON "FoiaVaughnGenerationPrompts"(tenant_id, action_taken)
  WHERE action_taken = 'PENDING';

-- Comments for documentation
COMMENT ON TABLE "FoiaVaughnIndexes" IS 'AI-5: Generated Vaughn Index documents for FOIA litigation';
COMMENT ON TABLE "FoiaVaughnEntries" IS 'Individual entries in Vaughn Indexes (one per withheld document)';
COMMENT ON TABLE "FoiaLitigationHolds" IS 'Litigation holds on FOIA requests requiring special handling';
COMMENT ON TABLE "FoiaVaughnGenerationPrompts" IS 'Tracks prompts to generate Vaughn indexes when holds are placed';

COMMENT ON COLUMN "FoiaVaughnIndexes".status IS 'DRAFT (editable), IN_REVIEW, FINALIZED (ready to file), FILED, SUPERSEDED';
COMMENT ON COLUMN "FoiaVaughnEntries".original_entry IS 'AI-generated entry text (immutable)';
COMMENT ON COLUMN "FoiaVaughnEntries".edited_entry IS 'Human-edited version (if modified)';
COMMENT ON COLUMN "FoiaVaughnEntries".version_history IS 'JSON array of edit history with timestamps';
COMMENT ON COLUMN "FoiaVaughnEntries".exemption_explanation IS 'Must be specific and non-conclusory per legal requirements';
