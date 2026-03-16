/**
 * Email Import Engine - API Handlers
 */

import { Response } from 'express';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  AuthenticatedRequest,
  IncomingEmailPayload,
  EmailIngestResponse,
  PendingImportRequest,
  ApproveRequestInput,
  RejectRequestInput,
  EmailImportAnalytics,
  ParsedFoiaRequest
} from './types';
import {
  parseEmailWithAI,
  extractTenantSubdomain,
  lookupTenantBySubdomain
} from './utils/emailParser';
import {
  uploadAttachmentToS3,
  validateAttachment,
  getFileSizeFromBase64
} from './utils/attachmentHandler';

/**
 * POST /api/v1/foia/migration/email/ingest
 * Webhook for incoming emails
 */
export async function ingestEmail(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const db: Pool = req.app.locals.db;

  try {
    const payload: IncomingEmailPayload = req.body;

    // Validate required fields
    if (!payload.from || !payload.to || !payload.subject || !payload.body_text) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: from, to, subject, body_text'
      });
      return;
    }

    // Step 1: Extract tenant from recipient address
    const subdomain = extractTenantSubdomain(payload.to);

    if (!subdomain) {
      res.status(400).json({
        success: false,
        error: `Invalid recipient address format. Expected: import@{subdomain}.govli.ai, got: ${payload.to}`
      });
      return;
    }

    const tenantId = await lookupTenantBySubdomain(db, subdomain);

    if (!tenantId) {
      res.status(404).json({
        success: false,
        error: `No active tenant found for subdomain: ${subdomain}`
      });
      return;
    }

    // Step 2: Parse email with AI
    const parsedData: ParsedFoiaRequest = await parseEmailWithAI(
      payload.from,
      payload.subject,
      payload.body_text,
      payload.body_html
    );

    console.log(`[Email Ingest] Parsed email from ${payload.from}`, {
      is_foia_request: parsedData.is_foia_request,
      confidence: parsedData.confidence,
      requester_name: parsedData.requester_name
    });

    // Create email import record
    const emailImportId = uuidv4();

    await db.query(
      `INSERT INTO "FoiaEmailImports"
       (id, tenant_id, from_email, to_email, subject, body_text, body_html,
        parsed_data, is_foia, confidence, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'PENDING', NOW())`,
      [
        emailImportId,
        tenantId,
        payload.from,
        payload.to,
        payload.subject,
        payload.body_text,
        payload.body_html || null,
        JSON.stringify(parsedData),
        parsedData.is_foia_request,
        parsedData.confidence
      ]
    );

    // Step 3: If is_foia_request = true, create draft FOIA request
    let requestId: string | undefined;
    let requiresReview = true;

    if (parsedData.is_foia_request) {
      requestId = uuidv4();

      // Create DRAFT foia_request with PENDING_IMPORT_REVIEW status
      await db.query(
        `INSERT INTO "FoiaRequests"
         (id, tenant_id, legacy_id, migration_source, description, requester,
          foia_status, submitted_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'email', $4, $5, 'PENDING_IMPORT_REVIEW', NOW(), NOW(), NOW())`,
        [
          requestId,
          tenantId,
          `EMAIL-${emailImportId}`,
          parsedData.request_description || payload.subject,
          JSON.stringify({
            name: parsedData.requester_name || 'Unknown',
            email: parsedData.requester_email || payload.from,
            phone: parsedData.requester_phone,
            organization: parsedData.requester_organization
          })
        ]
      );

      // Link email import to request
      await db.query(
        `UPDATE "FoiaEmailImports"
         SET request_id = $1
         WHERE id = $2`,
        [requestId, emailImportId]
      );

      // Step 3b: Attach email attachments as documents
      if (payload.attachments && payload.attachments.length > 0) {
        for (const attachment of payload.attachments) {
          // Validate attachment
          const validation = validateAttachment(attachment);
          if (!validation.valid) {
            console.warn(`[Email Ingest] Skipping invalid attachment: ${validation.error}`);
            continue;
          }

          // Upload to S3
          const s3Url = await uploadAttachmentToS3(attachment, tenantId, requestId);

          // Create document record
          await db.query(
            `INSERT INTO "FoiaDocuments"
             (id, request_id, filename, file_size, mime_type, s3_url, uploaded_by, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'email-import', NOW())`,
            [
              requestId,
              attachment.filename,
              getFileSizeFromBase64(attachment.content_base64),
              attachment.content_type,
              s3Url
            ]
          );
        }
      }

      // Step 3c: Notify foia_admin
      // TODO: Implement notification system
      console.log(`[Email Ingest] Notification: New imported request ${requestId} needs review`, {
        tenant_id: tenantId,
        confidence: parsedData.confidence,
        requester_email: parsedData.requester_email
      });

      // Emit event
      console.log('[Email Ingest] Emitting foia.email.import.pending_review', {
        tenant_id: tenantId,
        request_id: requestId,
        email_import_id: emailImportId
      });
    } else {
      // Step 4: Email is NOT a FOIA request - log as reject
      console.log(`[Email Ingest] Email rejected as non-FOIA`, {
        from: payload.from,
        subject: payload.subject,
        confidence: parsedData.confidence
      });

      requiresReview = false;
    }

    // Return response
    const response: EmailIngestResponse = {
      processed: true,
      request_id: requestId,
      confidence: parsedData.confidence,
      requires_review: requiresReview,
      message: parsedData.is_foia_request
        ? 'Email parsed as FOIA request. Draft created for review.'
        : 'Email does not appear to be a FOIA request.'
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('[Email Ingest] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to ingest email'
    });
  }
}

/**
 * GET /api/v1/foia/migration/email/pending
 * List all PENDING_IMPORT_REVIEW requests
 */
export async function getPendingReviews(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const db: Pool = req.app.locals.db;

  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const tenantId = req.user.tenant_id;

    // Get all pending email imports with draft requests
    const result = await db.query(
      `SELECT
         ei.id as email_import_id,
         ei.from_email,
         ei.subject,
         ei.body_text,
         ei.parsed_data,
         ei.confidence,
         ei.created_at,
         fr.id as request_id,
         fr.description,
         fr.requester
       FROM "FoiaEmailImports" ei
       LEFT JOIN "FoiaRequests" fr ON ei.request_id = fr.id
       WHERE ei.tenant_id = $1
         AND ei.is_foia = true
         AND ei.status = 'PENDING'
         AND fr.foia_status = 'PENDING_IMPORT_REVIEW'
       ORDER BY ei.created_at DESC`,
      [tenantId]
    );

    const pendingRequests: PendingImportRequest[] = result.rows.map((row: any) => ({
      id: row.request_id,
      tenant_id: tenantId,
      from_email: row.from_email,
      subject: row.subject,
      body_text: row.body_text,
      parsed_data: row.parsed_data,
      confidence: parseFloat(row.confidence),
      created_at: row.created_at.toISOString(),
      original_email_id: row.email_import_id
    }));

    res.json({
      success: true,
      data: {
        pending_requests: pendingRequests,
        total: pendingRequests.length
      }
    });
  } catch (error) {
    console.error('[Get Pending Reviews] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve pending reviews'
    });
  }
}

/**
 * POST /api/v1/foia/migration/email/:requestId/approve
 * Approve and finalize imported request
 */
export async function approveRequest(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const db: Pool = req.app.locals.db;

  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const { requestId } = req.params;
    const { approved_fields }: ApproveRequestInput = req.body;
    const tenantId = req.user.tenant_id;

    // Verify request exists and is in PENDING_IMPORT_REVIEW status
    const requestResult = await db.query(
      `SELECT id, requester, description
       FROM "FoiaRequests"
       WHERE id = $1 AND tenant_id = $2 AND foia_status = 'PENDING_IMPORT_REVIEW'`,
      [requestId, tenantId]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Request not found or not pending review'
      });
      return;
    }

    const currentRequest = requestResult.rows[0];
    const currentRequester = currentRequest.requester;

    // Apply approved fields (overriding AI-parsed values)
    let updatedDescription = currentRequest.description;
    let updatedRequester = currentRequester;

    if (approved_fields) {
      if (approved_fields.description) {
        updatedDescription = approved_fields.description;
      }

      // Update requester fields
      if (approved_fields.requester_name ||
          approved_fields.requester_email ||
          approved_fields.requester_phone ||
          approved_fields.requester_organization) {

        updatedRequester = {
          name: approved_fields.requester_name || currentRequester.name,
          email: approved_fields.requester_email || currentRequester.email,
          phone: approved_fields.requester_phone || currentRequester.phone,
          organization: approved_fields.requester_organization || currentRequester.organization
        };
      }
    }

    // Transition from PENDING_IMPORT_REVIEW to SUBMITTED
    await db.query(
      `UPDATE "FoiaRequests"
       SET foia_status = 'SUBMITTED',
           description = $1,
           requester = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [updatedDescription, JSON.stringify(updatedRequester), requestId]
    );

    // Update email import status to APPROVED
    await db.query(
      `UPDATE "FoiaEmailImports"
       SET status = 'APPROVED',
           approved_at = NOW()
       WHERE request_id = $1`,
      [requestId]
    );

    // Create audit log entry
    await db.query(
      `INSERT INTO "FoiaAuditLog"
       (id, request_id, event_type, description, actor_name, created_at)
       VALUES (gen_random_uuid(), $1, 'APPROVED_EMAIL_IMPORT', $2, $3, NOW())`,
      [
        requestId,
        'Email import approved and request submitted',
        req.user.id
      ]
    );

    // Emit event
    console.log('[Approve Request] Emitting foia.email.import.approved', {
      tenant_id: tenantId,
      request_id: requestId
    });

    res.json({
      success: true,
      data: {
        request_id: requestId,
        status: 'SUBMITTED',
        message: 'Request approved and submitted'
      }
    });
  } catch (error) {
    console.error('[Approve Request] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to approve request'
    });
  }
}

/**
 * POST /api/v1/foia/migration/email/:requestId/reject
 * Reject and delete imported request
 */
export async function rejectRequest(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const db: Pool = req.app.locals.db;

  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const { requestId } = req.params;
    const { reason }: RejectRequestInput = req.body;
    const tenantId = req.user.tenant_id;

    if (!reason) {
      res.status(400).json({
        success: false,
        error: 'Rejection reason is required'
      });
      return;
    }

    // Verify request exists and is in PENDING_IMPORT_REVIEW status
    const requestResult = await db.query(
      `SELECT id
       FROM "FoiaRequests"
       WHERE id = $1 AND tenant_id = $2 AND foia_status = 'PENDING_IMPORT_REVIEW'`,
      [requestId, tenantId]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Request not found or not pending review'
      });
      return;
    }

    // Update email import status to REJECTED (keep for quality tracking)
    await db.query(
      `UPDATE "FoiaEmailImports"
       SET status = 'REJECTED',
           rejected_at = NOW(),
           rejection_reason = $1
       WHERE request_id = $2`,
      [reason, requestId]
    );

    // Delete the draft request
    await db.query(
      `DELETE FROM "FoiaRequests" WHERE id = $1`,
      [requestId]
    );

    // Emit event
    console.log('[Reject Request] Emitting foia.email.import.rejected', {
      tenant_id: tenantId,
      request_id: requestId,
      reason
    });

    res.json({
      success: true,
      data: {
        message: 'Request rejected and deleted',
        reason
      }
    });
  } catch (error) {
    console.error('[Reject Request] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reject request'
    });
  }
}

/**
 * GET /api/v1/foia/migration/email/analytics
 * Get email import analytics
 */
export async function getAnalytics(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  const db: Pool = req.app.locals.db;

  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const tenantId = req.user.tenant_id;

    // Get analytics data
    const statsResult = await db.query(
      `SELECT
         COUNT(*) as total_emails,
         COUNT(*) FILTER (WHERE is_foia = true) as parsed_as_foia,
         COUNT(*) FILTER (WHERE is_foia = false) as parsed_as_non_foia,
         COUNT(*) FILTER (WHERE status = 'APPROVED') as approved,
         COUNT(*) FILTER (WHERE status = 'REJECTED') as rejected,
         COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
         AVG(confidence) as avg_confidence
       FROM "FoiaEmailImports"
       WHERE tenant_id = $1`,
      [tenantId]
    );

    const stats = statsResult.rows[0];

    // Calculate false positive rate
    // False positives = emails parsed as FOIA but rejected by admin
    const falsePositives = await db.query(
      `SELECT COUNT(*) as count
       FROM "FoiaEmailImports"
       WHERE tenant_id = $1
         AND is_foia = true
         AND status = 'REJECTED'`,
      [tenantId]
    );

    const totalParsedAsFoia = parseInt(stats.parsed_as_foia) || 1; // Avoid division by zero
    const falsePositiveCount = parseInt(falsePositives.rows[0].count);
    const falsePositiveRate = (falsePositiveCount / totalParsedAsFoia) * 100;

    const analytics: EmailImportAnalytics = {
      emails_received: parseInt(stats.total_emails) || 0,
      parsed_as_foia: parseInt(stats.parsed_as_foia) || 0,
      parsed_as_non_foia: parseInt(stats.parsed_as_non_foia) || 0,
      approved: parseInt(stats.approved) || 0,
      rejected: parseInt(stats.rejected) || 0,
      pending_review: parseInt(stats.pending) || 0,
      avg_confidence: parseFloat(stats.avg_confidence) || 0,
      false_positive_rate: falsePositiveRate || 0
    };

    res.json({
      success: true,
      data: analytics
    });
  } catch (error) {
    console.error('[Get Analytics] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve analytics'
    });
  }
}
