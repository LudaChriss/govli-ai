/**
 * AI-7: Conversational Request Builder - API Routes
 */

import { Router, Request, Response } from 'express';
import { ConversationService } from '../services/conversationService';
import { rateLimitMiddleware } from '../middleware/rateLimiter';
import { ConversationRequest } from '../types';

interface AuthRequest extends Request {
  auth?: {
    tenant_id: string;
    user_id: string;
    role: string;
  };
}

export function createConvoBuilderRoutes(): Router {
  const router = Router();
  const conversationService = new ConversationService();

  // ============================================================================
  // AI-7: Conversational Request Builder Endpoints
  // ============================================================================

  /**
   * POST /ai/convo-builder/message
   * Process a conversation message
   * Auth: PUBLIC (no authentication required)
   */
  router.post('/message', rateLimitMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { session_id, messages, agency_context } = req.body;

      // Validate request
      if (!session_id) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_SESSION_ID',
            message: 'session_id is required'
          },
          timestamp: new Date()
        });
      }

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_MESSAGES',
            message: 'messages must be an array'
          },
          timestamp: new Date()
        });
      }

      if (messages.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'EMPTY_MESSAGES',
            message: 'messages array cannot be empty'
          },
          timestamp: new Date()
        });
      }

      // Validate message format
      for (const msg of messages) {
        if (!msg.role || !msg.content) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_MESSAGE_FORMAT',
              message: 'Each message must have role and content'
            },
            timestamp: new Date()
          });
        }

        if (!['user', 'assistant', 'system'].includes(msg.role)) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_MESSAGE_ROLE',
              message: 'Message role must be user, assistant, or system'
            },
            timestamp: new Date()
          });
        }
      }

      const conversationRequest: ConversationRequest = {
        session_id,
        messages,
        agency_context
      };

      // Get IP address for logging
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

      // Process message
      const response = await conversationService.processMessage(
        conversationRequest,
        req.auth?.tenant_id,
        req.auth?.user_id,
        ipAddress
      );

      res.json({
        success: true,
        data: response,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[ConvoBuilderRoutes] Message processing error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PROCESSING_FAILED',
          message: error.message || 'Failed to process conversation message'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /ai/convo-builder/session/start
   * Start a new conversation session
   * Auth: PUBLIC
   */
  router.post('/session/start', async (req: AuthRequest, res: Response) => {
    try {
      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

      const sessionId = await conversationService.startSession(
        req.auth?.tenant_id,
        ipAddress
      );

      res.json({
        success: true,
        data: {
          session_id: sessionId
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[ConvoBuilderRoutes] Session start error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SESSION_START_FAILED',
          message: error.message || 'Failed to start conversation session'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /ai/convo-builder/session/:sessionId/complete
   * Mark a session as complete
   * Auth: PUBLIC
   */
  router.post('/session/:sessionId/complete', async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.params;
      const { submitted, message_count } = req.body;

      if (typeof submitted !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SUBMITTED',
            message: 'submitted must be a boolean'
          },
          timestamp: new Date()
        });
      }

      if (typeof message_count !== 'number' || message_count < 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_MESSAGE_COUNT',
            message: 'message_count must be a non-negative number'
          },
          timestamp: new Date()
        });
      }

      await conversationService.completeSession(
        sessionId,
        submitted,
        message_count,
        req.auth?.tenant_id
      );

      res.json({
        success: true,
        message: 'Session completed successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[ConvoBuilderRoutes] Session complete error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SESSION_COMPLETE_FAILED',
          message: error.message || 'Failed to complete session'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /ai/convo-builder/draft/validate
   * Validate a draft request
   * Auth: PUBLIC
   */
  router.post('/draft/validate', async (req: AuthRequest, res: Response) => {
    try {
      const { draft_request } = req.body;

      if (!draft_request) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_DRAFT_REQUEST',
            message: 'draft_request is required'
          },
          timestamp: new Date()
        });
      }

      const validation = conversationService.validateDraftRequest(draft_request);

      res.json({
        success: true,
        data: validation,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[ConvoBuilderRoutes] Draft validation error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: error.message || 'Failed to validate draft request'
        },
        timestamp: new Date()
      });
    }
  });

  return router;
}
