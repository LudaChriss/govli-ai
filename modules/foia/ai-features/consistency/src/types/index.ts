/**
 * AI-4: Exemption Consistency Analyzer - Type Definitions
 */

// ============================================================================
// Risk Levels & Status Types
// ============================================================================

export type ConsistencyRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ConsistencyCheckStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'OVERRIDDEN';
export type DiscrepancyType = 'UNDER_REDACTION' | 'OVER_REDACTION' | 'INCONSISTENT_CRITERIA';

// ============================================================================
// Consistency Check Types
// ============================================================================

export interface ConsistencyAlert {
  alert_type: DiscrepancyType;
  exemption_code: string;
  information_type: string;
  current_decision: 'EXEMPT' | 'DISCLOSED';
  historical_pattern: 'EXEMPT' | 'DISCLOSED';
  prior_cases_count: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  explanation: string;
  suggested_action: string;
}

export interface ConsistencyCheckResult {
  is_consistent: boolean;
  alerts: ConsistencyAlert[];
  overall_risk: ConsistencyRiskLevel;
  summary: string;
  prior_cases_reviewed: number;
}

export interface ConsistencyCheck {
  id: string;
  tenant_id: string;
  foia_response_id: string;
  foia_request_id: string;

  // Check Details
  record_types: string[];
  department: string | null;
  requester_category: string | null;
  exemptions_proposed: string[];

  // Results
  is_consistent: boolean;
  overall_risk: ConsistencyRiskLevel;
  alerts: ConsistencyAlert[];
  summary: string;
  prior_cases_reviewed: number;

  // Decision
  status: ConsistencyCheckStatus;
  checked_by: string | null;
  checked_at: Date;

  // Override (if HIGH risk)
  overridden_by: string | null;
  overridden_at: Date | null;
  override_justification: string | null;

  // AI Metadata
  model_used: string;
  confidence_score: number | null;

  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Exemption Heatmap Types
// ============================================================================

export interface ExemptionInconsistency {
  exemption_code: string;
  exemption_name: string;
  total_applications: number;
  inconsistent_applications: number;
  inconsistency_rate: number;
  most_common_discrepancy: DiscrepancyType;
  departments_affected: string[];
  trend: 'INCREASING' | 'STABLE' | 'DECREASING';
}

export interface ExemptionHeatmapData {
  exemptions: ExemptionInconsistency[];
  overall_inconsistency_rate: number;
  time_period: {
    start_date: Date;
    end_date: Date;
  };
  total_checks: number;
  high_risk_count: number;
}

// ============================================================================
// Historical Comparison Types
// ============================================================================

export interface HistoricalExemptionDecision {
  response_id: string;
  request_id: string;
  exemption_code: string;
  information_type: string;
  decision: 'EXEMPT' | 'DISCLOSED';
  decision_date: Date;
  department: string | null;
  requester_category: string | null;
}

export interface ConsistencyCheckHistory {
  id: string;
  foia_response_id: string;
  overall_risk: ConsistencyRiskLevel;
  is_consistent: boolean;
  alerts_count: number;
  status: ConsistencyCheckStatus;
  checked_at: Date;
  overridden: boolean;
  department: string | null;
  record_types: string[];
}

// ============================================================================
// Monthly Report Types
// ============================================================================

export interface MonthlyConsistencyReport {
  id: string;
  tenant_id: string;
  report_month: Date;

  // Summary Metrics
  total_checks: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  override_count: number;

  // Consistency Metrics
  overall_consistency_rate: number;
  most_inconsistent_exemptions: string[];
  departments_with_issues: string[];

  // Alerts
  critical_findings: string[];
  recommendations: string[];

  // Report Metadata
  generated_at: Date;
  generated_by: string;
  sent_to: string[];

  createdAt: Date;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface CheckConsistencyInput {
  response_id: string;
  exemption_decisions: {
    exemption_code: string;
    information_type: string;
    decision: 'EXEMPT' | 'DISCLOSED';
    rationale?: string;
  }[];
  record_types: string[];
  department?: string;
  requester_category?: string;
}

export interface OverrideConsistencyInput {
  justification: string;
}

export interface GetHistoryFilters {
  start_date?: Date;
  end_date?: Date;
  risk_level?: ConsistencyRiskLevel;
  department?: string;
  status?: ConsistencyCheckStatus;
  limit?: number;
  offset?: number;
}

export interface GetHeatmapFilters {
  start_date?: Date;
  end_date?: Date;
  department?: string;
  min_applications?: number;
}

// ============================================================================
// Dashboard Metrics Types
// ============================================================================

export interface ConsistencyDashboardMetrics {
  checks_last_30_days: number;
  high_risk_last_30_days: number;
  override_rate_last_30_days: number;
  avg_consistency_rate: number;
  most_inconsistent_exemption: {
    code: string;
    rate: number;
  } | null;
  pending_high_risk_count: number;
}
