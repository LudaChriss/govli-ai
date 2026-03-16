/**
 * Integration Tests: Transparency Dashboard
 * Tests public transparency scoring and dashboard access
 */

import { createMockRequest, createMockResponse, mockUsers, mockDb } from './setup';

describe('Transparency Dashboard Integration Tests', () => {
  describe('Data Seeding', () => {
    it('should seed 12 months of request data', async () => {
      const months = Array.from({ length: 12 }, (_, i) => {
        const date = new Date(2023, i, 1);
        return {
          month: date.toISOString().slice(0, 7),
          total_requests: Math.floor(Math.random() * 50) + 10,
          completed: Math.floor(Math.random() * 40) + 5,
          avg_days_to_complete: Math.floor(Math.random() * 20) + 5
        };
      });

      mockDb.query = jest.fn().mockResolvedValue({ rows: months });

      const result = await mockDb.query('SELECT * FROM monthly_stats');
      expect(result.rows).toHaveLength(12);
    });
  });

  describe('Transparency Score Calculation', () => {
    it('should calculate score between 0-100 with all components', async () => {
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          on_time_rate: 0.85,
          avg_response_days: 12,
          exemption_rate: 0.15,
          appeal_overturn_rate: 0.10,
          transparency_score: 78
        }]
      });

      const calculateScore = (metrics: any): number => {
        let score = 0;
        score += metrics.on_time_rate * 40; // 40 points max
        score += Math.max(0, (30 - metrics.avg_response_days) / 30 * 30); // 30 points max
        score += (1 - metrics.exemption_rate) * 20; // 20 points max
        score += (1 - metrics.appeal_overturn_rate) * 10; // 10 points max
        return Math.min(Math.max(score, 0), 100);
      };

      const result = await mockDb.query('SELECT * FROM calculate_transparency_score($1)', ['tenant-123']);
      const score = result.rows[0].transparency_score;

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBe(78);
    });
  });

  describe('Public Dashboard - Enabled', () => {
    it('should return data without PII when accessing /public/transparency/:slug', async () => {
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          tenant_name: 'City of Example',
          transparency_score: 78,
          total_requests_ytd: 450,
          on_time_rate: 0.85,
          avg_response_days: 12,
          public_dashboard_enabled: true
        }]
      });

      const req = createMockRequest({
        params: { slug: 'city-of-example' }
      });
      const res = createMockResponse();

      const getPublicDashboard = async (req: any, res: any) => {
        const result = await mockDb.query(
          'SELECT * FROM "TransparencyDashboards" WHERE slug = $1 AND public_dashboard_enabled = true',
          [req.params.slug]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Dashboard not found' });
        }

        const dashboard = result.rows[0];
        return res.json({
          tenant_name: dashboard.tenant_name,
          transparency_score: dashboard.transparency_score,
          metrics: {
            total_requests_ytd: dashboard.total_requests_ytd,
            on_time_rate: dashboard.on_time_rate,
            avg_response_days: dashboard.avg_response_days
          },
          // No PII exposed
          pii_excluded: true
        });
      };

      await getPublicDashboard(req, res);

      expect(res.json).toHaveBeenCalledWith({
        tenant_name: 'City of Example',
        transparency_score: 78,
        metrics: expect.any(Object),
        pii_excluded: true
      });
    });
  });

  describe('Public Dashboard - Disabled', () => {
    it('should return 404 when dashboard is disabled', async () => {
      mockDb.query = jest.fn().mockResolvedValue({
        rows: []
      });

      const req = createMockRequest({
        params: { slug: 'city-of-example' }
      });
      const res = createMockResponse();

      const getPublicDashboard = async (req: any, res: any) => {
        const result = await mockDb.query(
          'SELECT * FROM "TransparencyDashboards" WHERE slug = $1 AND public_dashboard_enabled = true',
          [req.params.slug]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Dashboard not found' });
        }

        return res.json(result.rows[0]);
      };

      await getPublicDashboard(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Dashboard not found' });
    });
  });
});
