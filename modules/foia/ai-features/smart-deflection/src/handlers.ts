/**
 * Govli AI FOIA Module - Smart Deflection Handlers
 * AI-12: API endpoints for deflection search and analytics
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { DeflectionService } from './services/deflectionService';

// Database connection pool
let dbPool: Pool;

export function setDatabasePool(pool: Pool): void {
  dbPool = pool;
}

// Rate limiting map (in production, use Redis)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_MAX = 30; // 30 requests
const RATE_LIMIT_WINDOW = 60 * 1000; // per minute

/**
 * Simple rate limiting middleware
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW
    });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

// ============================================================================
// Validation Schemas
// ============================================================================

const DeflectionSearchSchema = z.object({
  partial_description: z.string().min(10).max(2000),
  agency_id: z.string().uuid().optional()
});

const LogOutcomeSchema = z.object({
  deflection_id: z.string().uuid(),
  outcome: z.enum(['downloaded', 'dismissed', 'submitted_anyway']),
  matched_record_id: z.string().optional()
});

const AnalyticsQuerySchema = z.object({
  date_from: z.string().optional(),
  date_to: z.string().optional()
});

type DeflectionSearchInput = z.infer<typeof DeflectionSearchSchema>;
type LogOutcomeInput = z.infer<typeof LogOutcomeSchema>;
type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

// ============================================================================
// Handler: Search for Similar Records
// ============================================================================

/**
 * POST /ai/deflection/search
 *
 * Search for similar records to deflect duplicate FOIA requests
 */
export async function searchDeflection(
  req: Request<{}, {}, DeflectionSearchInput>,
  res: Response
): Promise<void> {
  try {
    // Rate limiting (public endpoint)
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(clientIp)) {
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded. Maximum 30 requests per minute.',
        retry_after: 60
      });
      return;
    }

    const validation = DeflectionSearchSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.issues
      });
      return;
    }

    const { partial_description, agency_id } = validation.data;

    const tenantId = (req as any).tenantId || 'default';
    const deflectionService = new DeflectionService(dbPool, tenantId);

    // Perform semantic search
    const result = await deflectionService.searchSimilarRecords(
      partial_description,
      agency_id
    );

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error in deflection search:', error);
    res.status(500).json({
      success: false,
      error: 'Deflection search failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// Handler: Log Deflection Outcome
// ============================================================================

/**
 * POST /ai/deflection/log-outcome
 *
 * Log the outcome of a deflection attempt
 */
export async function logDeflectionOutcome(
  req: Request<{}, {}, LogOutcomeInput>,
  res: Response
): Promise<void> {
  try {
    const validation = LogOutcomeSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validation.error.issues
      });
      return;
    }

    const { deflection_id, outcome, matched_record_id } = validation.data;

    const tenantId = (req as any).tenantId || 'default';
    const deflectionService = new DeflectionService(dbPool, tenantId);

    // Log outcome
    await deflectionService.logOutcome(deflection_id, outcome);

    // Update matched record ID if provided
    if (matched_record_id) {
      await dbPool.query(
        `UPDATE "FoiaDeflectionLog"
         SET matched_record_id = $1
         WHERE id = $2`,
        [matched_record_id, deflection_id]
      );
    }

    // Emit event for analytics (would integrate with event bus in production)
    // emit('foia.ai.deflection.outcome', { ... });
    console.log('Deflection outcome logged:', { deflection_id, outcome });

    res.json({
      success: true,
      data: {
        deflection_id,
        outcome,
        recorded_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error logging deflection outcome:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to log outcome',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// Handler: Get Deflection Analytics
// ============================================================================

/**
 * GET /ai/deflection/analytics
 *
 * Get deflection analytics and statistics
 */
export async function getDeflectionAnalytics(
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
    const deflectionService = new DeflectionService(dbPool, tenantId);

    // Get analytics
    const analytics = await deflectionService.getAnalytics(dateFrom, dateTo);

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
    console.error('Error fetching deflection analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// ============================================================================
// Handler: Refresh Embeddings (Internal/Cron)
// ============================================================================

/**
 * POST /ai/deflection/refresh-embeddings
 *
 * Refresh embeddings for new records (internal endpoint, called by cron)
 */
export async function refreshEmbeddings(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const tenantId = (req as any).tenantId || 'default';
    const deflectionService = new DeflectionService(dbPool, tenantId);

    // Refresh embeddings
    const result = await deflectionService.refreshEmbeddings();

    console.log('Embeddings refreshed:', result);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error refreshing embeddings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh embeddings',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
