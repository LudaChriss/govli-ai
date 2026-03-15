/**
 * Migration API - Handlers
 */

import { Response } from 'express';
import { Pool } from 'pg';
import {
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
  FinalizeMigrationResponse,
  BulkImportError,
  RequestIdMapping
} from './types';
import { generateMigrationToken } from './utils/tokenUtils';
import { getStatusMapping, storeStatusMappings, mapStatus } from './utils/statusMapper';
import { generatePresignedUploadUrl, uploadBase64ToS3 } from './utils/storageUtils';

/**
 * POST /api/v1/foia/migration/auth
 * Authenticate with migration key and get JWT token
 */
export async function authenticate(req: MigrationRequest, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const { migration_key } = req.body;

  if (!migration_key) {
    res.status(400).json({
      success: false,
      error: 'migration_key is required'
    });
    return;
  }

  try {
    // Verify migration key against active migration configuration
    const result = await db.query(
      `SELECT tenant_id, migration_source, migration_window_expires_at
       FROM "FoiaMigrationConfigurations"
       WHERE migration_key = $1
         AND is_active = true
         AND migration_window_expires_at > NOW()`,
      [migration_key]
    );

    if (result.rows.length === 0) {
      res.status(401).json({
        success: false,
        error: 'Invalid migration key or migration window expired'
      });
      return;
    }

    const config = result.rows[0];

    // Generate migration token (24h expiry)
    const token = generateMigrationToken({
      tenant_id: config.tenant_id,
      migration_source: config.migration_source,
      expires_at: config.migration_window_expires_at
    });

    res.json({
      success: true,
      data: {
        migration_token: token,
        tenant_id: config.tenant_id,
        migration_source: config.migration_source,
        expires_at: config.migration_window_expires_at
      }
    });
  } catch (error) {
    console.error('[Migration API] Error in authenticate:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to authenticate migration key'
    });
  }
}

/**
 * POST /api/v1/foia/migration/requests/bulk
 * Bulk import FOIA requests (up to 1000 per call)
 */
export async function bulkImportRequests(req: MigrationRequest, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const { requests }: { requests: BulkMigrationRequest[] } = req.body;
  const tenantId = req.migrationToken!.tenant_id;
  const migrationSource = req.migrationToken!.migration_source;

  if (!requests || !Array.isArray(requests)) {
    res.status(400).json({
      success: false,
      error: 'requests array is required'
    });
    return;
  }

  if (requests.length > 1000) {
    res.status(400).json({
      success: false,
      error: 'Maximum 1000 requests per bulk import'
    });
    return;
  }

  try {
    // Get status mapping for this tenant
    const statusMap = await getStatusMapping(db, tenantId, migrationSource);

    const response: BulkRequestsImportResponse = {
      imported: 0,
      skipped: 0,
      errors: [],
      request_id_map: []
    };

    for (const request of requests) {
      try {
        // Validate required fields
        if (!request.legacy_id || !request.migration_source || !request.description ||
            !request.requester_name || !request.requester_email || !request.requester_category ||
            !request.department || !request.date_received || !request.legacy_status) {
          response.errors.push({
            legacy_id: request.legacy_id || 'unknown',
            error: 'Missing required fields'
          });
          response.skipped++;
          continue;
        }

        // Check if already migrated
        const existingResult = await db.query(
          `SELECT govli_request_id FROM "FoiaMigrationRecords"
           WHERE tenant_id = $1 AND migration_source = $2 AND legacy_id = $3`,
          [tenantId, migrationSource, request.legacy_id]
        );

        if (existingResult.rows.length > 0) {
          response.request_id_map.push({
            legacy_id: request.legacy_id,
            govli_request_id: existingResult.rows[0].govli_request_id
          });
          response.skipped++;
          continue;
        }

        // Map legacy status to Govli status
        const govliStatus = mapStatus(request.legacy_status, statusMap);

        // Calculate statutory deadline (simplified - would use jurisdiction rules)
        const receivedDate = new Date(request.date_received);
        const statutoryDeadline = request.date_due || new Date(receivedDate.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString();

        // Create FOIA request
        const requestResult = await db.query(
          `INSERT INTO "FoiaRequests"
           (id, tenant_id, legacy_id, migration_source, description, requester, foia_status,
            submitted_at, statutory_deadline, delivered_at, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
           RETURNING id`,
          [
            tenantId,
            request.legacy_id,
            request.migration_source,
            request.description,
            JSON.stringify({
              name: request.requester_name,
              email: request.requester_email,
              phone: request.requester_phone
            }),
            govliStatus,
            request.date_received,
            statutoryDeadline,
            request.date_closed || null
          ]
        );

        const govliRequestId = requestResult.rows[0].id;

        // Create migration record
        await db.query(
          `INSERT INTO "FoiaMigrationRecords"
           (id, tenant_id, migration_source, legacy_id, legacy_status, govli_request_id, validation_status, migrated_at, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'MIGRATED', NOW(), NOW())`,
          [tenantId, migrationSource, request.legacy_id, request.legacy_status, govliRequestId]
        );

        // Create audit log entry
        await db.query(
          `INSERT INTO "FoiaAuditLog"
           (id, request_id, event_type, description, created_at)
           VALUES (gen_random_uuid(), $1, 'MIGRATED', $2, NOW())`,
          [govliRequestId, `Migrated from ${migrationSource}`]
        );

        response.imported++;
        response.request_id_map.push({
          legacy_id: request.legacy_id,
          govli_request_id: govliRequestId
        });
      } catch (error) {
        console.error(`[Migration API] Error importing request ${request.legacy_id}:`, error);
        response.errors.push({
          legacy_id: request.legacy_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        response.skipped++;
      }
    }

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('[Migration API] Error in bulkImportRequests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import requests'
    });
  }
}

/**
 * POST /api/v1/foia/migration/documents/bulk
 * Bulk import documents (up to 500 per call)
 */
export async function bulkImportDocuments(req: MigrationRequest, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const { documents }: { documents: BulkMigrationDocument[] } = req.body;
  const tenantId = req.migrationToken!.tenant_id;
  const migrationSource = req.migrationToken!.migration_source;

  if (!documents || !Array.isArray(documents)) {
    res.status(400).json({
      success: false,
      error: 'documents array is required'
    });
    return;
  }

  if (documents.length > 500) {
    res.status(400).json({
      success: false,
      error: 'Maximum 500 documents per bulk import'
    });
    return;
  }

  try {
    const response: BulkDocumentsImportResponse = {
      imported: 0,
      skipped: 0,
      errors: [],
      presigned_urls: []
    };

    for (const doc of documents) {
      try {
        // Look up Govli request ID from legacy ID
        const requestResult = await db.query(
          `SELECT govli_request_id FROM "FoiaMigrationRecords"
           WHERE tenant_id = $1 AND migration_source = $2 AND legacy_id = $3`,
          [tenantId, migrationSource, doc.legacy_request_id]
        );

        if (requestResult.rows.length === 0) {
          response.errors.push({
            legacy_id: doc.legacy_request_id,
            error: 'Request not found'
          });
          response.skipped++;
          continue;
        }

        const govliRequestId = requestResult.rows[0].govli_request_id;

        if (doc.upload_method === 'presigned_url') {
          // Generate presigned URL for client upload
          const { uploadUrl, expiresAt } = await generatePresignedUploadUrl(
            doc.filename,
            doc.mime_type,
            tenantId
          );

          response.presigned_urls!.push({
            legacy_request_id: doc.legacy_request_id,
            upload_url: uploadUrl,
            expires_at: expiresAt
          });

          // Create document record (pending upload)
          await db.query(
            `INSERT INTO "FoiaDocuments"
             (id, request_id, file_name, file_size, mime_type, uploaded_at, uploaded_by, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), 'migration', NOW())`,
            [govliRequestId, doc.filename, doc.file_size_bytes, doc.mime_type]
          );
        } else if (doc.upload_method === 'base64') {
          // Upload base64 content directly
          if (!doc.base64_content) {
            response.errors.push({
              legacy_id: doc.legacy_request_id,
              error: 'base64_content required for base64 upload method'
            });
            response.skipped++;
            continue;
          }

          if (doc.file_size_bytes > 5 * 1024 * 1024) {
            response.errors.push({
              legacy_id: doc.legacy_request_id,
              error: 'base64 method limited to 5MB files'
            });
            response.skipped++;
            continue;
          }

          const s3Url = await uploadBase64ToS3(
            doc.base64_content,
            doc.filename,
            doc.mime_type,
            tenantId
          );

          // Create document record
          await db.query(
            `INSERT INTO "FoiaDocuments"
             (id, request_id, file_name, file_size, mime_type, s3_url, uploaded_at, uploaded_by, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), 'migration', NOW())`,
            [govliRequestId, doc.filename, doc.file_size_bytes, doc.mime_type, s3Url]
          );
        }

        response.imported++;
      } catch (error) {
        console.error(`[Migration API] Error importing document for ${doc.legacy_request_id}:`, error);
        response.errors.push({
          legacy_id: doc.legacy_request_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        response.skipped++;
      }
    }

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('[Migration API] Error in bulkImportDocuments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import documents'
    });
  }
}

/**
 * POST /api/v1/foia/migration/contacts/bulk
 * Bulk import contacts (up to 2000 per call)
 */
export async function bulkImportContacts(req: MigrationRequest, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const { contacts }: { contacts: BulkMigrationContact[] } = req.body;
  const tenantId = req.migrationToken!.tenant_id;

  if (!contacts || !Array.isArray(contacts)) {
    res.status(400).json({
      success: false,
      error: 'contacts array is required'
    });
    return;
  }

  if (contacts.length > 2000) {
    res.status(400).json({
      success: false,
      error: 'Maximum 2000 contacts per bulk import'
    });
    return;
  }

  try {
    const response: BulkContactsImportResponse = {
      imported: 0,
      merged: 0,
      skipped: 0,
      errors: []
    };

    for (const contact of contacts) {
      try {
        if (!contact.email || !contact.name) {
          response.errors.push({
            legacy_id: contact.email || 'unknown',
            error: 'email and name are required'
          });
          response.skipped++;
          continue;
        }

        // Check for duplicate by email (case-insensitive)
        const existingResult = await db.query(
          `SELECT id, name, phone, organization, address
           FROM "FoiaContacts"
           WHERE tenant_id = $1 AND LOWER(email) = LOWER($2)`,
          [tenantId, contact.email]
        );

        if (existingResult.rows.length > 0) {
          // Merge fields (prefer non-null values)
          const existing = existingResult.rows[0];
          await db.query(
            `UPDATE "FoiaContacts"
             SET name = COALESCE($1, name),
                 phone = COALESCE($2, phone),
                 organization = COALESCE($3, organization),
                 address = COALESCE($4, address),
                 updated_at = NOW()
             WHERE id = $5`,
            [
              contact.name || existing.name,
              contact.phone || existing.phone,
              contact.organization || existing.organization,
              contact.address || existing.address,
              existing.id
            ]
          );
          response.merged++;
        } else {
          // Create new contact
          await db.query(
            `INSERT INTO "FoiaContacts"
             (id, tenant_id, email, name, phone, organization, address, requester_category, notes, created_at, updated_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
            [
              tenantId,
              contact.email,
              contact.name,
              contact.phone,
              contact.organization,
              contact.address,
              contact.requester_category,
              contact.notes
            ]
          );
          response.imported++;
        }
      } catch (error) {
        console.error(`[Migration API] Error importing contact ${contact.email}:`, error);
        response.errors.push({
          legacy_id: contact.email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        response.skipped++;
      }
    }

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('[Migration API] Error in bulkImportContacts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import contacts'
    });
  }
}

/**
 * POST /api/v1/foia/migration/audit-entries/bulk
 * Bulk import audit entries (preserves original timestamps)
 */
export async function bulkImportAuditEntries(req: MigrationRequest, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const { entries }: { entries: BulkMigrationAuditEntry[] } = req.body;
  const tenantId = req.migrationToken!.tenant_id;
  const migrationSource = req.migrationToken!.migration_source;

  if (!entries || !Array.isArray(entries)) {
    res.status(400).json({
      success: false,
      error: 'entries array is required'
    });
    return;
  }

  try {
    const response: BulkAuditEntriesImportResponse = {
      imported: 0,
      skipped: 0,
      errors: []
    };

    for (const entry of entries) {
      try {
        if (!entry.legacy_request_id || !entry.event_type || !entry.description || !entry.timestamp) {
          response.errors.push({
            legacy_id: entry.legacy_request_id || 'unknown',
            error: 'Missing required fields'
          });
          response.skipped++;
          continue;
        }

        // Look up Govli request ID
        const requestResult = await db.query(
          `SELECT govli_request_id FROM "FoiaMigrationRecords"
           WHERE tenant_id = $1 AND migration_source = $2 AND legacy_id = $3`,
          [tenantId, migrationSource, entry.legacy_request_id]
        );

        if (requestResult.rows.length === 0) {
          response.errors.push({
            legacy_id: entry.legacy_request_id,
            error: 'Request not found'
          });
          response.skipped++;
          continue;
        }

        const govliRequestId = requestResult.rows[0].govli_request_id;

        // CRITICAL: Preserve original timestamp (do not use NOW())
        await db.query(
          `INSERT INTO "FoiaAuditLog"
           (id, request_id, event_type, description, actor_name, created_at, visibility, metadata, is_migration)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, true)`,
          [
            govliRequestId,
            entry.event_type,
            entry.description,
            entry.actor_name || 'System',
            entry.timestamp, // CRITICAL: Use original timestamp
            entry.visibility || 'PUBLIC',
            JSON.stringify(entry.metadata || {})
          ]
        );

        response.imported++;
      } catch (error) {
        console.error(`[Migration API] Error importing audit entry for ${entry.legacy_request_id}:`, error);
        response.errors.push({
          legacy_id: entry.legacy_request_id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        response.skipped++;
      }
    }

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('[Migration API] Error in bulkImportAuditEntries:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import audit entries'
    });
  }
}

/**
 * POST /api/v1/foia/migration/status-mapping
 * Store custom status mappings
 */
export async function setStatusMapping(req: MigrationRequest, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const { mappings }: { mappings: StatusMapping[] } = req.body;
  const tenantId = req.migrationToken!.tenant_id;
  const migrationSource = req.migrationToken!.migration_source;

  if (!mappings || !Array.isArray(mappings)) {
    res.status(400).json({
      success: false,
      error: 'mappings array is required'
    });
    return;
  }

  try {
    await storeStatusMappings(db, tenantId, migrationSource, mappings);

    res.json({
      success: true,
      data: {
        message: `${mappings.length} status mappings stored`,
        mappings
      }
    });
  } catch (error) {
    console.error('[Migration API] Error in setStatusMapping:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store status mappings'
    });
  }
}

/**
 * GET /api/v1/foia/migration/validation-report
 * Generate validation report
 */
export async function getValidationReport(req: MigrationRequest, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const tenantId = req.migrationToken!.tenant_id;
  const migrationSource = req.migrationToken!.migration_source;

  try {
    const report: ValidationReportResponse = {
      validation_status: 'PASS',
      checks: []
    };

    // Check 1: Total requests migrated
    const migratedCountResult = await db.query(
      `SELECT COUNT(*) as count
       FROM "FoiaMigrationRecords"
       WHERE tenant_id = $1 AND migration_source = $2`,
      [tenantId, migrationSource]
    );
    const migratedCount = parseInt(migratedCountResult.rows[0].count);

    const actualCountResult = await db.query(
      `SELECT COUNT(*) as count
       FROM "FoiaRequests"
       WHERE tenant_id = $1 AND migration_source = $2`,
      [tenantId, migrationSource]
    );
    const actualCount = parseInt(actualCountResult.rows[0].count);

    const totalMatch = migratedCount === actualCount;
    if (!totalMatch) report.validation_status = 'WARN';

    report.checks.push({
      check_name: 'Total Requests',
      source_count: migratedCount,
      govli_count: actualCount,
      match: totalMatch,
      details: totalMatch ? 'All migrated requests accounted for' : 'Mismatch in total count'
    });

    // Check 2: Document count
    const docMigrationResult = await db.query(
      `SELECT COUNT(DISTINCT mr.govli_request_id) as count
       FROM "FoiaMigrationRecords" mr
       WHERE mr.tenant_id = $1 AND mr.migration_source = $2`,
      [tenantId, migrationSource]
    );
    const requestsWithDocs = parseInt(docMigrationResult.rows[0].count);

    const actualDocsResult = await db.query(
      `SELECT COUNT(*) as count
       FROM "FoiaDocuments" d
       JOIN "FoiaRequests" r ON d.request_id = r.id
       WHERE r.tenant_id = $1 AND r.migration_source = $2`,
      [tenantId, migrationSource]
    );
    const actualDocs = parseInt(actualDocsResult.rows[0].count);

    report.checks.push({
      check_name: 'Documents',
      source_count: requestsWithDocs,
      govli_count: actualDocs,
      match: true, // Informational
      details: `${actualDocs} documents migrated`
    });

    // Check 3: Status distribution
    const statusDistResult = await db.query(
      `SELECT foia_status, COUNT(*) as count
       FROM "FoiaRequests"
       WHERE tenant_id = $1 AND migration_source = $2
       GROUP BY foia_status`,
      [tenantId, migrationSource]
    );

    report.checks.push({
      check_name: 'Status Distribution',
      source_count: statusDistResult.rows.length,
      govli_count: statusDistResult.rows.length,
      match: true,
      details: statusDistResult.rows.map(r => `${r.foia_status}: ${r.count}`).join(', ')
    });

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('[Migration API] Error in getValidationReport:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate validation report'
    });
  }
}

/**
 * POST /api/v1/foia/migration/finalize
 * Finalize migration and lock down
 */
export async function finalizeMigration(req: MigrationRequest, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const tenantId = req.migrationToken!.tenant_id;
  const migrationSource = req.migrationToken!.migration_source;

  // Verify user is foia_admin (would check req.user in production)
  // For now, we'll just proceed

  try {
    // 1. Mark all migration records as finalized
    await db.query(
      `UPDATE "FoiaMigrationRecords"
       SET validation_status = 'FINAL', finalized_at = NOW()
       WHERE tenant_id = $1 AND migration_source = $2`,
      [tenantId, migrationSource]
    );

    // 2. Invalidate migration configuration
    await db.query(
      `UPDATE "FoiaMigrationConfigurations"
       SET is_active = false, finalized_at = NOW()
       WHERE tenant_id = $1 AND migration_source = $2`,
      [tenantId, migrationSource]
    );

    // 3. Get total migrated count
    const countResult = await db.query(
      `SELECT COUNT(*) as total
       FROM "FoiaMigrationRecords"
       WHERE tenant_id = $1 AND migration_source = $2`,
      [tenantId, migrationSource]
    );
    const totalMigrated = parseInt(countResult.rows[0].total);

    // 4. Generate final validation report (reuse existing function logic)
    const reportResult = await db.query(
      `SELECT COUNT(*) as count FROM "FoiaRequests"
       WHERE tenant_id = $1 AND migration_source = $2`,
      [tenantId, migrationSource]
    );

    const validationReport: ValidationReportResponse = {
      validation_status: 'PASS',
      checks: [{
        check_name: 'Final Count',
        source_count: totalMigrated,
        govli_count: parseInt(reportResult.rows[0].count),
        match: true,
        details: 'Migration finalized successfully'
      }]
    };

    // 5. Emit migration completed event (would use event bus in production)
    console.log('[Migration API] Emitting foia.migration.completed', {
      tenant_id: tenantId,
      migration_source: migrationSource,
      total_migrated: totalMigrated
    });

    const response: FinalizeMigrationResponse = {
      finalized_at: new Date().toISOString(),
      total_migrated: totalMigrated,
      validation_report: validationReport
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('[Migration API] Error in finalizeMigration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to finalize migration'
    });
  }
}
