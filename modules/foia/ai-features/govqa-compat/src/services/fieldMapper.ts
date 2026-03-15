/**
 * GovQA Compatibility API Layer - Field Mapping Service
 *
 * Translates between GovQA and Govli field formats
 */

/**
 * GovQA Status Code Mapping
 */
const GOVQA_STATUS_MAP: Record<string, string> = {
  'NEW': 'SUBMITTED',
  'ASSIGNED': 'IN_PROGRESS',
  'IN_PROGRESS': 'IN_PROGRESS',
  'PENDING_REVIEW': 'PENDING_APPROVAL',
  'CLOSED': 'DELIVERED',
  'DENIED': 'CLOSED',
  'WITHDRAWN': 'WITHDRAWN'
};

const GOVLI_STATUS_MAP: Record<string, string> = {
  'SUBMITTED': 'NEW',
  'IN_PROGRESS': 'IN_PROGRESS',
  'PENDING_APPROVAL': 'PENDING_REVIEW',
  'DELIVERED': 'CLOSED',
  'CLOSED': 'DENIED',
  'WITHDRAWN': 'WITHDRAWN'
};

/**
 * GovQA Case format
 */
export interface GovQACase {
  case_number: string;
  subject: string;
  department_code?: string;
  requester_name: string;
  requester_email: string;
  requester_phone?: string;
  requester_address?: string;
  status_code: string;
  assigned_to?: string;
  created_date: string;
  due_date?: string;
  close_date?: string;
  description?: string;
  priority?: string;
}

/**
 * Govli Request format (simplified for mapping)
 */
export interface GovliRequest {
  id?: string;
  legacy_id?: string;
  migration_source?: string;
  description: string;
  agencies_requested?: string[];
  requester: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
  };
  foia_status: string;
  assigned_officer_id?: string;
  submitted_at: string | Date;
  statutory_deadline?: string | Date;
  delivered_at?: string | Date;
  priority?: string;
  [key: string]: any;
}

/**
 * GovQA Document format
 */
export interface GovQADocument {
  document_id: string;
  case_number: string;
  file_name: string;
  file_size: number;
  upload_date: string;
  uploaded_by: string;
  document_type?: string;
}

/**
 * GovQA Message format
 */
export interface GovQAMessage {
  message_id: string;
  case_number: string;
  sender: string;
  message_text: string;
  sent_date: string;
  is_internal: boolean;
}

/**
 * Convert GovQA case format to Govli request format
 */
export function govqaToGovli(govqaCase: GovQACase): GovliRequest {
  return {
    legacy_id: govqaCase.case_number,
    migration_source: 'govqa',
    description: govqaCase.subject + (govqaCase.description ? `\n\n${govqaCase.description}` : ''),
    agencies_requested: govqaCase.department_code ? [govqaCase.department_code] : [],
    requester: {
      name: govqaCase.requester_name,
      email: govqaCase.requester_email,
      phone: govqaCase.requester_phone,
      address: govqaCase.requester_address
    },
    foia_status: GOVQA_STATUS_MAP[govqaCase.status_code] || 'SUBMITTED',
    assigned_officer_id: govqaCase.assigned_to,
    submitted_at: govqaCase.created_date,
    statutory_deadline: govqaCase.due_date,
    delivered_at: govqaCase.close_date,
    priority: govqaCase.priority
  };
}

/**
 * Convert Govli request format to GovQA case format
 */
export function govliToGovqa(govliRequest: GovliRequest): GovQACase {
  // Extract subject from description (first line)
  const descriptionLines = govliRequest.description.split('\n');
  const subject = descriptionLines[0].substring(0, 200); // GovQA has 200 char limit on subject
  const description = descriptionLines.slice(1).join('\n').trim();

  return {
    case_number: govliRequest.legacy_id || govliRequest.id || '',
    subject,
    department_code: govliRequest.agencies_requested?.[0],
    requester_name: govliRequest.requester.name,
    requester_email: govliRequest.requester.email,
    requester_phone: govliRequest.requester.phone,
    requester_address: govliRequest.requester.address,
    status_code: GOVLI_STATUS_MAP[govliRequest.foia_status] || 'NEW',
    assigned_to: govliRequest.assigned_officer_id,
    created_date: formatDate(govliRequest.submitted_at),
    due_date: govliRequest.statutory_deadline ? formatDate(govliRequest.statutory_deadline) : undefined,
    close_date: govliRequest.delivered_at ? formatDate(govliRequest.delivered_at) : undefined,
    description,
    priority: govliRequest.priority
  };
}

/**
 * Convert Govli document to GovQA document format
 */
export function govliDocumentToGovqa(govliDoc: any, caseNumber: string): GovQADocument {
  return {
    document_id: govliDoc.id,
    case_number: caseNumber,
    file_name: govliDoc.file_name || govliDoc.name,
    file_size: govliDoc.file_size || govliDoc.size,
    upload_date: formatDate(govliDoc.uploaded_at || govliDoc.created_at),
    uploaded_by: govliDoc.uploaded_by || 'system',
    document_type: govliDoc.document_type || govliDoc.type
  };
}

/**
 * Convert Govli timeline event to GovQA message format
 */
export function govliTimelineToGovqaMessage(timelineEvent: any, caseNumber: string): GovQAMessage {
  return {
    message_id: timelineEvent.id,
    case_number: caseNumber,
    sender: timelineEvent.actor_name || timelineEvent.user_name || 'System',
    message_text: timelineEvent.description || timelineEvent.message || timelineEvent.event_type,
    sent_date: formatDate(timelineEvent.created_at || timelineEvent.timestamp),
    is_internal: timelineEvent.visibility === 'INTERNAL' || timelineEvent.is_internal || false
  };
}

/**
 * Format date to GovQA format (ISO 8601)
 */
function formatDate(date: string | Date | undefined): string {
  if (!date) return '';

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toISOString();
}

/**
 * Parse GovQA filter parameters to Govli query parameters
 */
export function parseGovqaFilters(govqaQuery: any): any {
  const govliQuery: any = {};

  if (govqaQuery.status) {
    govliQuery.status = GOVQA_STATUS_MAP[govqaQuery.status] || govqaQuery.status;
  }

  if (govqaQuery.department) {
    govliQuery.agency = govqaQuery.department;
  }

  if (govqaQuery.assigned_to) {
    govliQuery.assigned_to = govqaQuery.assigned_to;
  }

  if (govqaQuery.from_date) {
    govliQuery.date_from = govqaQuery.from_date;
  }

  if (govqaQuery.to_date) {
    govliQuery.date_to = govqaQuery.to_date;
  }

  if (govqaQuery.page) {
    govliQuery.page = govqaQuery.page;
  }

  if (govqaQuery.limit) {
    govliQuery.limit = govqaQuery.limit;
  }

  return govliQuery;
}

/**
 * Transform Govli error to GovQA error format
 */
export function govliErrorToGovqa(error: any): any {
  return {
    error_code: error.code || 'INTERNAL_ERROR',
    error_message: error.message || 'An error occurred',
    details: error.details || {},
    timestamp: new Date().toISOString()
  };
}
