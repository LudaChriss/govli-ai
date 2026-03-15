/**
 * AI-16: Transparency Score Calculation Job
 *
 * Runs daily at 6 AM to calculate transparency scores for all enabled tenants
 */

import { Pool } from 'pg';
import { TransparencyService } from '../services/transparencyService';

/**
 * Calculate transparency scores for all enabled tenants
 * Should be run as a cron job: daily at 6 AM
 */
export async function calculateAllScores(db: Pool): Promise<void> {
  console.log('[ScoreCalculationJob] Starting transparency score calculation...');

  try {
    // Get all tenants with transparency dashboard enabled
    const result = await db.query(
      `SELECT id, name FROM "FoiaTenants"
       WHERE transparency_dashboard_enabled = true`
    );

    const tenants = result.rows;
    console.log(`[ScoreCalculationJob] Found ${tenants.length} tenants with transparency enabled`);

    const transparencyService = new TransparencyService(db);

    for (const tenant of tenants) {
      try {
        console.log(`[ScoreCalculationJob] Calculating score for ${tenant.name}...`);

        const score = await transparencyService.calculateScore(tenant.id);
        await transparencyService.storeScore(score);

        console.log(`[ScoreCalculationJob] Score for ${tenant.name}: ${score.score}/100`);
      } catch (error) {
        console.error(`[ScoreCalculationJob] Error calculating score for ${tenant.name}:`, error);
        // Continue with next tenant
      }
    }

    console.log('[ScoreCalculationJob] Score calculation completed');
  } catch (error) {
    console.error('[ScoreCalculationJob] Fatal error:', error);
    throw error;
  }
}

/**
 * Setup cron job (example using node-cron)
 */
export function setupScoreCalculationJob(db: Pool): void {
  // In production, use a proper cron scheduler like node-cron or Bull
  // Example:
  // cron.schedule('0 6 * * *', async () => {
  //   await calculateAllScores(db);
  // });

  console.log('[ScoreCalculationJob] Scheduled for daily execution at 6 AM');
}
