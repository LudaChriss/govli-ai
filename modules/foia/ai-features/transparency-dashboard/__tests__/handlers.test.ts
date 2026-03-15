/**
 * AI-16: Transparency Handlers Tests
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import {
  getPublicDashboard,
  getEmbedWidget,
  updateSettings
} from '../src/handlers';
import { AuthenticatedRequest } from '../src/types';

describe('Transparency Handlers', () => {
  let mockDb: Pool;
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let jsonSpy: jest.Mock;
  let sendSpy: jest.Mock;
  let statusSpy: jest.Mock;
  let setHeaderSpy: jest.Mock;

  beforeEach(() => {
    mockDb = {
      query: jest.fn()
    } as unknown as Pool;

    jsonSpy = jest.fn();
    sendSpy = jest.fn();
    statusSpy = jest.fn().mockReturnThis();
    setHeaderSpy = jest.fn();

    mockRes = {
      json: jsonSpy,
      send: sendSpy,
      status: statusSpy,
      setHeader: setHeaderSpy
    };

    mockReq = {
      app: {
        locals: { db: mockDb }
      } as any,
      params: {},
      body: {},
      user: undefined
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getPublicDashboard', () => {
    it('should return public dashboard data', async () => {
      mockReq.params = { agencySlug: 'test-agency' };

      // Mock tenant lookup
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 'tenant1', name: 'Test Agency', transparency_public: true }]
      });

      // Mock score data
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          score: 85,
          components: { response_time: 20, on_time_rate: 25, proactive_disclosure: 15, denial_rate: 12, appeal_reversal: 13 },
          peer_percentile: 75,
          calculated_at: new Date()
        }]
      });

      // Mock monthly stats
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      // Mock top exemptions
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      // Mock reading room count
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [{ count: '100' }] });

      await getPublicDashboard(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(setHeaderSpy).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(jsonSpy).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          agency_name: 'Test Agency',
          score: 85,
          peer_percentile: 75
        })
      });
    });

    it('should return 404 when agency not found', async () => {
      mockReq.params = { agencySlug: 'nonexistent' };

      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await getPublicDashboard(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Transparency dashboard not found or not public'
      });
    });
  });

  describe('getEmbedWidget', () => {
    it('should return HTML widget', async () => {
      mockReq.params = { agencySlug: 'test-agency' };

      // Mock tenant lookup
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: 'tenant1', name: 'Test Agency', transparency_public: true }]
      });

      // Mock score data
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          score: 85,
          components: { response_time: 20, on_time_rate: 25, proactive_disclosure: 15, denial_rate: 12, appeal_reversal: 13 },
          peer_percentile: 75,
          calculated_at: new Date()
        }]
      });

      // Mock monthly stats
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
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
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      // Mock reading room count
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [{ count: '100' }] });

      await getEmbedWidget(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(setHeaderSpy).toHaveBeenCalledWith('Content-Type', 'text/html');
      expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('<!DOCTYPE html>'));
      expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('Test Agency'));
    });
  });

  describe('updateSettings', () => {
    it('should update transparency settings', async () => {
      mockReq.user = { tenant_id: 'tenant1' } as any;
      mockReq.body = {
        transparency_dashboard_enabled: true,
        transparency_public: false
      };

      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await updateSettings(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE "FoiaTenants"'),
        expect.arrayContaining([true, false, 'tenant1'])
      );

      expect(jsonSpy).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          transparency_dashboard_enabled: true,
          transparency_public: false
        })
      });
    });

    it('should return 401 when user not authenticated', async () => {
      mockReq.user = undefined;

      await updateSettings(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(401);
      expect(jsonSpy).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized'
      });
    });
  });
});
