/**
 * FOIA Response Routes
 * All response generation, editing, approval, and delivery endpoints
 */

import { Router, Response } from 'express';
import { Pool } from 'pg';
import { ResponseService } from '../services/responseService';
import { AppealService } from '../services/appealService';
import { TemplateService } from '../services/templateService';
import { AuthRequest } from '../middleware/authMiddleware';
import { DraftRequest, EditRequest, ApproveRequest, DeliverRequest, AppealRequest } from '../types';

export function createResponseRoutes(db: Pool): Router {
  const router = Router();
  const responseService = new ResponseService(db);
  const appealService = new AppealService(db);
  const templateService = new TemplateService();

  /**
   * POST /response/requests/:id/draft
   * Draft a response using AI
   */
  router.post('/requests/:id/draft', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { id } = req.params;
      const draftRequest: DraftRequest = req.body;

      if (!draftRequest.response_type) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'response_type is required' }
        });
      }

      const response = await responseService.draftResponse(
        req.auth.tenant_id,
        id,
        req.auth.user_id,
        draftRequest
      );

      res.json({
        success: true,
        data: response,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[ResponseRoutes] Draft error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DRAFT_FAILED',
          message: error instanceof Error ? error.message : 'Failed to draft response'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * PUT /response/responses/:id/edit
   * Edit a response
   */
  router.put('/responses/:id/edit', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { id } = req.params;
      const editRequest: EditRequest = req.body;

      if (!editRequest.body_text) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'body_text is required' }
        });
      }

      const response = await responseService.editResponse(
        req.auth.tenant_id,
        id,
        req.auth.user_id,
        editRequest
      );

      res.json({
        success: true,
        data: response,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[ResponseRoutes] Edit error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EDIT_FAILED',
          message: error instanceof Error ? error.message : 'Failed to edit response'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /response/responses/:id/approve
   * Approve a response
   */
  router.post('/responses/:id/approve', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { id } = req.params;
      const approveRequest: ApproveRequest = req.body;

      const response = await responseService.approveResponse(
        req.auth.tenant_id,
        id,
        req.auth.user_id,
        approveRequest
      );

      res.json({
        success: true,
        data: response,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[ResponseRoutes] Approve error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'APPROVE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to approve response'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /response/responses/:id/deliver
   * Deliver a response via email
   */
  router.post('/responses/:id/deliver', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { id } = req.params;
      const deliverRequest: DeliverRequest = req.body;

      if (!deliverRequest.delivery_method) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'delivery_method is required' }
        });
      }

      const response = await responseService.deliverResponse(
        req.auth.tenant_id,
        id,
        req.auth.user_id,
        deliverRequest
      );

      res.json({
        success: true,
        data: response,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[ResponseRoutes] Deliver error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DELIVERY_FAILED',
          message: error instanceof Error ? error.message : 'Failed to deliver response'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /response/responses/:id/preview
   * Preview a response
   */
  router.get('/responses/:id/preview', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { id } = req.params;

      const response = await responseService.getResponse(req.auth.tenant_id, id);

      res.json({
        success: true,
        data: response,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[ResponseRoutes] Preview error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PREVIEW_FAILED',
          message: error instanceof Error ? error.message : 'Failed to preview response'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /response/templates
   * Get available templates
   */
  router.get('/templates', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const templates = templateService.getAvailableTemplates();

      res.json({
        success: true,
        data: templates,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[ResponseRoutes] Templates error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch templates'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /response/requests/:id/appeal
   * Submit an appeal
   */
  router.post('/requests/:id/appeal', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { id } = req.params;
      const appealRequest: AppealRequest = req.body;

      if (!appealRequest.reason) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'reason is required' }
        });
      }

      const appeal = await appealService.submitAppeal(
        req.auth.tenant_id,
        id,
        req.auth.user_id,
        appealRequest
      );

      res.json({
        success: true,
        data: appeal,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[ResponseRoutes] Appeal error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'APPEAL_FAILED',
          message: error instanceof Error ? error.message : 'Failed to submit appeal'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /response/requests/:id/responses
   * Get all responses for a request
   */
  router.get('/requests/:id/responses', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { id } = req.params;

      const responses = await responseService.getResponsesForRequest(req.auth.tenant_id, id);

      res.json({
        success: true,
        data: responses,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[ResponseRoutes] Get responses error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch responses'
        },
        timestamp: new Date()
      });
    }
  });

  return router;
}
