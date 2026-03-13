/**
 * AI-7: Conversational Request Builder - Rate Limiter
 * Limits: 20 messages per session per IP per hour
 */

import { Request, Response, NextFunction } from 'express';
import { RateLimitInfo, RateLimitResult } from '../types';

interface RateLimiterStore {
  [key: string]: RateLimitInfo;
}

/**
 * In-memory rate limiter
 * In production, use Redis for distributed rate limiting
 */
export class ConversationRateLimiter {
  private store: RateLimiterStore = {};
  private maxMessages: number;
  private windowMs: number;
  private cleanupInterval: NodeJS.Timeout;

  constructor(
    maxMessages: number = 20,
    windowMs: number = 60 * 60 * 1000 // 1 hour
  ) {
    this.maxMessages = maxMessages;
    this.windowMs = windowMs;

    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Check if request is within rate limit
   */
  checkLimit(ipAddress: string, sessionId: string): RateLimitResult {
    const key = this.getKey(ipAddress, sessionId);
    const now = new Date();

    let info = this.store[key];

    if (!info) {
      // First message in this session/IP combination
      info = {
        ip_address: ipAddress,
        session_id: sessionId,
        message_count: 0,
        window_start: now,
        window_end: new Date(now.getTime() + this.windowMs)
      };
      this.store[key] = info;
    }

    // Check if window has expired
    if (now > info.window_end) {
      // Reset window
      info.message_count = 0;
      info.window_start = now;
      info.window_end = new Date(now.getTime() + this.windowMs);
    }

    // Check limit
    if (info.message_count >= this.maxMessages) {
      return {
        allowed: false,
        remaining: 0,
        reset_at: info.window_end
      };
    }

    // Increment count
    info.message_count++;

    return {
      allowed: true,
      remaining: this.maxMessages - info.message_count,
      reset_at: info.window_end
    };
  }

  /**
   * Generate key for IP + session combination
   */
  private getKey(ipAddress: string, sessionId: string): string {
    return `${ipAddress}:${sessionId}`;
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = new Date();
    const keysToDelete: string[] = [];

    for (const [key, info] of Object.entries(this.store)) {
      if (now > info.window_end) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      delete this.store[key];
    }

    if (keysToDelete.length > 0) {
      console.log(`[RateLimiter] Cleaned up ${keysToDelete.length} expired entries`);
    }
  }

  /**
   * Destroy rate limiter (cleanup interval)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Global rate limiter instance
const globalRateLimiter = new ConversationRateLimiter();

/**
 * Express middleware for rate limiting
 */
export function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
  const sessionId = req.body.session_id;

  if (!sessionId) {
    res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_SESSION_ID',
        message: 'Session ID is required'
      }
    });
    return;
  }

  const result = globalRateLimiter.checkLimit(ipAddress, sessionId);

  // Add rate limit headers
  res.setHeader('X-RateLimit-Limit', '20');
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  res.setHeader('X-RateLimit-Reset', result.reset_at.toISOString());

  if (!result.allowed) {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many messages. Please wait before sending more.',
        reset_at: result.reset_at
      }
    });
    return;
  }

  next();
}

export { globalRateLimiter };
