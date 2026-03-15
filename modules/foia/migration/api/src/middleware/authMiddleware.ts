/**
 * Migration API - Authentication Middleware
 */

import { Response, NextFunction } from 'express';
import { MigrationRequest } from '../types';
import { verifyMigrationToken, extractTokenFromHeader } from '../utils/tokenUtils';

/**
 * Middleware to authenticate migration token
 */
export function authenticateMigrationToken(
  req: MigrationRequest,
  res: Response,
  next: NextFunction
): void {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      res.status(401).json({
        success: false,
        error: 'Migration token required. Include "Authorization: Bearer <token>" header.'
      });
      return;
    }

    const payload = verifyMigrationToken(token);
    req.migrationToken = payload;

    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      error: error instanceof Error ? error.message : 'Invalid migration token'
    });
  }
}
