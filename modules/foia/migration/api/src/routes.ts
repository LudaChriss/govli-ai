/**
 * Migration API - Routes
 */

import { Router } from 'express';
import { authenticateMigrationToken } from './middleware/authMiddleware';
import * as handlers from './handlers';

const router = Router();

/**
 * POST /api/v1/foia/migration/auth
 * Authenticate and obtain migration token
 *
 * Input: { migration_key: string }
 * Output: { migration_token: string, tenant_id: string, migration_source: string, expires_at: string }
 */
router.post('/auth', handlers.authenticate);

/**
 * POST /api/v1/foia/migration/requests/bulk
 * Bulk import FOIA requests from legacy system
 *
 * Auth: migration_token required
 * Input: { requests: BulkMigrationRequest[] } (max 1000)
 * Output: { imported, skipped, errors[], request_id_map[] }
 */
router.post(
  '/requests/bulk',
  authenticateMigrationToken,
  handlers.bulkImportRequests
);

/**
 * POST /api/v1/foia/migration/documents/bulk
 * Bulk import documents from legacy system
 *
 * Auth: migration_token required
 * Input: { documents: BulkMigrationDocument[] } (max 500)
 * Output: { imported, skipped, errors[], presigned_urls[] }
 */
router.post(
  '/documents/bulk',
  authenticateMigrationToken,
  handlers.bulkImportDocuments
);

/**
 * POST /api/v1/foia/migration/contacts/bulk
 * Bulk import contacts from legacy system
 *
 * Auth: migration_token required
 * Input: { contacts: BulkMigrationContact[] } (max 2000)
 * Output: { imported, merged, skipped, errors[] }
 */
router.post(
  '/contacts/bulk',
  authenticateMigrationToken,
  handlers.bulkImportContacts
);

/**
 * POST /api/v1/foia/migration/audit-entries/bulk
 * Bulk import audit log entries from legacy system
 *
 * Auth: migration_token required
 * Input: { entries: BulkMigrationAuditEntry[] }
 * Output: { imported, skipped, errors[] }
 */
router.post(
  '/audit-entries/bulk',
  authenticateMigrationToken,
  handlers.bulkImportAuditEntries
);

/**
 * POST /api/v1/foia/migration/status-mapping
 * Set custom status mappings for legacy to Govli status translation
 *
 * Auth: migration_token required
 * Input: { mappings: StatusMapping[] }
 * Output: { success: boolean, mappings_stored: number }
 */
router.post(
  '/status-mapping',
  authenticateMigrationToken,
  handlers.setStatusMapping
);

/**
 * GET /api/v1/foia/migration/validation-report
 * Get validation report comparing source vs Govli data
 *
 * Auth: migration_token required
 * Output: { validation_status: 'PASS'|'WARN'|'FAIL', checks[] }
 */
router.get(
  '/validation-report',
  authenticateMigrationToken,
  handlers.getValidationReport
);

/**
 * POST /api/v1/foia/migration/finalize
 * Finalize migration and invalidate migration token
 *
 * Auth: migration_token required
 * Output: { finalized_at, total_migrated, validation_report }
 */
router.post(
  '/finalize',
  authenticateMigrationToken,
  handlers.finalizeMigration
);

export default router;
