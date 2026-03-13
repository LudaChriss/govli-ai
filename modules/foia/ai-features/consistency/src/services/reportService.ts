/**
 * AI-4: Monthly Consistency Report Generator
 * Generates automated monthly reports analyzing exemption consistency trends
 */

import { Pool } from 'pg';
import { getSharedAIClient } from '@govli/foia-shared';
import { MonthlyConsistencyReport } from '../types';

interface ReportGenerationInput {
  report_month: Date; // First day of month
  generated_by?: string; // User ID or 'system' for automated reports
}

interface ReportMetrics {
  total_checks: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  override_count: number;
  overall_consistency_rate: number;
}

interface ExemptionInconsistencyData {
  exemption_code: string;
  inconsistency_rate: number;
  total_applications: number;
}

interface DepartmentIssue {
  department: string;
  high_risk_count: number;
  inconsistency_rate: number;
}

export class ReportService {
  private db: Pool;
  private aiClient: any;

  constructor(db: Pool) {
    this.db = db;
    this.aiClient = getSharedAIClient();
  }

  /**
   * Generate monthly consistency report
   */
  async generateMonthlyReport(
    tenant_id: string,
    input: ReportGenerationInput
  ): Promise<MonthlyConsistencyReport> {
    const { report_month, generated_by = 'system' } = input;

    // Calculate date range for the month
    const startDate = new Date(report_month);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);
    endDate.setHours(23, 59, 59, 999);

    console.log(`[ReportService] Generating monthly report for ${tenant_id}: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

    // 1. Gather metrics
    const metrics = await this.gatherMetrics(tenant_id, startDate, endDate);

    // 2. Identify most inconsistent exemptions
    const inconsistentExemptions = await this.getInconsistentExemptions(
      tenant_id,
      startDate,
      endDate
    );

    // 3. Identify departments with issues
    const departmentsWithIssues = await this.getDepartmentsWithIssues(
      tenant_id,
      startDate,
      endDate
    );

    // 4. Use AI to generate findings and recommendations
    const aiAnalysis = await this.generateAIRecommendations(
      tenant_id,
      generated_by,
      metrics,
      inconsistentExemptions,
      departmentsWithIssues
    );

    // 5. Store report
    const report = await this.storeReport(
      tenant_id,
      report_month,
      generated_by,
      metrics,
      inconsistentExemptions,
      departmentsWithIssues,
      aiAnalysis
    );

    return report;
  }

  /**
   * Get monthly report by ID or month
   */
  async getReport(
    tenant_id: string,
    report_month: Date
  ): Promise<MonthlyConsistencyReport | null> {
    const result = await this.db.query(
      `SELECT * FROM "FoiaConsistencyReports"
       WHERE tenant_id = $1 AND report_month = $2`,
      [tenant_id, report_month]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRowToReport(result.rows[0]);
  }

  /**
   * List all reports for a tenant
   */
  async listReports(
    tenant_id: string,
    limit: number = 12,
    offset: number = 0
  ): Promise<{ reports: MonthlyConsistencyReport[]; total: number }> {
    // Get count
    const countResult = await this.db.query(
      `SELECT COUNT(*) FROM "FoiaConsistencyReports"
       WHERE tenant_id = $1`,
      [tenant_id]
    );

    // Get reports
    const result = await this.db.query(
      `SELECT * FROM "FoiaConsistencyReports"
       WHERE tenant_id = $1
       ORDER BY report_month DESC
       LIMIT $2 OFFSET $3`,
      [tenant_id, limit, offset]
    );

    return {
      reports: result.rows.map(row => this.mapRowToReport(row)),
      total: parseInt(countResult.rows[0].count)
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  /**
   * Gather monthly metrics
   */
  private async gatherMetrics(
    tenant_id: string,
    startDate: Date,
    endDate: Date
  ): Promise<ReportMetrics> {
    const result = await this.db.query(
      `SELECT
        COUNT(*) as total_checks,
        COUNT(*) FILTER (WHERE overall_risk = 'HIGH') as high_risk_count,
        COUNT(*) FILTER (WHERE overall_risk = 'MEDIUM') as medium_risk_count,
        COUNT(*) FILTER (WHERE overall_risk = 'LOW') as low_risk_count,
        COUNT(*) FILTER (WHERE status = 'OVERRIDDEN') as override_count,
        ROUND(
          COUNT(*) FILTER (WHERE is_consistent = true)::numeric /
          NULLIF(COUNT(*), 0) * 100,
          2
        ) as overall_consistency_rate
       FROM "FoiaConsistencyChecks"
       WHERE tenant_id = $1
         AND checked_at >= $2
         AND checked_at < $3`,
      [tenant_id, startDate, endDate]
    );

    const row = result.rows[0];
    return {
      total_checks: parseInt(row.total_checks) || 0,
      high_risk_count: parseInt(row.high_risk_count) || 0,
      medium_risk_count: parseInt(row.medium_risk_count) || 0,
      low_risk_count: parseInt(row.low_risk_count) || 0,
      override_count: parseInt(row.override_count) || 0,
      overall_consistency_rate: parseFloat(row.overall_consistency_rate) || 0
    };
  }

  /**
   * Identify most inconsistent exemptions
   */
  private async getInconsistentExemptions(
    tenant_id: string,
    startDate: Date,
    endDate: Date
  ): Promise<ExemptionInconsistencyData[]> {
    const result = await this.db.query(
      `SELECT
        exemption_code,
        COUNT(*) as total_applications,
        COUNT(*) FILTER (WHERE overall_risk IN ('MEDIUM', 'HIGH')) as inconsistent_count,
        ROUND(
          COUNT(*) FILTER (WHERE overall_risk IN ('MEDIUM', 'HIGH'))::numeric /
          NULLIF(COUNT(*), 0) * 100,
          2
        ) as inconsistency_rate
       FROM "FoiaConsistencyChecks",
         jsonb_array_elements_text(exemptions_proposed) as exemption_code
       WHERE tenant_id = $1
         AND checked_at >= $2
         AND checked_at < $3
       GROUP BY exemption_code
       HAVING COUNT(*) >= 3
       ORDER BY inconsistency_rate DESC, total_applications DESC
       LIMIT 10`,
      [tenant_id, startDate, endDate]
    );

    return result.rows.map(row => ({
      exemption_code: row.exemption_code,
      inconsistency_rate: parseFloat(row.inconsistency_rate) || 0,
      total_applications: parseInt(row.total_applications) || 0
    }));
  }

  /**
   * Identify departments with consistency issues
   */
  private async getDepartmentsWithIssues(
    tenant_id: string,
    startDate: Date,
    endDate: Date
  ): Promise<DepartmentIssue[]> {
    const result = await this.db.query(
      `SELECT
        department,
        COUNT(*) as total_checks,
        COUNT(*) FILTER (WHERE overall_risk = 'HIGH') as high_risk_count,
        ROUND(
          COUNT(*) FILTER (WHERE is_consistent = false)::numeric /
          NULLIF(COUNT(*), 0) * 100,
          2
        ) as inconsistency_rate
       FROM "FoiaConsistencyChecks"
       WHERE tenant_id = $1
         AND checked_at >= $2
         AND checked_at < $3
         AND department IS NOT NULL
       GROUP BY department
       HAVING COUNT(*) FILTER (WHERE overall_risk = 'HIGH') > 0
       ORDER BY high_risk_count DESC, inconsistency_rate DESC
       LIMIT 10`,
      [tenant_id, startDate, endDate]
    );

    return result.rows.map(row => ({
      department: row.department,
      high_risk_count: parseInt(row.high_risk_count) || 0,
      inconsistency_rate: parseFloat(row.inconsistency_rate) || 0
    }));
  }

  /**
   * Use AI to generate findings and recommendations
   */
  private async generateAIRecommendations(
    tenant_id: string,
    user_id: string,
    metrics: ReportMetrics,
    inconsistentExemptions: ExemptionInconsistencyData[],
    departmentsWithIssues: DepartmentIssue[]
  ): Promise<{ critical_findings: string[]; recommendations: string[] }> {
    const prompt = `You are analyzing a monthly FOIA exemption consistency report. Based on the data below, identify critical findings and provide actionable recommendations.

**Monthly Metrics:**
- Total consistency checks: ${metrics.total_checks}
- High risk inconsistencies: ${metrics.high_risk_count}
- Medium risk inconsistencies: ${metrics.medium_risk_count}
- Low risk: ${metrics.low_risk_count}
- Supervisor overrides: ${metrics.override_count}
- Overall consistency rate: ${metrics.overall_consistency_rate}%

**Most Inconsistent Exemptions:**
${inconsistentExemptions.length > 0 ? inconsistentExemptions.map(e =>
  `- ${e.exemption_code}: ${e.inconsistency_rate}% inconsistency rate (${e.total_applications} applications)`
).join('\n') : '- No significant exemption inconsistencies'}

**Departments with Issues:**
${departmentsWithIssues.length > 0 ? departmentsWithIssues.map(d =>
  `- ${d.department}: ${d.high_risk_count} high risk cases, ${d.inconsistency_rate}% inconsistency rate`
).join('\n') : '- No departments with significant issues'}

**Task:**
1. Identify 3-5 critical findings (patterns, trends, concerns)
2. Provide 3-5 actionable recommendations for improving consistency

Return your analysis as a JSON object with this structure:
{
  "critical_findings": ["finding 1", "finding 2", ...],
  "recommendations": ["recommendation 1", "recommendation 2", ...]
}`;

    try {
      const response = await this.aiClient.callWithAudit({
        tenantId: tenant_id,
        userId: user_id,
        feature: 'ai-4-monthly-report',
        modelId: 'claude-3-5-sonnet-20241022',
        systemPrompt: 'You are a FOIA compliance analyst specializing in exemption consistency and best practices.',
        userMessage: prompt,
        maxTokens: 2000
      });

      const analysis = JSON.parse(response.content);

      return {
        critical_findings: analysis.critical_findings || [],
        recommendations: analysis.recommendations || []
      };
    } catch (error) {
      console.error('[ReportService] AI analysis failed:', error);
      // Return fallback analysis
      return {
        critical_findings: this.generateFallbackFindings(metrics, inconsistentExemptions, departmentsWithIssues),
        recommendations: this.generateFallbackRecommendations(metrics, inconsistentExemptions, departmentsWithIssues)
      };
    }
  }

  /**
   * Fallback findings if AI fails
   */
  private generateFallbackFindings(
    metrics: ReportMetrics,
    inconsistentExemptions: ExemptionInconsistencyData[],
    departmentsWithIssues: DepartmentIssue[]
  ): string[] {
    const findings: string[] = [];

    if (metrics.overall_consistency_rate < 80) {
      findings.push(`Overall consistency rate of ${metrics.overall_consistency_rate}% is below target (80%). This indicates systematic issues with exemption application.`);
    }

    if (metrics.high_risk_count > 0) {
      findings.push(`${metrics.high_risk_count} high-risk inconsistencies detected this month, requiring supervisor review.`);
    }

    if (inconsistentExemptions.length > 0) {
      const topExemption = inconsistentExemptions[0];
      findings.push(`Exemption ${topExemption.exemption_code} shows highest inconsistency rate (${topExemption.inconsistency_rate}%) across ${topExemption.total_applications} applications.`);
    }

    if (departmentsWithIssues.length > 0) {
      const topDept = departmentsWithIssues[0];
      findings.push(`${topDept.department} department has ${topDept.high_risk_count} high-risk cases with ${topDept.inconsistency_rate}% inconsistency rate.`);
    }

    if (findings.length === 0) {
      findings.push('No critical consistency issues detected this month. Exemption application patterns align with historical precedent.');
    }

    return findings;
  }

  /**
   * Fallback recommendations if AI fails
   */
  private generateFallbackRecommendations(
    metrics: ReportMetrics,
    inconsistentExemptions: ExemptionInconsistencyData[],
    departmentsWithIssues: DepartmentIssue[]
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.overall_consistency_rate < 80) {
      recommendations.push('Conduct training sessions for FOIA officers on exemption criteria and consistency requirements.');
    }

    if (inconsistentExemptions.length > 0) {
      const topExemption = inconsistentExemptions[0];
      recommendations.push(`Review and clarify guidance for applying exemption ${topExemption.exemption_code} to ensure consistent interpretation.`);
    }

    if (departmentsWithIssues.length > 0) {
      const topDept = departmentsWithIssues[0];
      recommendations.push(`Provide targeted training to ${topDept.department} department on exemption consistency standards.`);
    }

    if (metrics.override_count > metrics.high_risk_count * 0.8) {
      recommendations.push('High override rate suggests consistency rules may be too strict. Review alert thresholds.');
    }

    recommendations.push('Continue monitoring exemption consistency trends monthly to identify emerging patterns.');

    return recommendations;
  }

  /**
   * Store report in database
   */
  private async storeReport(
    tenant_id: string,
    report_month: Date,
    generated_by: string,
    metrics: ReportMetrics,
    inconsistentExemptions: ExemptionInconsistencyData[],
    departmentsWithIssues: DepartmentIssue[],
    aiAnalysis: { critical_findings: string[]; recommendations: string[] }
  ): Promise<MonthlyConsistencyReport> {
    const result = await this.db.query(
      `INSERT INTO "FoiaConsistencyReports" (
        tenant_id,
        report_month,
        total_checks,
        high_risk_count,
        medium_risk_count,
        low_risk_count,
        override_count,
        overall_consistency_rate,
        most_inconsistent_exemptions,
        departments_with_issues,
        critical_findings,
        recommendations,
        generated_by,
        generated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
      ON CONFLICT (tenant_id, report_month) DO UPDATE SET
        total_checks = EXCLUDED.total_checks,
        high_risk_count = EXCLUDED.high_risk_count,
        medium_risk_count = EXCLUDED.medium_risk_count,
        low_risk_count = EXCLUDED.low_risk_count,
        override_count = EXCLUDED.override_count,
        overall_consistency_rate = EXCLUDED.overall_consistency_rate,
        most_inconsistent_exemptions = EXCLUDED.most_inconsistent_exemptions,
        departments_with_issues = EXCLUDED.departments_with_issues,
        critical_findings = EXCLUDED.critical_findings,
        recommendations = EXCLUDED.recommendations,
        generated_at = NOW(),
        generated_by = EXCLUDED.generated_by
      RETURNING *`,
      [
        tenant_id,
        report_month,
        metrics.total_checks,
        metrics.high_risk_count,
        metrics.medium_risk_count,
        metrics.low_risk_count,
        metrics.override_count,
        metrics.overall_consistency_rate,
        JSON.stringify(inconsistentExemptions.map(e => e.exemption_code)),
        JSON.stringify(departmentsWithIssues.map(d => d.department)),
        JSON.stringify(aiAnalysis.critical_findings),
        JSON.stringify(aiAnalysis.recommendations),
        generated_by
      ]
    );

    return this.mapRowToReport(result.rows[0]);
  }

  /**
   * Map database row to MonthlyConsistencyReport
   */
  private mapRowToReport(row: any): MonthlyConsistencyReport {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      report_month: row.report_month,
      total_checks: row.total_checks,
      high_risk_count: row.high_risk_count,
      medium_risk_count: row.medium_risk_count,
      low_risk_count: row.low_risk_count,
      override_count: row.override_count,
      overall_consistency_rate: parseFloat(row.overall_consistency_rate),
      most_inconsistent_exemptions: row.most_inconsistent_exemptions || [],
      departments_with_issues: row.departments_with_issues || [],
      critical_findings: row.critical_findings || [],
      recommendations: row.recommendations || [],
      generated_at: row.generated_at,
      generated_by: row.generated_by,
      sent_to: row.sent_to || [],
      createdAt: row.createdAt
    };
  }

  /**
   * Mark report as sent to supervisors
   */
  async markReportSent(
    tenant_id: string,
    report_month: Date,
    recipient_ids: string[]
  ): Promise<void> {
    await this.db.query(
      `UPDATE "FoiaConsistencyReports"
       SET sent_to = $3
       WHERE tenant_id = $1 AND report_month = $2`,
      [tenant_id, report_month, JSON.stringify(recipient_ids)]
    );
  }
}
