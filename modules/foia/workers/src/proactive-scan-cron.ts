/**
 * AI-11: Proactive Disclosure Scan Cron Job
 * Runs weekly on Sunday at 3am to scan for proactive disclosure candidates
 */

import { Pool } from 'pg';
import { ProactiveService } from '../../ai-features/patterns/src/services/proactiveService';
// @ts-ignore
import cron from 'node-cron';

interface CronConfig {
  schedule: string; // Cron expression
  enabled: boolean;
  tenantIds?: string[]; // If empty, run for all tenants
  frequencyThreshold?: number; // Minimum frequency score
}

const DEFAULT_CONFIG: CronConfig = {
  schedule: '0 3 * * 0', // Sunday at 3am
  enabled: true,
  frequencyThreshold: 5 // Default minimum 5 requests in 12 months
};

export class ProactiveScanCron {
  private db: Pool;
  private config: CronConfig;
  private proactiveService: ProactiveService;
  private cronJob: cron.ScheduledTask | null = null;

  constructor(db: Pool, config: Partial<CronConfig> = {}) {
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.proactiveService = new ProactiveService(db);
  }

  /**
   * Start the cron job
   */
  start(): void {
    if (!this.config.enabled) {
      console.log('[ProactiveScanCron] Cron job is disabled');
      return;
    }

    if (this.cronJob) {
      console.warn('[ProactiveScanCron] Cron job is already running');
      return;
    }

    console.log(`[ProactiveScanCron] Starting cron job with schedule: ${this.config.schedule}`);

    this.cronJob = cron.schedule(this.config.schedule, async () => {
      await this.runScan();
    });

    console.log('[ProactiveScanCron] Cron job started successfully');
  }

  /**
   * Stop the cron job
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      console.log('[ProactiveScanCron] Cron job stopped');
    }
  }

  /**
   * Run proactive disclosure scan for all or specified tenants
   */
  async runScan(): Promise<void> {
    console.log('[ProactiveScanCron] Starting proactive disclosure scan');
    const startTime = Date.now();

    try {
      // Get list of tenants to process
      const tenantIds = await this.getTenants();

      if (tenantIds.length === 0) {
        console.log('[ProactiveScanCron] No tenants to process');
        return;
      }

      console.log(`[ProactiveScanCron] Processing ${tenantIds.length} tenants`);

      // Process each tenant
      for (const tenantId of tenantIds) {
        try {
          console.log(`[ProactiveScanCron] Scanning for proactive candidates for tenant: ${tenantId}`);

          const result = await this.proactiveService.scanProactiveCandidates(tenantId, {
            frequency_threshold: this.config.frequencyThreshold,
            lookback_months: 12
          });

          console.log(
            `[ProactiveScanCron] Tenant ${tenantId}: ` +
            `${result.candidates_generated} candidates generated, ` +
            `status: ${result.status}`
          );

          // If candidates were generated, notify supervisor (could be via email or notification system)
          if (result.candidates_generated && result.candidates_generated > 0) {
            await this.notifySupervisor(tenantId, result.candidates_generated);
          }
        } catch (error: any) {
          console.error(
            `[ProactiveScanCron] Failed to scan proactive candidates for tenant ${tenantId}:`,
            error.message
          );
          // Continue with other tenants even if one fails
        }
      }

      const duration = Date.now() - startTime;
      console.log(
        `[ProactiveScanCron] Completed proactive scan for all tenants in ${duration}ms`
      );
    } catch (error: any) {
      console.error('[ProactiveScanCron] Fatal error in proactive scan:', error);
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

    // Otherwise, get all tenants that have pattern clusters
    const result = await this.db.query(`
      SELECT DISTINCT tenant_id
      FROM "FoiaRequestPatterns"
      WHERE request_count_12mo >= $1
      ORDER BY tenant_id
    `, [this.config.frequencyThreshold || 5]);

    return result.rows.map(row => row.tenant_id);
  }

  /**
   * Notify supervisor of new proactive disclosure candidates
   * This is a placeholder - implement actual notification logic here
   */
  private async notifySupervisor(tenantId: string, candidateCount: number): Promise<void> {
    console.log(
      `[ProactiveScanCron] Would notify supervisor for tenant ${tenantId}: ` +
      `${candidateCount} new proactive disclosure candidates pending review`
    );

    // TODO: Implement actual notification
    // Options:
    // - Email notification
    // - In-app notification
    // - Slack/Teams message
    // - Create task in workflow queue
  }

  /**
   * Manually trigger scan (for testing or admin actions)
   */
  async triggerManual(tenantId?: string): Promise<void> {
    console.log('[ProactiveScanCron] Manual trigger initiated');

    if (tenantId) {
      // Run for specific tenant
      await this.proactiveService.scanProactiveCandidates(tenantId, {
        frequency_threshold: this.config.frequencyThreshold,
        lookback_months: 12
      });
    } else {
      // Run for all tenants
      await this.runScan();
    }
  }
}

/**
 * Singleton instance for use across the application
 */
let cronInstance: ProactiveScanCron | null = null;

export function initProactiveScanCron(
  db: Pool,
  config?: Partial<CronConfig>
): ProactiveScanCron {
  if (!cronInstance) {
    cronInstance = new ProactiveScanCron(db, config);
  }
  return cronInstance;
}

export function getProactiveScanCron(): ProactiveScanCron {
  if (!cronInstance) {
    throw new Error('Proactive scan cron not initialized');
  }
  return cronInstance;
}
