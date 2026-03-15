/**
 * Migration API - Type Definitions
 */

import { Request } from 'express';

/**
 * Migration token payload
 */
export interface MigrationTokenPayload {
  tenant_id: string;
  migration_source: string;
  expires_at: string;
}

/**
 * Authenticated migration request
 */
export interface MigrationRequest extends Request {
  migrationToken?: MigrationTokenPayload;
}

/**
 * Migration request for bulk import
 */
export interface BulkMigrationRequest {
  legacy_id: string;
  migration_source: string;
  description: string;
  requester_name: string;
  requester_email: string;
  requester_phone?: string;
  requester_category: string;
  department: string;
  date_received: string; // ISO 8601
  date_due?: string;
  date_closed?: string;
  legacy_status: string;
  response_type?: string;
  exemptions_applied?: string[];
  notes?: string;
  custom_fields?: Record<string, any>;
}

/**
 * Migration document for bulk import
 */
export interface BulkMigrationDocument {
  legacy_request_id: string;
  filename: string;
  file_size_bytes: number;
  mime_type: string;
  upload_method: 'presigned_url' | 'base64';
  base64_content?: string;
}

/**
 * Migration contact for bulk import
 */
export interface BulkMigrationContact {
  email: string;
  name: string;
  phone?: string;
  organization?: string;
  address?: string;
  requester_category?: string;
  notes?: string;
}

/**
 * Migration audit entry for bulk import
 */
export interface BulkMigrationAuditEntry {
  legacy_request_id: string;
  event_type: string;
  description: string;
  actor_name?: string;
  timestamp: string; // ISO 8601 - CRITICAL: preserve original timestamp
  visibility?: 'PUBLIC' | 'INTERNAL';
  metadata?: Record<string, any>;
}

/**
 * Status mapping
 */
export interface StatusMapping {
  legacy_status: string;
  govli_status: string;
}

/**
 * Validation check result
 */
export interface ValidationCheck {
  check_name: string;
  source_count: number;
  govli_count: number;
  match: boolean;
  details: string;
}

/**
 * Bulk import error
 */
export interface BulkImportError {
  legacy_id: string;
  error: string;
}

/**
 * Request ID mapping
 */
export interface RequestIdMapping {
  legacy_id: string;
  govli_request_id: string;
}

/**
 * Presigned URL for document upload
 */
export interface PresignedUrl {
  legacy_request_id: string;
  upload_url: string;
  expires_at: string;
}

/**
 * Bulk requests import response
 */
export interface BulkRequestsImportResponse {
  imported: number;
  skipped: number;
  errors: BulkImportError[];
  request_id_map: RequestIdMapping[];
}

/**
 * Bulk documents import response
 */
export interface BulkDocumentsImportResponse {
  imported: number;
  skipped: number;
  errors: BulkImportError[];
  presigned_urls?: PresignedUrl[];
}

/**
 * Bulk contacts import response
 */
export interface BulkContactsImportResponse {
  imported: number;
  merged: number;
  skipped: number;
  errors: BulkImportError[];
}

/**
 * Bulk audit entries import response
 */
export interface BulkAuditEntriesImportResponse {
  imported: number;
  skipped: number;
  errors: BulkImportError[];
}

/**
 * Validation report response
 */
export interface ValidationReportResponse {
  validation_status: 'PASS' | 'WARN' | 'FAIL';
  checks: ValidationCheck[];
}

/**
 * Finalize migration response
 */
export interface FinalizeMigrationResponse {
  finalized_at: string;
  total_migrated: number;
  validation_report: ValidationReportResponse;
}

/**
 * Migration record database row
 */
export interface MigrationRecord {
  id: string;
  tenant_id: string;
  migration_source: string;
  legacy_id: string;
  legacy_status: string;
  govli_request_id: string;
  validation_status: string;
  migrated_at: Date;
  finalized_at?: Date;
}

/**
 * Default status mappings by migration source
 */
export const DEFAULT_STATUS_MAPPINGS: Record<string, StatusMapping[]> = {
  govqa: [
    { legacy_status: 'NEW', govli_status: 'SUBMITTED' },
    { legacy_status: 'ASSIGNED', govli_status: 'IN_PROGRESS' },
    { legacy_status: 'IN_PROGRESS', govli_status: 'IN_PROGRESS' },
    { legacy_status: 'PENDING_REVIEW', govli_status: 'PENDING_APPROVAL' },
    { legacy_status: 'CLOSED', govli_status: 'DELIVERED' },
    { legacy_status: 'DENIED', govli_status: 'CLOSED' },
    { legacy_status: 'WITHDRAWN', govli_status: 'WITHDRAWN' }
  ],
  nextrequest: [
    { legacy_status: 'Open', govli_status: 'SUBMITTED' },
    { legacy_status: 'In Process', govli_status: 'IN_PROGRESS' },
    { legacy_status: 'Fulfilled', govli_status: 'DELIVERED' },
    { legacy_status: 'Closed', govli_status: 'CLOSED' },
    { legacy_status: 'Denied', govli_status: 'CLOSED' }
  ],
  jderequest: [
    { legacy_status: 'Submitted', govli_status: 'SUBMITTED' },
    { legacy_status: 'Processing', govli_status: 'IN_PROGRESS' },
    { legacy_status: 'Completed', govli_status: 'DELIVERED' },
    { legacy_status: 'Closed', govli_status: 'CLOSED' }
  ]
};
