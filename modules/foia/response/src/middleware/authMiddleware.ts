/**
 * FOIA Response Auth Middleware
 * JWT validation and tenant extraction
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export interface AuthRequest extends Request {
  auth?: {
    user_id: string;
    tenant_id: string;
    email: string;
    role: string;
  };
}

/**
 * Auth middleware - validates JWT and extracts tenant/user info
 */
export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;

      req.auth = {
        user_id: decoded.id,
        tenant_id: decoded.tenant_id,
        email: decoded.email,
        role: decoded.role
      };

      next();
    } catch (jwtError) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid or expired token'
        }
      });
    }
  } catch (error) {
    console.error('[AuthMiddleware] Error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication error'
      }
    });
  }
}
