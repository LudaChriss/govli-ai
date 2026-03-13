/**
 * Govli AI FOIA Module - Fee Calculator Service
 * Calculates fee estimates based on requester category and agency fee schedules
 */

import { Pool } from 'pg';

export interface FeeSchedule {
  id: string;
  tenant_id: string;
  agency_id: string;
  agency_name: string;
  search_rate_per_hour: number;
  review_rate_per_hour: number;
  copy_rate_per_page: number;
  first_two_hours_free_general: boolean;
  first_100_pages_free_general: boolean;
  first_100_pages_free_media: boolean;
  commercial_review_required: boolean;
  fee_waiver_threshold: number;
  advance_payment_threshold: number;
}

export interface SearchTimeEstimate {
  estimated_hours: number;
  confidence: 'low' | 'medium' | 'high';
  method: 'ml_model' | 'agency_average' | 'default';
  model_used?: string;
}

export interface FeeBreakdown {
  search_hours: number;
  search_cost: number;
  review_hours: number;
  review_cost: number;
  estimated_pages: number;
  copy_cost: number;
  subtotal: number;
  exemptions_applied: string[];
  total: number;
}

export interface FeeEstimateResult {
  fee_estimate_low: number;
  fee_estimate_high: number;
  likely_fee: number;
  likely_fee_waiver_eligible: boolean;
  fee_breakdown: FeeBreakdown;
  estimation_confidence: 'low' | 'medium' | 'high';
}

export interface FeeEstimateInput {
  description: string;
  requester_category: 'COMMERCIAL' | 'EDUCATIONAL' | 'NEWS_MEDIA' | 'PUBLIC_INTEREST' | 'OTHER';
  agency_id: string;
  date_range_years?: number;
  estimated_record_volume?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  record_type?: string;
}

/**
 * Fee Calculator Service
 */
export class FeeCalculator {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  /**
   * Calculate fee estimate for a FOIA request
   */
  async calculateFeeEstimate(
    input: FeeEstimateInput,
    tenantId: string
  ): Promise<FeeEstimateResult> {
    // 1. Get agency fee schedule
    const feeSchedule = await this.getFeeSchedule(tenantId, input.agency_id);

    // 2. Estimate search hours using historical data or defaults
    const searchEstimate = await this.estimateSearchHours(
      tenantId,
      input.record_type,
      input.date_range_years || 0,
      input.estimated_record_volume || 'MEDIUM'
    );

    // 3. Estimate page count based on record volume
    const pageEstimate = this.estimatePageCount(
      input.estimated_record_volume || 'MEDIUM'
    );

    // 4. Calculate fees based on requester category
    const feeBreakdown = this.calculateFees(
      input.requester_category,
      searchEstimate.estimated_hours,
      pageEstimate,
      feeSchedule
    );

    // 5. Calculate low/high estimates (±25% variance)
    const fee_estimate_low = Math.max(0, feeBreakdown.total * 0.75);
    const fee_estimate_high = feeBreakdown.total * 1.25;
    const likely_fee = feeBreakdown.total;

    // 6. Determine fee waiver eligibility
    const likely_fee_waiver_eligible = this.isFeeWaiverEligible(
      input.requester_category,
      likely_fee,
      feeSchedule
    );

    return {
      fee_estimate_low,
      fee_estimate_high,
      likely_fee,
      likely_fee_waiver_eligible,
      fee_breakdown: feeBreakdown,
      estimation_confidence: searchEstimate.confidence
    };
  }

  /**
   * Get fee schedule for agency
   */
  private async getFeeSchedule(
    tenantId: string,
    agencyId: string
  ): Promise<FeeSchedule> {
    const result = await this.db.query(
      `SELECT * FROM "FoiaFeeSchedules"
       WHERE tenant_id = $1 AND agency_id = $2 AND superseded_at IS NULL
       ORDER BY effective_date DESC
       LIMIT 1`,
      [tenantId, agencyId]
    );

    if (result.rows.length === 0) {
      // Fallback to default fee schedule
      const defaultResult = await this.db.query(
        `SELECT * FROM "FoiaFeeSchedules"
         WHERE tenant_id = 'default' AND agency_id = 'default-agency'
         LIMIT 1`
      );

      if (defaultResult.rows.length === 0) {
        throw new Error('No fee schedule found for agency or default');
      }

      return defaultResult.rows[0];
    }

    return result.rows[0];
  }

  /**
   * Estimate search hours using historical data
   */
  private async estimateSearchHours(
    tenantId: string,
    recordType: string | undefined,
    dateRangeYears: number,
    estimatedVolume: string
  ): Promise<SearchTimeEstimate> {
    try {
      // Try to find similar historical cases
      const result = await this.db.query(
        `SELECT AVG(actual_search_hours) as avg_hours, COUNT(*) as count
         FROM "FoiaHistoricalFeeCases"
         WHERE tenant_id = $1
           AND record_type = $2
           AND date_range_years BETWEEN $3 - 0.5 AND $3 + 0.5
           AND estimated_volume = $4`,
        [tenantId, recordType || 'general', dateRangeYears, estimatedVolume]
      );

      if (result.rows.length > 0 && result.rows[0].count > 0) {
        const avgHours = parseFloat(result.rows[0].avg_hours) || 0;
        return {
          estimated_hours: Math.round(avgHours * 10) / 10, // Round to 1 decimal
          confidence: result.rows[0].count >= 10 ? 'high' : 'medium',
          method: 'agency_average'
        };
      }
    } catch (error) {
      console.error('Error querying historical data:', error);
    }

    // Fallback: Use default estimates based on volume
    const defaultHours = this.getDefaultSearchHours(estimatedVolume, dateRangeYears);
    return {
      estimated_hours: defaultHours,
      confidence: 'low',
      method: 'default'
    };
  }

  /**
   * Get default search hours based on volume and date range
   */
  private getDefaultSearchHours(volume: string, dateRangeYears: number): number {
    let baseHours = 2; // Default starting point

    // Adjust for volume
    switch (volume) {
      case 'LOW':
        baseHours = 1;
        break;
      case 'MEDIUM':
        baseHours = 3;
        break;
      case 'HIGH':
        baseHours = 6;
        break;
      case 'VERY_HIGH':
        baseHours = 12;
        break;
    }

    // Adjust for date range (more years = more search time)
    const dateRangeMultiplier = 1 + (dateRangeYears * 0.1); // +10% per year
    return Math.round(baseHours * dateRangeMultiplier * 10) / 10;
  }

  /**
   * Estimate page count based on record volume
   */
  private estimatePageCount(volume: string): number {
    switch (volume) {
      case 'LOW':
        return 50;
      case 'MEDIUM':
        return 250;
      case 'HIGH':
        return 750;
      case 'VERY_HIGH':
        return 2000;
      default:
        return 250;
    }
  }

  /**
   * Calculate fees based on requester category and fee schedule
   */
  private calculateFees(
    requesterCategory: string,
    searchHours: number,
    estimatedPages: number,
    feeSchedule: FeeSchedule
  ): FeeBreakdown {
    let search_hours = searchHours;
    let review_hours = 0;
    let search_cost = 0;
    let review_cost = 0;
    let copy_cost = 0;
    let pages_to_charge = estimatedPages;
    const exemptions_applied: string[] = [];

    // Apply category-specific rules
    switch (requesterCategory) {
      case 'COMMERCIAL':
        // Commercial: Full fees apply
        // Charge for all search hours
        search_cost = search_hours * feeSchedule.search_rate_per_hour;

        // Commercial requests require review
        if (feeSchedule.commercial_review_required) {
          review_hours = search_hours * 0.5; // Estimate 50% of search time for review
          review_cost = review_hours * feeSchedule.review_rate_per_hour;
        }

        // Charge for all pages
        copy_cost = pages_to_charge * feeSchedule.copy_rate_per_page;
        break;

      case 'NEWS_MEDIA':
      case 'EDUCATIONAL':
        // News media & educational: Only copying fees beyond first 100 pages
        exemptions_applied.push('No search fees for news media/educational');
        exemptions_applied.push('No review fees for news media/educational');

        if (feeSchedule.first_100_pages_free_media && estimatedPages > 100) {
          pages_to_charge = estimatedPages - 100;
          copy_cost = pages_to_charge * feeSchedule.copy_rate_per_page;
          exemptions_applied.push('First 100 pages free');
        } else if (!feeSchedule.first_100_pages_free_media) {
          copy_cost = pages_to_charge * feeSchedule.copy_rate_per_page;
        } else {
          pages_to_charge = 0;
          copy_cost = 0;
          exemptions_applied.push('All pages free (under 100 pages)');
        }
        break;

      case 'PUBLIC_INTEREST':
      case 'OTHER':
      default:
        // General public: First 2 hours of search + first 100 pages free
        if (feeSchedule.first_two_hours_free_general && search_hours > 2) {
          const billable_search_hours = search_hours - 2;
          search_cost = billable_search_hours * feeSchedule.search_rate_per_hour;
          exemptions_applied.push('First 2 hours of search free');
        } else if (!feeSchedule.first_two_hours_free_general) {
          search_cost = search_hours * feeSchedule.search_rate_per_hour;
        } else {
          exemptions_applied.push('All search hours free (under 2 hours)');
        }

        if (feeSchedule.first_100_pages_free_general && estimatedPages > 100) {
          pages_to_charge = estimatedPages - 100;
          copy_cost = pages_to_charge * feeSchedule.copy_rate_per_page;
          exemptions_applied.push('First 100 pages free');
        } else if (!feeSchedule.first_100_pages_free_general) {
          copy_cost = pages_to_charge * feeSchedule.copy_rate_per_page;
        } else {
          pages_to_charge = 0;
          copy_cost = 0;
          exemptions_applied.push('All pages free (under 100 pages)');
        }
        break;
    }

    const subtotal = search_cost + review_cost + copy_cost;
    const total = Math.round(subtotal * 100) / 100; // Round to cents

    return {
      search_hours,
      search_cost: Math.round(search_cost * 100) / 100,
      review_hours: Math.round(review_hours * 10) / 10,
      review_cost: Math.round(review_cost * 100) / 100,
      estimated_pages: estimatedPages,
      copy_cost: Math.round(copy_cost * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      exemptions_applied,
      total
    };
  }

  /**
   * Determine if requester is likely eligible for fee waiver
   */
  private isFeeWaiverEligible(
    requesterCategory: string,
    likelyFee: number,
    feeSchedule: FeeSchedule
  ): boolean {
    // Fee waiver eligibility criteria:
    // 1. Request is in public interest (NEWS_MEDIA, EDUCATIONAL, PUBLIC_INTEREST)
    // 2. Fee is below threshold
    // 3. Commercial requesters are generally not eligible

    if (requesterCategory === 'COMMERCIAL') {
      return false;
    }

    if (likelyFee < feeSchedule.fee_waiver_threshold) {
      return true;
    }

    // News media and educational requesters may be eligible even with higher fees
    if (
      requesterCategory === 'NEWS_MEDIA' ||
      requesterCategory === 'EDUCATIONAL' ||
      requesterCategory === 'PUBLIC_INTEREST'
    ) {
      return true;
    }

    return false;
  }
}
