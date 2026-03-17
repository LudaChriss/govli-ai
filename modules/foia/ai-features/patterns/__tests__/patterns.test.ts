/**
 * AI-3 + AI-11: Pattern Intelligence & Proactive Disclosure
 * Comprehensive Test Suite
 */

import { Pool } from 'pg';
import { PatternService } from '../src/services/patternService';
import { ProactiveService } from '../src/services/proactiveService';
import { getSharedAIClient } from '@govli/foia-shared';

// Mock the shared AI client
jest.mock('@govli/foia-shared', () => ({
  getSharedAIClient: jest.fn(),
  emit: jest.fn().mockResolvedValue(undefined)
}));

describe('AI-3: Pattern Analysis Service', () => {
  let mockPool: any;
  let patternService: PatternService;
  let mockAIClient: any;

  const TENANT_ID = '00000000-0000-0000-0000-000000000001';
  const SAMPLE_REQUESTS = [
    {
      id: 'req-1',
      description: 'Police incident report for downtown area on March 5th',
      requester_email: 'citizen@example.com',
      requester_name: 'John Doe',
      department: 'Police',
      status: 'CLOSED',
      createdAt: new Date('2024-01-15')
    },
    {
      id: 'req-2',
      description: 'Police accident report from Highway 101',
      requester_email: 'lawyer@firm.com',
      requester_name: 'Jane Smith',
      department: 'Police',
      status: 'FULFILLED',
      createdAt: new Date('2024-02-10')
    },
    {
      id: 'req-3',
      description: 'Building permit records for 123 Main Street',
      requester_email: 'citizen@example.com',
      requester_name: 'John Doe',
      department: 'Planning',
      status: 'CLOSED',
      createdAt: new Date('2024-03-01')
    },
    {
      id: 'req-4',
      description: 'Police incident reports for January 2024',
      requester_email: 'journalist@news.com',
      requester_name: 'Reporter',
      department: 'Police',
      status: 'FULFILLED',
      createdAt: new Date('2024-01-20')
    },
    {
      id: 'req-5',
      description: 'Building permits issued in the downtown district',
      requester_email: 'citizen@example.com',
      requester_name: 'John Doe',
      department: 'Planning',
      status: 'CLOSED',
      createdAt: new Date('2024-02-15')
    }
  ];

  beforeEach(() => {
    // Create mock database pool
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn()
    } as any;

    // Create mock AI client
    mockAIClient = {
      callWithAudit: jest.fn()
    };

    (getSharedAIClient as jest.Mock).mockReturnValue(mockAIClient);

    patternService = new PatternService(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzePatterns', () => {
    it('should create a pattern analysis job and identify clusters', async () => {
      // Mock job creation
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Job insert
        .mockResolvedValueOnce({ rows: SAMPLE_REQUESTS }) // Fetch requests
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Store cluster 1
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Store cluster 2
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Repeat requesters
        .mockResolvedValueOnce({ rows: [] }) // Routing optimization query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Complete job
        .mockResolvedValueOnce({ // Get job
          rows: [{
            id: 'job-1',
            tenant_id: TENANT_ID,
            job_type: 'PATTERN_ANALYSIS',
            status: 'COMPLETED',
            patterns_identified: 2,
            candidates_generated: 0
          }]
        });

      // Mock AI response with clusters
      mockAIClient.callWithAudit.mockResolvedValue({
        content: JSON.stringify([
          {
            cluster_name: 'Police Reports',
            record_types: ['incident reports', 'accident reports'],
            department_most_likely: 'Police',
            request_count_12mo: 3,
            request_count_all_time: 3,
            trend: 'INCREASING',
            typical_requester_profile: 'Citizens and journalists',
            notable_patterns: ['High frequency in January', 'Downtown area focus']
          },
          {
            cluster_name: 'Building Permits',
            record_types: ['building permits', 'construction permits'],
            department_most_likely: 'Planning',
            request_count_12mo: 2,
            request_count_all_time: 2,
            trend: 'STABLE',
            typical_requester_profile: 'Property owners and developers',
            notable_patterns: ['Focused on downtown district']
          }
        ])
      });

      const result = await patternService.analyzePatterns(TENANT_ID, {
        lookback_months: 12,
        min_cluster_size: 2
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.patterns_identified).toBe(2);
      expect(mockAIClient.callWithAudit).toHaveBeenCalledTimes(1);
    });

    it('should handle empty request data gracefully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Job insert
        .mockResolvedValueOnce({ rows: [] }) // No requests
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Complete job
        .mockResolvedValueOnce({ // Get job
          rows: [{
            id: 'job-1',
            status: 'COMPLETED',
            patterns_identified: 0
          }]
        });

      const result = await patternService.analyzePatterns(TENANT_ID);

      expect(result.patterns_identified).toBe(0);
      expect(mockAIClient.callWithAudit).not.toHaveBeenCalled();
    });

    it('should filter clusters by minimum size', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Job insert
        .mockResolvedValueOnce({ rows: SAMPLE_REQUESTS }) // Fetch requests
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Store cluster (only 1, other below threshold)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Repeat requesters
        .mockResolvedValueOnce({ rows: [] }) // Routing optimization
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Complete job
        .mockResolvedValueOnce({ rows: [{ id: 'job-1', patterns_identified: 1 }] });

      mockAIClient.callWithAudit.mockResolvedValue({
        content: JSON.stringify([
          {
            cluster_name: 'Police Reports',
            record_types: ['incident reports'],
            department_most_likely: 'Police',
            request_count_12mo: 3,
            request_count_all_time: 3,
            trend: 'INCREASING',
            typical_requester_profile: 'Various',
            notable_patterns: []
          },
          {
            cluster_name: 'Single Request',
            record_types: ['misc'],
            department_most_likely: 'Admin',
            request_count_12mo: 1,
            request_count_all_time: 1,
            trend: 'STABLE',
            typical_requester_profile: 'Citizen',
            notable_patterns: []
          }
        ])
      });

      const result = await patternService.analyzePatterns(TENANT_ID, {
        min_cluster_size: 3
      });

      // Only one cluster should be stored (the one with 3+ requests)
      expect(result.patterns_identified).toBe(1);
    });
  });

  describe('getClusters', () => {
    it('should return clusters with filtering', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'cluster-1',
            tenant_id: TENANT_ID,
            cluster_name: 'Police Reports',
            record_types: JSON.stringify(['incident reports']),
            department_most_likely: 'Police',
            request_count_12mo: 5,
            request_count_all_time: 10,
            trend: 'INCREASING',
            typical_requester_profile: 'Citizens',
            notable_patterns: JSON.stringify(['pattern1']),
            request_ids: JSON.stringify(['req-1', 'req-2']),
            analysis_date: new Date(),
            model_used: 'claude-3-5-sonnet-20241022',
            confidence_score: 0.85,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      });

      const clusters = await patternService.getClusters(TENANT_ID, {
        department: 'Police',
        trend: 'INCREASING',
        min_request_count: 3
      });

      expect(clusters).toHaveLength(1);
      expect(clusters[0].cluster_name).toBe('Police Reports');
      expect(clusters[0].trend).toBe('INCREASING');
    });
  });

  describe('getRepeatRequesters', () => {
    it('should return list of repeat requesters', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'repeat-1',
            tenant_id: TENANT_ID,
            requester_email: 'citizen@example.com',
            requester_name: 'John Doe',
            request_count_12mo: 3,
            similar_request_clusters: JSON.stringify([]),
            request_ids: JSON.stringify(['req-1', 'req-3', 'req-5']),
            pattern_description: 'Filed 3 requests in the last 12 months',
            proactive_outreach_recommended: false,
            proactive_outreach_reason: null,
            last_request_date: new Date('2024-03-01'),
            first_request_date: new Date('2024-01-15'),
            analysis_date: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      });

      const requesters = await patternService.getRepeatRequesters(TENANT_ID);

      expect(requesters).toHaveLength(1);
      expect(requesters[0].requester_email).toBe('citizen@example.com');
      expect(requesters[0].request_count_12mo).toBe(3);
    });
  });

  describe('getRoutingOptimizations', () => {
    it('should return routing recommendations', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'routing-1',
            tenant_id: TENANT_ID,
            department: 'Legal',
            topic_cluster: 'General',
            avg_response_days: 25.5,
            request_count: 10,
            recommendation: 'Department shows slow response time',
            recommended_department: null,
            expected_improvement_pct: null,
            status: 'PENDING',
            reviewed_by: null,
            reviewed_at: null,
            review_notes: null,
            analysis_date: new Date(),
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      });

      const optimizations = await patternService.getRoutingOptimizations(TENANT_ID);

      expect(optimizations).toHaveLength(1);
      expect(optimizations[0].department).toBe('Legal');
      expect(optimizations[0].avg_response_days).toBe(25.5);
    });
  });
});

describe('AI-11: Proactive Disclosure Service', () => {
  let mockPool: any;
  let proactiveService: ProactiveService;
  let mockAIClient: any;

  const TENANT_ID = '00000000-0000-0000-0000-000000000001';
  const USER_ID = '00000000-0000-0000-0000-000000000002';

  beforeEach(() => {
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn()
    } as any;

    mockAIClient = {
      callWithAudit: jest.fn()
    };

    (getSharedAIClient as jest.Mock).mockReturnValue(mockAIClient);

    proactiveService = new ProactiveService(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('scanProactiveCandidates', () => {
    it('should scan pattern clusters and generate proactive candidates', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Job insert
        .mockResolvedValueOnce({ // Fetch high-frequency clusters
          rows: [
            {
              id: 'cluster-1',
              cluster_name: 'Police Reports',
              record_types: JSON.stringify(['incident reports']),
              request_count_12mo: 10,
              typical_requester_profile: 'Various',
              notable_patterns: JSON.stringify(['High frequency'])
            }
          ]
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Store candidate
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Complete job
        .mockResolvedValueOnce({ // Get job
          rows: [{
            id: 'job-1',
            status: 'COMPLETED',
            candidates_generated: 1
          }]
        });

      // Mock AI evaluation
      mockAIClient.callWithAudit.mockResolvedValue({
        content: JSON.stringify({
          should_publish: true,
          recommended_record_types: ['incident reports'],
          publish_format: 'redacted_template',
          estimated_request_deflection_pct: 60,
          justification: 'High frequency requests with clear public interest',
          caveats: ['May contain sensitive information requiring redaction']
        })
      });

      const result = await proactiveService.scanProactiveCandidates(TENANT_ID, {
        frequency_threshold: 5
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.candidates_generated).toBe(1);
      expect(mockAIClient.callWithAudit).toHaveBeenCalledTimes(1);
    });

    it('should handle no high-frequency clusters gracefully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Job insert
        .mockResolvedValueOnce({ rows: [] }) // No clusters
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Complete job
        .mockResolvedValueOnce({ rows: [{ id: 'job-1', candidates_generated: 0 }] });

      const result = await proactiveService.scanProactiveCandidates(TENANT_ID);

      expect(result.candidates_generated).toBe(0);
      expect(mockAIClient.callWithAudit).not.toHaveBeenCalled();
    });
  });

  describe('getCandidates', () => {
    it('should return proactive disclosure candidates with filters', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 'candidate-1',
            tenant_id: TENANT_ID,
            pattern_cluster_id: 'cluster-1',
            cluster_name: 'Police Reports',
            should_publish: true,
            recommended_record_types: JSON.stringify(['incident reports']),
            publish_format: 'redacted_template',
            frequency_score: 10,
            estimated_request_deflection_pct: 60,
            estimated_annual_requests: 15,
            justification: 'High frequency',
            caveats: JSON.stringify(['Redaction required']),
            public_interest_score: 0.8,
            status: 'PENDING',
            decision_made_by: null,
            decision_made_at: null,
            dismissal_reason: null,
            published_at: null,
            reading_room_url: null,
            scan_date: new Date(),
            model_used: 'claude-3-5-sonnet-20241022',
            confidence_score: 0.75,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      });

      const candidates = await proactiveService.getCandidates(TENANT_ID, {
        status: 'PENDING',
        should_publish_only: true,
        min_frequency_score: 5
      });

      expect(candidates).toHaveLength(1);
      expect(candidates[0].should_publish).toBe(true);
      expect(candidates[0].status).toBe('PENDING');
    });
  });

  describe('makeDecision', () => {
    it('should approve a proactive disclosure candidate', async () => {
      mockPool.query
        .mockResolvedValueOnce({ // Get candidate
          rows: [{
            id: 'candidate-1',
            tenant_id: TENANT_ID,
            cluster_name: 'Police Reports',
            status: 'PENDING',
            should_publish: true
          }]
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // Update decision
        .mockResolvedValueOnce({ // Get updated candidate
          rows: [{
            id: 'candidate-1',
            status: 'APPROVED',
            decision_made_by: USER_ID
          }]
        });

      const result = await proactiveService.makeDecision(
        TENANT_ID,
        'candidate-1',
        USER_ID,
        {
          decision: 'approve',
          notes: 'Good candidate for reading room'
        }
      );

      expect(result.status).toBe('APPROVED');
      expect(result.decision_made_by).toBe(USER_ID);
    });

    it('should dismiss a proactive disclosure candidate', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'candidate-1',
            tenant_id: TENANT_ID,
            cluster_name: 'Sensitive Records',
            status: 'PENDING'
          }]
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValueOnce({
          rows: [{
            id: 'candidate-1',
            status: 'DISMISSED',
            decision_made_by: USER_ID,
            dismissal_reason: 'Contains too much sensitive information'
          }]
        });

      const result = await proactiveService.makeDecision(
        TENANT_ID,
        'candidate-1',
        USER_ID,
        {
          decision: 'dismiss',
          dismissal_reason: 'Contains too much sensitive information'
        }
      );

      expect(result.status).toBe('DISMISSED');
      expect(result.dismissal_reason).toBe('Contains too much sensitive information');
    });
  });

  describe('getReadingRoomImpact', () => {
    it('should return impact metrics for published disclosures', async () => {
      const cutoff12mo = new Date();
      cutoff12mo.setMonth(cutoff12mo.getMonth() - 12);

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: 5 }] }) // Published count
        .mockResolvedValueOnce({ // Impact summary
          rows: [{
            total_deflected: 50,
            total_hours: 100,
            total_savings: 5000
          }]
        })
        .mockResolvedValueOnce({ // Monthly breakdown
          rows: [
            {
              month: '2024-03',
              requests_deflected: 20,
              staff_hours_saved: 40,
              cost_savings: 2000
            },
            {
              month: '2024-02',
              requests_deflected: 30,
              staff_hours_saved: 60,
              cost_savings: 3000
            }
          ]
        })
        .mockResolvedValueOnce({ // Top performers
          rows: [
            {
              candidate_id: 'candidate-1',
              cluster_name: 'Police Reports',
              requests_deflected: 30,
              published_at: new Date('2024-01-01')
            }
          ]
        });

      const impact = await proactiveService.getReadingRoomImpact(TENANT_ID);

      expect(impact.total_candidates_published).toBe(5);
      expect(impact.total_requests_deflected).toBe(50);
      expect(impact.total_staff_hours_saved).toBe(100);
      expect(impact.total_cost_savings_usd).toBe(5000);
      expect(impact.monthly_breakdown).toHaveLength(2);
      expect(impact.top_performing_disclosures).toHaveLength(1);
    });
  });

  describe('getDashboardMetrics', () => {
    it('should return dashboard summary metrics', async () => {
      const cutoff12mo = new Date();
      cutoff12mo.setMonth(cutoff12mo.getMonth() - 12);

      mockPool.query
        .mockResolvedValueOnce({ // Candidates counts
          rows: [{
            pending: 10,
            approved: 5,
            published: 3,
            last_scan: new Date()
          }]
        })
        .mockResolvedValueOnce({ // Impact metrics
          rows: [{
            deflected: 45,
            hours_saved: 90,
            cost_savings: 4500
          }]
        });

      const metrics = await proactiveService.getDashboardMetrics(TENANT_ID);

      expect(metrics.pending_candidates).toBe(10);
      expect(metrics.approved_candidates).toBe(5);
      expect(metrics.published_disclosures).toBe(3);
      expect(metrics.total_requests_deflected_12mo).toBe(45);
      expect(metrics.total_hours_saved_12mo).toBe(90);
      expect(metrics.total_cost_savings_12mo).toBe(4500);
    });
  });
});
