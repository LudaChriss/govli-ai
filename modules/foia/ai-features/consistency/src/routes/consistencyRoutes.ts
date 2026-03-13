/**
 * AI-4: Exemption Consistency Analyzer - API Routes
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { ConsistencyService } from '../services/consistencyService';
import { ReportService } from '../services/reportService';
import {
  CheckConsistencyInput,
  GetHistoryFilters,
  GetHeatmapFilters,
  OverrideConsistencyInput
} from '../types';

interface AuthRequest extends Request {
  auth?: {
    tenant_id: string;
    user_id: string;
    role: string;
  };
}

export function createConsistencyRoutes(db: Pool): Router {
  const router = Router();
  const consistencyService = new ConsistencyService(db);
  const reportService = new ReportService(db);

  // ============================================================================
  // AI-4: Consistency Check Endpoints
  // ============================================================================

  /**
   * POST /ai/consistency/check
   * Check exemption consistency (called during response approval)
   * Auth: foia_officer+
   */
  router.post('/check', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date()
        });
      }

      const allowedRoles = ['foia_officer', 'foia_supervisor', 'admin'];
      if (!allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'FOIA officer role required' },
          timestamp: new Date()
        });
      }

      const input: CheckConsistencyInput = req.body;

      // Validate required fields
      if (!input.response_id || !input.exemption_decisions || !input.record_types) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'response_id, exemption_decisions, and record_types are required'
          },
          timestamp: new Date()
        });
      }

      const check = await consistencyService.checkConsistency(
        req.auth.tenant_id,
        req.auth.user_id,
        input
      );

      // Determine response status based on risk level
      if (check.overall_risk === 'HIGH' && check.status === 'PENDING') {
        // HIGH risk - blocks approval, requires supervisor override
        return res.status(403).json({
          success: false,
          error: {
            code: 'HIGH_RISK_INCONSISTENCY',
            message: 'High risk inconsistency detected. Supervisor override required.',
            data: {
              check_id: check.id,
              alerts: check.alerts,
              summary: check.summary,
              override_required: true
            }
          },
          timestamp: new Date()
        });
      } else if (check.overall_risk === 'MEDIUM') {
        // MEDIUM risk - warning, allow with acknowledgment
        return res.status(200).json({
          success: true,
          data: check,
          warning: {
            code: 'MEDIUM_RISK_INCONSISTENCY',
            message: 'Potential inconsistency detected. Review alerts before proceeding.',
            alerts: check.alerts
          },
          timestamp: new Date()
        });
      } else {
        // LOW risk or consistent - silent pass
        return res.status(200).json({
          success: true,
          data: check,
          timestamp: new Date()
        });
      }
    } catch (error: any) {
      console.error('[ConsistencyRoutes] Check consistency error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'CHECK_FAILED',
          message: error.message || 'Failed to check consistency'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /ai/consistency/checks/:id/override
   * Override a HIGH risk consistency check (supervisor only)
   * Auth: foia_supervisor+
   */
  router.post('/checks/:id/override', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date()
        });
      }

      const allowedRoles = ['foia_supervisor', 'admin'];
      if (!allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Supervisor role required for override' },
          timestamp: new Date()
        });
      }

      const { id } = req.params;
      const input: OverrideConsistencyInput = req.body;

      if (!input.justification || input.justification.trim().length < 10) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'Detailed justification required (minimum 10 characters)'
          },
          timestamp: new Date()
        });
      }

      const check = await consistencyService.overrideCheck(
        req.auth.tenant_id,
        id,
        req.auth.user_id,
        input
      );

      res.json({
        success: true,
        data: check,
        message: 'Consistency check overridden successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[ConsistencyRoutes] Override check error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'OVERRIDE_FAILED',
          message: error.message || 'Failed to override check'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /ai/consistency/history
   * Get consistency check history
   * Auth: foia_supervisor+
   */
  router.get('/history', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date()
        });
      }

      const allowedRoles = ['foia_supervisor', 'admin'];
      if (!allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Supervisor role required' },
          timestamp: new Date()
        });
      }

      const filters: GetHistoryFilters = {
        start_date: req.query.start_date ? new Date(req.query.start_date as string) : undefined,
        end_date: req.query.end_date ? new Date(req.query.end_date as string) : undefined,
        risk_level: req.query.risk_level as any,
        department: req.query.department as string,
        status: req.query.status as any,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0
      };

      const result = await consistencyService.getHistory(req.auth.tenant_id, filters);

      res.json({
        success: true,
        data: result.checks,
        pagination: {
          total: result.total,
          limit: filters.limit,
          offset: filters.offset
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[ConsistencyRoutes] Get history error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error.message || 'Failed to fetch history'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /ai/consistency/exemption-heatmap
   * Get exemption inconsistency heatmap data
   * Auth: foia_supervisor+
   */
  router.get('/exemption-heatmap', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date()
        });
      }

      const allowedRoles = ['foia_supervisor', 'admin'];
      if (!allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Supervisor role required' },
          timestamp: new Date()
        });
      }

      const filters: GetHeatmapFilters = {
        start_date: req.query.start_date ? new Date(req.query.start_date as string) : undefined,
        end_date: req.query.end_date ? new Date(req.query.end_date as string) : undefined,
        department: req.query.department as string,
        min_applications: req.query.min_applications
          ? parseInt(req.query.min_applications as string)
          : 5
      };

      const heatmap = await consistencyService.getExemptionHeatmap(
        req.auth.tenant_id,
        filters
      );

      res.json({
        success: true,
        data: heatmap,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[ConsistencyRoutes] Get heatmap error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error.message || 'Failed to fetch heatmap data'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /ai/consistency/dashboard
   * Get consistency dashboard metrics
   * Auth: foia_supervisor+
   */
  router.get('/dashboard', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date()
        });
      }

      const allowedRoles = ['foia_supervisor', 'admin'];
      if (!allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Supervisor role required' },
          timestamp: new Date()
        });
      }

      const metrics = await consistencyService.getDashboardMetrics(req.auth.tenant_id);

      res.json({
        success: true,
        data: metrics,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[ConsistencyRoutes] Get dashboard metrics error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error.message || 'Failed to fetch dashboard metrics'
        },
        timestamp: new Date()
      });
    }
  });

  // ============================================================================
  // AI-4: Monthly Consistency Report Endpoints
  // ============================================================================

  /**
   * POST /ai/consistency/reports/generate
   * Generate a monthly consistency report
   * Auth: foia_supervisor+
   */
  router.post('/reports/generate', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date()
        });
      }

      const allowedRoles = ['foia_supervisor', 'admin'];
      if (!allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Supervisor role required' },
          timestamp: new Date()
        });
      }

      const { report_month } = req.body;

      if (!report_month) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'report_month is required (format: YYYY-MM-DD)'
          },
          timestamp: new Date()
        });
      }

      const reportMonth = new Date(report_month);
      reportMonth.setDate(1);
      reportMonth.setHours(0, 0, 0, 0);

      const report = await reportService.generateMonthlyReport(req.auth.tenant_id, {
        report_month: reportMonth,
        generated_by: req.auth.user_id
      });

      res.json({
        success: true,
        data: report,
        message: 'Monthly consistency report generated successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[ConsistencyRoutes] Generate report error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'GENERATION_FAILED',
          message: error.message || 'Failed to generate report'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /ai/consistency/reports
   * List all monthly consistency reports
   * Auth: foia_supervisor+
   */
  router.get('/reports', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date()
        });
      }

      const allowedRoles = ['foia_supervisor', 'admin'];
      if (!allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Supervisor role required' },
          timestamp: new Date()
        });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 12;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const result = await reportService.listReports(req.auth.tenant_id, limit, offset);

      res.json({
        success: true,
        data: result.reports,
        pagination: {
          total: result.total,
          limit,
          offset
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[ConsistencyRoutes] List reports error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error.message || 'Failed to fetch reports'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /ai/consistency/reports/:month
   * Get a specific monthly report by month (format: YYYY-MM)
   * Auth: foia_supervisor+
   */
  router.get('/reports/:month', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
          timestamp: new Date()
        });
      }

      const allowedRoles = ['foia_supervisor', 'admin'];
      if (!allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Supervisor role required' },
          timestamp: new Date()
        });
      }

      const { month } = req.params;

      // Parse month parameter (format: YYYY-MM or YYYY-MM-DD)
      const reportMonth = new Date(month);
      reportMonth.setDate(1);
      reportMonth.setHours(0, 0, 0, 0);

      const report = await reportService.getReport(req.auth.tenant_id, reportMonth);

      if (!report) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Report not found for the specified month'
          },
          timestamp: new Date()
        });
      }

      res.json({
        success: true,
        data: report,
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[ConsistencyRoutes] Get report error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error.message || 'Failed to fetch report'
        },
        timestamp: new Date()
      });
    }
  });

  return router;
}
