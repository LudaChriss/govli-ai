/**
 * AI-4: Exemption Consistency Analyzer - Service
 * Uses shared AI client - never instantiate Anthropic directly
 */

import { Pool } from 'pg';
import crypto from 'crypto';
import { getSharedAIClient, emit } from '@govli/foia-shared';
import {
  ConsistencyCheck,
  ConsistencyCheckResult,
  ConsistencyAlert,
  CheckConsistencyInput,
  HistoricalExemptionDecision,
  ConsistencyCheckHistory,
  GetHistoryFilters,
  ExemptionHeatmapData,
  ExemptionInconsistency,
  GetHeatmapFilters,
  OverrideConsistencyInput,
  ConsistencyDashboardMetrics,
  ConsistencyRiskLevel
} from '../types';

export class ConsistencyService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Main consistency check - analyzes exemption decisions against historical patterns
   */
  async checkConsistency(
    tenant_id: string,
    user_id: string,
    input: CheckConsistencyInput
  ): Promise<ConsistencyCheck> {
    const startTime = Date.now();

    try {
      // Validate response exists and get request details
      const responseResult = await this.db.query(
        `SELECT fr.id as request_id, fr.department, fr.requester_category, fr.record_types
         FROM "FoiaResponses" fresp
         JOIN "FoiaRequests" fr ON fresp.foia_request_id = fr.id
         WHERE fresp.id = $1 AND fresp.tenant_id = $2`,
        [input.response_id, tenant_id]
      );

      if (responseResult.rows.length === 0) {
        throw new Error('Response not found');
      }

      const requestData = responseResult.rows[0];

      // Fetch historical exemption decisions for similar requests
      const historicalDecisions = await this.fetchHistoricalDecisions(
        tenant_id,
        input.record_types,
        input.department || requestData.department,
        90 // last 90 days
      );

      if (historicalDecisions.length === 0) {
        // No historical data - auto-pass as LOW risk
        return await this.storeConsistencyCheck(
          tenant_id,
          user_id,
          input,
          requestData.request_id,
          {
            is_consistent: true,
            alerts: [],
            overall_risk: 'LOW',
            summary: 'No historical data available for comparison. First case of this type.',
            prior_cases_reviewed: 0
          }
        );
      }

      // Call AI to analyze consistency
      const aiResult = await this.analyzeConsistencyWithAI(
        tenant_id,
        input,
        historicalDecisions
      );

      // Store consistency check
      const check = await this.storeConsistencyCheck(
        tenant_id,
        user_id,
        input,
        requestData.request_id,
        aiResult
      );

      // Emit event
      await emit({
        id: crypto.randomUUID(),
        tenant_id,
        event_type: 'foia.ai.consistency.checked',
        entity_id: check.id,
        entity_type: 'consistency_check',
        user_id,
        metadata: {
          response_id: input.response_id,
          overall_risk: aiResult.overall_risk,
          is_consistent: aiResult.is_consistent,
          alerts_count: aiResult.alerts.length
        },
        timestamp: new Date()
      });

      console.log(
        `[ConsistencyService] Check completed in ${Date.now() - startTime}ms: ` +
        `${aiResult.overall_risk} risk, ${aiResult.alerts.length} alerts`
      );

      return check;
    } catch (error: any) {
      console.error('[ConsistencyService] Consistency check failed:', error);
      throw error;
    }
  }

  /**
   * Fetch historical exemption decisions for comparison
   */
  private async fetchHistoricalDecisions(
    tenant_id: string,
    record_types: string[],
    department: string | null,
    lookback_days: number
  ): Promise<HistoricalExemptionDecision[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - lookback_days);

    // This is a simplified query - in production you'd join with exemption tables
    const result = await this.db.query(
      `SELECT
        fresp.id as response_id,
        fresp.foia_request_id as request_id,
        fresp.exemption_codes as exemption_code,
        fresp.record_types,
        fresp."createdAt" as decision_date,
        fr.department,
        fr.requester_category
       FROM "FoiaResponses" fresp
       JOIN "FoiaRequests" fr ON fresp.foia_request_id = fr.id
       WHERE fresp.tenant_id = $1
         AND fresp.status = 'APPROVED'
         AND fresp."createdAt" >= $2
         AND (
           $3::text IS NULL OR fr.department = $3
         )
       ORDER BY fresp."createdAt" DESC
       LIMIT 50`,
      [tenant_id, cutoffDate, department]
    );

    // Transform to historical decisions format
    // In a real implementation, this would parse exemption_codes and match with record types
    return result.rows.map(row => ({
      response_id: row.response_id,
      request_id: row.request_id,
      exemption_code: Array.isArray(row.exemption_code) ? row.exemption_code[0] : 'b5',
      information_type: Array.isArray(row.record_types) ? row.record_types[0] : 'general',
      decision: 'EXEMPT' as const,
      decision_date: row.decision_date,
      department: row.department,
      requester_category: row.requester_category
    }));
  }

  /**
   * Use AI to analyze consistency between current and historical decisions
   */
  private async analyzeConsistencyWithAI(
    tenant_id: string,
    currentDecisions: CheckConsistencyInput,
    historicalDecisions: HistoricalExemptionDecision[]
  ): Promise<ConsistencyCheckResult> {
    const aiClient = getSharedAIClient();

    // Build prompt with current and historical decisions
    const currentSummary = currentDecisions.exemption_decisions.map((d, idx) =>
      `${idx + 1}. ${d.information_type}: ${d.decision} (${d.exemption_code})`
    ).join('\n');

    const historicalSummary = historicalDecisions.slice(0, 20).map((d, idx) =>
      `${idx + 1}. ${d.information_type}: ${d.decision} (${d.exemption_code}) - ` +
      `${d.decision_date.toLocaleDateString()}`
    ).join('\n');

    const prompt = `Analyze exemption consistency:

CURRENT PROPOSED EXEMPTIONS:
${currentSummary}

HISTORICAL DECISIONS (last 90 days, same record types):
${historicalSummary}

Total historical cases: ${historicalDecisions.length}`;

    const systemPrompt = `You are a FOIA compliance reviewer checking for exemption consistency.

Compare the CURRENT proposed exemption decisions against the HISTORICAL decisions provided.

Identify any cases where:
1. UNDER-REDACTION RISK: The same type of information was exempted previously but NOT exempted now
2. OVER-REDACTION RISK: Information was NOT exempted previously but IS exempted now
3. INCONSISTENT CRITERIA: The same exemption code is being applied differently

Return JSON:
{
  "is_consistent": boolean,
  "alerts": [
    {
      "alert_type": "UNDER_REDACTION" | "OVER_REDACTION" | "INCONSISTENT_CRITERIA",
      "exemption_code": "b5",
      "information_type": "email communications",
      "current_decision": "EXEMPT" | "DISCLOSED",
      "historical_pattern": "EXEMPT" | "DISCLOSED",
      "prior_cases_count": 3,
      "severity": "LOW" | "MEDIUM" | "HIGH",
      "explanation": "clear explanation",
      "suggested_action": "recommendation"
    }
  ],
  "overall_risk": "LOW" | "MEDIUM" | "HIGH",
  "summary": "2-3 sentence summary for supervisor",
  "prior_cases_reviewed": ${historicalDecisions.length}
}

IMPORTANT:
- Focus on substance, not exact wording
- Do not flag deliberate policy changes as inconsistencies
- Only flag patterns with 3+ historical cases
- HIGH risk: Major inconsistency that could violate FOIA law
- MEDIUM risk: Notable deviation requiring explanation
- LOW risk: Minor or explainable variation

Return ONLY valid JSON. No prose before or after.`;

    const result = await aiClient.callWithAudit(
      {
        prompt,
        systemPrompt,
        maxTokens: 3000,
        temperature: 0.2,
        model: 'claude-3-5-sonnet-20241022'
      },
      'AI-4',
      tenant_id,
      undefined,
      {
        foia_request_id: '',
        score: 60,
        factors: {
          date_range_years: 1,
          agency_count: 1,
          estimated_volume: 'MEDIUM',
          requester_category: currentDecisions.requester_category || 'citizen',
          keyword_complexity: 60
        },
        calculated_at: new Date()
      }
    );

    // Parse AI response
    try {
      const jsonMatch = result.content.match(/```json\n([\s\S]*?)\n```/) ||
                       result.content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        return JSON.parse(jsonStr);
      } else {
        return JSON.parse(result.content);
      }
    } catch (error) {
      console.error('[ConsistencyService] Failed to parse AI response:', error);
      throw new Error('Failed to parse AI consistency analysis');
    }
  }

  /**
   * Store consistency check result in database
   */
  private async storeConsistencyCheck(
    tenant_id: string,
    user_id: string,
    input: CheckConsistencyInput,
    request_id: string,
    aiResult: ConsistencyCheckResult
  ): Promise<ConsistencyCheck> {
    const checkId = crypto.randomUUID();
    const status = aiResult.overall_risk === 'HIGH' ? 'PENDING' : 'COMPLETED';

    await this.db.query(
      `INSERT INTO "FoiaConsistencyChecks" (
        id, tenant_id, foia_response_id, foia_request_id,
        record_types, department, requester_category, exemptions_proposed,
        is_consistent, overall_risk, alerts, summary, prior_cases_reviewed,
        status, checked_by, checked_at,
        model_used, confidence_score,
        "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), $16, $17, NOW(), NOW())`,
      [
        checkId,
        tenant_id,
        input.response_id,
        request_id,
        JSON.stringify(input.record_types),
        input.department || null,
        input.requester_category || null,
        JSON.stringify(input.exemption_decisions.map(d => d.exemption_code)),
        aiResult.is_consistent,
        aiResult.overall_risk,
        JSON.stringify(aiResult.alerts),
        aiResult.summary,
        aiResult.prior_cases_reviewed,
        status,
        user_id,
        'claude-3-5-sonnet-20241022',
        0.85
      ]
    );

    return this.getCheckById(tenant_id, checkId);
  }

  /**
   * Get consistency check by ID
   */
  async getCheckById(tenant_id: string, check_id: string): Promise<ConsistencyCheck> {
    const result = await this.db.query(
      `SELECT * FROM "FoiaConsistencyChecks"
       WHERE tenant_id = $1 AND id = $2`,
      [tenant_id, check_id]
    );

    if (result.rows.length === 0) {
      throw new Error('Consistency check not found');
    }

    return this.mapToConsistencyCheck(result.rows[0]);
  }

  /**
   * Override a HIGH risk check (supervisor only)
   */
  async overrideCheck(
    tenant_id: string,
    check_id: string,
    user_id: string,
    override: OverrideConsistencyInput
  ): Promise<ConsistencyCheck> {
    // Verify check exists and is HIGH risk
    const check = await this.getCheckById(tenant_id, check_id);

    if (check.overall_risk !== 'HIGH') {
      throw new Error('Only HIGH risk checks require override');
    }

    if (check.status === 'OVERRIDDEN') {
      throw new Error('Check has already been overridden');
    }

    // Update with override
    await this.db.query(
      `UPDATE "FoiaConsistencyChecks"
       SET status = 'OVERRIDDEN',
           overridden_by = $1,
           overridden_at = NOW(),
           override_justification = $2,
           "updatedAt" = NOW()
       WHERE id = $3`,
      [user_id, override.justification, check_id]
    );

    // Emit event
    await emit({
      id: crypto.randomUUID(),
      tenant_id,
      event_type: 'foia.ai.consistency.overridden',
      entity_id: check_id,
      entity_type: 'consistency_check',
      user_id,
      metadata: {
        response_id: check.foia_response_id,
        justification: override.justification
      },
      timestamp: new Date()
    });

    return this.getCheckById(tenant_id, check_id);
  }

  /**
   * Get consistency check history with filtering
   */
  async getHistory(
    tenant_id: string,
    filters: GetHistoryFilters = {}
  ): Promise<{ checks: ConsistencyCheckHistory[]; total: number }> {
    let query = `SELECT
      id, foia_response_id, overall_risk, is_consistent,
      COALESCE(jsonb_array_length(alerts), 0) as alerts_count,
      status, checked_at, overridden_by IS NOT NULL as overridden,
      department, record_types
    FROM "FoiaConsistencyChecks"
    WHERE tenant_id = $1`;

    const params: any[] = [tenant_id];
    let paramIndex = 2;

    if (filters.start_date) {
      query += ` AND checked_at >= $${paramIndex}`;
      params.push(filters.start_date);
      paramIndex++;
    }

    if (filters.end_date) {
      query += ` AND checked_at <= $${paramIndex}`;
      params.push(filters.end_date);
      paramIndex++;
    }

    if (filters.risk_level) {
      query += ` AND overall_risk = $${paramIndex}`;
      params.push(filters.risk_level);
      paramIndex++;
    }

    if (filters.department) {
      query += ` AND department = $${paramIndex}`;
      params.push(filters.department);
      paramIndex++;
    }

    if (filters.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filters.status);
      paramIndex++;
    }

    query += ` ORDER BY checked_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filters.limit);
      paramIndex++;
    }

    if (filters.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(filters.offset);
      paramIndex++;
    }

    const result = await this.db.query(query, params);

    // Get total count
    const countResult = await this.db.query(
      `SELECT COUNT(*) as total FROM "FoiaConsistencyChecks" WHERE tenant_id = $1`,
      [tenant_id]
    );

    return {
      checks: result.rows.map(row => this.mapToCheckHistory(row)),
      total: parseInt(countResult.rows[0].total)
    };
  }

  /**
   * Get exemption heatmap data
   */
  async getExemptionHeatmap(
    tenant_id: string,
    filters: GetHeatmapFilters = {}
  ): Promise<ExemptionHeatmapData> {
    const startDate = filters.start_date || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const endDate = filters.end_date || new Date();

    // Aggregate inconsistency data by exemption code
    const result = await this.db.query(
      `SELECT
        exemption_code,
        COUNT(*) as total_count,
        SUM(CASE WHEN is_consistent = false THEN 1 ELSE 0 END) as inconsistent_count,
        SUM(CASE WHEN overall_risk = 'HIGH' THEN 1 ELSE 0 END) as high_risk_count
       FROM "FoiaConsistencyChecks",
       jsonb_array_elements_text(exemptions_proposed) as exemption_code
       WHERE tenant_id = $1
         AND checked_at >= $2
         AND checked_at <= $3
         ${filters.department ? 'AND department = $4' : ''}
       GROUP BY exemption_code
       HAVING COUNT(*) >= $${filters.department ? 5 : 4}
       ORDER BY inconsistent_count DESC`,
      filters.department
        ? [tenant_id, startDate, endDate, filters.department, filters.min_applications || 5]
        : [tenant_id, startDate, endDate, filters.min_applications || 5]
    );

    const exemptions: ExemptionInconsistency[] = result.rows.map(row => ({
      exemption_code: row.exemption_code,
      exemption_name: this.getExemptionName(row.exemption_code),
      total_applications: parseInt(row.total_count),
      inconsistent_applications: parseInt(row.inconsistent_count),
      inconsistency_rate: parseFloat(row.inconsistent_count) / parseFloat(row.total_count),
      most_common_discrepancy: 'OVER_REDACTION' as const,
      departments_affected: [],
      trend: 'STABLE' as const
    }));

    const totalChecks = exemptions.reduce((sum, e) => sum + e.total_applications, 0);
    const totalInconsistent = exemptions.reduce((sum, e) => sum + e.inconsistent_applications, 0);
    const highRiskCount = result.rows.reduce((sum, row) => sum + parseInt(row.high_risk_count), 0);

    return {
      exemptions,
      overall_inconsistency_rate: totalChecks > 0 ? totalInconsistent / totalChecks : 0,
      time_period: {
        start_date: startDate,
        end_date: endDate
      },
      total_checks: totalChecks,
      high_risk_count: highRiskCount
    };
  }

  /**
   * Get dashboard metrics
   */
  async getDashboardMetrics(tenant_id: string): Promise<ConsistencyDashboardMetrics> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const metricsResult = await this.db.query(
      `SELECT
        COUNT(*) as total_checks,
        SUM(CASE WHEN overall_risk = 'HIGH' THEN 1 ELSE 0 END) as high_risk_count,
        SUM(CASE WHEN overridden_by IS NOT NULL THEN 1 ELSE 0 END) as override_count,
        AVG(CASE WHEN is_consistent = true THEN 100.0 ELSE 0.0 END) as avg_consistency_rate
       FROM "FoiaConsistencyChecks"
       WHERE tenant_id = $1 AND checked_at >= $2`,
      [tenant_id, thirtyDaysAgo]
    );

    const pendingResult = await this.db.query(
      `SELECT COUNT(*) as pending_count
       FROM "FoiaConsistencyChecks"
       WHERE tenant_id = $1 AND overall_risk = 'HIGH' AND status = 'PENDING'`,
      [tenant_id]
    );

    const metrics = metricsResult.rows[0];
    const totalChecks = parseInt(metrics.total_checks);

    return {
      checks_last_30_days: totalChecks,
      high_risk_last_30_days: parseInt(metrics.high_risk_count) || 0,
      override_rate_last_30_days: totalChecks > 0
        ? (parseInt(metrics.override_count) || 0) / totalChecks
        : 0,
      avg_consistency_rate: parseFloat(metrics.avg_consistency_rate) || 0,
      most_inconsistent_exemption: null,
      pending_high_risk_count: parseInt(pendingResult.rows[0].pending_count) || 0
    };
  }

  // Helper methods

  private getExemptionName(code: string): string {
    const exemptionNames: Record<string, string> = {
      'b1': 'National Security',
      'b2': 'Internal Personnel Rules',
      'b3': 'Statutory Exemptions',
      'b4': 'Trade Secrets',
      'b5': 'Deliberative Process',
      'b6': 'Personal Privacy',
      'b7': 'Law Enforcement',
      'b8': 'Financial Institutions',
      'b9': 'Geological Information'
    };
    return exemptionNames[code] || code;
  }

  private mapToConsistencyCheck(row: any): ConsistencyCheck {
    return {
      id: row.id,
      tenant_id: row.tenant_id,
      foia_response_id: row.foia_response_id,
      foia_request_id: row.foia_request_id,
      record_types: typeof row.record_types === 'string'
        ? JSON.parse(row.record_types)
        : row.record_types,
      department: row.department,
      requester_category: row.requester_category,
      exemptions_proposed: typeof row.exemptions_proposed === 'string'
        ? JSON.parse(row.exemptions_proposed)
        : row.exemptions_proposed,
      is_consistent: row.is_consistent,
      overall_risk: row.overall_risk,
      alerts: typeof row.alerts === 'string'
        ? JSON.parse(row.alerts)
        : row.alerts,
      summary: row.summary,
      prior_cases_reviewed: row.prior_cases_reviewed,
      status: row.status,
      checked_by: row.checked_by,
      checked_at: row.checked_at,
      overridden_by: row.overridden_by,
      overridden_at: row.overridden_at,
      override_justification: row.override_justification,
      model_used: row.model_used,
      confidence_score: row.confidence_score ? parseFloat(row.confidence_score) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  private mapToCheckHistory(row: any): ConsistencyCheckHistory {
    return {
      id: row.id,
      foia_response_id: row.foia_response_id,
      overall_risk: row.overall_risk,
      is_consistent: row.is_consistent,
      alerts_count: parseInt(row.alerts_count) || 0,
      status: row.status,
      checked_at: row.checked_at,
      overridden: row.overridden,
      department: row.department,
      record_types: typeof row.record_types === 'string'
        ? JSON.parse(row.record_types)
        : row.record_types
    };
  }
}
