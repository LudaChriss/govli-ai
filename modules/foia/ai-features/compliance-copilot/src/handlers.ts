/**
 * AI-14: Compliance Copilot Handlers
 *
 * API handlers for the conversational FOIA compliance assistant
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { CopilotService } from './services/copilotService';

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
const ChatMessageSchema = z.object({
  session_id: z.string().uuid(),
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string()
    })
  ),
  context: z.object({
    foia_request_id: z.string().uuid().optional(),
    current_screen: z.string(),
    officer_role: z.string(),
    tenant_id: z.string().uuid()
  })
});

const CheckExemptionSchema = z.object({
  text_snippet: z.string().min(1),
  tenant_id: z.string().uuid()
});

const DraftExtensionSchema = z.object({
  foia_request_id: z.string().uuid(),
  reason: z.string().min(1)
});

const ExplainDeadlineSchema = z.object({
  foia_request_id: z.string().uuid()
});

/**
 * POST /ai/copilot/message
 * Main chat endpoint for copilot conversations
 */
export async function sendMessage(req: Request, res: Response): Promise<void> {
  try {
    // Validate request
    const validated = ChatMessageSchema.parse(req.body);

    // Auth check: foia_officer+
    if (!req.user || !['foia_officer', 'foia_coordinator', 'foia_supervisor'].includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Access denied. FOIA officer role required.'
      });
      return;
    }

    // Ensure officer can only access their tenant
    if (req.user.tenant_id !== validated.context.tenant_id) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Cannot access other tenants.'
      });
      return;
    }

    const copilotService = new CopilotService(dbPool);

    const response = await copilotService.chat(
      validated.session_id,
      validated.messages,
      validated.context
    );

    res.json({
      success: true,
      data: response
    });
  } catch (error: any) {
    console.error('[CopilotHandler] Error in sendMessage:', error);

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
      error: error.message || 'Failed to process copilot message'
    });
  }
}

/**
 * GET /ai/copilot/history/:sessionId
 * Get conversation history for a session
 */
export async function getHistory(req: Request, res: Response): Promise<void> {
  try {
    const { sessionId } = req.params;

    if (!sessionId || !z.string().uuid().safeParse(sessionId).success) {
      res.status(400).json({
        success: false,
        error: 'Invalid session ID'
      });
      return;
    }

    // Auth check
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    // Check session ownership
    const sessionResult = await dbPool.query(
      `SELECT officer_id, tenant_id FROM "FoiaCopilotSessions" WHERE session_id = $1`,
      [sessionId]
    );

    if (sessionResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      });
      return;
    }

    const session = sessionResult.rows[0];

    // Officers can only see their own sessions, supervisors can see all
    if (req.user.role === 'foia_officer' && session.officer_id !== req.user.id) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Can only view your own sessions.'
      });
      return;
    }

    // Supervisors can only see sessions from their tenant
    if (['foia_coordinator', 'foia_supervisor'].includes(req.user.role) && session.tenant_id !== req.user.tenant_id) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Cannot access other tenants.'
      });
      return;
    }

    const copilotService = new CopilotService(dbPool);
    const history = await copilotService.getHistory(sessionId);

    res.json({
      success: true,
      data: {
        session_id: sessionId,
        messages: history
      }
    });
  } catch (error: any) {
    console.error('[CopilotHandler] Error in getHistory:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get conversation history'
    });
  }
}

/**
 * GET /ai/copilot/sessions
 * List all copilot sessions for this tenant
 */
export async function listSessions(req: Request, res: Response): Promise<void> {
  try {
    // Auth check: foia_supervisor+
    if (!req.user || !['foia_coordinator', 'foia_supervisor'].includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Supervisor role required.'
      });
      return;
    }

    const filters: any = {};

    // Parse query parameters
    if (req.query.officer_id) {
      filters.officer_id = req.query.officer_id as string;
    }

    if (req.query.date_from) {
      filters.date_from = new Date(req.query.date_from as string);
    }

    if (req.query.date_to) {
      filters.date_to = new Date(req.query.date_to as string);
    }

    if (req.query.model_used) {
      filters.model_used = req.query.model_used as string;
    }

    const copilotService = new CopilotService(dbPool);
    const sessions = await copilotService.listSessions(req.user.tenant_id, filters);

    res.json({
      success: true,
      data: {
        sessions,
        total: sessions.length
      }
    });
  } catch (error: any) {
    console.error('[CopilotHandler] Error in listSessions:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to list sessions'
    });
  }
}

/**
 * POST /ai/copilot/quick/check-exemption
 * Quick action: Check likely exemptions for text snippet
 */
export async function checkExemption(req: Request, res: Response): Promise<void> {
  try {
    const validated = CheckExemptionSchema.parse(req.body);

    // Auth check: foia_officer+
    if (!req.user || !['foia_officer', 'foia_coordinator', 'foia_supervisor'].includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Access denied. FOIA officer role required.'
      });
      return;
    }

    // Ensure officer can only access their tenant
    if (req.user.tenant_id !== validated.tenant_id) {
      res.status(403).json({
        success: false,
        error: 'Access denied. Cannot access other tenants.'
      });
      return;
    }

    const copilotService = new CopilotService(dbPool);
    const exemptions = await copilotService.checkExemption(validated.text_snippet, validated.tenant_id);

    res.json({
      success: true,
      data: {
        likely_exemptions: exemptions
      }
    });
  } catch (error: any) {
    console.error('[CopilotHandler] Error in checkExemption:', error);

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
      error: error.message || 'Failed to check exemptions'
    });
  }
}

/**
 * POST /ai/copilot/quick/draft-extension
 * Quick action: Draft extension notice
 */
export async function draftExtension(req: Request, res: Response): Promise<void> {
  try {
    const validated = DraftExtensionSchema.parse(req.body);

    // Auth check: foia_officer+
    if (!req.user || !['foia_officer', 'foia_coordinator', 'foia_supervisor'].includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Access denied. FOIA officer role required.'
      });
      return;
    }

    // Verify officer has access to this request
    const requestResult = await dbPool.query(
      `SELECT tenant_id FROM "FoiaRequests" WHERE id = $1`,
      [validated.foia_request_id]
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

    const copilotService = new CopilotService(dbPool);
    const draft = await copilotService.draftExtension(validated.foia_request_id, validated.reason);

    res.json({
      success: true,
      data: draft
    });
  } catch (error: any) {
    console.error('[CopilotHandler] Error in draftExtension:', error);

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
      error: error.message || 'Failed to draft extension notice'
    });
  }
}

/**
 * POST /ai/copilot/quick/explain-deadline
 * Quick action: Explain deadline for request
 */
export async function explainDeadline(req: Request, res: Response): Promise<void> {
  try {
    const validated = ExplainDeadlineSchema.parse(req.body);

    // Auth check: foia_officer+
    if (!req.user || !['foia_officer', 'foia_coordinator', 'foia_supervisor'].includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Access denied. FOIA officer role required.'
      });
      return;
    }

    // Verify officer has access to this request
    const requestResult = await dbPool.query(
      `SELECT tenant_id FROM "FoiaRequests" WHERE id = $1`,
      [validated.foia_request_id]
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

    const copilotService = new CopilotService(dbPool);
    const explanation = await copilotService.explainDeadline(validated.foia_request_id);

    res.json({
      success: true,
      data: explanation
    });
  } catch (error: any) {
    console.error('[CopilotHandler] Error in explainDeadline:', error);

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
      error: error.message || 'Failed to explain deadline'
    });
  }
}
