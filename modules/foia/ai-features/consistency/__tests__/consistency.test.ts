/**
 * AI-4: Exemption Consistency Analyzer - Test Suite
 */

import { Pool } from 'pg';
import { ConsistencyService } from '../src/services/consistencyService';
import {
  CheckConsistencyInput,
  OverrideConsistencyInput,
  GetHistoryFilters,
  GetHeatmapFilters,
  ConsistencyCheck,
  ConsistencyRiskLevel
} from '../src/types';

// Mock the shared AI client
jest.mock('@govli/foia-shared', () => ({
  getAIClient: jest.fn(() => ({
    callWithAudit: jest.fn()
  }))
}));

import { getAIClient } from '@govli/foia-shared';

describe('AI-4: Exemption Consistency Analyzer', () => {
  let mockDb: jest.Mocked<Pool>;
  let mockAIClient: any;
  let consistencyService: ConsistencyService;

  const TENANT_ID = 'test-tenant-123';
  const USER_ID = 'user-456';
  const RESPONSE_ID = 'response-789';
  const REQUEST_ID = 'request-abc';

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
    (getAIClient as jest.Mock).mockReturnValue(mockAIClient);

    consistencyService = new ConsistencyService(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================================================
  // ConsistencyService.checkConsistency() Tests
  // ==========================================================================

  describe('checkConsistency', () => {
    const baseInput: CheckConsistencyInput = {
      response_id: RESPONSE_ID,
      exemption_decisions: [
        {
          exemption_code: 'b5',
          information_type: 'internal_deliberations',
          decision: 'EXEMPT'
        },
        {
          exemption_code: 'b6',
          information_type: 'personnel_records',
          decision: 'EXEMPT'
        }
      ],
      record_types: ['emails', 'memos'],
      department: 'Human Resources',
      requester_category: 'media'
    };

    it('should detect LOW risk when exemptions are consistent with historical patterns', async () => {
      // Mock fetching FOIA request
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: REQUEST_ID, tenant_id: TENANT_ID }]
      });

      // Mock fetching historical decisions (90 days)
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            exemption_code: 'b5',
            information_type: 'internal_deliberations',
            decision: 'EXEMPT',
            decision_count: 15
          },
          {
            exemption_code: 'b6',
            information_type: 'personnel_records',
            decision: 'EXEMPT',
            decision_count: 12
          }
        ]
      });

      // Mock AI analysis returning LOW risk
      mockAIClient.callWithAudit.mockResolvedValueOnce({
        content: JSON.stringify({
          is_consistent: true,
          alerts: [],
          overall_risk: 'LOW',
          summary: 'All exemption decisions align with historical patterns. No inconsistencies detected.',
          prior_cases_reviewed: 27
        })
      });

      // Mock inserting consistency check
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'check-001',
            tenant_id: TENANT_ID,
            foia_response_id: RESPONSE_ID,
            foia_request_id: REQUEST_ID,
            record_types: ['emails', 'memos'],
            department: 'Human Resources',
            requester_category: 'media',
            exemptions_proposed: ['b5', 'b6'],
            is_consistent: true,
            overall_risk: 'LOW',
            alerts: [],
            summary: 'All exemption decisions align with historical patterns.',
            prior_cases_reviewed: 27,
            status: 'COMPLETED',
            checked_by: USER_ID,
            checked_at: new Date(),
            model_used: 'claude-3-5-sonnet-20241022',
            confidence_score: 0.95,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      });

      const result = await consistencyService.checkConsistency(
        TENANT_ID,
        USER_ID,
        baseInput
      );

      expect(result.overall_risk).toBe('LOW');
      expect(result.is_consistent).toBe(true);
      expect(result.alerts).toHaveLength(0);
      expect(result.status).toBe('COMPLETED');
      expect(mockAIClient.callWithAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          userId: USER_ID,
          feature: 'ai-4-consistency-check'
        })
      );
    });

    it('should detect HIGH risk when exemptions deviate significantly from historical patterns', async () => {
      // Mock fetching FOIA request
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: REQUEST_ID, tenant_id: TENANT_ID }]
      });

      // Mock fetching historical decisions showing different pattern
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            exemption_code: 'b5',
            information_type: 'internal_deliberations',
            decision: 'DISCLOSED', // Historical pattern is DISCLOSED
            decision_count: 18
          }
        ]
      });

      // Mock AI analysis returning HIGH risk with alerts
      mockAIClient.callWithAudit.mockResolvedValueOnce({
        content: JSON.stringify({
          is_consistent: false,
          alerts: [
            {
              alert_type: 'OVER_REDACTION',
              exemption_code: 'b5',
              information_type: 'internal_deliberations',
              current_decision: 'EXEMPT',
              historical_pattern: 'DISCLOSED',
              prior_cases_count: 18,
              severity: 'HIGH',
              explanation: 'Historical pattern shows b5 for internal_deliberations in HR department is typically DISCLOSED (18 prior cases). Current decision to EXEMPT deviates significantly.',
              suggested_action: 'Review historical cases to ensure this exemption is justified. Consider disclosing if no new sensitivity factors.'
            }
          ],
          overall_risk: 'HIGH',
          summary: 'HIGH RISK: Significant deviation from established exemption patterns detected. Supervisor review required.',
          prior_cases_reviewed: 18
        })
      });

      // Mock inserting consistency check with PENDING status
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'check-002',
            tenant_id: TENANT_ID,
            foia_response_id: RESPONSE_ID,
            foia_request_id: REQUEST_ID,
            record_types: ['emails', 'memos'],
            department: 'Human Resources',
            requester_category: 'media',
            exemptions_proposed: ['b5'],
            is_consistent: false,
            overall_risk: 'HIGH',
            alerts: [
              {
                alert_type: 'OVER_REDACTION',
                exemption_code: 'b5',
                information_type: 'internal_deliberations',
                current_decision: 'EXEMPT',
                historical_pattern: 'DISCLOSED',
                prior_cases_count: 18,
                severity: 'HIGH',
                explanation: 'Historical pattern shows b5 for internal_deliberations in HR department is typically DISCLOSED.',
                suggested_action: 'Review historical cases to ensure this exemption is justified.'
              }
            ],
            summary: 'HIGH RISK: Significant deviation from established exemption patterns detected.',
            prior_cases_reviewed: 18,
            status: 'PENDING', // HIGH risk = PENDING status (awaits supervisor override)
            checked_by: USER_ID,
            checked_at: new Date(),
            model_used: 'claude-3-5-sonnet-20241022',
            confidence_score: 0.89,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      });

      const result = await consistencyService.checkConsistency(
        TENANT_ID,
        USER_ID,
        baseInput
      );

      expect(result.overall_risk).toBe('HIGH');
      expect(result.is_consistent).toBe(false);
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].alert_type).toBe('OVER_REDACTION');
      expect(result.status).toBe('PENDING'); // Requires supervisor override
    });

    it('should detect MEDIUM risk for minor inconsistencies', async () => {
      // Mock fetching FOIA request
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: REQUEST_ID, tenant_id: TENANT_ID }]
      });

      // Mock fetching historical decisions with mixed patterns
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            exemption_code: 'b6',
            information_type: 'personnel_records',
            decision: 'EXEMPT',
            decision_count: 7
          },
          {
            exemption_code: 'b6',
            information_type: 'personnel_records',
            decision: 'DISCLOSED',
            decision_count: 5
          }
        ]
      });

      // Mock AI analysis returning MEDIUM risk
      mockAIClient.callWithAudit.mockResolvedValueOnce({
        content: JSON.stringify({
          is_consistent: false,
          alerts: [
            {
              alert_type: 'INCONSISTENT_CRITERIA',
              exemption_code: 'b6',
              information_type: 'personnel_records',
              current_decision: 'EXEMPT',
              historical_pattern: 'MIXED',
              prior_cases_count: 12,
              severity: 'MEDIUM',
              explanation: 'Historical pattern for b6 personnel_records shows mixed decisions (7 EXEMPT, 5 DISCLOSED). Pattern is inconsistent.',
              suggested_action: 'Review criteria for applying b6 to personnel records to establish consistent standard.'
            }
          ],
          overall_risk: 'MEDIUM',
          summary: 'MEDIUM RISK: Minor inconsistencies detected. Review recommended before approval.',
          prior_cases_reviewed: 12
        })
      });

      // Mock inserting consistency check with COMPLETED status (MEDIUM doesn't block)
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'check-003',
            overall_risk: 'MEDIUM',
            is_consistent: false,
            alerts: [
              {
                alert_type: 'INCONSISTENT_CRITERIA',
                severity: 'MEDIUM'
              }
            ],
            status: 'COMPLETED',
            prior_cases_reviewed: 12
          }
        ]
      });

      const result = await consistencyService.checkConsistency(
        TENANT_ID,
        USER_ID,
        baseInput
      );

      expect(result.overall_risk).toBe('MEDIUM');
      expect(result.alerts).toHaveLength(1);
      expect(result.alerts[0].severity).toBe('MEDIUM');
      expect(result.status).toBe('COMPLETED'); // MEDIUM doesn't block, just warns
    });

    it('should handle cases with no historical data gracefully', async () => {
      // Mock fetching FOIA request
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: REQUEST_ID, tenant_id: TENANT_ID }]
      });

      // Mock no historical decisions found
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      // Mock AI analysis with no historical data
      mockAIClient.callWithAudit.mockResolvedValueOnce({
        content: JSON.stringify({
          is_consistent: true,
          alerts: [],
          overall_risk: 'LOW',
          summary: 'No historical data available for comparison. Exemption decisions appear reasonable based on standard practices.',
          prior_cases_reviewed: 0
        })
      });

      // Mock inserting consistency check
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'check-004',
            overall_risk: 'LOW',
            is_consistent: true,
            alerts: [],
            summary: 'No historical data available for comparison.',
            prior_cases_reviewed: 0,
            status: 'COMPLETED'
          }
        ]
      });

      const result = await consistencyService.checkConsistency(
        TENANT_ID,
        USER_ID,
        baseInput
      );

      expect(result.overall_risk).toBe('LOW');
      expect(result.prior_cases_reviewed).toBe(0);
      expect(result.status).toBe('COMPLETED');
    });

    it('should throw error if response_id does not exist', async () => {
      // Mock no FOIA request found
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      await expect(
        consistencyService.checkConsistency(TENANT_ID, USER_ID, baseInput)
      ).rejects.toThrow('FOIA response not found');
    });
  });

  // ==========================================================================
  // ConsistencyService.overrideCheck() Tests
  // ==========================================================================

  describe('overrideCheck', () => {
    const CHECK_ID = 'check-high-risk-001';

    it('should allow supervisor to override HIGH risk check with justification', async () => {
      const overrideInput: OverrideConsistencyInput = {
        justification: 'Reviewed the specific case details. New policy directive from General Counsel mandates stricter application of b5 for all internal deliberations involving executive staff, regardless of historical patterns.'
      };

      // Mock fetching existing check
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: CHECK_ID,
            tenant_id: TENANT_ID,
            overall_risk: 'HIGH',
            status: 'PENDING',
            foia_response_id: RESPONSE_ID
          }
        ]
      });

      // Mock updating check to OVERRIDDEN status
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: CHECK_ID,
            tenant_id: TENANT_ID,
            overall_risk: 'HIGH',
            status: 'OVERRIDDEN',
            overridden_by: USER_ID,
            overridden_at: new Date(),
            override_justification: overrideInput.justification,
            foia_response_id: RESPONSE_ID
          }
        ]
      });

      const result = await consistencyService.overrideCheck(
        TENANT_ID,
        CHECK_ID,
        USER_ID,
        overrideInput
      );

      expect(result.status).toBe('OVERRIDDEN');
      expect(result.overridden_by).toBe(USER_ID);
      expect(result.override_justification).toBe(overrideInput.justification);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "FoiaConsistencyChecks"'),
        expect.arrayContaining([USER_ID, overrideInput.justification, CHECK_ID, TENANT_ID])
      );
    });

    it('should throw error if check does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      await expect(
        consistencyService.overrideCheck(TENANT_ID, 'nonexistent-check', USER_ID, {
          justification: 'Test'
        })
      ).rejects.toThrow('Consistency check not found');
    });

    it('should throw error if check is not HIGH risk', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: CHECK_ID,
            overall_risk: 'LOW', // Can't override LOW risk
            status: 'COMPLETED'
          }
        ]
      });

      await expect(
        consistencyService.overrideCheck(TENANT_ID, CHECK_ID, USER_ID, {
          justification: 'Test'
        })
      ).rejects.toThrow('Only HIGH risk checks can be overridden');
    });
  });

  // ==========================================================================
  // ConsistencyService.getHistory() Tests
  // ==========================================================================

  describe('getHistory', () => {
    it('should retrieve consistency check history with filters', async () => {
      const filters: GetHistoryFilters = {
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
        risk_level: 'HIGH',
        department: 'Human Resources',
        limit: 50,
        offset: 0
      };

      // Mock count query
      mockDb.query.mockResolvedValueOnce({
        rows: [{ count: '3' }]
      });

      // Mock fetching checks
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'check-001',
            foia_response_id: 'resp-001',
            overall_risk: 'HIGH',
            is_consistent: false,
            alerts: [{ alert_type: 'OVER_REDACTION' }],
            status: 'OVERRIDDEN',
            checked_at: new Date('2024-06-15'),
            department: 'Human Resources',
            record_types: ['emails']
          },
          {
            id: 'check-002',
            foia_response_id: 'resp-002',
            overall_risk: 'HIGH',
            is_consistent: false,
            alerts: [{ alert_type: 'UNDER_REDACTION' }],
            status: 'PENDING',
            checked_at: new Date('2024-08-20'),
            department: 'Human Resources',
            record_types: ['memos']
          }
        ]
      });

      const result = await consistencyService.getHistory(TENANT_ID, filters);

      expect(result.total).toBe(3);
      expect(result.checks).toHaveLength(2);
      expect(result.checks[0].overall_risk).toBe('HIGH');
      expect(result.checks[0].status).toBe('OVERRIDDEN');
    });

    it('should handle empty history', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ count: '0' }]
      });

      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      const result = await consistencyService.getHistory(TENANT_ID, {});

      expect(result.total).toBe(0);
      expect(result.checks).toHaveLength(0);
    });
  });

  // ==========================================================================
  // ConsistencyService.getExemptionHeatmap() Tests
  // ==========================================================================

  describe('getExemptionHeatmap', () => {
    it('should generate heatmap data showing exemption inconsistencies', async () => {
      const filters: GetHeatmapFilters = {
        start_date: new Date('2024-01-01'),
        end_date: new Date('2024-12-31'),
        min_applications: 5
      };

      // Mock aggregate query
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            exemption_code: 'b5',
            total_applications: 45,
            inconsistent_applications: 12,
            inconsistency_rate: 0.267,
            most_common_discrepancy: 'OVER_REDACTION',
            departments_affected: ['HR', 'Legal'],
            trend: 'INCREASING'
          },
          {
            exemption_code: 'b6',
            total_applications: 38,
            inconsistent_applications: 5,
            inconsistency_rate: 0.132,
            most_common_discrepancy: 'UNDER_REDACTION',
            departments_affected: ['HR'],
            trend: 'STABLE'
          }
        ]
      });

      // Mock overall stats
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            total_checks: 83,
            high_risk_count: 8,
            overall_inconsistency_rate: 0.205
          }
        ]
      });

      const result = await consistencyService.getExemptionHeatmap(TENANT_ID, filters);

      expect(result.exemptions).toHaveLength(2);
      expect(result.exemptions[0].exemption_code).toBe('b5');
      expect(result.exemptions[0].inconsistency_rate).toBe(0.267);
      expect(result.exemptions[0].trend).toBe('INCREASING');
      expect(result.overall_inconsistency_rate).toBe(0.205);
      expect(result.total_checks).toBe(83);
      expect(result.high_risk_count).toBe(8);
    });
  });

  // ==========================================================================
  // ConsistencyService.getDashboardMetrics() Tests
  // ==========================================================================

  describe('getDashboardMetrics', () => {
    it('should retrieve dashboard metrics for supervisor overview', async () => {
      // Mock metrics query
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            checks_last_30_days: 42,
            high_risk_last_30_days: 6,
            override_rate_last_30_days: 0.143,
            avg_consistency_rate: 0.857,
            pending_high_risk_count: 2
          }
        ]
      });

      // Mock most inconsistent exemption
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            exemption_code: 'b5',
            inconsistency_rate: 0.285
          }
        ]
      });

      const result = await consistencyService.getDashboardMetrics(TENANT_ID);

      expect(result.checks_last_30_days).toBe(42);
      expect(result.high_risk_last_30_days).toBe(6);
      expect(result.override_rate_last_30_days).toBe(0.143);
      expect(result.avg_consistency_rate).toBe(0.857);
      expect(result.pending_high_risk_count).toBe(2);
      expect(result.most_inconsistent_exemption).toEqual({
        code: 'b5',
        rate: 0.285
      });
    });

    it('should handle no data gracefully', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            checks_last_30_days: 0,
            high_risk_last_30_days: 0,
            override_rate_last_30_days: 0,
            avg_consistency_rate: 0,
            pending_high_risk_count: 0
          }
        ]
      });

      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      const result = await consistencyService.getDashboardMetrics(TENANT_ID);

      expect(result.checks_last_30_days).toBe(0);
      expect(result.most_inconsistent_exemption).toBeNull();
    });
  });
});
