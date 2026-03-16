/**
 * Email Import Engine - Types
 */

import { Request } from 'express';
import { Pool } from 'pg';

/**
 * Extended Express Request with user authentication
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    tenant_id: string;
    role: string;
  };
}

/**
 * Email attachment from webhook
 */
export interface EmailAttachment {
  filename: string;
  content_type: string;
  content_base64: string;
}

/**
 * Incoming email webhook payload
 */
export interface IncomingEmailPayload {
  from: string;
  to: string;
  subject: string;
  body_text: string;
  body_html?: string;
  attachments?: EmailAttachment[];
}

/**
 * AI-parsed FOIA request data
 */
export interface ParsedFoiaRequest {
  is_foia_request: boolean;
  requester_name: string | null;
  requester_email: string | null;
  requester_phone: string | null;
  requester_organization: string | null;
  request_description: string;
  date_range_mentioned: string | null;
  departments_mentioned: string[];
  record_types_mentioned: string[];
  urgency_indicators: string[];
  confidence: number;
}

/**
 * Email ingest response
 */
export interface EmailIngestResponse {
  processed: boolean;
  request_id?: string;
  confidence: number;
  requires_review: boolean;
  message: string;
}

/**
 * Pending import review request
 */
export interface PendingImportRequest {
  id: string;
  tenant_id: string;
  from_email: string;
  subject: string;
  body_text: string;
  parsed_data: ParsedFoiaRequest;
  confidence: number;
  created_at: string;
  original_email_id: string;
}

/**
 * Approve request input
 */
export interface ApproveRequestInput {
  approved_fields: {
    requester_name?: string;
    requester_email?: string;
    requester_phone?: string;
    requester_organization?: string;
    description?: string;
    department?: string;
    notes?: string;
  };
}

/**
 * Reject request input
 */
export interface RejectRequestInput {
  reason: string;
}

/**
 * Email import analytics
 */
export interface EmailImportAnalytics {
  emails_received: number;
  parsed_as_foia: number;
  parsed_as_non_foia: number;
  approved: number;
  rejected: number;
  pending_review: number;
  avg_confidence: number;
  false_positive_rate: number;
}

/**
 * Email import record status
 */
export type EmailImportStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * Email import database record
 */
export interface EmailImportRecord {
  id: string;
  tenant_id: string;
  from_email: string;
  to_email: string;
  subject: string;
  body_text: string;
  body_html?: string;
  parsed_data: ParsedFoiaRequest;
  is_foia: boolean;
  confidence: number;
  request_id?: string;
  status: EmailImportStatus;
  created_at: Date;
  approved_at?: Date;
  rejected_at?: Date;
  rejection_reason?: string;
}
