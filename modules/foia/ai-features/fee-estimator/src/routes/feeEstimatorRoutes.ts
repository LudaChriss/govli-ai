/**
 * AI-8: Real-Time Fee Estimator - API Routes
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { FeeEstimatorService } from '../services/feeEstimatorService';
import { FeeEstimationInput } from '../types';

interface AuthRequest extends Request {
  auth?: {
    tenant_id: string;
    user_id: string;
    role: string;
  };
}

export function createFeeEstimatorRoutes(db: Pool): Router {
  const router = Router();
  const feeEstimatorService = new FeeEstimatorService(db);

  // ============================================================================
  // AI-8: Fee Estimation Endpoints
  // ============================================================================

  /**
   * POST /api/ai/fees/estimate
   * Generate fee estimate for a FOIA request
   * Auth: PUBLIC (called automatically after request submission)
   */
  router.post('/estimate', async (req: AuthRequest, res: Response) => {
    try {
      const {
        foia_request_id,
        description,
        requester_category,
        agencies_requested,
        date_range_years,
        estimated_record_volume,
        record_types
      } = req.body;

      // Validate required fields
      if (!foia_request_id) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUEST_ID',
            message: 'foia_request_id is required'
          },
          timestamp: new Date()
        });
      }

      if (!description) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_DESCRIPTION',
            message: 'description is required'
          },
          timestamp: new Date()
        });
      }

      if (!requester_category) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_CATEGORY',
            message: 'requester_category is required'
          },
          timestamp: new Date()
        });
      }

      if (!agencies_requested || agencies_requested.length === 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_AGENCIES',
            message: 'At least one agency must be specified'
          },
          timestamp: new Date()
        });
      }

      const input: FeeEstimationInput = {
        foia_request_id,
        description,
        requester_category,
        agencies_requested,
        date_range_years: date_range_years || 1,
        estimated_record_volume: estimated_record_volume || 'moderate',
        record_types: record_types || []
      };

      const tenantId = req.auth?.tenant_id || 'default';

      const estimate = await feeEstimatorService.generateFeeEstimate(tenantId, input);

      res.json({
        success: true,
        data: estimate,
        message: 'Fee estimate generated successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[FeeEstimatorRoutes] Estimate generation error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'ESTIMATION_FAILED',
          message: error.message || 'Failed to generate fee estimate'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * GET /api/ai/fees/estimate/:foiaRequestId
   * Retrieve stored fee estimate
   * Auth: PUBLIC (by confirmation number) or foia_coordinator+
   */
  router.get('/estimate/:foiaRequestId', async (req: AuthRequest, res: Response) => {
    try {
      const { foiaRequestId } = req.params;
      const tenantId = req.auth?.tenant_id || 'default';

      const estimate = await feeEstimatorService.getFeeEstimate(tenantId, foiaRequestId);

      if (!estimate) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'No fee estimate found for this request'
          },
          timestamp: new Date()
        });
      }

      res.json({
        success: true,
        data: {
          fee_estimate_low: estimate.fee_estimate_low,
          fee_estimate_high: estimate.fee_estimate_high,
          likely_fee: estimate.likely_fee,
          likely_fee_waiver_eligible: estimate.likely_fee_waiver_eligible,
          plain_english_explanation: estimate.plain_english_explanation,
          fee_breakdown: estimate.fee_breakdown,
          waiver_application_url: estimate.waiver_application_url,
          estimation_confidence: estimate.estimation_confidence,
          estimated_at: estimate.estimated_at
        },
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[FeeEstimatorRoutes] Fetch estimate error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: error.message || 'Failed to fetch fee estimate'
        },
        timestamp: new Date()
      });
    }
  });

  /**
   * POST /api/ai/fees/track-actual/:foiaRequestId
   * Track actual fee for accuracy metrics
   * Auth: foia_coordinator+ (internal use only)
   */
  router.post('/track-actual/:foiaRequestId', async (req: AuthRequest, res: Response) => {
    try {
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          },
          timestamp: new Date()
        });
      }

      const allowedRoles = ['foia_coordinator', 'foia_supervisor', 'admin'];
      if (!allowedRoles.includes(req.auth.role)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Coordinator role required to track actual fees'
          },
          timestamp: new Date()
        });
      }

      const { foiaRequestId } = req.params;
      const { actual_fee, actual_search_hours, actual_pages } = req.body;

      if (typeof actual_fee !== 'number' || actual_fee < 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FEE',
            message: 'actual_fee must be a non-negative number'
          },
          timestamp: new Date()
        });
      }

      if (typeof actual_search_hours !== 'number' || actual_search_hours < 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_HOURS',
            message: 'actual_search_hours must be a non-negative number'
          },
          timestamp: new Date()
        });
      }

      if (typeof actual_pages !== 'number' || actual_pages < 0) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PAGES',
            message: 'actual_pages must be a non-negative number'
          },
          timestamp: new Date()
        });
      }

      await feeEstimatorService.trackActualFee(
        req.auth.tenant_id,
        foiaRequestId,
        actual_fee,
        actual_search_hours,
        actual_pages
      );

      res.json({
        success: true,
        message: 'Actual fee tracked successfully',
        timestamp: new Date()
      });
    } catch (error: any) {
      console.error('[FeeEstimatorRoutes] Track actual fee error:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'TRACKING_FAILED',
          message: error.message || 'Failed to track actual fee'
        },
        timestamp: new Date()
      });
    }
  });

  return router;
}
