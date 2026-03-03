/**
 * Govli AI FOIA Module - Centralized AI Client
 * Anthropic API wrapper with retry, audit, and budget management
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AIUsageRecord, ComplexityScore } from './types';

interface AICallParams {
  model?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  thinkingBudget?: number;
  systemPrompt?: string;
}

interface AICallResult {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens?: number;
    cacheHit: boolean;
  };
  model: string;
  latencyMs: number;
}

interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  timeoutMs: 30000
};

// Model pricing (per million tokens)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 },
  'claude-opus-4-20250514': { input: 15.00, output: 75.00 }
};

/**
 * Centralized Anthropic AI Client for FOIA Module
 * All AI features must use this client - never instantiate Anthropic directly
 */
export class FoiaAIClient {
  private anthropic: Anthropic;
  private retryOptions: RetryOptions;
  private tokenBudgetManager?: any; // Will be injected
  private costTracker?: any; // Will be injected
  private promptCache?: any; // Will be injected
  private modelRouter?: any; // Will be injected
  private complexityScorer?: any; // Will be injected

  constructor(apiKey?: string, options?: Partial<RetryOptions>) {
    this.anthropic = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY
    });
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  }

  /**
   * Inject external dependencies (for budget and cost tracking)
   */
  setTokenBudgetManager(manager: any): void {
    this.tokenBudgetManager = manager;
  }

  setCostTracker(tracker: any): void {
    this.costTracker = tracker;
  }

  setPromptCache(cache: any): void {
    this.promptCache = cache;
  }

  setModelRouter(router: any): void {
    this.modelRouter = router;
  }

  setComplexityScorer(scorer: any): void {
    this.complexityScorer = scorer;
  }

  /**
   * Main AI call method with automatic audit, retry, and budget checks
   */
  async callWithAudit(
    params: AICallParams,
    featureId: string,
    tenantId: string,
    foiaRequestId?: string,
    complexityScore?: ComplexityScore
  ): Promise<AICallResult> {
    // 1. Check token budget
    if (this.tokenBudgetManager) {
      const budgetStatus = await this.tokenBudgetManager.checkBudget(tenantId);
      if (!budgetStatus.allowed) {
        throw new Error(budgetStatus.warning || 'Token budget exceeded for tenant');
      }

      // Log warning if approaching limit
      if (budgetStatus.warning) {
        console.warn(`[FoiaAIClient] ${budgetStatus.warning}`);
      }
    }

    // 2. Select appropriate model based on complexity using ModelRouter
    let selectedModel: string;
    let thinkingBudget: number | undefined;

    if (this.modelRouter && complexityScore) {
      const modelSelection = await this.modelRouter.selectModel(
        tenantId,
        complexityScore.score,
        featureId
      );
      selectedModel = modelSelection.model_name;
      thinkingBudget = modelSelection.thinking_budget;
      console.log(`[FoiaAIClient] Model selected: ${selectedModel} (${modelSelection.reason})`);
    } else {
      selectedModel = this.selectModel(params.model, complexityScore);
      thinkingBudget = params.thinkingBudget;
    }

    // 3. Check prompt cache (for jurisdiction-specific content)
    const cacheKey = this.generateCacheKey(params, selectedModel);
    let cacheHit = false;
    let cachedPrefix = '';

    if (this.promptCache) {
      const cached = await this.promptCache.getCustomPrompt(cacheKey);
      if (cached && cached.cache_hit) {
        cacheHit = true;
        cachedPrefix = cached.content;
        console.log('[FoiaAIClient] Cache hit for prompt prefix');
      }
    }

    // 4. Execute AI call with retry logic
    const startTime = Date.now();
    const apiParams = {
      ...params,
      thinkingBudget: thinkingBudget || params.thinkingBudget
    };
    const result = await this.executeWithRetry(apiParams, selectedModel);
    const latencyMs = Date.now() - startTime;

    // 5. Calculate cost using CostTracker
    let costEstimate: number;

    if (this.costTracker) {
      // Create a mock response object for cost estimation
      const mockResponse = {
        usage: {
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens
        }
      } as any;

      const estimate = this.costTracker.estimateCost(
        selectedModel,
        mockResponse,
        cacheHit,
        false // not batch API
      );
      costEstimate = estimate.total_cost_usd;
    } else {
      costEstimate = this.calculateCost(
        result.usage.inputTokens,
        result.usage.outputTokens,
        selectedModel
      );
    }

    // 6. Record usage for audit and spend tracking
    const usageRecord: AIUsageRecord = {
      id: this.generateId(),
      tenant_id: tenantId,
      foia_request_id: foiaRequestId,
      feature_id: featureId,
      model_used: selectedModel,
      prompt_tokens: result.usage.inputTokens,
      completion_tokens: result.usage.outputTokens,
      thinking_tokens: result.usage.thinkingTokens || 0,
      cost_estimate_usd: costEstimate,
      latency_ms: latencyMs,
      cache_hit: cacheHit,
      batch_api: false,
      created_at: new Date()
    };

    // 7. Record spend in TokenBudgetManager
    if (this.tokenBudgetManager) {
      await this.tokenBudgetManager.recordSpend(tenantId, costEstimate, usageRecord);
    }

    // 8. Cache result for future use
    if (this.promptCache && !cacheHit) {
      await this.promptCache.setCustomPrompt(cacheKey, result.content, 3600); // 1 hour TTL
    }

    return { ...result, latencyMs, usage: { ...result.usage, cacheHit } };
  }

  /**
   * Execute AI call with exponential backoff retry
   */
  private async executeWithRetry(
    params: AICallParams,
    model: string
  ): Promise<AICallResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryOptions.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(
          () => controller.abort(),
          this.retryOptions.timeoutMs
        );

        const messages: Anthropic.MessageParam[] = [
          { role: 'user', content: params.prompt }
        ];

        const response = await this.anthropic.messages.create({
          model,
          max_tokens: params.maxTokens || 4096,
          temperature: params.temperature || 1.0,
          messages,
          system: params.systemPrompt,
          // @ts-ignore - Extended thinking budget parameter
          thinking: params.thinkingBudget
            ? { type: 'enabled', budget_tokens: params.thinkingBudget }
            : undefined
        });

        clearTimeout(timeout);

        return {
          content: this.extractContent(response),
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            thinkingTokens: 0, // Will be available in future API versions
            cacheHit: false
          },
          model,
          latencyMs: 0 // Will be set by caller
        };
      } catch (error: any) {
        lastError = error;

        // Don't retry on certain errors
        if (error.status === 400 || error.status === 401) {
          throw error;
        }

        // Calculate backoff delay
        if (attempt < this.retryOptions.maxRetries) {
          const delay = Math.min(
            this.retryOptions.baseDelayMs * Math.pow(2, attempt),
            this.retryOptions.maxDelayMs
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('AI call failed after retries');
  }

  /**
   * Select model based on complexity score and routing config
   */
  private selectModel(
    requestedModel: string | undefined,
    complexityScore?: ComplexityScore
  ): string {
    // If model explicitly requested, use it
    if (requestedModel) {
      return requestedModel;
    }

    // Default model selection based on complexity
    if (!complexityScore) {
      return 'claude-3-5-sonnet-20241022'; // Default to Sonnet
    }

    const score = complexityScore.score;

    if (score < 30) {
      return 'claude-3-5-haiku-20241022'; // Low complexity
    } else if (score < 70) {
      return 'claude-3-5-sonnet-20241022'; // Mid complexity
    } else if (score < 90) {
      return 'claude-3-5-sonnet-20241022'; // High complexity
    } else {
      return 'claude-opus-4-20250514'; // Critical complexity
    }
  }

  /**
   * Calculate cost estimate based on token usage
   */
  private calculateCost(
    inputTokens: number,
    outputTokens: number,
    model: string
  ): number {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-3-5-sonnet-20241022'];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return inputCost + outputCost;
  }

  /**
   * Generate cache key for prompt caching
   */
  private generateCacheKey(params: AICallParams, model: string): string {
    const hash = this.simpleHash(
      JSON.stringify({
        model,
        prompt: params.prompt,
        system: params.systemPrompt
      })
    );
    return `foia:ai:cache:${hash}`;
  }

  /**
   * Extract text content from API response
   */
  private extractContent(response: Anthropic.Message): string {
    const textBlocks = response.content.filter(
      (block): block is Anthropic.TextBlock => block.type === 'text'
    );
    return textBlocks.map(block => block.text).join('\n');
  }

  /**
   * Utility: Sleep for ms
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Utility: Generate unique ID
   */
  private generateId(): string {
    return `ai-usage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Utility: Simple hash function
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }
}

/**
 * Factory function to create FOIA AI client instance
 */
export function createFoiaAIClient(
  apiKey?: string,
  options?: Partial<RetryOptions>
): FoiaAIClient {
  return new FoiaAIClient(apiKey, options);
}

/**
 * Singleton instance for shared usage across features
 */
let sharedClient: FoiaAIClient | null = null;

export function getSharedAIClient(): FoiaAIClient {
  if (!sharedClient) {
    sharedClient = createFoiaAIClient();
  }
  return sharedClient;
}
