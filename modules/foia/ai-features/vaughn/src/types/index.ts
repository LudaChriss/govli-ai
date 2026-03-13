/**
 * AI-5: Vaughn Index Generator - Type Definitions
 */

// ============================================================================
// Vaughn Index Types
// ============================================================================

export interface VaughnEntry {
  id: string;
  vaughn_index_id: string;
  entry_number: number;

  // Document Description
  document_description: string; // Type, date, author, recipient, subject
  document_date: Date | null;
  document_type: string; // email, memo, report, etc.

  // Exemption Details
  exemption_code: string;
  statutory_citation: string;
  exemption_explanation: string; // Specific, non-conclusory explanation

  // Withholding Details
  withheld_in_full: boolean;
  segregability_explanation: string | null; // Why segregable portions couldn't be released

  // Source Data
  source_document_id: string | null;
  source_redaction_id: string | null;
  ai_reasoning: string | null; // Original AI reasoning from redaction

  // Edit Tracking
  original_entry: string; // Original AI-generated entry
  edited_entry: string | null; // Human-edited version
  edited_by: string | null;
  edited_at: Date | null;
  edit_notes: string | null;
  version_history: VaughnEntryVersion[];

  createdAt: Date;
  updatedAt: Date;
}

export interface VaughnEntryVersion {
  version: number;
  entry_text: string;
  edited_by: string;
  edited_at: Date;
  edit_notes: string;
}

export interface VaughnIndex {
  id: string;
  tenant_id: string;
  foia_request_id: string;

  // Index Metadata
  request_number: string; // FOIA request tracking number
  requester_name: string;
  litigation_hold_id: string | null; // Link to litigation hold

  // Generation Details
  entry_count: number;
  total_documents_withheld: number;
  generated_by: string; // User ID
  generated_at: Date;

  // Document Storage
  pdf_path: string | null;
  docx_path: string | null;

  // Status
  status: VaughnIndexStatus;
  finalized_at: Date | null;
  finalized_by: string | null;

  // Metadata
  model_used: string;
  generation_time_ms: number;

  createdAt: Date;
  updatedAt: Date;

  // Relations
  entries?: VaughnEntry[];
}

export type VaughnIndexStatus =
  | 'DRAFT'         // Generated, editable
  | 'IN_REVIEW'     // Under legal review
  | 'FINALIZED'     // Approved for filing
  | 'FILED'         // Filed with court
  | 'SUPERSEDED';   // Replaced by newer version

// ============================================================================
// Vaughn Generation Input Types
// ============================================================================

export interface GenerateVaughnIndexInput {
  foia_request_id: string;
  litigation_hold_id?: string;
  include_only_document_ids?: string[]; // Optional: generate for specific documents only
}

export interface VaughnEntryInput {
  document_id: string;
  document_type: string;
  document_date: Date | null;
  document_description: string;
  exemption_code: string;
  withheld_in_full: boolean;
  ai_reasoning: string | null;
  redaction_notes: string | null;
}

export interface EditVaughnEntryInput {
  entry_text: string;
  edit_notes?: string;
}

export interface RegenerateVaughnIndexInput {
  include_updated_entries?: boolean; // Include manually edited entries or regenerate all
}

// ============================================================================
// Vaughn Document Generation Types
// ============================================================================

export interface VaughnDocumentOptions {
  include_cover_page: boolean;
  include_table_of_contents: boolean;
  include_declaration_page: boolean;
  agency_name: string;
  agency_address: string;
  court_name?: string;
  case_number?: string;
}

export interface VaughnCoverPage {
  agency_name: string;
  request_number: string;
  requester_name: string;
  date_generated: Date;
  entry_count: number;
  court_name?: string;
  case_number?: string;
}

export interface VaughnDeclaration {
  declarant_name: string;
  declarant_title: string;
  agency_name: string;
  declaration_date: Date;
  signature_placeholder: boolean;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface GenerateVaughnIndexResponse {
  index: VaughnIndex;
  entries: VaughnEntry[];
  generation_summary: {
    total_entries: number;
    documents_processed: number;
    generation_time_ms: number;
    model_used: string;
  };
  download_urls: {
    pdf: string | null;
    docx: string | null;
  };
}

export interface GetVaughnIndexResponse {
  index: VaughnIndex;
  entries: VaughnEntry[];
  download_urls: {
    pdf: string | null;
    docx: string | null;
  };
}

// ============================================================================
// Litigation Hold Integration Types
// ============================================================================

export interface LitigationHold {
  id: string;
  tenant_id: string;
  foia_request_id: string;
  reason: string;
  placed_by: string;
  placed_at: Date;
  released_at: Date | null;
  released_by: string | null;
}

export interface VaughnGenerationPrompt {
  foia_request_id: string;
  litigation_hold_id: string;
  prompt_shown_at: Date;
  action_taken: 'GENERATED' | 'DISMISSED' | 'PENDING';
}
