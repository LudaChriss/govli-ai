/**
 * Govli AI FOIA Module - Batch Intelligence Handlers
 * AI-13: API endpoints for batch opportunity management
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { BatchService } from './services/batchService';

// Database connection pool
let dbPool: Pool;

export function setDatabasePool(pool: Pool): void {
  dbPool = pool;
}

// ============================================================================
// Validation Schemas
// ============================================================================

const ExecuteActionSchema = z.object({
  action: z.enum(['MERGE', 'PARALLEL', 'DISMISS']),
  primary_request_id: z.string().uuid().optional(),
  reason: z.string().optional()
});

const AnalyticsQuerySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional()
});

type ExecuteActionInput = z.infer<typeof ExecuteActionSchema>;
type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

// ============================================================================
// Handler: Get Batch Opportunities
// ============================================================================

/**
 * GET /ai/batch/opportunities
 *
 * Get all open batch processing opportunities
 */
export async function getOpportunities(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const tenantId = (req as any).tenantId || 'default';
    const batchService = new BatchService(dbPool, tenantId);

    const opportunities = await batchService.getOpportunities();

    res.json({
      success: true,
      data: {
        opportunities,
        total: opportunities.length
      }
    });

  } catch (error) {
    console.error('Error fetching batch opportunities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch opportunities',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// Handler: Execute Batch Action
// ============================================================================

/**
 * POST /ai/batch/opportunities/:opportunityId/action
 *
 * Execute batch action (MERGE, PARALLEL, or DISMISS)
 */
export async function executeAction(
  req: Request<{ opportunityId: string }, {}, ExecuteActionInput>,
  res: Response
): Promise<void> {
  try {
    const { opportunityId } = req.params;

    const validation = ExecuteActionSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.issues
      });
      return;
    }

    const { action, primary_request_id, reason } = validation.data;

    // Validate primary_request_id for MERGE and PARALLEL
    if ((action === 'MERGE' || action === 'PARALLEL') && !primary_request_id) {
      res.status(400).json({
        success: false,
        error: 'primary_request_id is required for MERGE and PARALLEL actions'
      });
      return;
    }

    const tenantId = (req as any).tenantId || 'default';
    const batchService = new BatchService(dbPool, tenantId);

    // Execute the action
    await batchService.executeAction(
      opportunityId,
      action,
      primary_request_id,
      reason
    );

    // Emit event (would integrate with event bus in production)
    console.log('[BatchIntelligence] Emitting foia.ai.batch.action_taken', {
      opportunity_id: opportunityId,
      action,
      primary_request_id,
      tenant_id: tenantId
    });

    res.json({
      success: true,
      data: {
        opportunity_id: opportunityId,
        action,
        primary_request_id,
        executed_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error executing batch action:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute action',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// Handler: Get Batch Analytics
// ============================================================================

/**
 * GET /ai/batch/analytics
 *
 * Get batch processing analytics
 */
export async function getAnalytics(
  req: Request<{}, {}, {}, AnalyticsQuery>,
  res: Response
): Promise<void> {
  try {
    const validation = AnalyticsQuerySchema.safeParse(req.query);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.issues
      });
      return;
    }

    const { date_from, date_to } = validation.data;

    // Default to last 30 days
    const dateFrom = date_from ? new Date(date_from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = date_to ? new Date(date_to) : new Date();

    const tenantId = (req as any).tenantId || 'default';
    const batchService = new BatchService(dbPool, tenantId);

    const analytics = await batchService.getAnalytics(dateFrom, dateTo);

    res.json({
      success: true,
      data: {
        ...analytics,
        date_range: {
          from: dateFrom.toISOString(),
          to: dateTo.toISOString()
        }
      }
    });

  } catch (error) {
    console.error('Error fetching batch analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// Handler: Trigger Manual Batch Detection
// ============================================================================

/**
 * POST /ai/batch/detect/:requestId
 *
 * Manually trigger batch detection for a request (testing/admin)
 */
export async function triggerDetection(
  req: Request<{ requestId: string }>,
  res: Response
): Promise<void> {
  try {
    const { requestId } = req.params;

    // Fetch request details
    const requestResult = await dbPool.query(
      `SELECT id, description, tenant_id, requester_id, requester_email
       FROM "FoiaRequests"
       WHERE id = $1`,
      [requestId]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Request not found'
      });
      return;
    }

    const request = requestResult.rows[0];
    const batchService = new BatchService(dbPool, request.tenant_id);

    // Detect batch opportunities
    const opportunities = await batchService.detectBatchOpportunities(
      request.id,
      request.description
    );

    res.json({
      success: true,
      data: {
        request_id: requestId,
        opportunities,
        detected_count: opportunities.length
      }
    });

  } catch (error) {
    console.error('Error triggering batch detection:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to trigger detection',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
