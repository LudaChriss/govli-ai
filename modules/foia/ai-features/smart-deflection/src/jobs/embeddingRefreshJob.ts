/**
 * Govli AI FOIA Module - Embedding Refresh Cron Job
 * AI-12: Nightly embedding refresh for new records
 * 
 * Scheduled to run nightly at 1 AM
 */

import { Pool } from 'pg';
import { DeflectionService } from '../services/deflectionService';

export interface EmbeddingRefreshJobResult {
  success: boolean;
  tenant_id: string;
  reading_room_updated: number;
  responses_updated: number;
  faqs_updated: number;
  total_updated: number;
  duration_ms: number;
  error?: string;
}

/**
 * Embedding Refresh Job
 * Run this job nightly at 1 AM via cron
 */
export class EmbeddingRefreshJob {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Execute the job for all tenants
   */
  async execute(): Promise<EmbeddingRefreshJobResult[]> {
    const startTime = Date.now();
    console.log('[EmbeddingRefreshJob] Starting embedding refresh...');

    const results: EmbeddingRefreshJobResult[] = [];

    try {
      // Get all active tenants
      const tenantsResult = await this.db.query(
        `SELECT id FROM "Tenants" WHERE active = true`
      );

      console.log(`[EmbeddingRefreshJob] Found ${tenantsResult.rows.length} active tenants`);

      // Process each tenant
      for (const tenant of tenantsResult.rows) {
        const tenantId = tenant.id;
        const tenantStartTime = Date.now();

        try {
          const deflectionService = new DeflectionService(this.db, tenantId);
          const refreshResult = await deflectionService.refreshEmbeddings();

          const totalUpdated = 
            refreshResult.reading_room_updated +
            refreshResult.responses_updated +
            refreshResult.faqs_updated;

          results.push({
            success: true,
            tenant_id: tenantId,
            reading_room_updated: refreshResult.reading_room_updated,
            responses_updated: refreshResult.responses_updated,
            faqs_updated: refreshResult.faqs_updated,
            total_updated: totalUpdated,
            duration_ms: Date.now() - tenantStartTime
          });

          console.log(`[EmbeddingRefreshJob] Tenant ${tenantId}: ${totalUpdated} embeddings refreshed`);

        } catch (error) {
          console.error(`[EmbeddingRefreshJob] Error processing tenant ${tenantId}:`, error);
          results.push({
            success: false,
            tenant_id: tenantId,
            reading_room_updated: 0,
            responses_updated: 0,
            faqs_updated: 0,
            total_updated: 0,
            duration_ms: Date.now() - tenantStartTime,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const totalDuration = Date.now() - startTime;
      const totalUpdated = results.reduce((sum, r) => sum + r.total_updated, 0);

      console.log(`[EmbeddingRefreshJob] Completed: ${totalUpdated} total embeddings refreshed in ${totalDuration}ms`);

    } catch (error) {
      console.error('[EmbeddingRefreshJob] Fatal error:', error);
    }

    return results;
  }
}

/**
 * Cron schedule function
 * Call this from your cron scheduler (node-cron, bull, etc.)
 */
export async function runEmbeddingRefreshJob(db: Pool): Promise<void> {
  const job = new EmbeddingRefreshJob(db);
  await job.execute();
}

/**
 * Example usage with node-cron:
 * 
 * import cron from 'node-cron';
 * import { runEmbeddingRefreshJob } from './jobs/embeddingRefreshJob';
 * 
 * // Run every day at 1:00 AM
 * cron.schedule('0 1 * * *', async () => {
 *   console.log('Starting embedding refresh job...');
 *   await runEmbeddingRefreshJob(dbPool);
 * });
 */
