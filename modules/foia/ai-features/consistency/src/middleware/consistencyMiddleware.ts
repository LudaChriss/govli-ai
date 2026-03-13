/**
 * AI-4: Exemption Consistency Check Middleware
 * Hooks into A-4 response approval workflow
 *
 * Usage: Add as middleware before response approval endpoint
 *
 * router.post('/responses/:id/approve',
 *   authMiddleware,
 *   consistencyCheckMiddleware(db),
 *   approveResponseHandler
 * );
 */

import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { ConsistencyService } from '../services/consistencyService';
import { CheckConsistencyInput } from '../types';

interface AuthRequest extends Request {
  auth?: {
    tenant_id: string;
    user_id: string;
    role: string;
  };
  consistencyCheck?: {
    check_id: string;
    overall_risk: string;
    is_consistent: boolean;
    alerts: any[];
  };
}

interface ConsistencyMiddlewareOptions {
  /**
   * Skip consistency check for certain roles (e.g., system)
   */
  skipForRoles?: string[];

  /**
   * Automatically bypass LOW risk checks (default: true)
   */
  autoPassLowRisk?: boolean;

  /**
   * Require acknowledgment for MEDIUM risk (default: true)
   */
  requireAcknowledgmentForMedium?: boolean;
}

const DEFAULT_OPTIONS: ConsistencyMiddlewareOptions = {
  skipForRoles: ['system'],
  autoPassLowRisk: true,
  requireAcknowledgmentForMedium: true
};

/**
 * Create consistency check middleware
 */
export function consistencyCheckMiddleware(
  db: Pool,
  options: ConsistencyMiddlewareOptions = {}
) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const consistencyService = new ConsistencyService(db);

  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      // Check authentication
      if (!req.auth) {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      // Skip for certain roles (e.g., system jobs)
      if (config.skipForRoles && config.skipForRoles.includes(req.auth.role)) {
        console.log('[ConsistencyMiddleware] Skipping check for role:', req.auth.role);
        return next();
      }

      // Extract response ID from URL params or body
      const responseId = req.params.id || req.body.response_id;

      if (!responseId) {
        console.warn('[ConsistencyMiddleware] No response_id found, skipping consistency check');
        return next();
      }

      // Check if consistency check was already performed (stored in session/request)
      const bypassToken = req.headers['x-consistency-bypass'] as string;
      if (bypassToken) {
        // Verify bypass token is valid (supervisor override or MEDIUM acknowledgment)
        const isValid = await verifyBypassToken(db, req.auth.tenant_id, responseId, bypassToken);
        if (isValid) {
          console.log('[ConsistencyMiddleware] Valid bypass token provided');
          return next();
        }
      }

      // Fetch response details to build consistency check input
      const responseResult = await db.query(
        `SELECT
          fresp.id,
          fresp.foia_request_id,
          fresp.exemption_codes,
          fr.record_types,
          fr.department,
          fr.requester_category
         FROM "FoiaResponses" fresp
         JOIN "FoiaRequests" fr ON fresp.foia_request_id = fr.id
         WHERE fresp.id = $1 AND fresp.tenant_id = $2`,
        [responseId, req.auth.tenant_id]
      );

      if (responseResult.rows.length === 0) {
        console.warn('[ConsistencyMiddleware] Response not found:', responseId);
        return next(); // Let the main handler deal with 404
      }

      const response = responseResult.rows[0];

      // Build consistency check input
      const exemptionDecisions = (response.exemption_codes || []).map((code: string) => ({
        exemption_code: code,
        information_type: 'general', // In real implementation, would extract from documents
        decision: 'EXEMPT' as const
      }));

      const input: CheckConsistencyInput = {
        response_id: responseId,
        exemption_decisions: exemptionDecisions,
        record_types: response.record_types || [],
        department: response.department,
        requester_category: response.requester_category
      };

      // Run consistency check
      console.log('[ConsistencyMiddleware] Running consistency check for response:', responseId);
      const check = await consistencyService.checkConsistency(
        req.auth.tenant_id,
        req.auth.user_id,
        input
      );

      // Store check info in request for logging
      req.consistencyCheck = {
        check_id: check.id,
        overall_risk: check.overall_risk,
        is_consistent: check.is_consistent,
        alerts: check.alerts
      };

      // Handle based on risk level
      if (check.overall_risk === 'HIGH' && check.status === 'PENDING') {
        // HIGH RISK: Block approval, require supervisor override
        console.log('[ConsistencyMiddleware] HIGH risk detected, blocking approval');
        return res.status(403).json({
          success: false,
          error: {
            code: 'HIGH_RISK_INCONSISTENCY',
            message: 'High risk exemption inconsistency detected. Supervisor override required.',
            data: {
              check_id: check.id,
              alerts: check.alerts,
              summary: check.summary,
              prior_cases_reviewed: check.prior_cases_reviewed,
              override_required: true,
              override_endpoint: `/api/ai/consistency/checks/${check.id}/override`
            }
          },
          timestamp: new Date()
        });
      } else if (check.overall_risk === 'MEDIUM') {
        // MEDIUM RISK: Show warning, require acknowledgment
        if (config.requireAcknowledgmentForMedium && !req.body.acknowledge_medium_risk) {
          console.log('[ConsistencyMiddleware] MEDIUM risk detected, acknowledgment required');
          return res.status(400).json({
            success: false,
            error: {
              code: 'MEDIUM_RISK_INCONSISTENCY',
              message: 'Potential exemption inconsistency detected. Review and acknowledge to proceed.',
              data: {
                check_id: check.id,
                alerts: check.alerts,
                summary: check.summary,
                acknowledgment_required: true,
                instructions: 'Review alerts and resubmit with acknowledge_medium_risk=true'
              }
            },
            timestamp: new Date()
          });
        }
        // Acknowledgment provided or not required, proceed with warning logged
        console.log('[ConsistencyMiddleware] MEDIUM risk acknowledged, proceeding');
      } else {
        // LOW RISK: Silent pass
        console.log('[ConsistencyMiddleware] LOW risk, proceeding');
      }

      // All checks passed, proceed to approval
      next();
    } catch (error: any) {
      console.error('[ConsistencyMiddleware] Error during consistency check:', error);

      // Don't block approval on middleware errors - log and continue
      // (In production, you might want to fail-closed instead)
      console.warn('[ConsistencyMiddleware] Allowing approval despite check error');
      next();
    }
  };
}

/**
 * Verify bypass token (for supervisor override or MEDIUM acknowledgment)
 */
async function verifyBypassToken(
  db: Pool,
  tenant_id: string,
  response_id: string,
  token: string
): Promise<boolean> {
  try {
    // Check if there's an overridden consistency check for this response
    const result = await db.query(
      `SELECT id FROM "FoiaConsistencyChecks"
       WHERE tenant_id = $1
         AND foia_response_id = $2
         AND status = 'OVERRIDDEN'
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      [tenant_id, response_id]
    );

    if (result.rows.length > 0) {
      // Valid override exists
      const checkId = result.rows[0].id;
      return token === `override:${checkId}`;
    }

    return false;
  } catch (error) {
    console.error('[ConsistencyMiddleware] Error verifying bypass token:', error);
    return false;
  }
}

/**
 * Helper: Generate bypass token after supervisor override
 */
export function generateBypassToken(check_id: string): string {
  return `override:${check_id}`;
}

/**
 * Example usage in A-4 routes:
 *
 * ```typescript
 * import { consistencyCheckMiddleware } from './ai-features/consistency/middleware';
 *
 * // Add to response approval endpoint
 * router.post('/responses/:id/approve',
 *   authMiddleware,
 *   consistencyCheckMiddleware(db, {
 *     requireAcknowledgmentForMedium: true,
 *     autoPassLowRisk: true
 *   }),
 *   async (req, res) => {
 *     // Consistency check passed, proceed with approval
 *     // Access check results via req.consistencyCheck if needed
 *     const { check_id, overall_risk } = req.consistencyCheck || {};
 *
 *     // ... approve response logic ...
 *   }
 * );
 * ```
 */
