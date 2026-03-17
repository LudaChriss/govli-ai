/**
 * Auth Middleware - copied from gateway for processing module
 */

import { Request } from 'express';

export type AuthRequest = Request & {
  auth?: {
    tenant_id: string;
    user_id: string;
    roles: string[];
    email?: string;
    name?: string;
  };
  file?: any;
};
