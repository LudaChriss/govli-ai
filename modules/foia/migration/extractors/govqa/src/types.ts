/**
 * GovQA Data Extractor - Types
 */

/**
 * GovQA API Configuration
 */
export interface GovQAConfig {
  govqa_api_url: string;
  govqa_username: string;
  govqa_password: string;
  govqa_api_key?: string;
}

/**
 * Govli Migration API Configuration
 */
export interface GovliConfig {
  govli_api_url: string;
  govli_migration_key: string;
  tenant_id: string;
}

/**
 * Migration Configuration
 */
export interface MigrationConfig {
  govqa: GovQAConfig;
  govli: GovliConfig;
  status_mapping: Record<string, string>;
  batch_size: number;
  output_dir: string;
  resume_from_checkpoint: boolean;
}

/**
 * GovQA Case (Request) Entity
 */
export interface GovQACase {
  id: string | number;
  case_number: string;
  requester_name: string;
  requester_email?: string;
  requester_phone?: string;
  requester_address?: string;
  requester_organization?: string;
  description: string;
  status: string;
  status_code?: string;
  date_received: string;
  date_submitted?: string;
  date_due?: string;
  date_closed?: string;
  assigned_to?: string;
  assigned_department?: string;
  fee_amount?: number;
  fee_waived?: boolean;
  notes?: string;
  custom_fields?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

/**
 * GovQA Contact (User) Entity
 */
export interface GovQAContact {
  id: string | number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  organization?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  created_at: string;
}

/**
 * GovQA Document Entity
 */
export interface GovQADocument {
  id: string | number;
  case_id: string | number;
  filename: string;
  file_size: number;
  mime_type?: string;
  download_url: string;
  upload_date: string;
  uploaded_by?: string;
  document_type?: string;
  is_public?: boolean;
}

/**
 * GovQA Communication Entity
 */
export interface GovQACommunication {
  id: string | number;
  case_id: string | number;
  message_type: 'NOTE' | 'EMAIL' | 'COMMENT';
  subject?: string;
  body: string;
  from_user?: string;
  to_user?: string;
  is_internal: boolean;
  created_at: string;
  created_by?: string;
}

/**
 * GovQA Fee Record Entity
 */
export interface GovQAFee {
  id: string | number;
  case_id: string | number;
  amount: number;
  description: string;
  payment_status: string;
  payment_date?: string;
  payment_method?: string;
  created_at: string;
}

/**
 * GovQA Routing Rule Entity
 */
export interface GovQARoutingRule {
  id: string | number;
  name: string;
  conditions: Record<string, any>;
  route_to_department?: string;
  route_to_user?: string;
  priority?: number;
  is_active: boolean;
}

/**
 * Extraction Progress Checkpoint
 */
export interface ExtractionCheckpoint {
  entity_type: string;
  last_page: number;
  last_id: string | number;
  total_extracted: number;
  timestamp: string;
}

/**
 * Extraction Summary
 */
export interface ExtractionSummary {
  entity_type: string;
  total_count: number;
  extracted_count: number;
  failed_count: number;
  start_time: string;
  end_time: string;
  duration_ms: number;
}

/**
 * Transformation Result
 */
export interface TransformationResult {
  source_type: string;
  source_id: string | number;
  target_type: string;
  target_data: any;
  warnings: string[];
  errors: string[];
}

/**
 * Loading Result
 */
export interface LoadingResult {
  entity_type: string;
  batch_number: number;
  total_in_batch: number;
  successful: number;
  failed: number;
  errors: Array<{
    source_id: string | number;
    error: string;
  }>;
}

/**
 * Validation Report
 */
export interface ValidationReport {
  migration_id: string;
  source_system: 'GovQA';
  target_system: 'Govli';
  migration_date: string;

  entity_counts: {
    contacts: {
      source: number;
      target: number;
      match: boolean;
    };
    cases: {
      source: number;
      target: number;
      match: boolean;
    };
    documents: {
      source: number;
      target: number;
      match: boolean;
    };
    communications: {
      source: number;
      target: number;
      match: boolean;
    };
    fees: {
      source: number;
      target: number;
      match: boolean;
    };
  };

  spot_check_results: Array<{
    entity_type: string;
    source_id: string | number;
    target_id: string;
    field_comparisons: Record<string, {
      source_value: any;
      target_value: any;
      match: boolean;
    }>;
  }>;

  orphaned_documents: string[];
  errors: string[];
  warnings: string[];

  overall_status: 'PASS' | 'FAIL' | 'WARNING';
}

/**
 * Govli Migration API Request Types
 */

export interface GovliMigrationContact {
  legacy_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  organization?: string;
  address?: string;
}

export interface GovliMigrationRequest {
  legacy_id: string;
  migration_source: 'govqa';
  tracking_number?: string;
  description: string;
  requester: {
    name: string;
    email: string;
    phone?: string;
    organization?: string;
    address?: string;
  };
  foia_status: string;
  submitted_at: string;
  due_date?: string;
  closed_at?: string;
  assigned_to_user_id?: string;
  assigned_department?: string;
  fee_amount?: number;
  fee_waived?: boolean;
  internal_notes?: string;
  custom_metadata?: Record<string, any>;
}

export interface GovliMigrationDocument {
  legacy_id: string;
  request_legacy_id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  file_url?: string;
  file_content_base64?: string;
  uploaded_at: string;
  uploaded_by?: string;
  document_type?: string;
  is_public?: boolean;
}

export interface GovliMigrationCommunication {
  legacy_id: string;
  request_legacy_id: string;
  message_type: 'NOTE' | 'EMAIL' | 'COMMENT';
  subject?: string;
  body: string;
  from_user?: string;
  to_user?: string;
  is_internal: boolean;
  sent_at: string;
}

export interface GovliMigrationFee {
  legacy_id: string;
  request_legacy_id: string;
  amount: number;
  description: string;
  payment_status: string;
  payment_date?: string;
  payment_method?: string;
}
