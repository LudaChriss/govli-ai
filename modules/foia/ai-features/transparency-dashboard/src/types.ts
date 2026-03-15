/**
 * AI-16: Type Definitions
 */

import { Request } from 'express';

/**
 * Extended Express Request with user property
 */
export interface AuthenticatedRequest extends Request {
  user?: {
    tenant_id: string;
    [key: string]: any;
  };
}
