/**
 * Govli AI FOIA Module - Shared Types
 * v2.0 + v3.0 Comprehensive Type Definitions
 */

// ===========================
// Base FOIA Types (v1.0 Core)
// ===========================

export interface FoiaRequest {
  id: string;
  tenant_id: string;
  requester_name: string;
  requester_email: string;
  requester_category: RequesterCategory;
  subject: string;
  description: string;
  date_range_start?: Date;
  date_range_end?: Date;
  agency_names: string[];
  status: FoiaRequestStatus;
  priority: Priority;
  assigned_to?: string;
  due_date?: Date;
  received_at: Date;
  created_at: Date;
  updated_at: Date;
}

export type RequesterCategory =
  | 'COMMERCIAL'
  | 'EDUCATIONAL'
  | 'NEWS_MEDIA'
  | 'PUBLIC_INTEREST'
  | 'OTHER';

export type FoiaRequestStatus =
  | 'PENDING'
  | 'IN_REVIEW'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'AWAITING_RESPONSE'
  | 'COMPLETED'
  | 'DENIED'
  | 'APPEALED';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface GovliEvent {
  id: string;
  tenant_id: string;
  event_type: string;
  entity_id: string;
  entity_type: string;
  user_id?: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

// ===========================
// v2.0 Type Additions
// ===========================

export enum ScopingFlag {
  TOO_BROAD = 'TOO_BROAD',
  MISSING_DATE = 'MISSING_DATE',
  MISSING_AGENCY = 'MISSING_AGENCY',
  AMBIGUOUS_RECORDS = 'AMBIGUOUS_RECORDS',
  DUPLICATE_LIKELY = 'DUPLICATE_LIKELY',
  WELL_SCOPED = 'WELL_SCOPED'
}

export interface TriageScore {
  relevance: number;
  confidence: number;
  bucket: 'LIKELY_RESPONSIVE' | 'POSSIBLY_RESPONSIVE' | 'REVIEW_NEEDED';
}

export interface ConsistencyAlert {
  prior_case_id: string;
  prior_exemption: string;
  current_exemption: string;
  similarity_score: number;
  flag: 'INCONSISTENT' | 'BORDERLINE' | 'CONSISTENT';
}

export interface WorkloadForecast {
  period_start: Date;
  period_end: Date;
  predicted_volume: number;
  confidence_interval: [number, number]; // [low, high]
  recommended_staff: number;
}

export interface ProactiveDisclosureCandidate {
  record_type: string;
  frequency_score: number;
  last_requested_at: Date;
  recommended_publish_date: Date;
  justification: string;
}

export type SupportedLanguage =
  | 'en'
  | 'es'
  | 'zh'
  | 'vi'
  | 'fr'
  | 'ar'
  | 'tl'
  | 'ko'
  | 'ru'
  | 'pt';

export interface AIFeatureAuditEvent extends GovliEvent {
  feature_id: string;
  model_used: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  human_override: boolean;
}

// ===========================
// v3.0 Type Additions
// ===========================

export interface TokenBudget {
  tenant_id: string;
  monthly_budget_usd: number; // 0 = uncapped
  current_month_spend_usd: number;
  budget_alert_threshold: number; // default 0.80
  budget_hard_stop: number; // default 0.95
  last_reset_at: Date;
}

export interface ModelRoutingConfig {
  tenant_id: string;
  model_low: 'haiku-4.5' | 'sonnet-4.5'; // complexity 0-29
  model_mid: 'sonnet-4.5' | 'opus-4.6'; // complexity 30-69
  model_high: 'sonnet-4.5' | 'opus-4.6'; // complexity 70-89
  model_critical: 'opus-4.6'; // complexity 90+
  thinking_budget_low: number; // default 0
  thinking_budget_mid: number; // default 5000
  thinking_budget_high: number; // default 15000
}

export interface ComplexityScore {
  foia_request_id: string;
  score: number; // 0-100
  factors: {
    date_range_years: number; // wider = higher
    agency_count: number; // more = higher
    estimated_volume: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
    requester_category: string;
    keyword_complexity: number; // NLP-derived
  };
  calculated_at: Date;
}

export interface AIUsageRecord {
  id: string;
  tenant_id: string;
  foia_request_id?: string;
  feature_id: string; // 'ai-1' through 'ai-14'
  model_used: string;
  prompt_tokens: number;
  completion_tokens: number;
  thinking_tokens: number;
  cost_estimate_usd: number;
  latency_ms: number;
  cache_hit: boolean;
  batch_api: boolean;
  created_at: Date;
}

export interface DeflectionResult {
  matches: Array<{
    title: string;
    date: string;
    score: number;
    download_url: string;
    snippet: string;
  }>;
  has_relevant_match: boolean;
  deflection_id: string;
}

export interface BatchOpportunity {
  group_id: string;
  request_ids: string[];
  similarity_score: number;
  requester_name: string;
  recommended_action: 'MERGE' | 'PARALLEL' | 'COORDINATE';
  reason: string;
}

export interface TransparencyScore {
  tenant_id: string;
  score: number; // 0-100 composite
  components: {
    response_time: number; // 0-25
    on_time_rate: number; // 0-25
    proactive_disclosure: number; // 0-20
    denial_rate: number; // 0-15 (lower denial = higher score)
    appeal_reversal: number; // 0-15 (lower reversal = higher)
  };
  peer_percentile: number; // vs same-state same-size peers
  calculated_at: Date;
}

export type MigrationSource =
  | 'govqa'
  | 'nextrequest'
  | 'justfoia'
  | 'foiaxpress'
  | 'spreadsheet'
  | 'email';

export interface MigrationRecord {
  id: string;
  migration_source: MigrationSource;
  legacy_id: string;
  legacy_status: string;
  govli_request_id: string;
  migrated_at: Date;
  validation_status: 'PENDING' | 'VALID' | 'NEEDS_REVIEW';
}

export interface ResponseClone {
  id: string;
  source_request_id: string;
  target_request_id: string;
  cloned_sections: string[];
  customizations_required: string[];
  created_by: string;
  created_at: Date;
}

export interface CopilotSession {
  id: string;
  request_id: string;
  user_id: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  started_at: Date;
  ended_at?: Date;
}

export interface CompatRequest {
  id: string;
  legacy_system: MigrationSource;
  endpoint: string;
  request_data: Record<string, any>;
  response_data?: Record<string, any>;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  created_at: Date;
}

// ===========================
// Utility Types
// ===========================

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: Date;
}

export interface BulkOperationResult {
  total: number;
  successful: number;
  failed: number;
  errors: Array<{
    id: string;
    error: string;
  }>;
}
