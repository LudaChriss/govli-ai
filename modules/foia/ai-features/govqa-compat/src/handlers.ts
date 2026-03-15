/**
 * GovQA Compatibility API Layer - Handlers
 *
 * Provides backward-compatible endpoints for GovQA migration
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import {
  govqaToGovli,
  govliToGovqa,
  govliDocumentToGovqa,
  govliTimelineToGovqaMessage,
  parseGovqaFilters,
  govliErrorToGovqa,
  GovQACase
} from './services/fieldMapper';

/**
 * POST /api/compat/govqa/cases
 * Create new FOIA request (GovQA format)
 */
export async function createCase(req: Request, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const tenantId = (req as any).user?.tenant_id;
  const govqaCase: GovQACase = req.body;

  try {
    // Transform GovQA format to Govli format
    const govliRequest = govqaToGovli(govqaCase);

    // Add tenant ID
    govliRequest.tenant_id = tenantId;

    // Insert into database
    const result = await db.query(
      `INSERT INTO "FoiaRequests"
       (id, tenant_id, legacy_id, migration_source, description, requester, foia_status, submitted_at, statutory_deadline, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING id, legacy_id, description, requester, foia_status, submitted_at, statutory_deadline`,
      [
        tenantId,
        govliRequest.legacy_id,
        govliRequest.migration_source,
        govliRequest.description,
        JSON.stringify(govliRequest.requester),
        govliRequest.foia_status,
        govliRequest.submitted_at,
        govliRequest.statutory_deadline
      ]
    );

    const createdRequest = result.rows[0];

    // Transform back to GovQA format
    const responseCase = govliToGovqa({
      ...govliRequest,
      id: createdRequest.id
    });

    res.status(201).json({
      success: true,
      data: responseCase
    });
  } catch (error) {
    console.error('[GovQA Compat] Error creating case:', error);
    res.status(500).json(govliErrorToGovqa(error));
  }
}

/**
 * GET /api/compat/govqa/cases/:caseNumber
 * Get single case by case number
 */
export async function getCase(req: Request, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const tenantId = (req as any).user?.tenant_id;
  const { caseNumber } = req.params;

  try {
    // Look up by legacy_id where migration_source='govqa'
    const result = await db.query(
      `SELECT
        id, legacy_id, description, requester, foia_status,
        assigned_officer_id, submitted_at, statutory_deadline,
        delivered_at, priority
       FROM "FoiaRequests"
       WHERE tenant_id = $1
         AND legacy_id = $2
         AND migration_source = 'govqa'`,
      [tenantId, caseNumber]
    );

    if (result.rows.length === 0) {
      res.status(404).json(govliErrorToGovqa({
        code: 'NOT_FOUND',
        message: `Case ${caseNumber} not found`
      }));
      return;
    }

    const govliRequest = result.rows[0];

    // Transform to GovQA format
    const govqaCase = govliToGovqa(govliRequest);

    res.json({
      success: true,
      data: govqaCase
    });
  } catch (error) {
    console.error('[GovQA Compat] Error getting case:', error);
    res.status(500).json(govliErrorToGovqa(error));
  }
}

/**
 * GET /api/compat/govqa/cases
 * List cases with filters
 */
export async function listCases(req: Request, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const tenantId = (req as any).user?.tenant_id;

  try {
    // Parse GovQA filters
    const govliFilters = parseGovqaFilters(req.query);
    const page = parseInt(govliFilters.page || '1');
    const limit = parseInt(govliFilters.limit || '50');
    const offset = (page - 1) * limit;

    // Build WHERE clauses
    const whereClauses: string[] = ['tenant_id = $1', 'migration_source = \'govqa\''];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (govliFilters.status) {
      whereClauses.push(`foia_status = $${paramIndex++}`);
      params.push(govliFilters.status);
    }

    if (govliFilters.assigned_to) {
      whereClauses.push(`assigned_officer_id = $${paramIndex++}`);
      params.push(govliFilters.assigned_to);
    }

    if (govliFilters.date_from) {
      whereClauses.push(`submitted_at >= $${paramIndex++}`);
      params.push(govliFilters.date_from);
    }

    if (govliFilters.date_to) {
      whereClauses.push(`submitted_at <= $${paramIndex++}`);
      params.push(govliFilters.date_to);
    }

    // Query requests
    const result = await db.query(
      `SELECT
        id, legacy_id, description, requester, foia_status,
        assigned_officer_id, submitted_at, statutory_deadline,
        delivered_at, priority
       FROM "FoiaRequests"
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY submitted_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total
       FROM "FoiaRequests"
       WHERE ${whereClauses.join(' AND ')}`,
      params
    );

    const total = parseInt(countResult.rows[0].total);

    // Transform each to GovQA format
    const govqaCases = result.rows.map((req: any) => govliToGovqa(req));

    res.json({
      success: true,
      data: {
        cases: govqaCases,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    console.error('[GovQA Compat] Error listing cases:', error);
    res.status(500).json(govliErrorToGovqa(error));
  }
}

/**
 * GET /api/compat/govqa/cases/:caseNumber/documents
 * Get documents for a case
 */
export async function getCaseDocuments(req: Request, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const tenantId = (req as any).user?.tenant_id;
  const { caseNumber } = req.params;

  try {
    // Look up request ID
    const requestResult = await db.query(
      `SELECT id FROM "FoiaRequests"
       WHERE tenant_id = $1 AND legacy_id = $2 AND migration_source = 'govqa'`,
      [tenantId, caseNumber]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json(govliErrorToGovqa({
        code: 'NOT_FOUND',
        message: `Case ${caseNumber} not found`
      }));
      return;
    }

    const requestId = requestResult.rows[0].id;

    // Get documents
    const documentsResult = await db.query(
      `SELECT id, file_name, file_size, uploaded_at, uploaded_by, document_type
       FROM "FoiaDocuments"
       WHERE request_id = $1
       ORDER BY uploaded_at DESC`,
      [requestId]
    );

    // Transform to GovQA format
    const govqaDocuments = documentsResult.rows.map((doc: any) =>
      govliDocumentToGovqa(doc, caseNumber)
    );

    res.json({
      success: true,
      data: {
        case_number: caseNumber,
        documents: govqaDocuments
      }
    });
  } catch (error) {
    console.error('[GovQA Compat] Error getting documents:', error);
    res.status(500).json(govliErrorToGovqa(error));
  }
}

/**
 * POST /api/compat/govqa/cases/:caseNumber/documents
 * Upload document for a case
 */
export async function uploadCaseDocument(req: Request, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const tenantId = (req as any).user?.tenant_id;
  const { caseNumber } = req.params;

  try {
    // Look up request ID
    const requestResult = await db.query(
      `SELECT id FROM "FoiaRequests"
       WHERE tenant_id = $1 AND legacy_id = $2 AND migration_source = 'govqa'`,
      [tenantId, caseNumber]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json(govliErrorToGovqa({
        code: 'NOT_FOUND',
        message: `Case ${caseNumber} not found`
      }));
      return;
    }

    const requestId = requestResult.rows[0].id;

    // In a real implementation, this would handle file upload
    // For now, simulate document upload
    const documentResult = await db.query(
      `INSERT INTO "FoiaDocuments"
       (id, request_id, file_name, file_size, uploaded_at, uploaded_by, document_type, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW(), $4, $5, NOW())
       RETURNING id, file_name, file_size, uploaded_at, uploaded_by, document_type`,
      [
        requestId,
        req.body.file_name || 'document.pdf',
        req.body.file_size || 0,
        (req as any).user?.id || 'system',
        req.body.document_type || 'ATTACHMENT'
      ]
    );

    const doc = documentResult.rows[0];
    const govqaDoc = govliDocumentToGovqa(doc, caseNumber);

    res.status(201).json({
      success: true,
      data: govqaDoc
    });
  } catch (error) {
    console.error('[GovQA Compat] Error uploading document:', error);
    res.status(500).json(govliErrorToGovqa(error));
  }
}

/**
 * GET /api/compat/govqa/cases/:caseNumber/messages
 * Get message thread for a case
 */
export async function getCaseMessages(req: Request, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const tenantId = (req as any).user?.tenant_id;
  const { caseNumber } = req.params;

  try {
    // Look up request ID
    const requestResult = await db.query(
      `SELECT id FROM "FoiaRequests"
       WHERE tenant_id = $1 AND legacy_id = $2 AND migration_source = 'govqa'`,
      [tenantId, caseNumber]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json(govliErrorToGovqa({
        code: 'NOT_FOUND',
        message: `Case ${caseNumber} not found`
      }));
      return;
    }

    const requestId = requestResult.rows[0].id;

    // Get timeline events
    const timelineResult = await db.query(
      `SELECT id, event_type, description, actor_name, created_at, visibility
       FROM "FoiaTimeline"
       WHERE request_id = $1
       ORDER BY created_at ASC`,
      [requestId]
    );

    // Transform to GovQA message format
    const govqaMessages = timelineResult.rows.map((event: any) =>
      govliTimelineToGovqaMessage(event, caseNumber)
    );

    res.json({
      success: true,
      data: {
        case_number: caseNumber,
        messages: govqaMessages
      }
    });
  } catch (error) {
    console.error('[GovQA Compat] Error getting messages:', error);
    res.status(500).json(govliErrorToGovqa(error));
  }
}

/**
 * POST /api/compat/govqa/cases/:caseNumber/payment
 * Process payment for a case
 */
export async function processCasePayment(req: Request, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const tenantId = (req as any).user?.tenant_id;
  const { caseNumber } = req.params;
  const { amount, payment_method } = req.body;

  try {
    // Look up request ID
    const requestResult = await db.query(
      `SELECT id FROM "FoiaRequests"
       WHERE tenant_id = $1 AND legacy_id = $2 AND migration_source = 'govqa'`,
      [tenantId, caseNumber]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json(govliErrorToGovqa({
        code: 'NOT_FOUND',
        message: `Case ${caseNumber} not found`
      }));
      return;
    }

    const requestId = requestResult.rows[0].id;

    // Record payment
    const paymentResult = await db.query(
      `INSERT INTO "FoiaPayments"
       (id, request_id, amount, payment_method, payment_status, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'COMPLETED', NOW())
       RETURNING id, amount, payment_method, payment_status, created_at`,
      [requestId, amount, payment_method || 'CREDIT_CARD']
    );

    const payment = paymentResult.rows[0];

    // GovQA payment receipt format
    res.json({
      success: true,
      data: {
        case_number: caseNumber,
        payment_id: payment.id,
        amount: payment.amount,
        payment_method: payment.payment_method,
        status: payment.payment_status,
        transaction_date: payment.created_at
      }
    });
  } catch (error) {
    console.error('[GovQA Compat] Error processing payment:', error);
    res.status(500).json(govliErrorToGovqa(error));
  }
}

/**
 * GET /api/compat/govqa/reports/export
 * Export report in GovQA format
 */
export async function exportReport(req: Request, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const tenantId = (req as any).user?.tenant_id;
  const { format = 'csv', from_date, to_date } = req.query;

  try {
    // Build query
    const whereClauses: string[] = ['tenant_id = $1', 'migration_source = \'govqa\''];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (from_date) {
      whereClauses.push(`submitted_at >= $${paramIndex++}`);
      params.push(from_date);
    }

    if (to_date) {
      whereClauses.push(`submitted_at <= $${paramIndex++}`);
      params.push(to_date);
    }

    const result = await db.query(
      `SELECT
        legacy_id as case_number,
        description,
        requester,
        foia_status,
        submitted_at,
        statutory_deadline,
        delivered_at
       FROM "FoiaRequests"
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY submitted_at DESC`,
      params
    );

    if (format === 'csv') {
      // Generate CSV
      const headers = 'Case Number,Subject,Requester Name,Requester Email,Status,Created Date,Due Date,Close Date\n';
      const rows = result.rows.map((row: any) => {
        const requester = typeof row.requester === 'string' ? JSON.parse(row.requester) : row.requester;
        const subject = row.description.split('\n')[0];
        return [
          row.case_number,
          `"${subject}"`,
          `"${requester.name}"`,
          requester.email,
          row.foia_status,
          row.submitted_at,
          row.statutory_deadline || '',
          row.delivered_at || ''
        ].join(',');
      }).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="govqa_export_${Date.now()}.csv"`);
      res.send(headers + rows);
    } else {
      // JSON format
      const govqaCases = result.rows.map((req: any) => govliToGovqa(req));
      res.json({
        success: true,
        data: {
          format: 'json',
          total: govqaCases.length,
          cases: govqaCases
        }
      });
    }
  } catch (error) {
    console.error('[GovQA Compat] Error exporting report:', error);
    res.status(500).json(govliErrorToGovqa(error));
  }
}

/**
 * GET /api/v1/foia/migration/compat-usage
 * Migration tracking dashboard
 * Auth: foia_admin
 */
export async function getCompatUsage(req: Request, res: Response): Promise<void> {
  const db: Pool = req.app.locals.db;
  const tenantId = (req as any).user?.tenant_id;

  try {
    // Get total compat requests
    const totalResult = await db.query(
      `SELECT COUNT(*) as total
       FROM "FoiaCompatRequests"
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const totalRequests = parseInt(totalResult.rows[0].total);

    // Get unique integrations (by IP or user agent - simplified)
    const integrationsResult = await db.query(
      `SELECT COUNT(DISTINCT govqa_case_number) as unique_cases
       FROM "FoiaCompatRequests"
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const uniqueIntegrations = parseInt(integrationsResult.rows[0].unique_cases);

    // Get endpoints used with call counts
    const endpointsResult = await db.query(
      `SELECT
        endpoint,
        COUNT(*) as call_count,
        MAX(created_at) as last_used
       FROM "FoiaCompatRequests"
       WHERE tenant_id = $1
       GROUP BY endpoint
       ORDER BY call_count DESC`,
      [tenantId]
    );

    const endpointsUsed = endpointsResult.rows.map((row: any) => ({
      endpoint: row.endpoint,
      call_count: parseInt(row.call_count),
      last_used: row.last_used
    }));

    // Determine migration progress
    let migrationProgress: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE' = 'NOT_STARTED';

    if (totalRequests === 0) {
      migrationProgress = 'COMPLETE'; // No compat requests = fully migrated
    } else {
      // Check if there have been any requests in last 30 days
      const recentResult = await db.query(
        `SELECT COUNT(*) as recent
         FROM "FoiaCompatRequests"
         WHERE tenant_id = $1
           AND created_at >= NOW() - INTERVAL '30 days'`,
        [tenantId]
      );

      const recentRequests = parseInt(recentResult.rows[0].recent);

      if (recentRequests > 0) {
        migrationProgress = 'IN_PROGRESS';
      } else {
        migrationProgress = 'COMPLETE'; // No activity in 30 days
      }
    }

    res.json({
      success: true,
      data: {
        total_compat_requests: totalRequests,
        unique_integrations: uniqueIntegrations,
        endpoints_used: endpointsUsed,
        migration_progress: migrationProgress
      }
    });
  } catch (error) {
    console.error('[GovQA Compat] Error getting compat usage:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get compatibility usage data'
    });
  }
}
