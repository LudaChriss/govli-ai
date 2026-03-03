/**
 * FOIA Response Types
 */

export type ResponseType =
  | 'FULL_GRANT'
  | 'PARTIAL_GRANT'
  | 'FULL_DENIAL'
  | 'NO_RESPONSIVE_RECORDS'
  | 'FEE_WAIVER_DENIAL'
  | 'ACKNOWLEDGMENT';

export type ResponseStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'DELIVERED'
  | 'FAILED';

export type AppealStatus =
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'GRANTED'
  | 'DENIED'
  | 'PARTIALLY_GRANTED';

/**
 * FOIA Response
 */
export interface FoiaResponse {
  id: string;
  tenant_id: string;
  foia_request_id: string;
  response_type: ResponseType;
  status: ResponseStatus;

  // Content
  subject: string;
  body_text: string;
  body_html?: string;

  // AI Generation tracking
  ai_generated: boolean;
  ai_model_used?: string;
  ai_prompt_tokens?: number;
  ai_completion_tokens?: number;

  // Edit tracking
  original_body_text?: string;
  edit_delta_pct?: number;
  edit_count: number;

  // Approval
  approved_by?: string;
  approved_at?: Date;

  // Delivery
  delivered_to?: string;
  delivered_at?: Date;
  delivery_method?: 'EMAIL' | 'POSTAL' | 'PORTAL';
  delivery_status?: string;
  delivery_error?: string;

  // Metadata
  exemptions_cited?: string[];
  documents_included?: string[];
  fee_amount?: number;
  appeal_rights_included: boolean;

  created_by: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Appeal
 */
export interface Appeal {
  id: string;
  tenant_id: string;
  foia_request_id: string;
  response_id?: string;

  status: AppealStatus;

  // Appeal content
  reason: string;
  additional_info?: string;

  // Review
  reviewed_by?: string;
  reviewed_at?: Date;
  review_notes?: string;

  // Resolution
  resolved_at?: Date;
  resolution?: string;

  created_by: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Template Data for Handlebars
 */
export interface TemplateData {
  // Request info
  request_id: string;
  requester_name: string;
  requester_email: string;
  request_subject: string;
  received_at: Date;

  // Agency info
  agency_name: string;
  agency_address?: string;
  foia_officer_name?: string;
  foia_officer_email?: string;
  foia_liaison_name?: string;
  foia_liaison_phone?: string;

  // Response specific
  response_type: ResponseType;
  granted_documents?: { name: string; description?: string }[];
  denied_documents?: { name: string; exemptions: string[]; reason?: string }[];
  exemptions_cited?: string[];

  // Fees
  fee_amount?: number;
  fee_waiver_requested?: boolean;
  fee_waiver_granted?: boolean;

  // Appeal rights
  appeal_deadline_days: number;
  appeal_address?: string;
  appeal_email?: string;

  // Additional
  notes?: string;
  attachments?: { name: string; size: number }[];
}

/**
 * Email Delivery Options
 */
export interface EmailDeliveryOptions {
  to: string;
  subject: string;
  body_text: string;
  body_html?: string;
  attachments?: {
    filename: string;
    path?: string;
    content?: Buffer;
    contentType?: string;
  }[];
  from?: string;
  reply_to?: string;
}

/**
 * Draft Request
 */
export interface DraftRequest {
  response_type: ResponseType;
  exemptions_cited?: string[];
  documents_included?: string[];
  fee_amount?: number;
  additional_context?: string;
}

/**
 * Edit Request
 */
export interface EditRequest {
  body_text: string;
  body_html?: string;
  subject?: string;
  exemptions_cited?: string[];
}

/**
 * Approve Request
 */
export interface ApproveRequest {
  notes?: string;
}

/**
 * Deliver Request
 */
export interface DeliverRequest {
  delivery_method: 'EMAIL' | 'POSTAL' | 'PORTAL';
  delivery_email?: string;
  delivery_address?: string;
  attachments?: string[]; // document IDs
}

/**
 * Appeal Request
 */
export interface AppealRequest {
  reason: string;
  additional_info?: string;
}
