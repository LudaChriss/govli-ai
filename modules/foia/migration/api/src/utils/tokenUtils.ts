/**
 * Migration API - Token Utilities
 */

import jwt from 'jsonwebtoken';
import { MigrationTokenPayload } from '../types';

// In production, this should be from environment variable
const JWT_SECRET = process.env.MIGRATION_JWT_SECRET || 'migration-secret-key-change-in-production';

/**
 * Generate migration JWT token (24 hour expiry)
 */
export function generateMigrationToken(payload: MigrationTokenPayload): string {
  return jwt.sign(
    {
      tenant_id: payload.tenant_id,
      migration_source: payload.migration_source,
      expires_at: payload.expires_at
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * Verify and decode migration JWT token
 */
export function verifyMigrationToken(token: string): MigrationTokenPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as MigrationTokenPayload;

    // Check if migration window has expired
    const expiresAt = new Date(decoded.expires_at);
    if (expiresAt < new Date()) {
      throw new Error('Migration window has expired');
    }

    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid migration token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Migration token has expired (24h limit)');
    }
    throw error;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) return null;

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}
