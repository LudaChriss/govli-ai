/**
 * FOIA Tracking Routes
 * All tracking, workflow, and SLA endpoints
 */

import { Router, Response } from 'express';
import { Pool } from 'pg';
import { TrackingService } from '../services/trackingService';
import { RoutingService } from '../services/routingService';
import { SLAService } from '../services/slaService';
import { AuthRequest } from '../middleware/authMiddleware';

export function createTrackingRoutes(db: Pool): Router {
  const router = Router();
  const trackingService = new TrackingService(db);
  const routingService = new RoutingService(db);
  const slaService = new SLAService(db);

  /**
   * GET /tracking/requests/:id/timeline
   * Get timeline events for a request
   */
  router.get('/requests/:id/timeline', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { id } = req.params;

      const timeline = await trackingService.getTimeline(req.auth.tenant_id, id);

      res.json({
        success: true,
        data: timeline,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[TrackingRoutes] Get timeline error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch timeline'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /tracking/requests/:id/transition
   * Transition request to new status (with state machine validation)
   */
  router.post('/requests/:id/transition', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { id } = req.params;
      const { to_status, reason, metadata } = req.body;

      if (!to_status) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'to_status is required' }
        });
      }

      const result = await trackingService.transitionStatus(
        req.auth.tenant_id,
        id,
        req.auth.user_id,
        { to_status, reason, metadata }
      );

      res.json({
        success: true,
        data: result,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[TrackingRoutes] Transition error:', error);

      // Check if it's an invalid transition error
      if (error instanceof Error && error.name === 'InvalidTransitionError') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_TRANSITION',
            message: error.message
          },
          timestamp: new Date()
        });
      }

      res.status(500).json({
        success: false,
        error: {
          code: 'TRANSITION_FAILED',
          message: error instanceof Error ? error.message : 'State transition failed'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /tracking/requests/:id/route
   * Route request to department
   */
  router.post('/requests/:id/route', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { id } = req.params;
      const { department_id, department_name, notes } = req.body;

      if (!department_id || !department_name) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'department_id and department_name are required' }
        });
      }

      const routing = await routingService.routeRequest(
        req.auth.tenant_id,
        id,
        department_id,
        department_name,
        notes,
        req.auth.user_id
      );

      res.json({
        success: true,
        data: routing,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[TrackingRoutes] Route error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ROUTING_FAILED',
          message: error instanceof Error ? error.message : 'Routing failed'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * PUT /tracking/routing/:routingId/assign
   * Assign routing to user
   */
  router.put('/routing/:routingId/assign', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { routingId } = req.params;
      const { assigned_to } = req.body;

      if (!assigned_to) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'assigned_to is required' }
        });
      }

      const routing = await routingService.assignRouting(
        req.auth.tenant_id,
        routingId,
        assigned_to,
        req.auth.user_id
      );

      res.json({
        success: true,
        data: routing,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[TrackingRoutes] Assign error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ASSIGNMENT_FAILED',
          message: error instanceof Error ? error.message : 'Assignment failed'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /tracking/sla-dashboard
   * Get SLA dashboard for tenant
   */
  router.get('/sla-dashboard', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const dashboard = await slaService.getSLADashboard(req.auth.tenant_id);

      res.json({
        success: true,
        data: dashboard,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[TrackingRoutes] SLA dashboard error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch SLA dashboard'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /tracking/requests/:id/extend-deadline
   * Request deadline extension
   */
  router.post('/requests/:id/extend-deadline', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { id } = req.params;
      const { extension_days, reason } = req.body;

      if (!extension_days || !reason) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'extension_days and reason are required' }
        });
      }

      if (extension_days <= 0 || extension_days > 365) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: 'extension_days must be between 1 and 365' }
        });
      }

      const extension = await trackingService.requestDeadlineExtension(
        req.auth.tenant_id,
        id,
        extension_days,
        reason,
        req.auth.user_id
      );

      res.json({
        success: true,
        data: extension,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[TrackingRoutes] Extend deadline error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'EXTENSION_FAILED',
          message: error instanceof Error ? error.message : 'Deadline extension failed'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /tracking/requests/overdue-alerts
   * Get overdue requests
   */
  router.get('/requests/overdue-alerts', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const alerts = await slaService.getOverdueAlerts(req.auth.tenant_id);

      res.json({
        success: true,
        data: alerts,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[TrackingRoutes] Overdue alerts error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch overdue alerts'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /tracking/sla-wall
   * Get SLA wall display data for full-screen monitoring
   * Returns all active requests sorted by breach_risk_score DESC with urgency buckets
   */
  router.get('/sla-wall', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const wallData = await slaService.getSLAWall(req.auth.tenant_id);

      res.json({
        success: true,
        data: wallData,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[TrackingRoutes] SLA wall error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch SLA wall data'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /tracking/requests/:id/sla-status
   * Get SLA status for a specific request
   */
  router.get('/requests/:id/sla-status', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { id } = req.params;

      const slaStatus = await slaService.calculateSLAStatus(req.auth.tenant_id, id);

      res.json({
        success: true,
        data: slaStatus,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[TrackingRoutes] SLA status error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to fetch SLA status'
        },
        timestamp: new Date()
      });
    }
  });

  return router;
}
