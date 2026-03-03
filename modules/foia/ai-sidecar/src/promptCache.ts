/**
 * Govli AI FOIA Module - Prompt Cache
 * Caches jurisdiction-specific content to reduce token costs
 */

import Redis from 'ioredis';
import { Pool } from 'pg';
import crypto from 'crypto';

/**
 * Cache Entry
 */
interface CacheEntry {
  content: string;
  created_at: Date;
  ttl: number;
  hits: number;
}

/**
 * Cache Statistics
 */
export interface CacheStats {
  total_hits: number;
  total_misses: number;
  hit_rate: number;
  cached_items: number;
}

/**
 * Cached Prompt Result
 */
export interface CachedPrompt {
  content: string;
  cache_hit: boolean;
  cache_key?: string;
}

/**
 * Prompt Cache Manager
 */
export class PromptCache {
  private redis: Redis;
  private db: Pool;
  private defaultTTL: number = 86400; // 24 hours

  // Cache key prefixes
  private static readonly PREFIX_JURISDICTION = 'prompt:jurisdiction:';
  private static readonly PREFIX_EXEMPTION = 'prompt:exemption:';
  private static readonly PREFIX_CUSTOM = 'prompt:custom:';
  private static readonly STATS_KEY = 'prompt:cache:stats';

  constructor(redis: Redis, db: Pool, defaultTTL?: number) {
    this.redis = redis;
    this.db = db;
    if (defaultTTL) {
      this.defaultTTL = defaultTTL;
    }
  }

  /**
   * Get cached jurisdiction-specific FOIA law content
   */
  async getJurisdictionPrompt(jurisdiction_id: string): Promise<CachedPrompt> {
    const cacheKey = `${PromptCache.PREFIX_JURISDICTION}${jurisdiction_id}`;

    try {
      // Check cache
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        // Record hit
        await this.recordCacheHit(true);
        await this.redis.hincrby(`${cacheKey}:meta`, 'hits', 1);

        return {
          content: cached,
          cache_hit: true,
          cache_key: cacheKey
        };
      }

      // Cache miss - fetch from database
      await this.recordCacheHit(false);

      const result = await this.db.query(
        `SELECT foia_statute_text, exemptions_text, procedures_text
         FROM foia_jurisdictions
         WHERE id = $1`,
        [jurisdiction_id]
      );

      if (result.rows.length === 0) {
        return {
          content: '',
          cache_hit: false
        };
      }

      const row = result.rows[0];
      const content = this.buildJurisdictionPrompt(row);

      // Cache for 24 hours (jurisdictions rarely change)
      await this.redis.setex(cacheKey, this.defaultTTL, content);
      await this.redis.hset(`${cacheKey}:meta`, {
        created_at: new Date().toISOString(),
        hits: 0
      });
      await this.redis.expire(`${cacheKey}:meta`, this.defaultTTL);

      return {
        content,
        cache_hit: false,
        cache_key: cacheKey
      };
    } catch (error) {
      console.error('[PromptCache] Error fetching jurisdiction prompt:', error);
      return {
        content: '',
        cache_hit: false
      };
    }
  }

  /**
   * Get cached exemption definition
   */
  async getExemptionPrompt(exemption_id: string): Promise<CachedPrompt> {
    const cacheKey = `${PromptCache.PREFIX_EXEMPTION}${exemption_id}`;

    try {
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        await this.recordCacheHit(true);
        await this.redis.hincrby(`${cacheKey}:meta`, 'hits', 1);

        return {
          content: cached,
          cache_hit: true,
          cache_key: cacheKey
        };
      }

      await this.recordCacheHit(false);

      const result = await this.db.query(
        `SELECT exemption_code, exemption_name, definition, case_law_summary
         FROM foia_exemptions
         WHERE id = $1`,
        [exemption_id]
      );

      if (result.rows.length === 0) {
        return {
          content: '',
          cache_hit: false
        };
      }

      const row = result.rows[0];
      const content = this.buildExemptionPrompt(row);

      // Cache for 24 hours
      await this.redis.setex(cacheKey, this.defaultTTL, content);
      await this.redis.hset(`${cacheKey}:meta`, {
        created_at: new Date().toISOString(),
        hits: 0
      });
      await this.redis.expire(`${cacheKey}:meta`, this.defaultTTL);

      return {
        content,
        cache_hit: false,
        cache_key: cacheKey
      };
    } catch (error) {
      console.error('[PromptCache] Error fetching exemption prompt:', error);
      return {
        content: '',
        cache_hit: false
      };
    }
  }

  /**
   * Get custom cached content by key
   */
  async getCustomPrompt(
    key: string,
    fetchFunction?: () => Promise<string>,
    ttl?: number
  ): Promise<CachedPrompt> {
    const cacheKey = `${PromptCache.PREFIX_CUSTOM}${this.hashKey(key)}`;

    try {
      const cached = await this.redis.get(cacheKey);

      if (cached) {
        await this.recordCacheHit(true);
        await this.redis.hincrby(`${cacheKey}:meta`, 'hits', 1);

        return {
          content: cached,
          cache_hit: true,
          cache_key: cacheKey
        };
      }

      await this.recordCacheHit(false);

      if (!fetchFunction) {
        return {
          content: '',
          cache_hit: false
        };
      }

      // Fetch content
      const content = await fetchFunction();

      // Cache with specified TTL or default
      const cacheTTL = ttl || this.defaultTTL;
      await this.redis.setex(cacheKey, cacheTTL, content);
      await this.redis.hset(`${cacheKey}:meta`, {
        created_at: new Date().toISOString(),
        hits: 0,
        original_key: key
      });
      await this.redis.expire(`${cacheKey}:meta`, cacheTTL);

      return {
        content,
        cache_hit: false,
        cache_key: cacheKey
      };
    } catch (error) {
      console.error('[PromptCache] Error with custom prompt:', error);
      return {
        content: '',
        cache_hit: false
      };
    }
  }

  /**
   * Set custom prompt in cache
   */
  async setCustomPrompt(key: string, content: string, ttl?: number): Promise<void> {
    const cacheKey = `${PromptCache.PREFIX_CUSTOM}${this.hashKey(key)}`;
    const cacheTTL = ttl || this.defaultTTL;

    await this.redis.setex(cacheKey, cacheTTL, content);
    await this.redis.hset(`${cacheKey}:meta`, {
      created_at: new Date().toISOString(),
      hits: 0,
      original_key: key
    });
    await this.redis.expire(`${cacheKey}:meta`, cacheTTL);
  }

  /**
   * Invalidate specific cache entry
   */
  async invalidate(cacheKey: string): Promise<void> {
    await this.redis.del(cacheKey);
    await this.redis.del(`${cacheKey}:meta`);
  }

  /**
   * Invalidate all jurisdiction caches
   */
  async invalidateJurisdictions(): Promise<void> {
    const keys = await this.redis.keys(`${PromptCache.PREFIX_JURISDICTION}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * Invalidate all exemption caches
   */
  async invalidateExemptions(): Promise<void> {
    const keys = await this.redis.keys(`${PromptCache.PREFIX_EXEMPTION}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const stats = await this.redis.hgetall(PromptCache.STATS_KEY);

      const total_hits = parseInt(stats.hits || '0');
      const total_misses = parseInt(stats.misses || '0');
      const total = total_hits + total_misses;
      const hit_rate = total > 0 ? (total_hits / total) * 100 : 0;

      // Count cached items
      const jurisdictionKeys = await this.redis.keys(`${PromptCache.PREFIX_JURISDICTION}*`);
      const exemptionKeys = await this.redis.keys(`${PromptCache.PREFIX_EXEMPTION}*`);
      const customKeys = await this.redis.keys(`${PromptCache.PREFIX_CUSTOM}*`);

      // Filter out :meta keys
      const cached_items = [
        ...jurisdictionKeys,
        ...exemptionKeys,
        ...customKeys
      ].filter(key => !key.endsWith(':meta')).length;

      return {
        total_hits,
        total_misses,
        hit_rate,
        cached_items
      };
    } catch (error) {
      console.error('[PromptCache] Error fetching stats:', error);
      return {
        total_hits: 0,
        total_misses: 0,
        hit_rate: 0,
        cached_items: 0
      };
    }
  }

  /**
   * Reset cache statistics
   */
  async resetStats(): Promise<void> {
    await this.redis.del(PromptCache.STATS_KEY);
  }

  /**
   * Record cache hit or miss
   */
  private async recordCacheHit(hit: boolean): Promise<void> {
    const field = hit ? 'hits' : 'misses';
    await this.redis.hincrby(PromptCache.STATS_KEY, field, 1);
  }

  /**
   * Build jurisdiction prompt from database row
   */
  private buildJurisdictionPrompt(row: any): string {
    return `
# FOIA Jurisdiction Context

## Statute Text
${row.foia_statute_text || 'Not available'}

## Exemptions
${row.exemptions_text || 'Not available'}

## Procedures
${row.procedures_text || 'Not available'}
`.trim();
  }

  /**
   * Build exemption prompt from database row
   */
  private buildExemptionPrompt(row: any): string {
    return `
# FOIA Exemption: ${row.exemption_code}

## Name
${row.exemption_name}

## Definition
${row.definition || 'Not available'}

## Case Law Summary
${row.case_law_summary || 'Not available'}
`.trim();
  }

  /**
   * Hash a key for consistent cache key generation
   */
  private hashKey(key: string): string {
    return crypto
      .createHash('sha256')
      .update(key)
      .digest('hex')
      .substring(0, 16);
  }
}
