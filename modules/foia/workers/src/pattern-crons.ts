/**
 * AI-3 + AI-11: Pattern Intelligence & Proactive Disclosure Cron Jobs
 * Central initialization and management for both cron jobs
 */

import { Pool } from 'pg';
import { PatternAnalysisCron, initPatternAnalysisCron } from './pattern-analysis-cron';
import { ProactiveScanCron, initProactiveScanCron } from './proactive-scan-cron';

interface PatternCronsConfig {
  patternAnalysis?: {
    schedule?: string; // Default: '0 2 * * *' (2am daily)
    enabled?: boolean;
    tenantIds?: string[];
  };
  proactiveScan?: {
    schedule?: string; // Default: '0 3 * * 0' (Sunday 3am)
    enabled?: boolean;
    tenantIds?: string[];
    frequencyThreshold?: number;
  };
}

/**
 * Manager class for both pattern analysis and proactive scan cron jobs
 */
export class PatternCronsManager {
  private patternCron: PatternAnalysisCron;
  private proactiveCron: ProactiveScanCron;

  constructor(db: Pool, config: PatternCronsConfig = {}) {
    this.patternCron = initPatternAnalysisCron(db, config.patternAnalysis);
    this.proactiveCron = initProactiveScanCron(db, config.proactiveScan);
  }

  /**
   * Start all cron jobs
   */
  startAll(): void {
    console.log('[PatternCronsManager] Starting all pattern-related cron jobs');
    this.patternCron.start();
    this.proactiveCron.start();
    console.log('[PatternCronsManager] All cron jobs started');
  }

  /**
   * Stop all cron jobs
   */
  stopAll(): void {
    console.log('[PatternCronsManager] Stopping all pattern-related cron jobs');
    this.patternCron.stop();
    this.proactiveCron.stop();
    console.log('[PatternCronsManager] All cron jobs stopped');
  }

  /**
   * Start only pattern analysis cron
   */
  startPatternAnalysis(): void {
    this.patternCron.start();
  }

  /**
   * Start only proactive scan cron
   */
  startProactiveScan(): void {
    this.proactiveCron.start();
  }

  /**
   * Manually trigger pattern analysis
   */
  async triggerPatternAnalysis(tenantId?: string): Promise<void> {
    await this.patternCron.triggerManual(tenantId);
  }

  /**
   * Manually trigger proactive scan
   */
  async triggerProactiveScan(tenantId?: string): Promise<void> {
    await this.proactiveCron.triggerManual(tenantId);
  }

  /**
   * Get status of cron jobs
   */
  getStatus(): {
    patternAnalysis: string;
    proactiveScan: string;
  } {
    return {
      patternAnalysis: 'Configured for nightly execution at 2am',
      proactiveScan: 'Configured for weekly execution on Sunday at 3am'
    };
  }
}

/**
 * Singleton instance for use across the application
 */
let managerInstance: PatternCronsManager | null = null;

/**
 * Initialize pattern crons manager
 */
export function initPatternCrons(
  db: Pool,
  config?: PatternCronsConfig
): PatternCronsManager {
  if (!managerInstance) {
    managerInstance = new PatternCronsManager(db, config);
  }
  return managerInstance;
}

/**
 * Get pattern crons manager instance
 */
export function getPatternCrons(): PatternCronsManager {
  if (!managerInstance) {
    throw new Error('Pattern crons manager not initialized');
  }
  return managerInstance;
}

/**
 * Example usage:
 *
 * ```typescript
 * import { Pool } from 'pg';
 * import { initPatternCrons } from './workers/pattern-crons';
 *
 * const db = new Pool({ connectionString: process.env.DATABASE_URL });
 *
 * // Initialize and start all crons
 * const crons = initPatternCrons(db, {
 *   patternAnalysis: {
 *     enabled: true,
 *     schedule: '0 2 * * *' // 2am daily
 *   },
 *   proactiveScan: {
 *     enabled: true,
 *     schedule: '0 3 * * 0', // Sunday 3am
 *     frequencyThreshold: 5
 *   }
 * });
 *
 * crons.startAll();
 *
 * // Manually trigger for testing
 * await crons.triggerPatternAnalysis('tenant-id-123');
 * await crons.triggerProactiveScan('tenant-id-123');
 * ```
 */
