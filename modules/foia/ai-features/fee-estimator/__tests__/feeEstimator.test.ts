/**
 * AI-8: Real-Time Fee Estimator - Test Suite
 */

import { Pool } from 'pg';
import { FeeEstimatorService } from '../src/services/feeEstimatorService';
import { FeeEstimationInput, AgencyFeeSchedule, FeeCalculationContext } from '../src/types';

// Mock the shared AI client
jest.mock('@govli/foia-shared', () => ({
  getSharedAIClient: jest.fn(),
  emit: jest.fn().mockResolvedValue(undefined)
}));

import { getSharedAIClient } from '@govli/foia-shared';

describe('AI-8: Real-Time Fee Estimator', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockAIClient: any;
  let feeEstimatorService: FeeEstimatorService;

  const TENANT_ID = 'test-tenant-123';
  const REQUEST_ID = 'request-789';

  const mockSchedule: AgencyFeeSchedule = {
    agency_id: 'test-agency',
    agency_name: 'Test Agency',
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

  beforeEach(() => {
    // Mock database pool
    mockDb = {
      query: jest.fn(),
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn()
    } as any;

    // Mock AI client
    mockAIClient = {
      callWithAudit: jest.fn()
    };
    (getSharedAIClient as jest.Mock).mockReturnValue(mockAIClient);

    feeEstimatorService = new FeeEstimatorService(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // Fee Calculation Tests - By Requester Category
  // ==========================================================================

  describe('Fee Calculation by Requester Category', () => {
    it('should calculate fees correctly for commercial requesters', () => {
      const context: FeeCalculationContext = {
        schedule: mockSchedule,
        requester_category: 'commercial',
        search_hours: 4,
        review_hours: 2,
        estimated_pages: 200
      };

      const breakdown = (feeEstimatorService as any).calculateFeeBreakdown(context);

      // Commercial: full fees
      // Search: 4 hours * $25 = $100
      // Review: 2 hours * $40 = $80
      // Copy: 200 pages * $0.10 = $20
      // Total: $200

      expect(breakdown.search_cost).toBe(100.00);
      expect(breakdown.review_cost).toBe(80.00);
      expect(breakdown.copy_cost).toBe(20.00);
      expect(breakdown.total).toBe(200.00);
      expect(breakdown.exemptions_applied).toHaveLength(0);
    });

    it('should calculate fees correctly for news media requesters', () => {
      const context: FeeCalculationContext = {
        schedule: mockSchedule,
        requester_category: 'news_media',
        search_hours: 4,
        review_hours: 0,
        estimated_pages: 200
      };

      const breakdown = (feeEstimatorService as any).calculateFeeBreakdown(context);

      // News media: no search/review fees, only pages beyond 100
      // Search: $0
      // Review: $0
      // Copy: (200 - 100) pages * $0.10 = $10
      // Total: $10

      expect(breakdown.search_cost).toBe(0);
      expect(breakdown.review_cost).toBeUndefined();
      expect(breakdown.copy_cost).toBe(10.00);
      expect(breakdown.total).toBe(10.00);
      expect(breakdown.exemptions_applied).toContain('First 100 pages free');
    });

    it('should calculate fees correctly for educational requesters', () => {
      const context: FeeCalculationContext = {
        schedule: mockSchedule,
        requester_category: 'educational',
        search_hours: 4,
        review_hours: 0,
        estimated_pages: 50
      };

      const breakdown = (feeEstimatorService as any).calculateFeeBreakdown(context);

      // Educational: no search/review fees, pages under 100 are free
      // Total: $0

      expect(breakdown.search_cost).toBe(0);
      expect(breakdown.copy_cost).toBe(0);
      expect(breakdown.total).toBe(0);
    });

    it('should calculate fees correctly for general public requesters', () => {
      const context: FeeCalculationContext = {
        schedule: mockSchedule,
        requester_category: 'general_public',
        search_hours: 4,
        review_hours: 0,
        estimated_pages: 200
      };

      const breakdown = (feeEstimatorService as any).calculateFeeBreakdown(context);

      // General public: first 2 hours free, first 100 pages free
      // Search: (4 - 2) hours * $25 = $50
      // Review: $0
      // Copy: (200 - 100) pages * $0.10 = $10
      // Total: $60

      expect(breakdown.search_cost).toBe(50.00);
      expect(breakdown.review_cost).toBeUndefined();
      expect(breakdown.copy_cost).toBe(10.00);
      expect(breakdown.total).toBe(60.00);
      expect(breakdown.exemptions_applied).toContain('First 2 hours of search free');
      expect(breakdown.exemptions_applied).toContain('First 100 pages free');
    });

    it('should handle general public under threshold (no fees)', () => {
      const context: FeeCalculationContext = {
        schedule: mockSchedule,
        requester_category: 'general_public',
        search_hours: 1.5,
        review_hours: 0,
        estimated_pages: 75
      };

      const breakdown = (feeEstimatorService as any).calculateFeeBreakdown(context);

      // Under all thresholds
      expect(breakdown.search_cost).toBe(0);
      expect(breakdown.copy_cost).toBe(0);
      expect(breakdown.total).toBe(0);
    });
  });

  // ==========================================================================
  // Waiver Eligibility Tests
  // ==========================================================================

  describe('Fee Waiver Eligibility', () => {
    it('should mark fees below threshold as auto-approved waiver', () => {
      const eligibility = (feeEstimatorService as any).determineWaiverEligibility(
        'general_public',
        10.00,
        mockSchedule
      );

      expect(eligibility.eligible).toBe(true);
      expect(eligibility.auto_approved).toBe(true);
      expect(eligibility.reason).toContain('below auto-waiver threshold');
    });

    it('should mark news media as waiver eligible', () => {
      const eligibility = (feeEstimatorService as any).determineWaiverEligibility(
        'news_media',
        50.00,
        mockSchedule
      );

      expect(eligibility.eligible).toBe(true);
      expect(eligibility.auto_approved).toBe(false);
      expect(eligibility.application_url).toBeDefined();
    });

    it('should mark educational as waiver eligible', () => {
      const eligibility = (feeEstimatorService as any).determineWaiverEligibility(
        'educational',
        50.00,
        mockSchedule
      );

      expect(eligibility.eligible).toBe(true);
      expect(eligibility.auto_approved).toBe(false);
      expect(eligibility.application_url).toBeDefined();
    });

    it('should mark general public as potentially waiver eligible', () => {
      const eligibility = (feeEstimatorService as any).determineWaiverEligibility(
        'general_public',
        50.00,
        mockSchedule
      );

      expect(eligibility.eligible).toBe(true);
      expect(eligibility.auto_approved).toBe(false);
      expect(eligibility.reason).toContain('primarily benefits the public');
    });

    it('should mark commercial as not waiver eligible', () => {
      const eligibility = (feeEstimatorService as any).determineWaiverEligibility(
        'commercial',
        50.00,
        mockSchedule
      );

      expect(eligibility.eligible).toBe(false);
      expect(eligibility.auto_approved).toBe(false);
    });
  });

  // ==========================================================================
  // Complete Fee Estimation Tests
  // ==========================================================================

  describe('Complete Fee Estimation', () => {
    it('should generate complete fee estimate', async () => {
      const input: FeeEstimationInput = {
        foia_request_id: REQUEST_ID,
        description: 'Police reports from January 2024',
        requester_category: 'general_public',
        agencies_requested: ['police-dept'],
        date_range_years: 1,
        estimated_record_volume: 'moderate',
        record_types: ['police reports']
      };

      // Mock fee schedule fetch
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            ...mockSchedule,
            agency_id: 'police-dept',
            agency_name: 'Police Department'
          }
        ]
      } as any);

      // Mock ML estimate (no historical data)
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: []
      } as any);

      // Mock AI explanation
      mockAIClient.callWithAudit.mockResolvedValueOnce({
        content: 'FOIA fees cover the cost of searching for, reviewing, and copying records. Based on your request, we estimate fees will be approximately $30. As a general public requester, you may qualify for a fee waiver if disclosure primarily benefits the public. This is just an estimate - actual fees may vary. You won\'t be charged without advance notice if fees exceed $25.'
      });

      // Mock store estimate
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'estimate-123',
            foia_request_id: REQUEST_ID,
            tenant_id: TENANT_ID,
            requester_category: 'general_public',
            fee_estimate_low: 22.50,
            fee_estimate_high: 37.50,
            likely_fee: 30.00,
            likely_fee_waiver_eligible: true,
            fee_breakdown: JSON.stringify({
              search_hours: 3,
              search_cost: 25.00,
              estimated_pages: 100,
              copy_cost: 5.00,
              subtotal: 30.00,
              exemptions_applied: ['First 2 hours of search free', 'First 100 pages free'],
              total: 30.00
            }),
            plain_english_explanation: 'Test explanation',
            waiver_application_url: '/apply-for-fee-waiver',
            estimated_at: new Date(),
            estimation_confidence: 'low',
            model_used: 'default',
            accuracy_tracked: false,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      } as any);

      const result = await feeEstimatorService.generateFeeEstimate(TENANT_ID, input);

      expect(result).toBeDefined();
      expect(result.likely_fee).toBeGreaterThan(0);
      expect(result.fee_estimate_low).toBeLessThanOrEqual(result.likely_fee);
      expect(result.fee_estimate_high).toBeGreaterThanOrEqual(result.likely_fee);
      expect(result.plain_english_explanation).toBeDefined();
      expect(result.fee_breakdown).toBeDefined();
      expect(mockAIClient.callWithAudit).toHaveBeenCalledTimes(1);
    });

    it('should use fallback explanation if AI fails', async () => {
      const input: FeeEstimationInput = {
        foia_request_id: REQUEST_ID,
        description: 'Test request',
        requester_category: 'commercial',
        agencies_requested: ['test-agency'],
        date_range_years: 1,
        estimated_record_volume: 'low'
      };

      // Mock fee schedule
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ ...mockSchedule, agency_id: 'test-agency' }]
      } as any);

      // Mock ML estimate
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] } as any);

      // Mock AI failure
      mockAIClient.callWithAudit.mockRejectedValueOnce(new Error('AI service unavailable'));

      // Mock store estimate
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'estimate-123',
            foia_request_id: REQUEST_ID,
            tenant_id: TENANT_ID,
            requester_category: 'commercial',
            fee_estimate_low: 30.00,
            fee_estimate_high: 50.00,
            likely_fee: 40.00,
            likely_fee_waiver_eligible: false,
            fee_breakdown: JSON.stringify({
              search_hours: 1.5,
              search_cost: 37.50,
              estimated_pages: 25,
              copy_cost: 2.50,
              subtotal: 40.00,
              exemptions_applied: [],
              total: 40.00
            }),
            plain_english_explanation: 'FOIA fees cover the cost of searching for, reviewing, and copying responsive records. Based on your request, we estimate fees will be approximately $40.00. As a commercial requester, you may not qualify for a fee waiver, but you can still apply. This is just an estimate - actual fees may vary based on the records found. You won\'t be charged without advance notice if fees exceed $25.',
            estimated_at: new Date(),
            estimation_confidence: 'low',
            model_used: 'default',
            accuracy_tracked: false,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      } as any);

      const result = await feeEstimatorService.generateFeeEstimate(TENANT_ID, input);

      expect(result.plain_english_explanation).toContain('FOIA fees cover');
      expect(result.plain_english_explanation).toContain('$40.00');
    });
  });

  // ==========================================================================
  // Accuracy Tracking Tests
  // ==========================================================================

  describe('Accuracy Tracking', () => {
    it('should track actual fee and calculate accuracy', async () => {
      // Mock fetch estimate
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'estimate-123',
            foia_request_id: REQUEST_ID,
            tenant_id: TENANT_ID,
            requester_category: 'general_public',
            likely_fee: 50.00,
            fee_estimate_low: 37.50,
            fee_estimate_high: 62.50,
            fee_breakdown: JSON.stringify({}),
            plain_english_explanation: 'Test',
            accuracy_tracked: false,
            estimated_at: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      } as any);

      // Mock update
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] } as any);

      // Mock insert historical case
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] } as any);

      await feeEstimatorService.trackActualFee(
        TENANT_ID,
        REQUEST_ID,
        55.00, // actual fee
        3.5,   // actual search hours
        150    // actual pages
      );

      // Verify update was called
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "FoiaFeeEstimates"'),
        expect.arrayContaining([55.00, 3.5, 150])
      );

      // Verify historical case was inserted
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "FoiaHistoricalFeeCases"'),
        expect.arrayContaining([TENANT_ID, REQUEST_ID])
      );
    });
  });

  // ==========================================================================
  // ML Estimation Tests
  // ==========================================================================

  describe('ML-Based Search Hour Estimation', () => {
    it('should use ML estimate when sufficient historical data exists', async () => {
      // Mock historical cases
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          { actual_search_hours: 2.5, date_range_years: 1, estimated_volume: 'moderate' },
          { actual_search_hours: 3.0, date_range_years: 1, estimated_volume: 'moderate' },
          { actual_search_hours: 2.8, date_range_years: 1, estimated_volume: 'moderate' },
          { actual_search_hours: 3.2, date_range_years: 1, estimated_volume: 'moderate' },
          { actual_search_hours: 2.7, date_range_years: 1, estimated_volume: 'moderate' }
        ]
      } as any);

      const estimate = await (feeEstimatorService as any).mlEstimateSearchHours(
        TENANT_ID,
        ['police reports'],
        1,
        'moderate'
      );

      // Average of 2.5, 3.0, 2.8, 3.2, 2.7 = 2.84
      expect(estimate.estimated_hours).toBeCloseTo(2.8, 1);
      expect(estimate.confidence).toBe('medium'); // 5 cases
      expect(estimate.method).toBe('ml_model');
    });

    it('should use fallback when insufficient historical data', async () => {
      // Mock no historical data
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: []
      } as any);

      const estimate = await (feeEstimatorService as any).mlEstimateSearchHours(
        TENANT_ID,
        ['police reports'],
        1,
        'moderate'
      );

      expect(estimate.confidence).toBe('low');
      expect(estimate.method).toBe('ml_model');
      expect(estimate.similar_cases_count).toBe(0);
    });
  });
});
