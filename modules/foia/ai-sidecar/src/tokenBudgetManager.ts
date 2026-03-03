/**
 * Govli AI FOIA Module - Token Budget Manager
 * Manages AI token budgets and spending limits per tenant
 */

import Redis from 'ioredis';
import { Pool } from 'pg';
import { TokenBudget, AIUsageRecord } from '@govli/foia-shared';
import { emit } from '@govli/foia-shared';

/**
 * Budget Status Response
 */
export interface BudgetStatus {
  allowed: boolean;
  remaining_usd: number;
  utilization_pct: number;
  warning: string | null;
}

/**
 * Token Budget Manager Class
 */
export class TokenBudgetManager {
  private redis: Redis;
  private db: Pool;

  constructor(redis: Redis, db: Pool) {
    this.redis = redis;
    this.db = db;
  }

  /**
   * Check if tenant has budget available for AI operations
   */
  async checkBudget(tenant_id: string): Promise<BudgetStatus> {
    try {
      // Load TokenBudget from Redis cache (fallback: DB)
      const budget = await this.loadTokenBudget(tenant_id);

      // If uncapped (monthly_budget = 0), always allow
      if (budget.monthly_budget_usd === 0) {
        return {
          allowed: true,
          remaining_usd: Infinity,
          utilization_pct: 0,
          warning: null
        };
      }

      // Calculate current spend
      const current_spend = await this.getCurrentMonthSpend(tenant_id);

      // Calculate utilization
      const utilization_pct = (current_spend / budget.monthly_budget_usd) * 100;
      const remaining_usd = budget.monthly_budget_usd - current_spend;

      // Check against hard stop (95%)
      if (utilization_pct >= budget.budget_hard_stop * 100) {
        return {
          allowed: false,
          remaining_usd: Math.max(0, remaining_usd),
          utilization_pct,
          warning: `Budget hard stop reached (${budget.budget_hard_stop * 100}%). AI features disabled until next billing cycle.`
        };
      }

      // Check against alert threshold (80%)
      let warning: string | null = null;
      if (utilization_pct >= budget.budget_alert_threshold * 100) {
        warning = `Budget alert: ${utilization_pct.toFixed(1)}% of monthly budget used (${budget.budget_alert_threshold * 100}% threshold).`;
      }

      return {
        allowed: true,
        remaining_usd: Math.max(0, remaining_usd),
        utilization_pct,
        warning
      };
    } catch (error) {
      console.error('[TokenBudgetManager] Error checking budget:', error);
      // On error, allow but log
      return {
        allowed: true,
        remaining_usd: 0,
        utilization_pct: 0,
        warning: 'Unable to check budget. Proceeding with caution.'
      };
    }
  }

  /**
   * Record AI spend for a tenant
   */
  async recordSpend(
    tenant_id: string,
    amount_usd: number,
    usageRecord: AIUsageRecord
  ): Promise<void> {
    try {
      // Atomic increment in Redis
      const key = `tenant:${tenant_id}:ai_spend`;
      const newSpend = await this.redis.incrbyfloat(key, amount_usd);

      // Set expiry to end of next month
      const now = new Date();
      const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      const ttl = Math.floor((endOfNextMonth.getTime() - now.getTime()) / 1000);
      await this.redis.expire(key, ttl);

      // Write AIUsageRecord to PostgreSQL
      await this.db.query(
        `INSERT INTO foia_ai_usage (
          id, tenant_id, foia_request_id, feature_id, model_used,
          prompt_tokens, completion_tokens, thinking_tokens,
          cost_estimate_usd, latency_ms, cache_hit, batch_api, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
        [
          usageRecord.id,
          usageRecord.tenant_id,
          usageRecord.foia_request_id || null,
          usageRecord.feature_id,
          usageRecord.model_used,
          usageRecord.prompt_tokens,
          usageRecord.completion_tokens,
          usageRecord.thinking_tokens,
          usageRecord.cost_estimate_usd,
          usageRecord.latency_ms,
          usageRecord.cache_hit,
          usageRecord.batch_api
        ]
      );

      // Check if we crossed alert threshold
      const budget = await this.loadTokenBudget(tenant_id);
      if (budget.monthly_budget_usd > 0) {
        const utilization_pct = (Number(newSpend) / budget.monthly_budget_usd) * 100;
        const threshold_pct = budget.budget_alert_threshold * 100;
        const previous_pct = ((Number(newSpend) - amount_usd) / budget.monthly_budget_usd) * 100;

        // If we just crossed the threshold, emit warning event
        if (previous_pct < threshold_pct && utilization_pct >= threshold_pct) {
          await emit({
            id: crypto.randomUUID(),
            tenant_id,
            event_type: 'foia.ai.budget.warning',
            entity_id: tenant_id,
            entity_type: 'token_budget',
            metadata: {
              current_spend_usd: newSpend,
              monthly_budget_usd: budget.monthly_budget_usd,
              utilization_pct,
              threshold_pct
            },
            timestamp: new Date()
          });
        }
      }
    } catch (error) {
      console.error('[TokenBudgetManager] Error recording spend:', error);
      throw error;
    }
  }

  /**
   * Reset monthly budgets (cron: 1st of month)
   */
  async resetMonthlyBudgets(): Promise<void> {
    try {
      console.log('[TokenBudgetManager] Resetting monthly budgets...');

      // Get all tenant IDs
      const result = await this.db.query(
        'SELECT DISTINCT tenant_id FROM foia_token_budgets WHERE monthly_budget_usd > 0'
      );

      for (const row of result.rows) {
        const tenant_id = row.tenant_id;

        // Get current month's total spend
        const spendKey = `tenant:${tenant_id}:ai_spend`;
        const totalSpend = parseFloat(await this.redis.get(spendKey) || '0');

        // Archive to monthly totals table
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1; // 1-12

        await this.db.query(
          `INSERT INTO foia_ai_usage_monthly (tenant_id, year, month, total_spend_usd, created_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (tenant_id, year, month) DO UPDATE
           SET total_spend_usd = $4, updated_at = NOW()`,
          [tenant_id, year, month, totalSpend]
        );

        // Reset Redis counter
        await this.redis.set(spendKey, '0');

        // Update last_reset_at in database
        await this.db.query(
          'UPDATE foia_token_budgets SET last_reset_at = NOW() WHERE tenant_id = $1',
          [tenant_id]
        );
      }

      console.log(`[TokenBudgetManager] Reset ${result.rows.length} tenant budgets`);
    } catch (error) {
      console.error('[TokenBudgetManager] Error resetting monthly budgets:', error);
      throw error;
    }
  }

  /**
   * Load token budget from cache or database
   */
  private async loadTokenBudget(tenant_id: string): Promise<TokenBudget> {
    // Try Redis cache first
    const cacheKey = `tenant:${tenant_id}:token_budget`;
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Fallback to database
    const result = await this.db.query(
      'SELECT * FROM foia_token_budgets WHERE tenant_id = $1',
      [tenant_id]
    );

    let budget: TokenBudget;

    if (result.rows.length === 0) {
      // Create default budget (uncapped)
      budget = {
        tenant_id,
        monthly_budget_usd: 0, // Uncapped
        current_month_spend_usd: 0,
        budget_alert_threshold: 0.80,
        budget_hard_stop: 0.95,
        last_reset_at: new Date()
      };

      await this.db.query(
        `INSERT INTO foia_token_budgets (tenant_id, monthly_budget_usd, current_month_spend_usd,
          budget_alert_threshold, budget_hard_stop, last_reset_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          budget.tenant_id,
          budget.monthly_budget_usd,
          budget.current_month_spend_usd,
          budget.budget_alert_threshold,
          budget.budget_hard_stop
        ]
      );
    } else {
      budget = result.rows[0];
    }

    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(budget));

    return budget;
  }

  /**
   * Get current month's spend from Redis
   */
  private async getCurrentMonthSpend(tenant_id: string): Promise<number> {
    const key = `tenant:${tenant_id}:ai_spend`;
    const spend = await this.redis.get(key);
    return parseFloat(spend || '0');
  }

  /**
   * Update tenant budget settings
   */
  async updateBudget(tenant_id: string, updates: Partial<TokenBudget>): Promise<void> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.monthly_budget_usd !== undefined) {
      fields.push(`monthly_budget_usd = $${paramIndex++}`);
      values.push(updates.monthly_budget_usd);
    }

    if (updates.budget_alert_threshold !== undefined) {
      fields.push(`budget_alert_threshold = $${paramIndex++}`);
      values.push(updates.budget_alert_threshold);
    }

    if (updates.budget_hard_stop !== undefined) {
      fields.push(`budget_hard_stop = $${paramIndex++}`);
      values.push(updates.budget_hard_stop);
    }

    if (fields.length === 0) return;

    values.push(tenant_id);

    await this.db.query(
      `UPDATE foia_token_budgets SET ${fields.join(', ')} WHERE tenant_id = $${paramIndex}`,
      values
    );

    // Invalidate cache
    const cacheKey = `tenant:${tenant_id}:token_budget`;
    await this.redis.del(cacheKey);
  }
}