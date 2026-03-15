/**
 * GovQA Compatibility - Handlers Tests
 */

import { Request, Response } from 'express';
import { Pool } from 'pg';
import { createCase, getCase, listCases, getCompatUsage } from '../src/handlers';
import { AuthenticatedRequest } from '../src/types';

describe('GovQA Compat Handlers', () => {
  let mockDb: Pool;
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let jsonSpy: jest.Mock;
  let statusSpy: jest.Mock;

  beforeEach(() => {
    mockDb = {
      query: jest.fn()
    } as unknown as Pool;

    jsonSpy = jest.fn();
    statusSpy = jest.fn().mockReturnThis();

    mockRes = {
      json: jsonSpy,
      status: statusSpy
    };

    mockReq = {
      app: {
        locals: { db: mockDb }
      } as any,
      params: {},
      body: {},
      user: { tenant_id: 'tenant-123' } as any
    };
  });

  describe('createCase', () => {
    it('should create a case and transform to GovQA format', async () => {
      mockReq.body = {
        case_number: 'GQ-2026-001',
        subject: 'Test request',
        requester_name: 'John Doe',
        requester_email: 'john@example.com',
        status_code: 'NEW',
        created_date: '2026-03-01T10:00:00Z'
      };

      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          id: 'req-123',
          legacy_id: 'GQ-2026-001',
          description: 'Test request',
          requester: { name: 'John Doe', email: 'john@example.com' },
          foia_status: 'SUBMITTED',
          submitted_at: '2026-03-01T10:00:00Z'
        }]
      });

      await createCase(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(201);
      expect(jsonSpy).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          case_number: 'GQ-2026-001',
          subject: 'Test request',
          requester_name: 'John Doe'
        })
      });
    });
  });

  describe('getCase', () => {
    it('should retrieve case by legacy_id', async () => {
      mockReq.params = { caseNumber: 'GQ-2026-001' };

      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{
          id: 'req-123',
          legacy_id: 'GQ-2026-001',
          description: 'Test request',
          requester: { name: 'John Doe', email: 'john@example.com' },
          foia_status: 'SUBMITTED',
          submitted_at: '2026-03-01T10:00:00Z'
        }]
      });

      await getCase(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(jsonSpy).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          case_number: 'GQ-2026-001'
        })
      });
    });

    it('should return 404 when case not found', async () => {
      mockReq.params = { caseNumber: 'GQ-NOTFOUND' };

      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: []
      });

      await getCase(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(statusSpy).toHaveBeenCalledWith(404);
    });
  });

  describe('listCases', () => {
    it('should list cases with pagination', async () => {
      mockReq.query = { page: '1', limit: '10' };

      // Mock request results
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'req-1',
            legacy_id: 'GQ-001',
            description: 'Request 1',
            requester: { name: 'User 1', email: 'user1@example.com' },
            foia_status: 'SUBMITTED',
            submitted_at: '2026-03-01T10:00:00Z'
          }
        ]
      });

      // Mock count results
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ total: '1' }]
      });

      await listCases(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(jsonSpy).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          cases: expect.any(Array),
          pagination: expect.objectContaining({
            page: 1,
            limit: 10,
            total: 1
          })
        })
      });
    });
  });

  describe('getCompatUsage', () => {
    it('should return migration tracking data', async () => {
      // Mock total requests
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ total: '150' }]
      });

      // Mock unique integrations
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ unique_cases: '45' }]
      });

      // Mock endpoints used
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            endpoint: '/api/compat/govqa/cases',
            call_count: '100',
            last_used: '2026-03-15T10:00:00Z'
          }
        ]
      });

      // Mock recent requests
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ recent: '25' }]
      });

      await getCompatUsage(mockReq as AuthenticatedRequest, mockRes as Response);

      expect(jsonSpy).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          total_compat_requests: 150,
          unique_integrations: 45,
          endpoints_used: expect.any(Array),
          migration_progress: 'IN_PROGRESS'
        })
      });
    });
  });
});
