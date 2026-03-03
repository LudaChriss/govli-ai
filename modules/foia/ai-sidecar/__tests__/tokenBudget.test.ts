/**
 * Token Budget Manager Tests
 * Tests for budget checking, model routing, caching, and cost estimation
 */

// @ts-ignore - redis-mock doesn't have types
import RedisMock from 'redis-mock';
import { Pool } from 'pg';
import { TokenBudgetManager } from '../src/tokenBudgetManager';
import { ModelRouter } from '../src/modelRouter';
import { PromptCache } from '../src/promptCache';
import { CostTracker } from '../src/costTracker';
import { ComplexityScorer } from '../src/complexityScorer';
import Anthropic from '@anthropic-ai/sdk';

// Mock dependencies
jest.mock('pg');
jest.mock('@anthropic-ai/sdk');

describe('TokenBudgetManager', () => {
  let redis: any;
  let db: any;
  let budgetManager: TokenBudgetManager;

  beforeEach(() => {
    redis = RedisMock.createClient();
    db = {
      query: jest.fn()
    } as any;
    budgetManager = new TokenBudgetManager(redis, db);
  });

  afterEach(() => {
    redis.end(true);
  });

  describe('Budget Checking', () => {
    it('should allow requests when budget is uncapped', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          tenant_id: 'tenant-1',
          monthly_budget_usd: 0, // Uncapped
          current_month_spend_usd: 0,
          budget_alert_threshold: 0.80,
          budget_hard_stop: 0.95,
          last_reset_at: new Date()
        }]
      });

      const status = await budgetManager.checkBudget('tenant-1');

      expect(status.allowed).toBe(true);
      expect(status.remaining_usd).toBe(Infinity);
      expect(status.utilization_pct).toBe(0);
    });

    it('should allow requests when under budget', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          tenant_id: 'tenant-1',
          monthly_budget_usd: 1000,
          current_month_spend_usd: 0,
          budget_alert_threshold: 0.80,
          budget_hard_stop: 0.95,
          last_reset_at: new Date()
        }]
      });

      redis.set('tenant:tenant-1:ai_spend', '500');

      const status = await budgetManager.checkBudget('tenant-1');

      expect(status.allowed).toBe(true);
      expect(status.remaining_usd).toBe(500);
      expect(status.utilization_pct).toBe(50);
      expect(status.warning).toBeNull();
    });

    it('should warn when approaching budget threshold (80%)', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          tenant_id: 'tenant-1',
          monthly_budget_usd: 1000,
          current_month_spend_usd: 0,
          budget_alert_threshold: 0.80,
          budget_hard_stop: 0.95,
          last_reset_at: new Date()
        }]
      });

      redis.set('tenant:tenant-1:ai_spend', '850');

      const status = await budgetManager.checkBudget('tenant-1');

      expect(status.allowed).toBe(true);
      expect(status.utilization_pct).toBe(85);
      expect(status.warning).toContain('Budget alert');
    });

    it('should block requests at hard stop (95%)', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          tenant_id: 'tenant-1',
          monthly_budget_usd: 1000,
          current_month_spend_usd: 0,
          budget_alert_threshold: 0.80,
          budget_hard_stop: 0.95,
          last_reset_at: new Date()
        }]
      });

      redis.set('tenant:tenant-1:ai_spend', '960');

      const status = await budgetManager.checkBudget('tenant-1');

      expect(status.allowed).toBe(false);
      expect(status.warning).toContain('Budget hard stop reached');
    });
  });

  describe('Spend Recording', () => {
    it('should record spend and increment Redis counter', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          tenant_id: 'tenant-1',
          monthly_budget_usd: 1000,
          budget_alert_threshold: 0.80,
          budget_hard_stop: 0.95
        }]
      });

      const usageRecord = {
        id: 'usage-1',
        tenant_id: 'tenant-1',
        foia_request_id: 'request-1',
        feature_id: 'AI-2',
        model_used: 'claude-3-5-sonnet-20250122',
        prompt_tokens: 1000,
        completion_tokens: 500,
        thinking_tokens: 0,
        cost_estimate_usd: 0.0105,
        latency_ms: 1500,
        cache_hit: false,
        batch_api: false,
        created_at: new Date()
      };

      await budgetManager.recordSpend('tenant-1', 0.0105, usageRecord);

      // Verify Redis increment
      const spend = await redis.get('tenant:tenant-1:ai_spend');
      expect(parseFloat(spend)).toBeCloseTo(0.0105, 4);

      // Verify database insert
      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO foia_ai_usage'),
        expect.arrayContaining(['usage-1', 'tenant-1', 'request-1'])
      );
    });
  });
});

describe('ModelRouter', () => {
  let redis: any;
  let db: any;
  let router: ModelRouter;

  beforeEach(() => {
    redis = RedisMock.createClient();
    db = {
      query: jest.fn()
    } as any;
    router = new ModelRouter(redis, db);
  });

  afterEach(() => {
    redis.end(true);
  });

  describe('Model Selection', () => {
    it('should select Haiku for low complexity (0-29)', async () => {
      db.query.mockResolvedValue({ rows: [] }); // No tenant override

      const selection = await router.selectModel('tenant-1', 25, 'AI-6');

      expect(selection.model_name).toBe('claude-3-5-haiku-20250122');
      expect(selection.thinking_budget).toBe(5000);
      expect(selection.reason).toContain('Low complexity');
    });

    it('should select Sonnet for medium complexity (30-69)', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const selection = await router.selectModel('tenant-1', 50, 'AI-1');

      expect(selection.model_name).toBe('claude-3-5-sonnet-20250122');
      expect(selection.thinking_budget).toBe(10000);
      expect(selection.reason).toContain('Medium complexity');
    });

    it('should select Opus for high complexity (70-89)', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const selection = await router.selectModel('tenant-1', 80, 'AI-2');

      expect(selection.model_name).toBe('claude-3-7-opus-20250219');
      expect(selection.thinking_budget).toBe(15000);
      expect(selection.reason).toContain('High complexity');
    });

    it('should select Opus with extended thinking for critical complexity (90+)', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const selection = await router.selectModel('tenant-1', 95, 'AI-4');

      expect(selection.model_name).toBe('claude-3-7-opus-20250219');
      expect(selection.thinking_budget).toBe(30000); // Doubled for critical
      expect(selection.reason).toContain('Critical complexity');
    });

    it('should override with Opus for Vaughn Index (AI-5)', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const selection = await router.selectModel('tenant-1', 10, 'AI-5');

      expect(selection.model_name).toBe('claude-3-7-opus-20250219');
      expect(selection.reason).toContain('AI-5');
    });

    it('should override with Haiku for Deflection (AI-12)', async () => {
      db.query.mockResolvedValue({ rows: [] });

      const selection = await router.selectModel('tenant-1', 80, 'AI-12');

      expect(selection.model_name).toBe('claude-3-5-haiku-20250122');
      expect(selection.reason).toContain('AI-12');
    });
  });
});

describe('PromptCache', () => {
  let redis: any;
  let db: any;
  let cache: PromptCache;

  beforeEach(() => {
    redis = RedisMock.createClient();
    db = {
      query: jest.fn()
    } as any;
    cache = new PromptCache(redis, db);
  });

  afterEach(() => {
    redis.end(true);
  });

  describe('Jurisdiction Caching', () => {
    it('should cache miss on first request and fetch from database', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          foia_statute_text: 'State FOIA statute...',
          exemptions_text: 'Exemption (a): ...',
          procedures_text: 'Requests must be submitted...'
        }]
      });

      const result = await cache.getJurisdictionPrompt('jurisdiction-1');

      expect(result.cache_hit).toBe(false);
      expect(result.content).toContain('FOIA Jurisdiction Context');
      expect(result.content).toContain('State FOIA statute');
    });

    it('should cache hit on subsequent requests', async () => {
      db.query.mockResolvedValueOnce({
        rows: [{
          foia_statute_text: 'State FOIA statute...',
          exemptions_text: 'Exemption (a): ...',
          procedures_text: 'Requests must be submitted...'
        }]
      });

      // First request - miss
      await cache.getJurisdictionPrompt('jurisdiction-1');

      // Second request - hit
      const result = await cache.getJurisdictionPrompt('jurisdiction-1');

      expect(result.cache_hit).toBe(true);
      expect(db.query).toHaveBeenCalledTimes(1); // Only called once
    });
  });

  describe('Cache Statistics', () => {
    it('should track cache hits and misses', async () => {
      db.query.mockResolvedValue({ rows: [{ foia_statute_text: 'Test' }] });

      // Generate hits and misses
      await cache.getJurisdictionPrompt('j1'); // Miss
      await cache.getJurisdictionPrompt('j1'); // Hit
      await cache.getJurisdictionPrompt('j1'); // Hit
      await cache.getJurisdictionPrompt('j2'); // Miss

      const stats = await cache.getStats();

      expect(stats.total_hits).toBe(2);
      expect(stats.total_misses).toBe(2);
      expect(stats.hit_rate).toBe(50);
    });
  });
});

describe('CostTracker', () => {
  let router: ModelRouter;
  let tracker: CostTracker;

  beforeEach(() => {
    const redis = RedisMock.createClient();
    const db = { query: jest.fn() } as any;
    router = new ModelRouter(redis, db);
    tracker = new CostTracker(router);
    redis.end(true);
  });

  describe('Cost Estimation', () => {
    it('should calculate cost for Haiku model', () => {
      const mockResponse = {
        usage: {
          input_tokens: 1000,
          output_tokens: 500
        }
      } as Anthropic.Message;

      const estimate = tracker.estimateCost(
        'claude-3-5-haiku-20250122',
        mockResponse,
        false,
        false
      );

      expect(estimate.input_tokens).toBe(1000);
      expect(estimate.output_tokens).toBe(500);
      expect(estimate.total_cost_usd).toBeCloseTo(0.0028, 4); // (1000/1000 * 0.0008) + (500/1000 * 0.004)
    });

    it('should apply batch discount when enabled', () => {
      const mockResponse = {
        usage: {
          input_tokens: 1000,
          output_tokens: 500
        }
      } as Anthropic.Message;

      const estimate = tracker.estimateCost(
        'claude-3-5-sonnet-20250122',
        mockResponse,
        false,
        true // batch API
      );

      const baseCost = 0.0105; // (1000/1000 * 0.003) + (500/1000 * 0.015)
      expect(estimate.total_cost_usd).toBeCloseTo(baseCost * 0.5, 4);
      expect(estimate.batch_discount_applied).toBe(true);
      expect(estimate.batch_discount_amount_usd).toBeCloseTo(baseCost * 0.5, 4);
    });

    it('should account for cache read tokens', () => {
      const mockResponse = {
        usage: {
          input_tokens: 2000,
          output_tokens: 500,
          cache_read_input_tokens: 1500
        } as any
      } as Anthropic.Message;

      const estimate = tracker.estimateCost(
        'claude-3-5-sonnet-20250122',
        mockResponse,
        true,
        false
      );

      // Regular input: 500 tokens at 0.003/1k
      // Cache read: 1500 tokens at 0.0003/1k
      // Output: 500 tokens at 0.015/1k
      const expectedCost = (500/1000 * 0.003) + (1500/1000 * 0.0003) + (500/1000 * 0.015);
      expect(estimate.total_cost_usd).toBeCloseTo(expectedCost, 4);
    });
  });

  describe('Savings Calculations', () => {
    it('should calculate batch savings correctly', () => {
      const savings = tracker.calculateBatchSavings(1.00);

      expect(savings.regular_cost).toBe(1.00);
      expect(savings.batch_cost).toBe(0.50);
      expect(savings.savings).toBe(0.50);
      expect(savings.savings_percentage).toBe(50);
    });

    it('should calculate cache savings correctly', () => {
      const savings = tracker.calculateCacheSavings(
        'claude-3-5-sonnet-20250122',
        2000, // total input tokens
        1500  // cached tokens
      );

      // Without cache: 2000 tokens * 0.003 = 0.006
      // With cache: 500 * 0.003 + 1500 * 0.0003 = 0.0015 + 0.00045 = 0.00195
      expect(savings.without_cache_cost).toBeCloseTo(0.006, 4);
      expect(savings.with_cache_cost).toBeCloseTo(0.00195, 4);
      expect(savings.savings).toBeCloseTo(0.00405, 4);
    });
  });
});

describe('ComplexityScorer', () => {
  let scorer: ComplexityScorer;

  beforeEach(() => {
    scorer = new ComplexityScorer();
  });

  describe('Complexity Scoring', () => {
    it('should score simple requests as low complexity', () => {
      const result = scorer.calculateScore({
        request_text_length: 50,
        document_count: 0,
        has_legal_citations: false,
        requires_legal_analysis: false,
        has_multiple_exemptions: false,
        is_urgent: false,
        feature_id: 'AI-6',
        estimated_analysis_depth: 'simple'
      });

      expect(result.total_score).toBeLessThan(30);
      expect(result.recommended_model_tier).toBe('low');
    });

    it('should score document review with many documents as high complexity', () => {
      const result = scorer.scoreDocumentReview(75, true, true);

      expect(result.total_score).toBeGreaterThanOrEqual(70);
      expect(result.recommended_model_tier).toBe('high');
    });

    it('should score Vaughn Index as critical complexity', () => {
      const result = scorer.scoreVaughnIndex(50, 3);

      expect(result.total_score).toBeGreaterThanOrEqual(90);
      expect(result.recommended_model_tier).toBe('critical');
    });

    it('should apply feature-specific bonuses correctly', () => {
      // AI-5 (Vaughn) gets +20 points
      const vaughnScore = scorer.quickScore('AI-5', 0, false);

      // AI-12 (Deflection) gets -10 points
      const deflectionScore = scorer.quickScore('AI-12', 0, false);

      expect(vaughnScore).toBeGreaterThan(deflectionScore);
      expect(deflectionScore).toBeLessThan(30); // Should be low tier
    });

    it('should score redaction complexity correctly', () => {
      const simpleRedaction = scorer.scoreRedaction(5, 'simple');
      const complexRedaction = scorer.scoreRedaction(5, 'complex');

      expect(complexRedaction.total_score).toBeGreaterThan(simpleRedaction.total_score);
      expect(complexRedaction.recommended_model_tier).toBe('critical');
    });
  });
});
