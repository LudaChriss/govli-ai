/**
 * AI-8: Real-Time Fee Estimator - Type Definitions
 */

// ============================================================================
// Requester Categories
// ============================================================================

export type RequesterCategory =
  | 'commercial'
  | 'news_media'
  | 'educational'
  | 'scientific'
  | 'general_public'
  | 'other';

// ============================================================================
// Fee Schedule
// ============================================================================

export interface AgencyFeeSchedule {
  agency_id: string;
  agency_name: string;
  search_rate_per_hour: number;          // e.g., $25/hour
  review_rate_per_hour: number;          // e.g., $40/hour (for commercial)
  copy_rate_per_page: number;            // e.g., $0.10/page
  first_two_hours_free_general: boolean; // General public: first 2 hours free
  first_100_pages_free_general: boolean; // General public: first 100 pages free
  first_100_pages_free_media: boolean;   // News media: first 100 pages free
  commercial_review_required: boolean;   // Commercial requests require review time
  fee_waiver_threshold: number;          // Auto-approve waiver below this (e.g., $15)
  advance_payment_threshold: number;     // Require advance notice above this (e.g., $25)
}

// ============================================================================
// Fee Estimation Input
// ============================================================================

export interface FeeEstimationInput {
  foia_request_id: string;
  description: string;
  requester_category: RequesterCategory;
  agencies_requested: string[];
  date_range_years?: number;
  estimated_record_volume?: 'low' | 'moderate' | 'high' | 'very_high';
  record_types?: string[];
}

// ============================================================================
// Fee Breakdown
// ============================================================================

export interface FeeBreakdown {
  search_hours: number;
  search_cost: number;
  review_hours?: number;
  review_cost?: number;
  estimated_pages: number;
  copy_cost: number;
  subtotal: number;
  exemptions_applied: string[]; // e.g., "First 2 hours free", "First 100 pages free"
  total: number;
}

// ============================================================================
// Fee Estimate
// ============================================================================

export interface FeeEstimate {
  id: string;
  foia_request_id: string;
  tenant_id: string;
  requester_category: RequesterCategory;
  fee_estimate_low: number;
  fee_estimate_high: number;
  likely_fee: number; // Most likely amount
  likely_fee_waiver_eligible: boolean;
  plain_english_explanation: string;
  fee_breakdown: FeeBreakdown;
  waiver_application_url?: string;
  estimated_at: Date;
  estimation_confidence: 'low' | 'medium' | 'high';
  model_used?: string; // ML model version or 'fallback'
  actual_fee?: number; // Filled in after case closes
  accuracy_tracked: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Fee Estimation Response
// ============================================================================

export interface FeeEstimationResponse {
  fee_estimate_low: number;
  fee_estimate_high: number;
  likely_fee: number;
  likely_fee_waiver_eligible: boolean;
  plain_english_explanation: string;
  fee_breakdown: FeeBreakdown;
  waiver_application_url?: string;
  below_threshold: boolean;
  advance_payment_required: boolean;
  estimation_confidence: 'low' | 'medium' | 'high';
}

// ============================================================================
// Historical Data (for ML model)
// ============================================================================

export interface HistoricalFeeCase {
  record_type: string;
  date_range_years: number;
  requester_category: RequesterCategory;
  actual_search_hours: number;
  actual_pages: number;
  actual_fee: number;
}

// ============================================================================
// Search Time Estimation
// ============================================================================

export interface SearchTimeEstimate {
  estimated_hours: number;
  confidence: 'low' | 'medium' | 'high';
  method: 'ml_model' | 'agency_average' | 'default';
  similar_cases_count?: number;
}

// ============================================================================
// Page Volume Estimation
// ============================================================================

export interface PageVolumeEstimate {
  estimated_pages: number;
  confidence: 'low' | 'medium' | 'high';
  method: 'ml_model' | 'record_type_average' | 'volume_category' | 'default';
}

// ============================================================================
// Waiver Eligibility
// ============================================================================

export interface WaiverEligibility {
  eligible: boolean;
  reason: string;
  auto_approved: boolean; // If fee is below threshold
  application_url?: string;
}

// ============================================================================
// Fee Accuracy Tracking
// ============================================================================

export interface FeeAccuracyMetrics {
  total_estimates: number;
  estimates_with_actuals: number;
  avg_accuracy_percentage: number;
  within_25_percent: number;
  within_50_percent: number;
  overestimates: number;
  underestimates: number;
}

// ============================================================================
// Service Options
// ============================================================================

export interface FeeEstimatorOptions {
  use_ml_model?: boolean;
  confidence_threshold?: number; // Minimum confidence to use ML
  default_search_hours?: number;
  default_pages?: number;
}

// ============================================================================
// Fee Calculation Context
// ============================================================================

export interface FeeCalculationContext {
  schedule: AgencyFeeSchedule;
  requester_category: RequesterCategory;
  search_hours: number;
  review_hours: number;
  estimated_pages: number;
}
