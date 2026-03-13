/**
 * AI-7: Conversational Request Builder - Type Definitions
 */

// ============================================================================
// Core Message Types
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ConversationMessage {
  role: MessageRole;
  content: string;
  timestamp?: Date;
}

// ============================================================================
// Agency Context
// ============================================================================

export interface AgencyContext {
  agency_name?: string;
  departments?: string[];
  common_record_types?: string[];
}

// ============================================================================
// Draft Request
// ============================================================================

export interface DraftRequest {
  description: string;
  agencies: string[];
  date_range_start?: string; // ISO date string
  date_range_end?: string; // ISO date string
  format_preference?: 'electronic' | 'paper' | 'either';
  estimated_scope?: 'narrow' | 'moderate' | 'broad';
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface ConversationRequest {
  session_id: string;
  messages: ConversationMessage[];
  agency_context?: AgencyContext;
}

export interface ConversationResponse {
  message: string;
  ready_to_submit: boolean;
  draft_request?: DraftRequest;
  suggested_follow_up_questions?: string[];
  session_id: string;
  message_count: number;
}

// ============================================================================
// Session Tracking
// ============================================================================

export interface ConversationSession {
  session_id: string;
  tenant_id?: string; // Optional - for multi-tenant tracking
  ip_address: string;
  user_agent: string;
  started_at: Date;
  last_message_at: Date;
  message_count: number;
  completed: boolean;
  submitted: boolean;
  draft_request?: DraftRequest;
}

// ============================================================================
// Analytics Events
// ============================================================================

export interface ConversationAnalytics {
  session_id: string;
  event_type: 'session_started' | 'message_sent' | 'draft_ready' | 'request_submitted' | 'session_abandoned';
  tenant_id?: string;
  message_count?: number;
  turns_to_completion?: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

// ============================================================================
// Rate Limiting
// ============================================================================

export interface RateLimitInfo {
  ip_address: string;
  session_id: string;
  message_count: number;
  window_start: Date;
  window_end: Date;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset_at: Date;
}

// ============================================================================
// Claude Response Parsing
// ============================================================================

export interface ParsedClaudeResponse {
  message: string;
  ready_to_submit: boolean;
  draft_request?: DraftRequest;
  suggested_follow_up_questions?: string[];
}

// ============================================================================
// Service Options
// ============================================================================

export interface ConversationServiceOptions {
  max_messages_per_session?: number;
  max_turns_before_completion?: number;
  model?: string;
}

// ============================================================================
// Frontend Component Props
// ============================================================================

export interface ConversationalRequestBuilderProps {
  agencyContext?: AgencyContext;
  onRequestReady?: (draftRequest: DraftRequest) => void;
  onSubmit?: (draftRequest: DraftRequest) => Promise<void>;
  onModeSwitch?: () => void;
  initialSessionId?: string;
}

export interface ChatMessage extends ConversationMessage {
  id: string;
  isLoading?: boolean;
  suggestedQuestions?: string[];
}
