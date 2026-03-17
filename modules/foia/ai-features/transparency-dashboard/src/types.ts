/**
 * AI-16: Type Definitions
 */

import { Request } from 'express';

/**
 * Extended Express Request with user property
 */
export type AuthenticatedRequest = Request & {
  user?: {
    tenant_id: string;
    [key: string]: any;
  };
};
