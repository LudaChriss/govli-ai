/**
 * Spreadsheet Import Engine - Types
 */

import { Request } from 'express';

import { File as MulterFile } from 'multer';

/**
 * Extended Express Request with user authentication
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    tenant_id: string;
    role: string;
  };
  file?: MulterFile;
  body: any;
}

/**
 * File upload response
 */
export interface FileUploadResponse {
  file_id: string;
  sheet_names: string[];
  columns: string[];
  row_count: number;
  preview: Record<string, any>[];
  detected_date_columns: string[];
  detected_email_columns: string[];
}

/**
 * Column mapping suggestion from AI
 */
export interface ColumnMapping {
  source_column: string;
  target_field: string | null;
  confidence: number;
}

/**
 * AI mapping suggestion response
 */
export interface MappingSuggestionResponse {
  mappings: ColumnMapping[];
}

/**
 * Confirmed mapping input
 */
export interface ConfirmMappingInput {
  file_id: string;
  mappings: {
    source: string;
    target: string;
  }[];
}

/**
 * Confirmed mapping response
 */
export interface ConfirmMappingResponse {
  mapping_id: string;
  mapped_fields: string[];
  unmapped_columns: string[];
}

/**
 * Import request input
 */
export interface ImportRequestInput {
  file_id: string;
  mapping_id: string;
}

/**
 * Import error detail
 */
export interface ImportError {
  row_number: number;
  error: string;
}

/**
 * Import response
 */
export interface ImportResponse {
  total_rows: number;
  imported: number;
  skipped: number;
  errors: ImportError[];
  import_report_url: string;
}

/**
 * Parsed spreadsheet data stored in Redis
 */
export interface ParsedSpreadsheetData {
  file_id: string;
  original_filename: string;
  sheet_names: string[];
  columns: string[];
  rows: Record<string, any>[];
  detected_date_columns: string[];
  detected_email_columns: string[];
  uploaded_at: string;
  uploaded_by: string;
  tenant_id: string;
}

/**
 * Confirmed mapping stored in Redis
 */
export interface ConfirmedMapping {
  mapping_id: string;
  file_id: string;
  mappings: {
    source: string;
    target: string;
  }[];
  confirmed_at: string;
  confirmed_by: string;
  tenant_id: string;
}

/**
 * Target FOIA fields for mapping
 */
export type FoiaTargetField =
  | 'requester_name'
  | 'requester_email'
  | 'requester_phone'
  | 'description'
  | 'date_received'
  | 'date_due'
  | 'date_closed'
  | 'department'
  | 'status'
  | 'response_type'
  | 'notes'
  | 'tracking_number'
  | 'category';

/**
 * Valid target fields array
 */
export const VALID_TARGET_FIELDS: FoiaTargetField[] = [
  'requester_name',
  'requester_email',
  'requester_phone',
  'description',
  'date_received',
  'date_due',
  'date_closed',
  'department',
  'status',
  'response_type',
  'notes',
  'tracking_number',
  'category'
];

/**
 * Status mapping keywords (flexible matching)
 */
export const STATUS_KEYWORDS: Record<string, string> = {
  // Submitted/Open
  'open': 'SUBMITTED',
  'new': 'SUBMITTED',
  'submitted': 'SUBMITTED',
  'received': 'SUBMITTED',
  'pending': 'SUBMITTED',

  // In Progress
  'in progress': 'IN_PROGRESS',
  'in-progress': 'IN_PROGRESS',
  'processing': 'IN_PROGRESS',
  'assigned': 'IN_PROGRESS',
  'under review': 'IN_PROGRESS',
  'reviewing': 'IN_PROGRESS',

  // Pending Approval
  'pending approval': 'PENDING_APPROVAL',
  'awaiting approval': 'PENDING_APPROVAL',
  'needs approval': 'PENDING_APPROVAL',

  // Ready for Delivery
  'ready': 'READY_FOR_DELIVERY',
  'ready for delivery': 'READY_FOR_DELIVERY',
  'approved': 'READY_FOR_DELIVERY',

  // Delivered
  'delivered': 'DELIVERED',
  'fulfilled': 'DELIVERED',
  'completed': 'DELIVERED',
  'sent': 'DELIVERED',

  // Closed
  'closed': 'CLOSED',
  'complete': 'CLOSED',
  'done': 'CLOSED',

  // Denied
  'denied': 'CLOSED',
  'rejected': 'CLOSED',

  // Withdrawn
  'withdrawn': 'WITHDRAWN',
  'cancelled': 'WITHDRAWN',
  'canceled': 'WITHDRAWN'
};
