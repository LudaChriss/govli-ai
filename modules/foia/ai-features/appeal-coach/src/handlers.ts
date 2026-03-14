/**
 * Govli AI FOIA Module - Appeal Coach Handlers
 * API handlers for appeal analysis and drafting endpoints
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { ApiResponse } from '@govli/foia-shared';
import { AppealAnalyzer } from './services/appealAnalyzer';
import { AppealDrafter } from './services/appealDrafter';

// Database connection pool
let dbPool: Pool;

export function setDatabasePool(pool: Pool): void {
  dbPool = pool;
}

/**
 * Validation schema for POST /ai/appeal-coach/analyze
 */
const AnalyzeAppealSchema = z.object({
  foia_request_id: z.string().uuid(),
  confirmation_number: z.string().min(1)
});

type AnalyzeAppealInput = z.infer<typeof AnalyzeAppealSchema>;

/**
 * POST /ai/appeal-coach/analyze
 * Analyze a FOIA response and provide appeal guidance
 */
export async function analyzeAppeal(
  req: Request<{}, {}, AnalyzeAppealInput>,
  res: Response
): Promise<void> {
  try {
    const input = AnalyzeAppealSchema.parse(req.body);
    const tenantId = (req as any).tenantId || 'default';

    // Check rate limit (3 sessions per confirmation number)
    const rateLimitResult = await dbPool.query(
      `SELECT COUNT(*) as count
       FROM "FoiaAppealCoachSessions"
       WHERE confirmation_number = $1
         AND created_at > NOW() - INTERVAL '7 days'`,
      [input.confirmation_number]
    );

    const sessionCount = parseInt(rateLimitResult.rows[0]?.count || '0');
    if (sessionCount >= 3) {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'You have reached the maximum number of appeal coach sessions (3) for this request. If you need additional assistance, please contact us directly.'
        },
        timestamp: new Date()
      });
      return;
    }

    // Initialize analyzer
    const analyzer = new AppealAnalyzer(dbPool, tenantId);

    // Fetch response data
    const responseData = await analyzer.fetchResponseData(
      input.foia_request_id,
      input.confirmation_number
    );

    if (!responseData) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'FOIA request not found or not yet delivered. The Appeal Coach is only available for delivered responses.'
        },
        timestamp: new Date()
      });
      return;
    }

    // Analyze for appeal
    const analysis = await analyzer.analyzeForAppeal(responseData);

    // Log session
    await dbPool.query(
      `INSERT INTO "FoiaAppealCoachSessions" (
        id, foia_request_id, confirmation_number, analysis_result,
        created_at
      ) VALUES (uuid_generate_v4(), $1, $2, $3, NOW())`,
      [input.foia_request_id, input.confirmation_number, JSON.stringify(analysis)]
    );

    // Return analysis
    const response: ApiResponse<typeof analysis> = {
      success: true,
      data: analysis,
      timestamp: new Date()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error analyzing appeal:', error);

    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.errors
        },
        timestamp: new Date()
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYSIS_FAILED',
        message: 'Failed to analyze appeal. Please try again later.',
        details: error.message
      },
      timestamp: new Date()
    });
  }
}

/**
 * Validation schema for POST /ai/appeal-coach/draft-appeal
 */
const DraftAppealSchema = z.object({
  foia_request_id: z.string().uuid(),
  confirmation_number: z.string().min(1),
  selected_grounds: z.array(z.string()).min(1),
  requester_statement: z.string().optional()
});

type DraftAppealInput = z.infer<typeof DraftAppealSchema>;

/**
 * POST /ai/appeal-coach/draft-appeal
 * Draft a formal FOIA appeal letter
 */
export async function draftAppeal(
  req: Request<{}, {}, DraftAppealInput>,
  res: Response
): Promise<void> {
  try {
    const input = DraftAppealSchema.parse(req.body);
    const tenantId = (req as any).tenantId || 'default';

    // Verify request exists and get requester info
    const requestResult = await dbPool.query(
      `SELECT r.id, r.confirmation_number, r.description, r.response_date,
              r.requester_name, r.requester_email,
              a.name as agency_name
       FROM "FoiaRequests" r
       LEFT JOIN "Agencies" a ON r.agency_id = a.id
       WHERE r.id = $1 AND r.confirmation_number = $2
         AND r.status IN ('DELIVERED', 'PARTIALLY_GRANTED', 'DENIED')`,
      [input.foia_request_id, input.confirmation_number]
    );

    if (requestResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'FOIA request not found or not yet delivered'
        },
        timestamp: new Date()
      });
      return;
    }

    const request = requestResult.rows[0];

    // Initialize drafter
    const drafter = new AppealDrafter(tenantId);

    // Draft appeal letter
    const draft = await drafter.draftAppealLetter({
      request_id: input.foia_request_id,
      original_request_description: request.description,
      response_date: request.response_date,
      selected_grounds: input.selected_grounds,
      requester_statement: input.requester_statement,
      requester_name: request.requester_name,
      requester_email: request.requester_email,
      agency_name: request.agency_name || 'Agency'
    });

    // Log draft generation
    await dbPool.query(
      `UPDATE "FoiaAppealCoachSessions"
       SET draft_generated = true,
           draft_letter = $1,
           updated_at = NOW()
       WHERE foia_request_id = $2 AND confirmation_number = $3
       ORDER BY created_at DESC
       LIMIT 1`,
      [draft.letter, input.foia_request_id, input.confirmation_number]
    );

    // Return draft
    const response: ApiResponse<typeof draft> = {
      success: true,
      data: draft,
      timestamp: new Date()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error drafting appeal:', error);

    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input data',
          details: error.errors
        },
        timestamp: new Date()
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'DRAFT_FAILED',
        message: 'Failed to draft appeal. Please try again later.',
        details: error.message
      },
      timestamp: new Date()
    });
  }
}

/**
 * GET /ai/appeal-coach/sessions/:confirmationNumber
 * Get appeal coach session history for a confirmation number
 */
export async function getCoachSessions(
  req: Request<{ confirmationNumber: string }>,
  res: Response
): Promise<void> {
  try {
    const { confirmationNumber } = req.params;

    const sessionsResult = await dbPool.query(
      `SELECT id, foia_request_id, created_at, draft_generated
       FROM "FoiaAppealCoachSessions"
       WHERE confirmation_number = $1
       ORDER BY created_at DESC`,
      [confirmationNumber]
    );

    const sessions = sessionsResult.rows;
    const sessionsRemaining = Math.max(0, 3 - sessions.length);

    res.json({
      success: true,
      data: {
        sessions,
        total_sessions: sessions.length,
        sessions_remaining: sessionsRemaining,
        rate_limit_reached: sessions.length >= 3
      },
      timestamp: new Date()
    });
  } catch (error: any) {
    console.error('Error fetching coach sessions:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch session history',
        details: error.message
      },
      timestamp: new Date()
    });
  }
}