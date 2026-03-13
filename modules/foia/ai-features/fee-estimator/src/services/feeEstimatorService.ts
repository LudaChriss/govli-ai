/**
 * AI-8: Real-Time Fee Estimator - Service Layer
 */

import { Pool } from 'pg';
import { getSharedAIClient, emit } from '@govli/foia-shared';
import * as crypto from 'crypto';
import {
  FeeEstimationInput,
  FeeEstimate,
  FeeEstimationResponse,
  AgencyFeeSchedule,
  FeeBreakdown,
  SearchTimeEstimate,
  PageVolumeEstimate,
  WaiverEligibility,
  FeeCalculationContext,
  RequesterCategory,
  FeeEstimatorOptions
} from '../types';

/**
 * FeeEstimatorService
 * Calculates fee estimates with ML-based search time prediction
 */
export class FeeEstimatorService {
  private db: Pool;
  private options: FeeEstimatorOptions;

  constructor(db: Pool, options: FeeEstimatorOptions = {}) {
    this.db = db;
    this.options = {
      use_ml_model: options.use_ml_model !== false,
      confidence_threshold: options.confidence_threshold || 0.6,
      default_search_hours: options.default_search_hours || 2,
      default_pages: options.default_pages || 50
    };
  }

  /**
   * Generate comprehensive fee estimate
   */
  async generateFeeEstimate(
    tenantId: string,
    input: FeeEstimationInput
  ): Promise<FeeEstimationResponse> {
    const startTime = Date.now();

    // 1. Fetch agency fee schedule
    const schedule = await this.getFeeSchedule(tenantId, input.agencies_requested[0] || 'default');

    // 2. Estimate search hours using ML or fallback
    const searchEstimate = await this.estimateSearchHours(
      tenantId,
      input.description,
      input.record_types || [],
      input.date_range_years || 1,
      input.estimated_record_volume || 'moderate'
    );

    // 3. Estimate page volume
    const pageEstimate = await this.estimatePageVolume(
      tenantId,
      input.record_types || [],
      input.estimated_record_volume || 'moderate'
    );

    // 4. Calculate review hours (for commercial requests)
    const reviewHours = input.requester_category === 'commercial' && schedule.commercial_review_required
      ? searchEstimate.estimated_hours * 0.5 // Review takes ~50% of search time
      : 0;

    // 5. Calculate fee breakdown
    const breakdown = this.calculateFeeBreakdown({
      schedule,
      requester_category: input.requester_category,
      search_hours: searchEstimate.estimated_hours,
      review_hours: reviewHours,
      estimated_pages: pageEstimate.estimated_pages
    });

    // 6. Calculate estimate range (±25% of likely fee)
    const lowEstimate = Math.max(0, breakdown.total * 0.75);
    const highEstimate = breakdown.total * 1.25;

    // 7. Determine waiver eligibility
    const waiverEligibility = this.determineWaiverEligibility(
      input.requester_category,
      breakdown.total,
      schedule
    );

    // 8. Generate plain-English explanation using Claude
    const explanation = await this.generatePlainEnglishExplanation(
      tenantId,
      input.requester_category,
      breakdown.total,
      waiverEligibility.eligible,
      schedule.advance_payment_threshold
    );

    // 9. Store estimate in database
    const estimate = await this.storeFeeEstimate(tenantId, input, {
      fee_estimate_low: lowEstimate,
      fee_estimate_high: highEstimate,
      likely_fee: breakdown.total,
      likely_fee_waiver_eligible: waiverEligibility.eligible,
      plain_english_explanation: explanation,
      fee_breakdown: breakdown,
      waiver_application_url: waiverEligibility.application_url,
      estimation_confidence: searchEstimate.confidence,
      model_used: searchEstimate.method
    });

    // 10. Emit analytics event
    const generationTime = Date.now() - startTime;
    await this.emitAnalyticsEvent({
      tenant_id: tenantId,
      event_type: 'fee_estimated',
      foia_request_id: input.foia_request_id,
      requester_category: input.requester_category,
      estimated_fee: breakdown.total,
      estimation_method: searchEstimate.method,
      generation_time_ms: generationTime
    });

    return {
      fee_estimate_low: lowEstimate,
      fee_estimate_high: highEstimate,
      likely_fee: breakdown.total,
      likely_fee_waiver_eligible: waiverEligibility.eligible,
      plain_english_explanation: explanation,
      fee_breakdown: breakdown,
      waiver_application_url: waiverEligibility.application_url,
      below_threshold: breakdown.total < schedule.fee_waiver_threshold,
      advance_payment_required: breakdown.total > schedule.advance_payment_threshold,
      estimation_confidence: searchEstimate.confidence
    };
  }

  /**
   * Get fee schedule for agency
   */
  private async getFeeSchedule(tenantId: string, agencyId: string): Promise<AgencyFeeSchedule> {
    const result = await this.db.query(
      `SELECT *
       FROM "FoiaFeeSchedules"
       WHERE tenant_id = $1
         AND agency_id = $2
         AND superseded_at IS NULL
       ORDER BY effective_date DESC
       LIMIT 1`,
      [tenantId, agencyId]
    );

    if (result.rows.length === 0) {
      // Return default schedule
      return {
        agency_id: 'default',
        agency_name: 'Default Agency',
        search_rate_per_hour: 25.00,
        review_rate_per_hour: 40.00,
        copy_rate_per_page: 0.10,
        first_two_hours_free_general: true,
        first_100_pages_free_general: true,
        first_100_pages_free_media: true,
        commercial_review_required: true,
        fee_waiver_threshold: 15.00,
        advance_payment_threshold: 25.00
      };
    }

    const row = result.rows[0];
    return {
      agency_id: row.agency_id,
      agency_name: row.agency_name,
      search_rate_per_hour: parseFloat(row.search_rate_per_hour),
      review_rate_per_hour: parseFloat(row.review_rate_per_hour),
      copy_rate_per_page: parseFloat(row.copy_rate_per_page),
      first_two_hours_free_general: row.first_two_hours_free_general,
      first_100_pages_free_general: row.first_100_pages_free_general,
      first_100_pages_free_media: row.first_100_pages_free_media,
      commercial_review_required: row.commercial_review_required,
      fee_waiver_threshold: parseFloat(row.fee_waiver_threshold),
      advance_payment_threshold: parseFloat(row.advance_payment_threshold)
    };
  }

  /**
   * Estimate search hours using ML model or fallback
   */
  private async estimateSearchHours(
    tenantId: string,
    description: string,
    recordTypes: string[],
    dateRangeYears: number,
    estimatedVolume: string
  ): Promise<SearchTimeEstimate> {
    // Try ML model first if enabled and we have historical data
    if (this.options.use_ml_model) {
      try {
        const mlEstimate = await this.mlEstimateSearchHours(
          tenantId,
          recordTypes,
          dateRangeYears,
          estimatedVolume
        );

        if (mlEstimate.confidence === 'high' || mlEstimate.confidence === 'medium') {
          return mlEstimate;
        }
      } catch (error) {
        console.warn('[FeeEstimator] ML estimation failed, falling back to agency average:', error);
      }
    }

    // Fallback to agency averages
    return this.fallbackEstimateSearchHours(
      tenantId,
      recordTypes,
      dateRangeYears,
      estimatedVolume
    );
  }

  /**
   * ML-based search hour estimation
   */
  private async mlEstimateSearchHours(
    tenantId: string,
    recordTypes: string[],
    dateRangeYears: number,
    estimatedVolume: string
  ): Promise<SearchTimeEstimate> {
    // Find similar historical cases
    const result = await this.db.query(
      `SELECT actual_search_hours, date_range_years, estimated_volume
       FROM "FoiaHistoricalFeeCases"
       WHERE tenant_id = $1
         AND record_type = ANY($2)
         AND date_range_years BETWEEN $3 - 1 AND $3 + 1
       ORDER BY closed_at DESC
       LIMIT 20`,
      [tenantId, recordTypes.length > 0 ? recordTypes : ['general'], dateRangeYears]
    );

    if (result.rows.length < 3) {
      return {
        estimated_hours: this.options.default_search_hours!,
        confidence: 'low',
        method: 'ml_model',
        similar_cases_count: result.rows.length
      };
    }

    // Simple average of similar cases (in production, use proper ML model)
    const avgHours = result.rows.reduce((sum, row) => sum + parseFloat(row.actual_search_hours), 0) / result.rows.length;

    // Adjust for volume
    const volumeMultipliers = {
      low: 0.7,
      moderate: 1.0,
      high: 1.3,
      very_high: 1.6
    };
    const adjustedHours = avgHours * (volumeMultipliers[estimatedVolume as keyof typeof volumeMultipliers] || 1.0);

    return {
      estimated_hours: Math.round(adjustedHours * 10) / 10, // Round to 1 decimal
      confidence: result.rows.length >= 10 ? 'high' : 'medium',
      method: 'ml_model',
      similar_cases_count: result.rows.length
    };
  }

  /**
   * Fallback search hour estimation using agency averages
   */
  private async fallbackEstimateSearchHours(
    tenantId: string,
    recordTypes: string[],
    dateRangeYears: number,
    estimatedVolume: string
  ): Promise<SearchTimeEstimate> {
    // Base estimates by volume
    const baseHours: { [key: string]: number } = {
      low: 1.5,
      moderate: 3.0,
      high: 6.0,
      very_high: 12.0
    };

    let hours = baseHours[estimatedVolume] || baseHours.moderate;

    // Adjust for date range (more years = more search time)
    hours = hours * Math.sqrt(dateRangeYears);

    return {
      estimated_hours: Math.round(hours * 10) / 10,
      confidence: 'low',
      method: 'default'
    };
  }

  /**
   * Estimate page volume
   */
  private async estimatePageVolume(
    tenantId: string,
    recordTypes: string[],
    estimatedVolume: string
  ): Promise<PageVolumeEstimate> {
    // Volume-based estimates
    const volumePages: { [key: string]: number } = {
      low: 25,
      moderate: 100,
      high: 300,
      very_high: 750
    };

    return {
      estimated_pages: volumePages[estimatedVolume] || volumePages.moderate,
      confidence: 'medium',
      method: 'volume_category'
    };
  }

  /**
   * Calculate fee breakdown by requester category
   */
  private calculateFeeBreakdown(context: FeeCalculationContext): FeeBreakdown {
    const { schedule, requester_category, search_hours, review_hours, estimated_pages } = context;
    const exemptions: string[] = [];

    let searchCost = 0;
    let reviewCost = 0;
    let copyCost = 0;

    switch (requester_category) {
      case 'commercial':
        // Commercial: full fees for everything
        searchCost = search_hours * schedule.search_rate_per_hour;
        reviewCost = review_hours * schedule.review_rate_per_hour;
        copyCost = estimated_pages * schedule.copy_rate_per_page;
        break;

      case 'news_media':
      case 'educational':
      case 'scientific':
        // Media/Educational: no search/review fees, only pages beyond 100
        searchCost = 0;
        reviewCost = 0;
        const chargeablePages = Math.max(0, estimated_pages - (schedule.first_100_pages_free_media ? 100 : 0));
        copyCost = chargeablePages * schedule.copy_rate_per_page;
        if (schedule.first_100_pages_free_media && estimated_pages > 100) {
          exemptions.push('First 100 pages free');
        }
        break;

      case 'general_public':
      default:
        // General public: first 2 hours free, first 100 pages free
        const chargeableSearchHours = Math.max(0, search_hours - (schedule.first_two_hours_free_general ? 2 : 0));
        searchCost = chargeableSearchHours * schedule.search_rate_per_hour;
        reviewCost = 0; // No review for general public

        const chargeablePublicPages = Math.max(0, estimated_pages - (schedule.first_100_pages_free_general ? 100 : 0));
        copyCost = chargeablePublicPages * schedule.copy_rate_per_page;

        if (schedule.first_two_hours_free_general && search_hours > 2) {
          exemptions.push('First 2 hours of search free');
        }
        if (schedule.first_100_pages_free_general && estimated_pages > 100) {
          exemptions.push('First 100 pages free');
        }
        break;
    }

    const subtotal = searchCost + reviewCost + copyCost;
    const total = Math.round(subtotal * 100) / 100; // Round to 2 decimals

    return {
      search_hours,
      search_cost: Math.round(searchCost * 100) / 100,
      review_hours: review_hours > 0 ? review_hours : undefined,
      review_cost: reviewCost > 0 ? Math.round(reviewCost * 100) / 100 : undefined,
      estimated_pages,
      copy_cost: Math.round(copyCost * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      exemptions_applied: exemptions,
      total
    };
  }

  /**
   * Determine fee waiver eligibility
   */
  private determineWaiverEligibility(
    requesterCategory: RequesterCategory,
    estimatedFee: number,
    schedule: AgencyFeeSchedule
  ): WaiverEligibility {
    // Auto-approved if below threshold
    if (estimatedFee < schedule.fee_waiver_threshold) {
      return {
        eligible: true,
        reason: `Fee is below auto-waiver threshold of $${schedule.fee_waiver_threshold}`,
        auto_approved: true
      };
    }

    // News media, educational, scientific are likely eligible
    if (['news_media', 'educational', 'scientific'].includes(requesterCategory)) {
      return {
        eligible: true,
        reason: `Requester category '${requesterCategory}' typically qualifies for fee waivers`,
        auto_approved: false,
        application_url: '/apply-for-fee-waiver'
      };
    }

    // General public may qualify
    if (requesterCategory === 'general_public') {
      return {
        eligible: true,
        reason: 'Fee waivers are available if disclosure primarily benefits the public',
        auto_approved: false,
        application_url: '/apply-for-fee-waiver'
      };
    }

    // Commercial unlikely to qualify
    return {
      eligible: false,
      reason: 'Commercial requesters typically do not qualify for fee waivers',
      auto_approved: false
    };
  }

  /**
   * Generate plain-English explanation using Claude
   */
  private async generatePlainEnglishExplanation(
    tenantId: string,
    requesterCategory: RequesterCategory,
    estimatedFee: number,
    waiverEligible: boolean,
    advancePaymentThreshold: number
  ): Promise<string> {
    const aiClient = getSharedAIClient();

    const systemPrompt = `You are a helpful government employee explaining FOIA fees to a member of the public.

Write a friendly, 4-6 sentence fee explanation. Explain:
1. Why there may be fees
2. What the estimated range is and what it covers
3. Whether they may qualify for a fee waiver based on their requester category
4. What happens next regarding fees

Use plain language, grade 7 reading level. Do not be legalistic.
Be transparent and reassuring. End with: "You won't be charged without advance notice if fees exceed $${advancePaymentThreshold}."`;

    const userPrompt = `Requester category: ${requesterCategory}
Estimated fee: $${estimatedFee.toFixed(2)}
Fee waiver eligible: ${waiverEligible ? 'Yes' : 'No'}
Advance payment threshold: $${advancePaymentThreshold}

Write a plain-English fee explanation.`;

    try {
      const response = await aiClient.callWithAudit(
        {
          prompt: userPrompt,
          systemPrompt,
          maxTokens: 500,
          temperature: 0.7,
          model: 'claude-3-5-sonnet-20241022'
        },
        'ai-8-fee-explanation',
        tenantId,
        undefined
      );

      return response.content.trim();
    } catch (error) {
      console.error('[FeeEstimator] Failed to generate plain-English explanation:', error);

      // Fallback explanation
      return this.generateFallbackExplanation(
        requesterCategory,
        estimatedFee,
        waiverEligible,
        advancePaymentThreshold
      );
    }
  }

  /**
   * Fallback explanation if AI fails
   */
  private generateFallbackExplanation(
    requesterCategory: RequesterCategory,
    estimatedFee: number,
    waiverEligible: boolean,
    advancePaymentThreshold: number
  ): string {
    const parts: string[] = [];

    parts.push(`FOIA fees cover the cost of searching for, reviewing, and copying responsive records.`);
    parts.push(`Based on your request, we estimate fees will be approximately $${estimatedFee.toFixed(2)}.`);

    if (waiverEligible) {
      parts.push(`Good news: you may qualify for a fee waiver or reduction based on your requester category (${requesterCategory}).`);
    } else {
      parts.push(`As a ${requesterCategory} requester, you may not qualify for a fee waiver, but you can still apply.`);
    }

    parts.push(`This is just an estimate - actual fees may vary based on the records found.`);
    parts.push(`You won't be charged without advance notice if fees exceed $${advancePaymentThreshold}.`);

    return parts.join(' ');
  }

  /**
   * Store fee estimate in database
   */
  private async storeFeeEstimate(
    tenantId: string,
    input: FeeEstimationInput,
    estimate: Partial<FeeEstimate>
  ): Promise<FeeEstimate> {
    const result = await this.db.query(
      `INSERT INTO "FoiaFeeEstimates" (
        tenant_id,
        foia_request_id,
        requester_category,
        fee_estimate_low,
        fee_estimate_high,
        likely_fee,
        likely_fee_waiver_eligible,
        fee_breakdown,
        plain_english_explanation,
        waiver_application_url,
        estimation_confidence,
        model_used,
        estimation_method
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        tenantId,
        input.foia_request_id,
        input.requester_category,
        estimate.fee_estimate_low,
        estimate.fee_estimate_high,
        estimate.likely_fee,
        estimate.likely_fee_waiver_eligible,
        JSON.stringify(estimate.fee_breakdown),
        estimate.plain_english_explanation,
        estimate.waiver_application_url || null,
        estimate.estimation_confidence,
        estimate.model_used,
        estimate.model_used
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      foia_request_id: row.foia_request_id,
      tenant_id: row.tenant_id,
      requester_category: row.requester_category,
      fee_estimate_low: parseFloat(row.fee_estimate_low),
      fee_estimate_high: parseFloat(row.fee_estimate_high),
      likely_fee: parseFloat(row.likely_fee),
      likely_fee_waiver_eligible: row.likely_fee_waiver_eligible,
      plain_english_explanation: row.plain_english_explanation,
      fee_breakdown: JSON.parse(row.fee_breakdown),
      waiver_application_url: row.waiver_application_url,
      estimated_at: row.estimated_at,
      estimation_confidence: row.estimation_confidence,
      model_used: row.model_used,
      accuracy_tracked: row.accuracy_tracked,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  /**
   * Get stored fee estimate
   */
  async getFeeEstimate(tenantId: string, foiaRequestId: string): Promise<FeeEstimate | null> {
    const result = await this.db.query(
      `SELECT *
       FROM "FoiaFeeEstimates"
       WHERE tenant_id = $1
         AND foia_request_id = $2
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      [tenantId, foiaRequestId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      foia_request_id: row.foia_request_id,
      tenant_id: row.tenant_id,
      requester_category: row.requester_category,
      fee_estimate_low: parseFloat(row.fee_estimate_low),
      fee_estimate_high: parseFloat(row.fee_estimate_high),
      likely_fee: parseFloat(row.likely_fee),
      likely_fee_waiver_eligible: row.likely_fee_waiver_eligible,
      plain_english_explanation: row.plain_english_explanation,
      fee_breakdown: JSON.parse(row.fee_breakdown),
      waiver_application_url: row.waiver_application_url,
      estimated_at: row.estimated_at,
      estimation_confidence: row.estimation_confidence,
      model_used: row.model_used,
      actual_fee: row.actual_fee ? parseFloat(row.actual_fee) : undefined,
      accuracy_tracked: row.accuracy_tracked,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  /**
   * Track actual fee for accuracy metrics
   */
  async trackActualFee(
    tenantId: string,
    foiaRequestId: string,
    actualFee: number,
    actualSearchHours: number,
    actualPages: number
  ): Promise<void> {
    const estimate = await this.getFeeEstimate(tenantId, foiaRequestId);

    if (!estimate) {
      console.warn('[FeeEstimator] No estimate found to track actual fee');
      return;
    }

    const accuracyPercentage = actualFee > 0
      ? Math.max(0, (1 - Math.abs(estimate.likely_fee - actualFee) / actualFee) * 100)
      : 100;

    await this.db.query(
      `UPDATE "FoiaFeeEstimates"
       SET actual_fee = $1,
           actual_search_hours = $2,
           actual_pages = $3,
           accuracy_percentage = $4,
           accuracy_tracked = true,
           tracked_at = NOW(),
           "updatedAt" = NOW()
       WHERE tenant_id = $5
         AND foia_request_id = $6`,
      [actualFee, actualSearchHours, actualPages, accuracyPercentage, tenantId, foiaRequestId]
    );

    // Also add to historical cases for future ML training
    await this.db.query(
      `INSERT INTO "FoiaHistoricalFeeCases" (
        tenant_id,
        foia_request_id,
        requester_category,
        actual_search_hours,
        actual_pages,
        actual_fee,
        closed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [tenantId, foiaRequestId, estimate.requester_category, actualSearchHours, actualPages, actualFee]
    );
  }

  /**
   * Emit analytics event
   */
  private async emitAnalyticsEvent(data: {
    tenant_id: string;
    event_type: string;
    foia_request_id: string;
    requester_category: string;
    estimated_fee: number;
    estimation_method: string;
    generation_time_ms: number;
  }): Promise<void> {
    try {
      await emit({
        id: crypto.randomUUID(),
        tenant_id: data.tenant_id,
        event_type: `foia.ai.fee-estimator.${data.event_type}`,
        entity_id: data.foia_request_id,
        entity_type: 'foia_request',
        metadata: {
          requester_category: data.requester_category,
          estimated_fee: data.estimated_fee,
          estimation_method: data.estimation_method,
          generation_time_ms: data.generation_time_ms
        },
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[FeeEstimator] Failed to emit analytics event:', error);
    }
  }
}
