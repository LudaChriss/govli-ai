/**
 * Govli AI FOIA Module - Model Router
 * Routes AI requests to appropriate Claude models based on complexity
 */

import { Pool } from 'pg';
import Redis from 'ioredis';

/**
 * Model Configuration
 */
interface ModelConfig {
  model_name: string;
  thinking_budget: number; // Max thinking tokens
  cost_per_1k_input: number; // USD per 1k input tokens
  cost_per_1k_output: number; // USD per 1k output tokens
  cost_per_1k_cache_write: number; // USD per 1k cache write tokens
  cost_per_1k_cache_read: number; // USD per 1k cache read tokens
}

/**
 * Model Selection Result
 */
export interface ModelSelection {
  model_name: string;
  thinking_budget: number;
  estimated_cost_per_1k: number; // Rough estimate for budgeting
  reason: string;
}

/**
 * Complexity Score Thresholds
 */
const COMPLEXITY_THRESHOLDS = {
  LOW: 30,      // 0-29: Simple, templated responses
  MID: 70,      // 30-69: Moderate analysis required
  HIGH: 90      // 70-89: Complex reasoning, 90+: Critical with extended thinking
};

/**
 * Model Configurations (as of 2025-01)
 */
const MODELS: Record<string, ModelConfig> = {
  'claude-3-5-haiku-20250122': {
    model_name: 'claude-3-5-haiku-20250122',
    thinking_budget: 5000,
    cost_per_1k_input: 0.0008,
    cost_per_1k_output: 0.004,
    cost_per_1k_cache_write: 0.001,
    cost_per_1k_cache_read: 0.00008
  },
  'claude-3-5-sonnet-20250122': {
    model_name: 'claude-3-5-sonnet-20250122',
    thinking_budget: 10000,
    cost_per_1k_input: 0.003,
    cost_per_1k_output: 0.015,
    cost_per_1k_cache_write: 0.00375,
    cost_per_1k_cache_read: 0.0003
  },
  'claude-3-7-opus-20250219': {
    model_name: 'claude-3-7-opus-20250219',
    thinking_budget: 15000,
    cost_per_1k_input: 0.015,
    cost_per_1k_output: 0.075,
    cost_per_1k_cache_write: 0.01875,
    cost_per_1k_cache_read: 0.0015
  }
};

/**
 * Feature-specific overrides
 */
const FEATURE_OVERRIDES: Record<string, string> = {
  'AI-5': 'claude-3-7-opus-20250219',    // Vaughn Index: legal quality required
  'AI-12': 'claude-3-5-haiku-20250122'   // Deflection: speed + cost
};

/**
 * Model Router Class
 */
export class ModelRouter {
  private redis: Redis;
  private db: Pool;

  constructor(redis: Redis, db: Pool) {
    this.redis = redis;
    this.db = db;
  }

  /**
   * Select appropriate model based on complexity and feature
   */
  async selectModel(
    tenant_id: string,
    complexity_score: number,
    feature_id: string
  ): Promise<ModelSelection> {
    try {
      // Check for feature-specific override
      if (FEATURE_OVERRIDES[feature_id]) {
        const model_name = FEATURE_OVERRIDES[feature_id];
        const config = MODELS[model_name];

        return {
          model_name: config.model_name,
          thinking_budget: config.thinking_budget,
          estimated_cost_per_1k: (config.cost_per_1k_input + config.cost_per_1k_output) / 2,
          reason: `Feature ${feature_id} requires ${model_name}`
        };
      }

      // Check tenant-specific overrides from database
      const tenantOverride = await this.getTenantModelOverride(tenant_id, feature_id);
      if (tenantOverride) {
        const config = MODELS[tenantOverride];
        if (config) {
          return {
            model_name: config.model_name,
            thinking_budget: config.thinking_budget,
            estimated_cost_per_1k: (config.cost_per_1k_input + config.cost_per_1k_output) / 2,
            reason: `Tenant override for ${feature_id}`
          };
        }
      }

      // Route based on complexity score
      let selected_model: string;
      let reason: string;

      if (complexity_score < COMPLEXITY_THRESHOLDS.LOW) {
        // 0-29: Simple, templated responses
        selected_model = 'claude-3-5-haiku-20250122';
        reason = `Low complexity (${complexity_score}) - using fast model`;
      } else if (complexity_score < COMPLEXITY_THRESHOLDS.MID) {
        // 30-69: Moderate analysis required
        selected_model = 'claude-3-5-sonnet-20250122';
        reason = `Medium complexity (${complexity_score}) - using balanced model`;
      } else if (complexity_score < COMPLEXITY_THRESHOLDS.HIGH) {
        // 70-89: Complex reasoning
        selected_model = 'claude-3-7-opus-20250219';
        reason = `High complexity (${complexity_score}) - using advanced model`;
      } else {
        // 90+: Critical with extended thinking
        selected_model = 'claude-3-7-opus-20250219';
        reason = `Critical complexity (${complexity_score}) - using advanced model with extended thinking`;
      }

      const config = MODELS[selected_model];

      // For critical complexity (90+), increase thinking budget
      const thinking_budget = complexity_score >= COMPLEXITY_THRESHOLDS.HIGH
        ? config.thinking_budget * 2
        : config.thinking_budget;

      return {
        model_name: config.model_name,
        thinking_budget,
        estimated_cost_per_1k: (config.cost_per_1k_input + config.cost_per_1k_output) / 2,
        reason
      };
    } catch (error) {
      console.error('[ModelRouter] Error selecting model:', error);

      // Fallback to Sonnet (safe middle ground)
      const fallback = MODELS['claude-3-5-sonnet-20250122'];
      return {
        model_name: fallback.model_name,
        thinking_budget: fallback.thinking_budget,
        estimated_cost_per_1k: (fallback.cost_per_1k_input + fallback.cost_per_1k_output) / 2,
        reason: 'Fallback due to routing error'
      };
    }
  }

  /**
   * Get model configuration by name
   */
  getModelConfig(model_name: string): ModelConfig | undefined {
    return MODELS[model_name];
  }

  /**
   * Get all available models
   */
  getAvailableModels(): ModelConfig[] {
    return Object.values(MODELS);
  }

  /**
   * Get tenant-specific model override from database
   */
  private async getTenantModelOverride(
    tenant_id: string,
    feature_id: string
  ): Promise<string | null> {
    try {
      // Try cache first
      const cacheKey = `tenant:${tenant_id}:model_override:${feature_id}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Query database
      const result = await this.db.query(
        `SELECT model_name FROM foia_ai_model_overrides
         WHERE tenant_id = $1 AND feature_id = $2 AND enabled = true`,
        [tenant_id, feature_id]
      );

      if (result.rows.length > 0) {
        const model_name = result.rows[0].model_name;

        // Cache for 1 hour
        await this.redis.setex(cacheKey, 3600, model_name);

        return model_name;
      }

      return null;
    } catch (error) {
      console.error('[ModelRouter] Error fetching tenant override:', error);
      return null;
    }
  }

  /**
   * Update tenant model override
   */
  async setTenantModelOverride(
    tenant_id: string,
    feature_id: string,
    model_name: string
  ): Promise<void> {
    // Validate model exists
    if (!MODELS[model_name]) {
      throw new Error(`Invalid model name: ${model_name}`);
    }

    await this.db.query(
      `INSERT INTO foia_ai_model_overrides (tenant_id, feature_id, model_name, enabled, created_at)
       VALUES ($1, $2, $3, true, NOW())
       ON CONFLICT (tenant_id, feature_id)
       DO UPDATE SET model_name = $3, enabled = true, updated_at = NOW()`,
      [tenant_id, feature_id, model_name]
    );

    // Invalidate cache
    const cacheKey = `tenant:${tenant_id}:model_override:${feature_id}`;
    await this.redis.del(cacheKey);
  }

  /**
   * Remove tenant model override
   */
  async removeTenantModelOverride(
    tenant_id: string,
    feature_id: string
  ): Promise<void> {
    await this.db.query(
      `UPDATE foia_ai_model_overrides
       SET enabled = false, updated_at = NOW()
       WHERE tenant_id = $1 AND feature_id = $2`,
      [tenant_id, feature_id]
    );

    // Invalidate cache
    const cacheKey = `tenant:${tenant_id}:model_override:${feature_id}`;
    await this.redis.del(cacheKey);
  }
}
