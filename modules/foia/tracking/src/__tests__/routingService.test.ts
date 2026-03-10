/**
 * Routing Service Tests
 * Tests routing and assignment functionality
 */

import { Pool } from 'pg';
import { RoutingService } from '../services/routingService';

// Mock pg Pool
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn()
  };
  return { Pool: jest.fn(() => mPool) };
});

// Mock emit
jest.mock('@govli/foia-shared', () => ({
  emit: jest.fn()
}));

describe('RoutingService', () => {
  let routingService: RoutingService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = new Pool();
    routingService = new RoutingService(mockDb);
    jest.clearAllMocks();
  });

  describe('routeRequest', () => {
    it('should create routing record and emit event', async () => {
      const mockRouting = {
        id: 'routing-1',
        tenant_id: 'tenant-1',
        foia_request_id: 'req-1',
        department_id: 'dept-1',
        department_name: 'IT Department',
        status: 'PENDING',
        notes: 'Routing to IT',
        created_by: 'user-1',
        created_at: new Date(),
        updated_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockRouting] });

      const result = await routingService.routeRequest(
        'tenant-1',
        'req-1',
        'dept-1',
        'IT Department',
        'Routing to IT',
        'user-1'
      );

      expect(result).toEqual(mockRouting);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO foia_routing'),
        expect.arrayContaining(['tenant-1', 'req-1', 'dept-1', 'IT Department'])
      );
    });
  });

  describe('assignRouting', () => {
    it('should assign routing to user and update request', async () => {
      // Mock check query
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'routing-1', tenant_id: 'tenant-1' }]
      });

      // Mock update routing query
      const mockRouting = {
        id: 'routing-1',
        foia_request_id: 'req-1',
        assigned_to: 'user-2',
        status: 'ASSIGNED'
      };
      mockDb.query.mockResolvedValueOnce({ rows: [mockRouting] });

      // Mock update request query
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await routingService.assignRouting(
        'tenant-1',
        'routing-1',
        'user-2',
        'user-1'
      );

      expect(result).toEqual(mockRouting);
      expect(mockDb.query).toHaveBeenCalledTimes(3);
    });

    it('should throw error if routing not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        routingService.assignRouting('tenant-1', 'invalid-id', 'user-2', 'user-1')
      ).rejects.toThrow('Routing record not found or access denied');
    });
  });

  describe('getRoutingRecords', () => {
    it('should return routing records for request', async () => {
      const mockRoutings = [
        {
          id: 'routing-1',
          tenant_id: 'tenant-1',
          foia_request_id: 'req-1',
          department_id: 'dept-1',
          department_name: 'IT Department',
          status: 'ASSIGNED',
          created_at: new Date()
        },
        {
          id: 'routing-2',
          tenant_id: 'tenant-1',
          foia_request_id: 'req-1',
          department_id: 'dept-2',
          department_name: 'Legal Department',
          status: 'COMPLETED',
          created_at: new Date()
        }
      ];

      mockDb.query.mockResolvedValueOnce({ rows: mockRoutings });

      const result = await routingService.getRoutingRecords('tenant-1', 'req-1');

      expect(result).toEqual(mockRoutings);
      expect(result).toHaveLength(2);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT r.*'),
        ['tenant-1', 'req-1']
      );
    });

    it('should return empty array when no routings found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await routingService.getRoutingRecords('tenant-1', 'req-1');

      expect(result).toEqual([]);
    });
  });

  describe('updateRoutingStatus', () => {
    it('should update routing status to IN_PROGRESS', async () => {
      const mockRouting = {
        id: 'routing-1',
        foia_request_id: 'req-1',
        status: 'IN_PROGRESS',
        updated_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockRouting] });

      const result = await routingService.updateRoutingStatus(
        'tenant-1',
        'routing-1',
        'IN_PROGRESS',
        'user-1'
      );

      expect(result).toEqual(mockRouting);
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE foia_routing'),
        ['IN_PROGRESS', 'routing-1', 'tenant-1']
      );
    });

    it('should update routing status to COMPLETED', async () => {
      const mockRouting = {
        id: 'routing-1',
        foia_request_id: 'req-1',
        status: 'COMPLETED',
        updated_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockRouting] });

      const result = await routingService.updateRoutingStatus(
        'tenant-1',
        'routing-1',
        'COMPLETED',
        'user-1'
      );

      expect(result.status).toBe('COMPLETED');
    });

    it('should update routing status to ESCALATED', async () => {
      const mockRouting = {
        id: 'routing-1',
        foia_request_id: 'req-1',
        status: 'ESCALATED',
        updated_at: new Date()
      };

      mockDb.query.mockResolvedValueOnce({ rows: [mockRouting] });

      const result = await routingService.updateRoutingStatus(
        'tenant-1',
        'routing-1',
        'ESCALATED',
        'user-1'
      );

      expect(result.status).toBe('ESCALATED');
    });

    it('should throw error if routing not found', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        routingService.updateRoutingStatus('tenant-1', 'invalid-id', 'COMPLETED', 'user-1')
      ).rejects.toThrow('Routing record not found or access denied');
    });
  });
});
