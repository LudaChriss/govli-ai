/**
 * Govli AI FOIA Module - Cost Tracker
 * Precise cost estimation with per-token pricing
 */

import Anthropic from '@anthropic-ai/sdk';
import { ModelRouter } from './modelRouter';

/**
 * Cost Estimate Result
 */
export interface CostEstimate {
  input_tokens: number;
  output_tokens: number;
  thinking_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  cost_input_usd: number;
  cost_output_usd: number;
  cost_thinking_usd: number;
  cost_cache_write_usd: number;
  cost_cache_read_usd: number;
  total_cost_usd: number;
  batch_discount_applied: boolean;
  batch_discount_amount_usd?: number;
}

/**
 * Cost Breakdown by Category
 */
export interface CostBreakdown {
  base_cost_usd: number;
  cache_savings_usd: number;
  batch_savings_usd: number;
  net_cost_usd: number;
  savings_percentage: number;
}

/**
 * Cost Tracker
 */
export class CostTracker {
  private modelRouter: ModelRouter;

  // Batch API discount
  private static readonly BATCH_DISCOUNT = 0.50; // 50% off

  constructor(modelRouter: ModelRouter) {
    this.modelRouter = modelRouter;
  }

  /**
   * Estimate cost from Anthropic API response
   */
  estimateCost(
    model_name: string,
    response: Anthropic.Message,
    cache_hit: boolean = false,
    batch_api: boolean = false
  ): CostEstimate {
    const config = this.modelRouter.getModelConfig(model_name);

    if (!config) {
      throw new Error(`Unknown model: ${model_name}`);
    }

    // Extract token counts from usage
    const usage = response.usage;
    const input_tokens = usage.input_tokens || 0;
    const output_tokens = usage.output_tokens || 0;

    // Extract cache-specific tokens (if available)
    const cache_creation_input_tokens = (usage as any).cache_creation_input_tokens || 0;
    const cache_read_input_tokens = (usage as any).cache_read_input_tokens || 0;

    // Extract thinking tokens (extended thinking)
    const thinking_tokens = (usage as any).thinking_tokens || 0;

    // Calculate base token counts (non-cached input)
    const regular_input_tokens = input_tokens - cache_creation_input_tokens - cache_read_input_tokens;

    // Calculate costs
    const cost_input_usd = (regular_input_tokens / 1000) * config.cost_per_1k_input;
    const cost_output_usd = (output_tokens / 1000) * config.cost_per_1k_output;
    const cost_thinking_usd = (thinking_tokens / 1000) * config.cost_per_1k_output; // Thinking uses output pricing
    const cost_cache_write_usd = (cache_creation_input_tokens / 1000) * config.cost_per_1k_cache_write;
    const cost_cache_read_usd = (cache_read_input_tokens / 1000) * config.cost_per_1k_cache_read;

    // Total cost before discounts
    let total_cost_usd = cost_input_usd + cost_output_usd + cost_thinking_usd + cost_cache_write_usd + cost_cache_read_usd;

    // Apply batch discount if applicable
    let batch_discount_amount_usd: number | undefined;
    if (batch_api) {
      batch_discount_amount_usd = total_cost_usd * CostTracker.BATCH_DISCOUNT;
      total_cost_usd *= (1 - CostTracker.BATCH_DISCOUNT);
    }

    return {
      input_tokens: regular_input_tokens,
      output_tokens,
      thinking_tokens,
      cache_write_tokens: cache_creation_input_tokens,
      cache_read_tokens: cache_read_input_tokens,
      cost_input_usd,
      cost_output_usd,
      cost_thinking_usd,
      cost_cache_write_usd,
      cost_cache_read_usd,
      total_cost_usd,
      batch_discount_applied: batch_api,
      batch_discount_amount_usd
    };
  }

  /**
   * Calculate cost breakdown with savings
   */
  calculateBreakdown(estimate: CostEstimate): CostBreakdown {
    // Base cost (what it would cost without any optimizations)
    const base_cost_usd = estimate.cost_input_usd + estimate.cost_output_usd + estimate.cost_thinking_usd;

    // Cache savings (difference between cache write/read and full input cost)
    const full_input_cost = ((estimate.input_tokens + estimate.cache_write_tokens + estimate.cache_read_tokens) / 1000) *
      (estimate.cost_input_usd / (estimate.input_tokens / 1000));
    const cache_savings_usd = full_input_cost - (estimate.cost_input_usd + estimate.cost_cache_write_usd + estimate.cost_cache_read_usd);

    // Batch savings
    const batch_savings_usd = estimate.batch_discount_amount_usd || 0;

    // Net cost
    const net_cost_usd = estimate.total_cost_usd;

    // Total savings percentage
    const total_savings = cache_savings_usd + batch_savings_usd;
    const savings_percentage = base_cost_usd > 0 ? (total_savings / base_cost_usd) * 100 : 0;

    return {
      base_cost_usd,
      cache_savings_usd,
      batch_savings_usd,
      net_cost_usd,
      savings_percentage
    };
  }

  /**
   * Estimate cost before making API call (for budget checking)
   */
  estimatePreCallCost(
    model_name: string,
    estimated_input_tokens: number,
    estimated_output_tokens: number,
    thinking_budget?: number,
    cache_hit: boolean = false,
    batch_api: boolean = false
  ): number {
    const config = this.modelRouter.getModelConfig(model_name);

    if (!config) {
      throw new Error(`Unknown model: ${model_name}`);
    }

    // Calculate base costs
    let input_cost = (estimated_input_tokens / 1000) * config.cost_per_1k_input;
    let output_cost = (estimated_output_tokens / 1000) * config.cost_per_1k_output;
    let thinking_cost = 0;

    // Add thinking cost if budget specified
    if (thinking_budget) {
      thinking_cost = (thinking_budget / 1000) * config.cost_per_1k_output;
    }

    // Apply cache discount to input if cache hit expected
    if (cache_hit) {
      // Assume 90% of input is cached (conservative estimate)
      const cached_portion = estimated_input_tokens * 0.9;
      const uncached_portion = estimated_input_tokens * 0.1;

      input_cost = (uncached_portion / 1000) * config.cost_per_1k_input +
                   (cached_portion / 1000) * config.cost_per_1k_cache_read;
    }

    let total_cost = input_cost + output_cost + thinking_cost;

    // Apply batch discount if applicable
    if (batch_api) {
      total_cost *= (1 - CostTracker.BATCH_DISCOUNT);
    }

    return total_cost;
  }

  /**
   * Get cost per token for a specific model and token type
   */
  getCostPerToken(
    model_name: string,
    token_type: 'input' | 'output' | 'cache_write' | 'cache_read'
  ): number {
    const config = this.modelRouter.getModelConfig(model_name);

    if (!config) {
      throw new Error(`Unknown model: ${model_name}`);
    }

    switch (token_type) {
      case 'input':
        return config.cost_per_1k_input / 1000;
      case 'output':
        return config.cost_per_1k_output / 1000;
      case 'cache_write':
        return config.cost_per_1k_cache_write / 1000;
      case 'cache_read':
        return config.cost_per_1k_cache_read / 1000;
      default:
        throw new Error(`Unknown token type: ${token_type}`);
    }
  }

  /**
   * Calculate potential savings from using batch API
   */
  calculateBatchSavings(estimated_cost_usd: number): {
    regular_cost: number;
    batch_cost: number;
    savings: number;
    savings_percentage: number;
  } {
    const batch_cost = estimated_cost_usd * (1 - CostTracker.BATCH_DISCOUNT);
    const savings = estimated_cost_usd - batch_cost;
    const savings_percentage = CostTracker.BATCH_DISCOUNT * 100;

    return {
      regular_cost: estimated_cost_usd,
      batch_cost,
      savings,
      savings_percentage
    };
  }

  /**
   * Calculate potential savings from prompt caching
   */
  calculateCacheSavings(
    model_name: string,
    total_input_tokens: number,
    cached_tokens: number
  ): {
    without_cache_cost: number;
    with_cache_cost: number;
    savings: number;
    savings_percentage: number;
  } {
    const config = this.modelRouter.getModelConfig(model_name);

    if (!config) {
      throw new Error(`Unknown model: ${model_name}`);
    }

    const uncached_tokens = total_input_tokens - cached_tokens;

    // Cost without cache (all tokens at full input rate)
    const without_cache_cost = (total_input_tokens / 1000) * config.cost_per_1k_input;

    // Cost with cache (uncached at full rate, cached at read rate)
    // First request writes cache, subsequent reads use cache read rate
    const with_cache_cost = (uncached_tokens / 1000) * config.cost_per_1k_input +
                           (cached_tokens / 1000) * config.cost_per_1k_cache_read;

    const savings = without_cache_cost - with_cache_cost;
    const savings_percentage = without_cache_cost > 0 ? (savings / without_cache_cost) * 100 : 0;

    return {
      without_cache_cost,
      with_cache_cost,
      savings,
      savings_percentage
    };
  }

  /**
   * Format cost estimate for display
   */
  formatCostEstimate(estimate: CostEstimate): string {
    const lines = [
      `Total Cost: $${estimate.total_cost_usd.toFixed(6)}`,
      ``,
      `Token Usage:`,
      `  Input: ${estimate.input_tokens.toLocaleString()} ($${estimate.cost_input_usd.toFixed(6)})`,
      `  Output: ${estimate.output_tokens.toLocaleString()} ($${estimate.cost_output_usd.toFixed(6)})`
    ];

    if (estimate.thinking_tokens > 0) {
      lines.push(`  Thinking: ${estimate.thinking_tokens.toLocaleString()} ($${estimate.cost_thinking_usd.toFixed(6)})`);
    }

    if (estimate.cache_write_tokens > 0) {
      lines.push(`  Cache Write: ${estimate.cache_write_tokens.toLocaleString()} ($${estimate.cost_cache_write_usd.toFixed(6)})`);
    }

    if (estimate.cache_read_tokens > 0) {
      lines.push(`  Cache Read: ${estimate.cache_read_tokens.toLocaleString()} ($${estimate.cost_cache_read_usd.toFixed(6)})`);
    }

    if (estimate.batch_discount_applied) {
      lines.push(``, `Batch Discount: -$${estimate.batch_discount_amount_usd!.toFixed(6)} (50%)`);
    }

    return lines.join('\n');
  }
}
