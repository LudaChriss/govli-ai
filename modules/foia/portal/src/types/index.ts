/**
 * FOIA Portal Type Definitions
 */

export interface FOIARequest {
  id: string;
  tenant_id: string;
  confirmation_number: string;
  status: 'PENDING' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'FULFILLED' | 'DENIED' | 'APPEALED' | 'CLOSED';
  requester_name: string;
  requester_email: string;
  requester_phone?: string;
  requester_address?: string;
  requester_organization?: string;
  subject: string;
  description: string;
  category?: string;
  urgency?: 'STANDARD' | 'EXPEDITED';
  fee_waiver_requested?: boolean;
  fee_waiver_justification?: string;
  received_at: string;
  acknowledged_at?: string;
  due_date?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface FOIAResponse {
  id: string;
  tenant_id: string;
  foia_request_id: string;
  response_type: 'FULL_GRANT' | 'PARTIAL_GRANT' | 'FULL_DENIAL' | 'NO_RECORDS' | 'REFERRAL';
  response_letter?: string;
  exemptions_applied?: string[];
  fees_assessed?: number;
  documents_released?: number;
  documents_withheld?: number;
  response_date: string;
  created_at: string;
}

export interface FOIADocument {
  id: string;
  tenant_id: string;
  foia_response_id: string;
  filename: string;
  file_size: number;
  mime_type: string;
  redacted: boolean;
  exemptions_applied?: string[];
  uploaded_at: string;
}

export interface FOIAAppeal {
  id: string;
  tenant_id: string;
  foia_request_id: string;
  appeal_reason: string;
  appeal_details: string;
  status: 'PENDING' | 'UNDER_REVIEW' | 'GRANTED' | 'DENIED' | 'CLOSED';
  filed_at: string;
  resolved_at?: string;
  resolution?: string;
  created_at: string;
  updated_at: string;
}

export interface Agency {
  id: string;
  tenant_id: string;
  name: string;
  contact_email: string;
  contact_phone?: string;
  contact_address?: string;
  website?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface RequestFormData {
  // Step 1: Contact Information
  requester_name: string;
  requester_email: string;
  requester_phone?: string;
  requester_address?: string;
  requester_organization?: string;
  
  // Step 2: Records Sought
  subject: string;
  description: string;
  date_range_start?: string;
  date_range_end?: string;
  
  // Step 3: Category & Fees
  category?: string;
  urgency?: 'STANDARD' | 'EXPEDITED';
  expedited_justification?: string;
  fee_waiver_requested?: boolean;
  fee_waiver_justification?: string;
  
  // Metadata
  step: number;
}

export interface StatusTimeline {
  status: string;
  timestamp: string;
  description: string;
}

export interface APIError {
  code: string;
  message: string;
  details?: unknown;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: APIError;
}
