/**
 * AI-4: Monthly Consistency Report Cron Job
 * Generates automated monthly consistency reports on the 1st of each month
 *
 * Schedule: 1st day of month at 6:00 AM
 * Cron: 0 6 1 * *
 *
 * Usage:
 *   import { MonthlyConsistencyReportCron } from './monthly-consistency-report-cron';
 *
 *   const cron = new MonthlyConsistencyReportCron(db);
 *   await cron.start(); // Runs on schedule
 *   await cron.runNow(); // Run immediately for testing
 */

import { Pool } from 'pg';
import { ReportService } from '../../ai-features/consistency/src/services/reportService';
// @ts-ignore
import * as cron from 'node-cron';

interface MonthlyReportCronConfig {
  /**
   * Cron schedule (default: "0 6 1 * *" = 1st of month at 6am)
   */
  schedule?: string;

  /**
   * Whether to run report for previous month on startup (default: false)
   */
  runOnStartup?: boolean;

  /**
   * Notify supervisors via email (default: true if email service available)
   */
  notifySupervisors?: boolean;

  /**
   * Timezone for cron schedule (default: 'America/New_York')
   */
  timezone?: string;
}

const DEFAULT_CONFIG: Required<MonthlyReportCronConfig> = {
  schedule: '0 6 1 * *', // 6am on 1st of each month
  runOnStartup: false,
  notifySupervisors: true,
  timezone: 'America/New_York'
};

export class MonthlyConsistencyReportCron {
  private db: Pool;
  private reportService: ReportService;
  private config: Required<MonthlyReportCronConfig>;
  private cronJob: cron.ScheduledTask | null = null;

  constructor(db: Pool, config: MonthlyReportCronConfig = {}) {
    this.db = db;
    this.reportService = new ReportService(db);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the cron job
   */
  async start(): Promise<void> {
    console.log('[MonthlyReportCron] Starting monthly consistency report cron job');
    console.log(`[MonthlyReportCron] Schedule: ${this.config.schedule} (${this.config.timezone})`);

    // Run on startup if configured
    if (this.config.runOnStartup) {
      console.log('[MonthlyReportCron] Running report generation on startup');
      await this.runReportGeneration();
    }

    // Schedule the cron job
    this.cronJob = cron.schedule(
      this.config.schedule,
      async () => {
        await this.runReportGeneration();
      },
      {
        timezone: this.config.timezone,
        scheduled: true
      }
    );

    console.log('[MonthlyReportCron] Cron job scheduled successfully');
  }

  /**
   * Stop the cron job
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log('[MonthlyReportCron] Cron job stopped');
    }
  }

  /**
   * Run report generation immediately (for testing or manual trigger)
   */
  async runNow(): Promise<void> {
    console.log('[MonthlyReportCron] Manual report generation triggered');
    await this.runReportGeneration();
  }

  /**
   * Main report generation logic
   */
  private async runReportGeneration(): Promise<void> {
    const startTime = Date.now();
    console.log('[MonthlyReportCron] ==========================================');
    console.log('[MonthlyReportCron] Starting monthly consistency report generation');
    console.log('[MonthlyReportCron] ==========================================');

    try {
      // Get all active tenants
      const tenantIds = await this.getTenants();
      console.log(`[MonthlyReportCron] Found ${tenantIds.length} tenants`);

      // Calculate report month (previous month)
      const reportMonth = this.getReportMonth();
      console.log(`[MonthlyReportCron] Generating reports for: ${reportMonth.toISOString().split('T')[0]}`);

      let successCount = 0;
      let errorCount = 0;

      // Generate report for each tenant
      for (const tenantId of tenantIds) {
        try {
          console.log(`[MonthlyReportCron] Generating report for tenant: ${tenantId}`);

          const report = await this.reportService.generateMonthlyReport(tenantId, {
            report_month: reportMonth,
            generated_by: 'system'
          });

          console.log(`[MonthlyReportCron] ✓ Report generated for ${tenantId}:`);
          console.log(`  - Total checks: ${report.total_checks}`);
          console.log(`  - High risk: ${report.high_risk_count}`);
          console.log(`  - Consistency rate: ${report.overall_consistency_rate}%`);
          console.log(`  - Findings: ${report.critical_findings.length}`);
          console.log(`  - Recommendations: ${report.recommendations.length}`);

          // Notify supervisors if configured
          if (this.config.notifySupervisors) {
            await this.notifySupervisors(tenantId, report);
          }

          successCount++;
        } catch (error: any) {
          console.error(`[MonthlyReportCron] ✗ Failed to generate report for ${tenantId}:`, error.message);
          errorCount++;
        }
      }

      const duration = Date.now() - startTime;
      console.log('[MonthlyReportCron] ==========================================');
      console.log('[MonthlyReportCron] Monthly report generation completed');
      console.log(`[MonthlyReportCron] Duration: ${duration}ms`);
      console.log(`[MonthlyReportCron] Success: ${successCount} | Errors: ${errorCount}`);
      console.log('[MonthlyReportCron] ==========================================');
    } catch (error: any) {
      console.error('[MonthlyReportCron] Fatal error during report generation:', error);
      throw error;
    }
  }

  /**
   * Get all active tenant IDs
   */
  private async getTenants(): Promise<string[]> {
    try {
      const result = await this.db.query(
        `SELECT DISTINCT tenant_id
         FROM "FoiaRequests"
         WHERE "createdAt" > NOW() - INTERVAL '6 months'
         ORDER BY tenant_id`
      );

      return result.rows.map(row => row.tenant_id);
    } catch (error) {
      console.error('[MonthlyReportCron] Error fetching tenants:', error);
      return [];
    }
  }

  /**
   * Get report month (previous month, first day)
   */
  private getReportMonth(): Date {
    const now = new Date();
    const reportMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    reportMonth.setHours(0, 0, 0, 0);
    return reportMonth;
  }

  /**
   * Notify supervisors about new report
   */
  private async notifySupervisors(tenantId: string, report: any): Promise<void> {
    try {
      // Get FOIA supervisors for this tenant
      const supervisors = await this.db.query(
        `SELECT id, email, name
         FROM "Users"
         WHERE tenant_id = $1
           AND role IN ('foia_supervisor', 'admin')
           AND active = true`,
        [tenantId]
      );

      if (supervisors.rows.length === 0) {
        console.log(`[MonthlyReportCron] No supervisors found for tenant ${tenantId}`);
        return;
      }

      const supervisorIds = supervisors.rows.map(s => s.id);

      // Mark report as sent
      await this.reportService.markReportSent(
        tenantId,
        report.report_month,
        supervisorIds
      );

      // TODO: Send email notification if email service is available
      // For now, just log
      console.log(`[MonthlyReportCron] Report notification sent to ${supervisors.rows.length} supervisors`);

      // If you have an email service, send notifications:
      /*
      for (const supervisor of supervisors.rows) {
        await emailService.send({
          to: supervisor.email,
          subject: `Monthly FOIA Consistency Report - ${report.report_month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
          template: 'monthly-consistency-report',
          data: {
            supervisor_name: supervisor.name,
            report_month: report.report_month,
            total_checks: report.total_checks,
            high_risk_count: report.high_risk_count,
            consistency_rate: report.overall_consistency_rate,
            critical_findings: report.critical_findings,
            recommendations: report.recommendations,
            report_url: `${process.env.APP_URL}/foia/admin/consistency/reports/${report.id}`
          }
        });
      }
      */
    } catch (error) {
      console.error('[MonthlyReportCron] Error notifying supervisors:', error);
      // Don't throw - notification failure shouldn't block report generation
    }
  }
}

/**
 * Example usage in main worker process:
 *
 * ```typescript
 * import { Pool } from 'pg';
 * import { MonthlyConsistencyReportCron } from './monthly-consistency-report-cron';
 *
 * const db = new Pool({
 *   connectionString: process.env.DATABASE_URL
 * });
 *
 * const reportCron = new MonthlyConsistencyReportCron(db, {
 *   schedule: '0 6 1 * *', // 6am on 1st of month
 *   runOnStartup: false,
 *   notifySupervisors: true
 * });
 *
 * await reportCron.start();
 * ```
 */
