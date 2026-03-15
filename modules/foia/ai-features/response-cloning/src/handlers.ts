/**
 * AI-15: Response Cloning Handlers
 *
 * API handlers for one-click response cloning with AI adaptation
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { CloningService } from './services/cloningService';
import { triggerCloneDetection } from './events/cloneDetectionSubscriber';

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: string;
        tenant_id: string;
      };
    }
  }
}

let dbPool: Pool;

export function setDatabasePool(pool: Pool): void {
  dbPool = pool;
}

// Validation schemas
const ExecuteCloneSchema = z.object({
  source_request_id: z.string().uuid()
});

const ApproveCloneSchema = z.object({
  modifications: z.object({
    adapted_letter: z.string().optional(),
    redactions: z.array(z.any()).optional(),
    exemptions: z.array(z.any()).optional()
  }).optional()
});

const RejectCloneSchema = z.object({
  reason: z.string().min(1)
});

/**
 * GET /ai/cloning/:foiaRequestId/candidates
 * Get clone candidates for a request
 */
export async function getCandidates(req: Request, res: Response): Promise<void> {
  try {
    const { foiaRequestId } = req.params;

    if (!foiaRequestId || !z.string().uuid().safeParse(foiaRequestId).success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request ID'
      });
      return;
    }

    // Auth check: foia_officer+
    if (!req.user || !['foia_officer', 'foia_coordinator', 'foia_supervisor'].includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Access denied. FOIA officer role required.'
      });
      return;
    }

    // Verify request exists and user has access
    const requestResult = await dbPool.query(
      `SELECT tenant_id FROM "FoiaRequests" WHERE id = $1`,
      [foiaRequestId]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Request not found'
      });
      return;
    }

    if (requestResult.rows[0].tenant_id !== req.user.tenant_id) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Cannot access other tenants.'
      });
      return;
    }

    const cloningService = new CloningService(dbPool, req.user.tenant_id);
    const candidates = await cloningService.getCandidates(foiaRequestId);

    res.json({
      success: true,
      data: {
        candidates,
        total: candidates.length
      }
    });
  } catch (error: any) {
    console.error('[CloningHandler] Error in getCandidates:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get clone candidates'
    });
  }
}

/**
 * POST /ai/cloning/:foiaRequestId/clone
 * Execute clone: copy response and adapt with AI
 */
export async function executeClone(req: Request, res: Response): Promise<void> {
  try {
    const { foiaRequestId } = req.params;
    const validated = ExecuteCloneSchema.parse(req.body);

    if (!foiaRequestId || !z.string().uuid().safeParse(foiaRequestId).success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request ID'
      });
      return;
    }

    // Auth check: foia_officer+
    if (!req.user || !['foia_officer', 'foia_coordinator', 'foia_supervisor'].includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Access denied. FOIA officer role required.'
      });
      return;
    }

    // Verify request exists and user has access
    const requestResult = await dbPool.query(
      `SELECT tenant_id FROM "FoiaRequests" WHERE id = $1`,
      [foiaRequestId]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Request not found'
      });
      return;
    }

    if (requestResult.rows[0].tenant_id !== req.user.tenant_id) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Cannot access other tenants.'
      });
      return;
    }

    const cloningService = new CloningService(dbPool, req.user.tenant_id);
    const clonePackage = await cloningService.executeClone(
      foiaRequestId,
      validated.source_request_id,
      req.user.id
    );

    res.json({
      success: true,
      data: clonePackage
    });
  } catch (error: any) {
    console.error('[CloningHandler] Error in executeClone:', error);

    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid request format',
        details: error.errors
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to execute clone'
    });
  }
}

/**
 * GET /ai/cloning/:foiaRequestId/review
 * Get side-by-side review of cloned response
 */
export async function getReview(req: Request, res: Response): Promise<void> {
  try {
    const { foiaRequestId } = req.params;

    if (!foiaRequestId || !z.string().uuid().safeParse(foiaRequestId).success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request ID'
      });
      return;
    }

    // Auth check: foia_officer+
    if (!req.user || !['foia_officer', 'foia_coordinator', 'foia_supervisor'].includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Access denied. FOIA officer role required.'
      });
      return;
    }

    // Verify request exists and user has access
    const requestResult = await dbPool.query(
      `SELECT tenant_id FROM "FoiaRequests" WHERE id = $1`,
      [foiaRequestId]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Request not found'
      });
      return;
    }

    if (requestResult.rows[0].tenant_id !== req.user.tenant_id) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Cannot access other tenants.'
      });
      return;
    }

    const cloningService = new CloningService(dbPool, req.user.tenant_id);
    const review = await cloningService.getReview(foiaRequestId);

    res.json({
      success: true,
      data: review
    });
  } catch (error: any) {
    console.error('[CloningHandler] Error in getReview:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get clone review'
    });
  }
}

/**
 * POST /ai/cloning/:foiaRequestId/approve
 * Approve cloned response (with optional modifications)
 */
export async function approveClone(req: Request, res: Response): Promise<void> {
  try {
    const { foiaRequestId } = req.params;
    const validated = ApproveCloneSchema.parse(req.body);

    if (!foiaRequestId || !z.string().uuid().safeParse(foiaRequestId).success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request ID'
      });
      return;
    }

    // Auth check: foia_officer+
    if (!req.user || !['foia_officer', 'foia_coordinator', 'foia_supervisor'].includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Access denied. FOIA officer role required.'
      });
      return;
    }

    // Verify request exists and user has access
    const requestResult = await dbPool.query(
      `SELECT tenant_id FROM "FoiaRequests" WHERE id = $1`,
      [foiaRequestId]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Request not found'
      });
      return;
    }

    if (requestResult.rows[0].tenant_id !== req.user.tenant_id) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Cannot access other tenants.'
      });
      return;
    }

    const cloningService = new CloningService(dbPool, req.user.tenant_id);
    await cloningService.approveClone(
      foiaRequestId,
      req.user.id,
      validated.modifications
    );

    res.json({
      success: true,
      data: {
        message: 'Clone approved successfully',
        request_id: foiaRequestId,
        status: 'PENDING_APPROVAL' // Proceeds to A-4 approval workflow
      }
    });
  } catch (error: any) {
    console.error('[CloningHandler] Error in approveClone:', error);

    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid request format',
        details: error.errors
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to approve clone'
    });
  }
}

/**
 * POST /ai/cloning/:foiaRequestId/reject
 * Reject cloned response
 */
export async function rejectClone(req: Request, res: Response): Promise<void> {
  try {
    const { foiaRequestId } = req.params;
    const validated = RejectCloneSchema.parse(req.body);

    if (!foiaRequestId || !z.string().uuid().safeParse(foiaRequestId).success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request ID'
      });
      return;
    }

    // Auth check: foia_officer+
    if (!req.user || !['foia_officer', 'foia_coordinator', 'foia_supervisor'].includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Access denied. FOIA officer role required.'
      });
      return;
    }

    // Verify request exists and user has access
    const requestResult = await dbPool.query(
      `SELECT tenant_id FROM "FoiaRequests" WHERE id = $1`,
      [foiaRequestId]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Request not found'
      });
      return;
    }

    if (requestResult.rows[0].tenant_id !== req.user.tenant_id) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Cannot access other tenants.'
      });
      return;
    }

    const cloningService = new CloningService(dbPool, req.user.tenant_id);
    await cloningService.rejectClone(foiaRequestId, validated.reason);

    res.json({
      success: true,
      data: {
        message: 'Clone rejected',
        request_id: foiaRequestId
      }
    });
  } catch (error: any) {
    console.error('[CloningHandler] Error in rejectClone:', error);

    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: 'Invalid request format',
        details: error.errors
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Failed to reject clone'
    });
  }
}

/**
 * GET /ai/cloning/analytics
 * Get cloning analytics
 */
export async function getAnalytics(req: Request, res: Response): Promise<void> {
  try {
    // Auth check: foia_supervisor+
    if (!req.user || !['foia_coordinator', 'foia_supervisor'].includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Supervisor role required.'
      });
      return;
    }

    // Parse date range
    const dateFrom = req.query.date_from
      ? new Date(req.query.date_from as string)
      : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // Default: 90 days ago

    const dateTo = req.query.date_to
      ? new Date(req.query.date_to as string)
      : new Date(); // Default: now

    const cloningService = new CloningService(dbPool, req.user.tenant_id);
    const analytics = await cloningService.getAnalytics(dateFrom, dateTo);

    res.json({
      success: true,
      data: {
        ...analytics,
        date_range: {
          from: dateFrom,
          to: dateTo
        }
      }
    });
  } catch (error: any) {
    console.error('[CloningHandler] Error in getAnalytics:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get analytics'
    });
  }
}

/**
 * POST /ai/cloning/:foiaRequestId/detect (manual trigger for testing)
 * Manually trigger clone detection
 */
export async function triggerDetection(req: Request, res: Response): Promise<void> {
  try {
    const { foiaRequestId } = req.params;

    if (!foiaRequestId || !z.string().uuid().safeParse(foiaRequestId).success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request ID'
      });
      return;
    }

    // Auth check: foia_officer+
    if (!req.user || !['foia_officer', 'foia_coordinator', 'foia_supervisor'].includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Access denied. FOIA officer role required.'
      });
      return;
    }

    // Load request details
    const requestResult = await dbPool.query(
      `SELECT * FROM "FoiaRequests" WHERE id = $1`,
      [foiaRequestId]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Request not found'
      });
      return;
    }

    const request = requestResult.rows[0];

    if (request.tenant_id !== req.user.tenant_id) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Cannot access other tenants.'
      });
      return;
    }

    const candidateCount = await triggerCloneDetection(
      dbPool,
      foiaRequestId,
      request.tenant_id,
      request.description,
      request.requester_category,
      request.department
    );

    res.json({
      success: true,
      data: {
        request_id: foiaRequestId,
        candidates_detected: candidateCount
      }
    });
  } catch (error: any) {
    console.error('[CloningHandler] Error in triggerDetection:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to trigger detection'
    });
  }
}
