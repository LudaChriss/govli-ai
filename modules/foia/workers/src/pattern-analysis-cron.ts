/**
 * AI-3: Pattern Analysis Cron Job
 * Runs nightly at 2am to analyze request patterns
 */

import { Pool } from 'pg';
import { PatternService } from '../../ai-features/patterns/src/services/patternService';
import cron from 'node-cron';

interface CronConfig {
  schedule: string; // Cron expression
  enabled: boolean;
  tenantIds?: string[]; // If empty, run for all tenants
}

const DEFAULT_CONFIG: CronConfig = {
  schedule: '0 2 * * *', // 2am daily
  enabled: true
};

export class PatternAnalysisCron {
  private db: Pool;
  private config: CronConfig;
  private patternService: PatternService;
  private cronJob: cron.ScheduledTask | null = null;

  constructor(db: Pool, config: Partial<CronConfig> = {}) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.patternService = new PatternService(db);
  }

  /**
   * Start the cron job
   */
  start(): void {
    if (!this.config.enabled) {
      console.log('[PatternAnalysisCron] Cron job is disabled');
      return;
    }

    if (this.cronJob) {
      console.warn('[PatternAnalysisCron] Cron job is already running');
      return;
    }

    console.log(`[PatternAnalysisCron] Starting cron job with schedule: ${this.config.schedule}`);

    this.cronJob = cron.schedule(this.config.schedule, async () => {
      await this.runAnalysis();
    });

    console.log('[PatternAnalysisCron] Cron job started successfully');
  }

  /**
   * Stop the cron job
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[PatternAnalysisCron] Cron job stopped');
    }
  }

  /**
   * Run pattern analysis for all or specified tenants
   */
  async runAnalysis(): Promise<void> {
    console.log('[PatternAnalysisCron] Starting pattern analysis job');
    const startTime = Date.now();

    try {
      // Get list of tenants to process
      const tenantIds = await this.getTenants();

      if (tenantIds.length === 0) {
        console.log('[PatternAnalysisCron] No tenants to process');
        return;
      }

      console.log(`[PatternAnalysisCron] Processing ${tenantIds.length} tenants`);

      // Process each tenant
      for (const tenantId of tenantIds) {
        try {
          console.log(`[PatternAnalysisCron] Analyzing patterns for tenant: ${tenantId}`);

          const result = await this.patternService.analyzePatterns(tenantId, {
            lookback_months: 24,
            min_cluster_size: 3
          });

          console.log(
            `[PatternAnalysisCron] Tenant ${tenantId}: ` +
            `${result.patterns_identified} patterns identified, ` +
            `status: ${result.status}`
          );
        } catch (error: any) {
          console.error(
            `[PatternAnalysisCron] Failed to analyze patterns for tenant ${tenantId}:`,
            error.message
          );
          // Continue with other tenants even if one fails
        }
      }

      const duration = Date.now() - startTime;
      console.log(
        `[PatternAnalysisCron] Completed pattern analysis for all tenants in ${duration}ms`
      );
    } catch (error: any) {
      console.error('[PatternAnalysisCron] Fatal error in pattern analysis:', error);
    }
  }

  /**
   * Get list of tenant IDs to process
   */
  private async getTenants(): Promise<string[]> {
    // If specific tenants are configured, use those
    if (this.config.tenantIds && this.config.tenantIds.length > 0) {
      return this.config.tenantIds;
    }

    // Otherwise, get all active tenants from database
    // This query should be adjusted based on your actual tenant table structure
    const result = await this.db.query(`
      SELECT DISTINCT tenant_id
      FROM "FoiaRequests"
      WHERE "createdAt" >= NOW() - INTERVAL '6 months'
      ORDER BY tenant_id
    `);

    return result.rows.map(row => row.tenant_id);
  }

  /**
   * Manually trigger analysis (for testing or admin actions)
   */
  async triggerManual(tenantId?: string): Promise<void> {
    console.log('[PatternAnalysisCron] Manual trigger initiated');

    if (tenantId) {
      // Run for specific tenant
      await this.patternService.analyzePatterns(tenantId, {
        lookback_months: 24,
        min_cluster_size: 3
      });
    } else {
      // Run for all tenants
      await this.runAnalysis();
    }
  }
}

/**
 * Singleton instance for use across the application
 */
let cronInstance: PatternAnalysisCron | null = null;

export function initPatternAnalysisCron(
  db: Pool,
  config?: Partial<CronConfig>
): PatternAnalysisCron {
  if (!cronInstance) {
    cronInstance = new PatternAnalysisCron(db, config);
  }
  return cronInstance;
}

export function getPatternAnalysisCron(): PatternAnalysisCron {
  if (!cronInstance) {
    throw new Error('Pattern analysis cron not initialized');
  }
  return cronInstance;
}
