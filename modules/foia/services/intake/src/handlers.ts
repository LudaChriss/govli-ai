/**
 * Govli AI FOIA Module - Intake Service Handlers
 * Business logic for FOIA request intake and validation
 */

import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Pool } from 'pg';
import axios from 'axios';
import {
  FoiaRequest,
  GovliEvent,
  PaginatedResponse,
  ApiResponse
} from '@govli/foia-shared';
import { calculateFoiaDueDate } from '@govli/foia-shared';
import {
  SubmitRequestInput,
  ValidateRequestInput,
  AcknowledgeRequestInput,
  StaffQueueFilters,
  DuplicateCheckInput
} from './schemas';
import { ComplexityScorer } from '../../../ai-sidecar/src/complexityScorer';

// Database connection pool (should be injected in production)
let dbPool: Pool;

export function setDatabasePool(pool: Pool): void {
  dbPool = pool;
}

/**
 * Analytics bus for emitting events (mock implementation)
 */
const analyticsBus = {
  emit: async (event: GovliEvent): Promise<void> => {
    // In production, this would publish to message queue or event bus
    console.log('[AnalyticsBus]', event.event_type, event);
  }
};

/**
 * POST /intake/requests
 * Submit a new FOIA request (public endpoint)
 */
export async function submitRequest(
  req: Request<{}, {}, SubmitRequestInput>,
  res: Response
): Promise<void> {
  try {
    const requestData = req.body;
    const tenantId = (req as any).tenantId || '00000000-0000-0000-0000-000000000000';

    // Generate UUID for the request
    const requestId = uuidv4();
    const confirmationNumber = generateConfirmationNumber();

    // Calculate statutory deadline (20 business days)
    const receivedAt = new Date();
    const dueDate = calculateFoiaDueDate(receivedAt, 20);

    // Determine initial priority
    const priority = determinePriority(requestData);

    // Create the FOIA request record
    const foiaRequest: Partial<FoiaRequest> = {
      id: requestId,
      tenant_id: tenantId,
      requester_name: requestData.requester_name,
      requester_email: requestData.requester_email,
      requester_category: requestData.requester_category,
      subject: requestData.subject,
      description: requestData.description,
      date_range_start: requestData.date_range_start
        ? new Date(requestData.date_range_start)
        : undefined,
      date_range_end: requestData.date_range_end
        ? new Date(requestData.date_range_end)
        : undefined,
      agency_names: requestData.agency_names,
      status: 'PENDING',
      priority,
      due_date: dueDate,
      received_at: receivedAt,
      created_at: receivedAt,
      updated_at: receivedAt
    };

    // v2.0: Extract migration_source from headers or body
    const migrationSource = (req.body as any).migration_source ||
                           req.headers['x-migration-source'] as string ||
                           null;

    // Insert into database (v2.0: added complexity_score and migration_source)
    await dbPool.query(
      `INSERT INTO foia_requests (
        id, tenant_id, requester_name, requester_email, requester_category,
        subject, description, date_range_start, date_range_end, agency_names,
        status, priority, due_date, received_at, created_at, updated_at,
        confirmation_number, complexity_score, migration_source
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        foiaRequest.id,
        foiaRequest.tenant_id,
        foiaRequest.requester_name,
        foiaRequest.requester_email,
        foiaRequest.requester_category,
        foiaRequest.subject,
        foiaRequest.description,
        foiaRequest.date_range_start || null,
        foiaRequest.date_range_end || null,
        foiaRequest.agency_names,
        foiaRequest.status,
        foiaRequest.priority,
        foiaRequest.due_date,
        foiaRequest.received_at,
        foiaRequest.created_at,
        foiaRequest.updated_at,
        confirmationNumber,
        null, // complexity_score - calculated below
        migrationSource
      ]
    );

    // v2.0: Calculate complexity score after INSERT
    let complexityScore = 0;
    try {
      const scorer = new ComplexityScorer();
      const scoreResult = scorer.calculateScore({
        request_text_length: (requestData.description || '').length,
        document_count: 0, // No documents at intake stage
        has_legal_citations: /\d+\s*U\.?S\.?C\.?|\d+\s*C\.?F\.?R\.?/i.test(requestData.description || ''),
        requires_legal_analysis: requestData.expedited_processing || false,
        has_multiple_exemptions: false,
        is_urgent: requestData.expedited_processing || false,
        feature_id: 'AI-1', // Intake Triage
        estimated_analysis_depth: 'moderate'
      });

      complexityScore = scoreResult.total_score;

      // Update the request with the calculated score
      await dbPool.query(
        `UPDATE foia_requests SET complexity_score = $1 WHERE id = $2`,
        [complexityScore, requestId]
      );
    } catch (error: any) {
      console.error('Failed to calculate complexity score:', error);
      // Don't fail the request if scoring fails
    }

    // Emit event for analytics
    const event: GovliEvent = {
      id: uuidv4(),
      tenant_id: tenantId,
      event_type: 'foia.request.submitted',
      entity_id: requestId,
      entity_type: 'foia_request',
      user_id: undefined,
      metadata: {
        requester_category: requestData.requester_category,
        agency_count: requestData.agency_names.length,
        expedited: requestData.expedited_processing,
        fee_waiver: requestData.fee_waiver_requested,
        complexity_score: complexityScore,
        migration_source: migrationSource
      },
      timestamp: new Date()
    };

    await analyticsBus.emit(event);

    // v2.0: Emit webhook to legacy CRM if configured
    try {
      const webhookUrl = await getLegacyCrmWebhookUrl(tenantId);
      if (webhookUrl) {
        // Fire-and-forget webhook
        axios.post(webhookUrl, {
          request_id: requestId,
          confirmation_number: confirmationNumber,
          requester_email: requestData.requester_email,
          subject: requestData.subject,
          status: 'PENDING',
          received_at: receivedAt,
          due_date: dueDate
        }, {
          timeout: 5000,
          headers: { 'Content-Type': 'application/json' }
        }).catch((error) => {
          console.error('Webhook delivery failed (non-blocking):', error.message);
        });

        // Log webhook attempt to audit
        await dbPool.query(
          `INSERT INTO foia_request_history (
            id, request_id, action, performed_by, notes, created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())`,
          [
            uuidv4(),
            requestId,
            'WEBHOOK_SENT',
            null,
            `Webhook sent to ${webhookUrl}`
          ]
        );
      }
    } catch (error: any) {
      console.error('Webhook emission failed (non-blocking):', error);
      // Don't fail the request if webhook fails
    }

    // AI-8: Generate fee estimate (fire-and-forget)
    try {
      // Calculate date range in years
      let dateRangeYears = 0;
      if (requestData.date_range_start && requestData.date_range_end) {
        const start = new Date(requestData.date_range_start);
        const end = new Date(requestData.date_range_end);
        dateRangeYears = Math.abs(end.getFullYear() - start.getFullYear());
      }

      // Fire-and-forget fee estimation call
      axios.post(`${process.env.API_BASE_URL || 'http://localhost:3000'}/ai/fees/estimate`, {
        foia_request_id: requestId,
        description: requestData.description,
        requester_category: requestData.requester_category,
        agencies_requested: requestData.agency_names,
        date_range_years: dateRangeYears,
        estimated_record_volume: 'MEDIUM', // Default, could be enhanced with ML
        record_type: undefined // Could be extracted from description
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': tenantId
        }
      }).catch((error) => {
        console.error('Fee estimation failed (non-blocking):', error.message);
      });
    } catch (error: any) {
      console.error('Fee estimation initialization failed (non-blocking):', error);
      // Don't fail the request if fee estimation fails
    }

    // Return response
    const response: ApiResponse<{
      request_id: string;
      confirmation_number: string;
      status: string;
      due_date: Date;
    }> = {
      success: true,
      data: {
        request_id: requestId,
        confirmation_number: confirmationNumber,
        status: 'PENDING',
        due_date: dueDate
      },
      timestamp: new Date()
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error('Error submitting request:', error);
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'SUBMISSION_FAILED',
        message: 'Failed to submit FOIA request',
        details: error.message
      },
      timestamp: new Date()
    };
    res.status(500).json(response);
  }
}

/**
 * GET /intake/requests/:id/status
 * Get request status (public + staff views)
 */
export async function getRequestStatus(
  req: Request<{ id: string }>,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const confirmationNumber = req.query.confirmation_number as string;
    const isStaff = (req as any).user?.role !== undefined;

    let query: string;
    let params: any[];

    if (confirmationNumber) {
      // Public lookup by confirmation number
      query = `
        SELECT id, status, received_at, due_date, subject, priority,
               confirmation_number, created_at, updated_at
        FROM foia_requests
        WHERE confirmation_number = $1
      `;
      params = [confirmationNumber];
    } else {
      // Lookup by ID (requires authentication)
      if (!isStaff) {
        res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Authentication required for ID-based lookup'
          },
          timestamp: new Date()
        });
        return;
      }

      query = `
        SELECT * FROM foia_requests WHERE id = $1
      `;
      params = [id];
    }

    const result = await dbPool.query(query, params);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Request not found'
        },
        timestamp: new Date()
      });
      return;
    }

    const request = result.rows[0];

    res.json({
      success: true,
      data: request,
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error getting request status:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch request status',
        details: error.message
      },
      timestamp: new Date()
    });
  }
}

/**
 * PUT /intake/requests/:id/validate
 * Validate/review a request (staff only)
 */
export async function validateRequest(
  req: Request<{ id: string }, {}, ValidateRequestInput>,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const validationData = req.body;
    const userId = (req as any).user?.id;

    // Update request with validation status
    const newStatus =
      validationData.validation_status === 'APPROVED'
        ? 'IN_REVIEW'
        : validationData.validation_status === 'REJECTED'
        ? 'DENIED'
        : 'PENDING';

    await dbPool.query(
      `UPDATE foia_requests
       SET status = $1, assigned_to = $2, updated_at = NOW()
       WHERE id = $3`,
      [newStatus, validationData.assigned_to || null, id]
    );

    // Log validation action
    await dbPool.query(
      `INSERT INTO foia_request_history (
        id, request_id, action, performed_by, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        uuidv4(),
        id,
        'VALIDATION',
        userId,
        validationData.validation_notes || null
      ]
    );

    // Emit event
    const event: GovliEvent = {
      id: uuidv4(),
      tenant_id: (req as any).tenantId,
      event_type: 'foia.request.validated',
      entity_id: id,
      entity_type: 'foia_request',
      user_id: userId,
      metadata: {
        validation_status: validationData.validation_status,
        assigned_to: validationData.assigned_to
      },
      timestamp: new Date()
    };

    await analyticsBus.emit(event);

    res.json({
      success: true,
      data: {
        request_id: id,
        status: newStatus,
        validation_status: validationData.validation_status
      },
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error validating request:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Failed to validate request',
        details: error.message
      },
      timestamp: new Date()
    });
  }
}

/**
 * POST /intake/requests/:id/acknowledge
 * Send acknowledgment to requester (staff only)
 */
export async function acknowledgeRequest(
  req: Request<{ id: string }, {}, AcknowledgeRequestInput>,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const ackData = req.body;
    const userId = (req as any).user?.id;

    // Get request details
    const requestResult = await dbPool.query(
      'SELECT * FROM foia_requests WHERE id = $1',
      [id]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Request not found'
        },
        timestamp: new Date()
      });
      return;
    }

    const request = requestResult.rows[0];

    // Update status to acknowledged
    await dbPool.query(
      `UPDATE foia_requests
       SET status = 'IN_REVIEW', updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    // Log acknowledgment
    await dbPool.query(
      `INSERT INTO foia_request_history (
        id, request_id, action, performed_by, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        uuidv4(),
        id,
        'ACKNOWLEDGED',
        userId,
        `Sent via ${ackData.acknowledgment_method}`
      ]
    );

    // In production, send actual email/mail here
    console.log(`[Acknowledgment] Sending to ${request.requester_email} via ${ackData.acknowledgment_method}`);

    // Emit event
    const event: GovliEvent = {
      id: uuidv4(),
      tenant_id: (req as any).tenantId,
      event_type: 'foia.request.acknowledged',
      entity_id: id,
      entity_type: 'foia_request',
      user_id: userId,
      metadata: {
        method: ackData.acknowledgment_method
      },
      timestamp: new Date()
    };

    await analyticsBus.emit(event);

    res.json({
      success: true,
      data: {
        request_id: id,
        acknowledged_at: new Date(),
        method: ackData.acknowledgment_method
      },
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error acknowledging request:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ACKNOWLEDGMENT_FAILED',
        message: 'Failed to acknowledge request',
        details: error.message
      },
      timestamp: new Date()
    });
  }
}

/**
 * GET /intake/requests
 * Get staff queue with filters (staff only)
 */
export async function getStaffQueue(
  req: Request<{}, {}, {}, StaffQueueFilters>,
  res: Response
): Promise<void> {
  try {
    const filters = req.query;

    // Build query
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.priority) {
      conditions.push(`priority = $${paramIndex++}`);
      params.push(filters.priority);
    }

    if (filters.assigned_to) {
      conditions.push(`assigned_to = $${paramIndex++}`);
      params.push(filters.assigned_to);
    }

    if (filters.requester_category) {
      conditions.push(`requester_category = $${paramIndex++}`);
      params.push(filters.requester_category);
    }

    if (filters.from_date) {
      conditions.push(`received_at >= $${paramIndex++}`);
      params.push(filters.from_date);
    }

    if (filters.to_date) {
      conditions.push(`received_at <= $${paramIndex++}`);
      params.push(filters.to_date);
    }

    if (filters.search) {
      conditions.push(`(subject ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await dbPool.query(
      `SELECT COUNT(*) FROM foia_requests ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const offset = ((filters.page as unknown as number) - 1) * (filters.page_size as unknown as number);
    const sortOrder = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

    const dataResult = await dbPool.query(
      `SELECT * FROM foia_requests
       ${whereClause}
       ORDER BY ${filters.sort_by} ${sortOrder}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, filters.page_size, offset]
    );

    const response: ApiResponse<PaginatedResponse<any>> = {
      success: true,
      data: {
        data: dataResult.rows,
        total,
        page: filters.page as unknown as number,
        page_size: filters.page_size as unknown as number,
        has_more: offset + dataResult.rows.length < total
      },
      timestamp: new Date()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error fetching staff queue:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch staff queue',
        details: error.message
      },
      timestamp: new Date()
    });
  }
}

/**
 * POST /intake/requests/:id/duplicate-check
 * Check for duplicate or similar requests (staff only)
 */
export async function checkDuplicates(
  req: Request<{ id: string }, {}, DuplicateCheckInput>,
  res: Response
): Promise<void> {
  try {
    const { id } = req.params;
    const { similarity_threshold, check_last_days } = req.body;

    // Get the current request
    const requestResult = await dbPool.query(
      'SELECT * FROM foia_requests WHERE id = $1',
      [id]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Request not found'
        },
        timestamp: new Date()
      });
      return;
    }

    const currentRequest = requestResult.rows[0];

    // Find similar requests (simple text similarity)
    // In production, use vector similarity or AI-based duplicate detection
    const similarResult = await dbPool.query(
      `SELECT id, subject, description, requester_email, received_at, status,
              similarity(subject || ' ' || description, $1) as similarity_score
       FROM foia_requests
       WHERE id != $2
         AND received_at >= NOW() - INTERVAL '${check_last_days} days'
         AND (
           requester_email = $3
           OR similarity(subject || ' ' || description, $1) > $4
         )
       ORDER BY similarity_score DESC
       LIMIT 10`,
      [
        currentRequest.subject + ' ' + currentRequest.description,
        id,
        currentRequest.requester_email,
        similarity_threshold
      ]
    );

    res.json({
      success: true,
      data: {
        request_id: id,
        similar_requests: similarResult.rows,
        is_likely_duplicate: similarResult.rows.length > 0 && similarResult.rows[0].similarity_score > 0.9
      },
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error checking duplicates:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DUPLICATE_CHECK_FAILED',
        message: 'Failed to check for duplicates',
        details: error.message
      },
      timestamp: new Date()
    });
  }
}

/**
 * Helper: Get legacy CRM webhook URL from tenant config
 * v2.0: Added for webhook integration
 */
async function getLegacyCrmWebhookUrl(tenantId: string): Promise<string | null> {
  try {
    const result = await dbPool.query(
      `SELECT config FROM tenant_settings
       WHERE tenant_id = $1
         AND key = 'integrations'`,
      [tenantId]
    );

    if (result.rows.length > 0) {
      const config = result.rows[0].config;
      return config?.legacy_crm_webhook || null;
    }
  } catch (error: any) {
    console.warn('Could not fetch webhook config:', error.message);
  }

  return null;
}

/**
 * Helper: Generate confirmation number
 */
function generateConfirmationNumber(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
  return `FOIA-${year}-${random}`;
}

/**
 * Helper: Determine priority based on request data
 */
function determinePriority(data: SubmitRequestInput): 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' {
  if (data.expedited_processing) {
    return 'URGENT';
  }

  if (data.requester_category === 'NEWS_MEDIA') {
    return 'HIGH';
  }

  if (data.agency_names.length > 3) {
    return 'MEDIUM';
  }

  return 'LOW';
}
