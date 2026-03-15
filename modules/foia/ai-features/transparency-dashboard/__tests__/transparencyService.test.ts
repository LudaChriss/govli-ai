/**
 * AI-16: TransparencyService Tests
 */

import { Pool } from 'pg';
import { TransparencyService } from '../src/services/transparencyService';

describe('TransparencyService', () => {
  let db: Pool;
  let service: TransparencyService;
  const tenantId = '550e8400-e29b-41d4-a716-446655440000';

  beforeAll(() => {
    db = {
      query: jest.fn()
    } as unknown as Pool;

    service = new TransparencyService(db);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateScore', () => {
    it('should calculate transparency score with all components', async () => {
      // Mock request data (last 12 months)
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'req1',
            status: 'CLOSED',
            submitted_at: new Date('2026-01-01'),
            closed_at: new Date('2026-01-08'),
            deadline: new Date('2026-01-20'),
            response_days: '7'
          },
          {
            id: 'req2',
            status: 'CLOSED',
            submitted_at: new Date('2026-01-05'),
            closed_at: new Date('2026-01-12'),
            deadline: new Date('2026-01-25'),
            response_days: '7'
          }
        ]
      });

      // Mock reading room count
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ count: '5' }]
      });

      // Mock total requests count
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ count: '20' }]
      });

      // Mock denials data
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ denials: '1', total: '20' }]
      });

      // Mock appeals data
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ reversed: '0', total: '5' }]
      });

      // Mock tenant info for peer percentile
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ state: 'TX', size_tier: 'MEDIUM' }]
      });

      // Mock peer scores
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          { score: 85 },
          { score: 75 },
          { score: 65 }
        ]
      });

      const score = await service.calculateScore(tenantId);

      expect(score.tenant_id).toBe(tenantId);
      expect(score.score).toBeGreaterThan(0);
      expect(score.score).toBeLessThanOrEqual(100);
      expect(score.components.response_time).toBeGreaterThan(0);
      expect(score.components.on_time_rate).toBeGreaterThan(0);
      expect(score.components.proactive_disclosure).toBeGreaterThanOrEqual(0);
      expect(score.components.denial_rate).toBeGreaterThan(0);
      expect(score.components.appeal_reversal).toBeGreaterThanOrEqual(0);
      expect(score.peer_percentile).toBeGreaterThanOrEqual(0);
      expect(score.peer_percentile).toBeLessThanOrEqual(100);
    });

    it('should return zero score when no data available', async () => {
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: []
      });

      const score = await service.calculateScore(tenantId);

      expect(score.score).toBe(0);
      expect(score.components.response_time).toBe(0);
      expect(score.components.on_time_rate).toBe(0);
      expect(score.components.proactive_disclosure).toBe(0);
      expect(score.components.denial_rate).toBe(0);
      expect(score.components.appeal_reversal).toBe(0);
    });
  });

  describe('storeScore', () => {
    it('should store transparency score in database', async () => {
      const score = {
        tenant_id: tenantId,
        score: 85,
        components: {
          response_time: 20,
          on_time_rate: 25,
          proactive_disclosure: 15,
          denial_rate: 12,
          appeal_reversal: 13
        },
        peer_percentile: 75,
        calculated_at: new Date()
      };

      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await service.storeScore(score);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO "FoiaTransparencyScores"'),
        expect.arrayContaining([
          tenantId,
          85,
          expect.any(String), // JSON.stringify(components)
          75,
          expect.any(Date)
        ])
      );
    });
  });

  describe('getPublicDashboard', () => {
    it('should return public dashboard data when transparency is public', async () => {
      const agencySlug = 'test-agency';

      // Mock tenant lookup
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: tenantId, name: 'Test Agency', transparency_public: true }]
      });

      // Mock score data
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          score: 85,
          components: {
            response_time: 20,
            on_time_rate: 25,
            proactive_disclosure: 15,
            denial_rate: 12,
            appeal_reversal: 13
          },
          peer_percentile: 75,
          calculated_at: new Date()
        }]
      });

      // Mock monthly stats
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          month: '2026-03',
          requests_received: '45',
          median_response_days: '8.5',
          on_time_pct: '92.3',
          denials: '2',
          proactive_disclosures: '0'
        }]
      });

      // Mock top exemptions
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          code: '§ 552.101',
          count: '12',
          description: ''
        }]
      });

      // Mock reading room count
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ count: '150' }]
      });

      const dashboard = await service.getPublicDashboard(agencySlug);

      expect(dashboard).not.toBeNull();
      expect(dashboard?.agency_name).toBe('Test Agency');
      expect(dashboard?.score).toBe(85);
      expect(dashboard?.peer_percentile).toBe(75);
      expect(dashboard?.monthly_stats).toHaveLength(1);
      expect(dashboard?.top_exemptions).toHaveLength(1);
      expect(dashboard?.reading_room_count).toBe(150);
    });

    it('should return null when agency not found', async () => {
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: []
      });

      const dashboard = await service.getPublicDashboard('nonexistent');

      expect(dashboard).toBeNull();
    });

    it('should return null when transparency is not public', async () => {
      (db.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: tenantId, name: 'Test Agency', transparency_public: false }]
      });

      const dashboard = await service.getPublicDashboard('test-agency');

      expect(dashboard).toBeNull();
    });
  });

  describe('setPublicVisibility', () => {
    it('should update transparency_public flag', async () => {
      (db.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await service.setPublicVisibility(tenantId, true);

      expect(db.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "FoiaTenants"'),
        [true, tenantId]
      );
    });
  });
});
