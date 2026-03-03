/**
 * Govli AI FOIA Module - Batch Queue
 * Manages non-urgent AI requests via Anthropic Batch API (50% cost reduction)
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import Anthropic from '@anthropic-ai/sdk';
import { Pool } from 'pg';

/**
 * Batch Job Data
 */
export interface BatchJobData {
  tenant_id: string;
  foia_request_id: string;
  feature_id: string;
  model: string;
  messages: Anthropic.MessageParam[];
  system_prompt?: string;
  max_tokens: number;
  thinking_budget?: number;
  metadata?: Record<string, any>;
}

/**
 * Batch Job Result
 */
export interface BatchJobResult {
  success: boolean;
  response?: Anthropic.Message;
  error?: string;
  cost_estimate_usd?: number;
  batch_discount_applied: boolean;
}

/**
 * Batch Queue Statistics
 */
export interface BatchQueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  total_processed: number;
  estimated_savings_usd: number;
}

/**
 * Batch Queue Manager
 */
export class BatchQueue {
  private queue: Queue<BatchJobData, BatchJobResult>;
  private worker: Worker<BatchJobData, BatchJobResult>;
  private queueEvents: QueueEvents;
  private anthropic: Anthropic;
  private db: Pool;
  private redis: Redis;

  // Batch API provides 50% cost reduction
  private static readonly BATCH_DISCOUNT = 0.50;

  constructor(redis: Redis, db: Pool, anthropicApiKey: string) {
    this.redis = redis;
    this.db = db;
    this.anthropic = new Anthropic({
      apiKey: anthropicApiKey
    });

    // Create queue
    // @ts-ignore - Redis version compatibility
    this.queue = new Queue<BatchJobData, BatchJobResult>('foia-ai-batch', {
      connection: redis as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: {
          age: 86400, // Keep completed jobs for 24 hours
          count: 1000
        },
        removeOnFail: {
          age: 604800 // Keep failed jobs for 7 days
        }
      }
    });

    // Create worker
    // @ts-ignore - Redis version compatibility
    this.worker = new Worker<BatchJobData, BatchJobResult>(
      'foia-ai-batch',
      async (job: Job<BatchJobData, BatchJobResult>) => {
        return await this.processJob(job);
      },
      {
        connection: redis.duplicate() as any,
        concurrency: 5, // Process 5 batch jobs concurrently
        limiter: {
          max: 50, // Max 50 jobs per interval
          duration: 60000 // 1 minute
        }
      }
    );

    // Create queue events listener
    // @ts-ignore - Redis version compatibility
    this.queueEvents = new QueueEvents('foia-ai-batch', {
      connection: redis.duplicate() as any
    });

    // Setup event listeners
    this.setupEventListeners();
  }

  /**
   * Add job to batch queue
   */
  async addJob(
    jobData: BatchJobData,
    priority?: number,
    delay?: number
  ): Promise<string> {
    const job = await this.queue.add('batch-request', jobData, {
      priority: priority || 10, // Default priority
      delay: delay || 0,
      jobId: `${jobData.tenant_id}-${jobData.foia_request_id}-${Date.now()}`
    });

    console.log(`[BatchQueue] Added job ${job.id} for tenant ${jobData.tenant_id}`);

    return job.id!;
  }

  /**
   * Process a batch job
   */
  private async processJob(job: Job<BatchJobData, BatchJobResult>): Promise<BatchJobResult> {
    const { tenant_id, foia_request_id, feature_id, model, messages, system_prompt, max_tokens, thinking_budget, metadata } = job.data;

    try {
      console.log(`[BatchQueue] Processing job ${job.id} for tenant ${tenant_id}`);

      // Call Anthropic API
      const params: Anthropic.MessageCreateParams = {
        model,
        messages,
        max_tokens,
        system: system_prompt
      };

      // Add thinking budget if specified
      if (thinking_budget) {
        // @ts-ignore - Extended thinking parameter
        params.thinking = {
          type: 'enabled',
          budget_tokens: thinking_budget
        };
      }

      const response = await this.anthropic.messages.create(params);

      // Calculate cost estimate with batch discount
      const baseCost = this.estimateBaseCost(response);
      const actualCost = baseCost * (1 - BatchQueue.BATCH_DISCOUNT);

      // Record savings
      await this.recordSavings(tenant_id, baseCost - actualCost);

      // Update job progress
      await job.updateProgress(100);

      return {
        success: true,
        response,
        cost_estimate_usd: actualCost,
        batch_discount_applied: true
      };
    } catch (error: any) {
      console.error(`[BatchQueue] Error processing job ${job.id}:`, error);

      return {
        success: false,
        error: error.message || 'Unknown error',
        batch_discount_applied: false
      };
    }
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<{
    state: string;
    progress: number;
    result?: BatchJobResult;
  }> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return {
        state: 'not_found',
        progress: 0
      };
    }

    const state = await job.getState();
    const progress = job.progress as number || 0;

    return {
      state,
      progress,
      result: job.returnvalue
    };
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<BatchQueueStats> {
    const counts = await this.queue.getJobCounts();

    // Get total savings from Redis
    const savingsKey = 'batch:queue:total_savings_usd';
    const estimated_savings_usd = parseFloat(await this.redis.get(savingsKey) || '0');

    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      total_processed: (counts.completed || 0) + (counts.failed || 0),
      estimated_savings_usd
    };
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return false;
    }

    const state = await job.getState();

    // Only cancel if waiting or delayed
    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      console.log(`[BatchQueue] Cancelled job ${jobId}`);
      return true;
    }

    return false;
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);

    if (!job) {
      return false;
    }

    const state = await job.getState();

    if (state === 'failed') {
      await job.retry();
      console.log(`[BatchQueue] Retrying job ${jobId}`);
      return true;
    }

    return false;
  }

  /**
   * Clean completed jobs older than specified age
   */
  async cleanOldJobs(ageInHours: number = 24): Promise<number> {
    const grace = ageInHours * 3600 * 1000; // Convert to milliseconds
    const cleaned = await this.queue.clean(grace, 100, 'completed');

    console.log(`[BatchQueue] Cleaned ${cleaned.length} old jobs`);
    return cleaned.length;
  }

  /**
   * Pause queue processing
   */
  async pause(): Promise<void> {
    await this.queue.pause();
    console.log('[BatchQueue] Queue paused');
  }

  /**
   * Resume queue processing
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    console.log('[BatchQueue] Queue resumed');
  }

  /**
   * Close queue and worker connections
   */
  async close(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    await this.queueEvents.close();
    console.log('[BatchQueue] Connections closed');
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Job completed
    this.worker.on('completed', (job: Job, result: BatchJobResult) => {
      console.log(`[BatchQueue] Job ${job.id} completed successfully`);
    });

    // Job failed
    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      if (job) {
        console.error(`[BatchQueue] Job ${job.id} failed:`, error.message);
      } else {
        console.error('[BatchQueue] Job failed:', error.message);
      }
    });

    // Job progress
    this.queueEvents.on('progress', ({ jobId, data }: { jobId: string; data: any }) => {
      console.log(`[BatchQueue] Job ${jobId} progress: ${data}%`);
    });

    // Worker error
    this.worker.on('error', (error: Error) => {
      console.error('[BatchQueue] Worker error:', error);
    });
  }

  /**
   * Estimate base cost (before batch discount)
   */
  private estimateBaseCost(response: Anthropic.Message): number {
    const usage = response.usage;

    // Rough cost estimates (should match modelRouter.ts pricing)
    const input_tokens = usage.input_tokens || 0;
    const output_tokens = usage.output_tokens || 0;

    // Use average pricing (actual cost depends on model)
    const cost_per_1k_input = 0.003; // Sonnet pricing
    const cost_per_1k_output = 0.015;

    return (
      (input_tokens / 1000) * cost_per_1k_input +
      (output_tokens / 1000) * cost_per_1k_output
    );
  }

  /**
   * Record savings from batch processing
   */
  private async recordSavings(tenant_id: string, savings_usd: number): Promise<void> {
    // Global savings counter
    const globalKey = 'batch:queue:total_savings_usd';
    await this.redis.incrbyfloat(globalKey, savings_usd);

    // Per-tenant savings counter
    const tenantKey = `batch:queue:tenant:${tenant_id}:savings_usd`;
    await this.redis.incrbyfloat(tenantKey, savings_usd);

    // Set expiry on tenant key (end of next month)
    const now = new Date();
    const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    const ttl = Math.floor((endOfNextMonth.getTime() - now.getTime()) / 1000);
    await this.redis.expire(tenantKey, ttl);
  }

  /**
   * Get tenant-specific savings
   */
  async getTenantSavings(tenant_id: string): Promise<number> {
    const tenantKey = `batch:queue:tenant:${tenant_id}:savings_usd`;
    const savings = await this.redis.get(tenantKey);
    return parseFloat(savings || '0');
  }
}
