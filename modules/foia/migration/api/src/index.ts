// @govli/foia-migration-api
// Built by Govli AI FOIA Build Guide v2/v3

/**
 * Migration API Module
 *
 * Provides time-gated bulk import API for migrating data from legacy FOIA systems.
 * Supports GovQA, NextRequest, JDE eRequest, and custom sources.
 *
 * Rate limit: 5000 req/min (configured in API Gateway)
 * Authentication: JWT-based migration tokens with 24h expiry
 * Migration window: Configurable (default 60 days)
 */

import migrationRouter from './routes';

export { migrationRouter };

// Re-export types for external use
export type {
  MigrationTokenPayload,
  MigrationRequest,
  BulkMigrationRequest,
  BulkMigrationDocument,
  BulkMigrationContact,
  BulkMigrationAuditEntry,
  StatusMapping,
  BulkRequestsImportResponse,
  BulkDocumentsImportResponse,
  BulkContactsImportResponse,
  BulkAuditEntriesImportResponse,
  ValidationReportResponse,
  FinalizeMigrationResponse
} from './types';

// Re-export utilities for programmatic use
export { generateMigrationToken, verifyMigrationToken } from './utils/tokenUtils';
export { getStatusMapping, storeStatusMappings, mapStatus } from './utils/statusMapper';
