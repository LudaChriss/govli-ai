/**
 * GovQA Compatibility Middleware
 *
 * Adds compatibility headers and logs requests for migration tracking
 */

import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';

const MIGRATION_WARNING = 'This endpoint is provided for GovQA migration compatibility. Please migrate to /api/v1/foia/* within 12 months.';

/**
 * Add compatibility headers to all GovQA compat requests
 */
export function addCompatHeaders(req: Request, res: Response, next: NextFunction): void {
  // Add header indicating this is a compatibility request
  res.setHeader('X-Govli-Compat', 'govqa');

  // Add migration warning
  res.setHeader('X-Govli-Migration-Warning', MIGRATION_WARNING);

  // Add CORS headers for backward compatibility
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'X-Govli-Compat, X-Govli-Migration-Warning');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }

  next();
}

/**
 * Log compatibility request for migration tracking
 */
export async function logCompatRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
  const db: Pool = req.app.locals.db;
  const tenantId = (req as any).user?.tenant_id || null;

  try {
    // Extract case number from URL if present
    const caseNumberMatch = req.path.match(/\/cases\/([^\/]+)/);
    const caseNumber = caseNumberMatch ? caseNumberMatch[1] : null;

    // Store the original send function
    const originalSend = res.send;
    let responseCode = 200;
    let requestId: string | null = null;

    // Override send to capture response code
    res.send = function (data: any): Response {
      responseCode = res.statusCode;

      // Try to extract Govli request_id from response if available
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          requestId = parsed?.data?.id || parsed?.id || null;
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Call original send
      return originalSend.call(this, data);
    };

    // Continue with request
    next();

    // Log after response is sent (using setImmediate to ensure send has been called)
    setImmediate(async () => {
      try {
        await db.query(
          `INSERT INTO "FoiaCompatRequests"
           (id, tenant_id, endpoint, govqa_case_number, govli_request_id, request_body, response_code, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())`,
          [
            tenantId,
            req.path,
            caseNumber,
            requestId,
            JSON.stringify({
              method: req.method,
              query: req.query,
              body: req.body
            }),
            responseCode
          ]
        );
      } catch (error) {
        console.error('[GovQA Compat] Failed to log request:', error);
        // Don't fail the request if logging fails
      }
    });
  } catch (error) {
    console.error('[GovQA Compat] Error in logging middleware:', error);
    // Continue even if logging setup fails
    next();
  }
}

/**
 * Combined compatibility middleware
 */
export function compatMiddleware(req: Request, res: Response, next: NextFunction): void {
  addCompatHeaders(req, res, () => {
    logCompatRequest(req, res, next).catch((error) => {
      console.error('[GovQA Compat] Middleware error:', error);
      next();
    });
  });
}
