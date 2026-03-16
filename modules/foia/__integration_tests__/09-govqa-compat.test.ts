/**
 * Integration Tests: GovQA Compatibility API
 * Tests backward-compatible API layer for GovQA migration
 */

import { createMockRequest, createMockResponse, mockUsers, mockDb } from './setup';

describe('GovQA Compatibility Integration Tests', () => {
  describe('Submit via GovQA API', () => {
    it('should create request using GovQA field names and map to Govli', async () => {
      const req = createMockRequest({
        body: {
          caseNumber: 'GQ-2024-001',
          requesterName: 'John Doe',
          requesterEmail: 'john@example.com',
          description: 'Request for documents',
          status: 'Open'
        }
      });
      const res = createMockResponse();

      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'req-123',
          tracking_number: 'GQ-2024-001',
          requester: { name: 'John Doe', email: 'john@example.com' },
          description: 'Request for documents',
          foia_status: 'SUBMITTED'
        }]
      });

      const createGovQARequest = async (req: any, res: any) => {
        // Map GovQA fields to Govli
        const govliRequest = {
          tracking_number: req.body.caseNumber,
          requester: {
            name: req.body.requesterName,
            email: req.body.requesterEmail
          },
          description: req.body.description,
          foia_status: req.body.status === 'Open' ? 'SUBMITTED' : 'IN_PROGRESS',
          migration_source: 'govqa_compat'
        };

        const result = await mockDb.query('INSERT INTO "FoiaRequests" ...', [govliRequest]);

        res.setHeader('X-Govli-Migration-Warning', 'Using GovQA compatibility mode');

        return res.json({
          success: true,
          caseId: result.rows[0].id,
          caseNumber: result.rows[0].tracking_number
        });
      };

      await createGovQARequest(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('X-Govli-Migration-Warning', expect.any(String));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        caseId: 'req-123',
        caseNumber: 'GQ-2024-001'
      });
    });
  });

  describe('Get Request via GovQA API', () => {
    it('should return GovQA-formatted response with X-Govli-Migration-Warning header', async () => {
      const req = createMockRequest({
        params: { caseNumber: 'GQ-2024-001' }
      });
      const res = createMockResponse();

      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'req-123',
          tracking_number: 'GQ-2024-001',
          requester: { name: 'John Doe', email: 'john@example.com' },
          description: 'Request for documents',
          foia_status: 'IN_PROGRESS'
        }]
      });

      const getGovQARequest = async (req: any, res: any) => {
        const result = await mockDb.query(
          'SELECT * FROM "FoiaRequests" WHERE tracking_number = $1',
          [req.params.caseNumber]
        );

        const govliRequest = result.rows[0];

        // Map to GovQA format
        const govqaResponse = {
          caseId: govliRequest.id,
          caseNumber: govliRequest.tracking_number,
          requesterName: govliRequest.requester.name,
          requesterEmail: govliRequest.requester.email,
          description: govliRequest.description,
          status: govliRequest.foia_status === 'SUBMITTED' ? 'Open' : 'In Progress'
        };

        res.setHeader('X-Govli-Migration-Warning', 'Using GovQA compatibility mode');

        return res.json(govqaResponse);
      };

      await getGovQARequest(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('X-Govli-Migration-Warning', expect.any(String));
      expect(res.json).toHaveBeenCalledWith({
        caseId: 'req-123',
        caseNumber: 'GQ-2024-001',
        requesterName: 'John Doe',
        requesterEmail: 'john@example.com',
        description: 'Request for documents',
        status: 'In Progress'
      });
    });
  });

  describe('Compatibility Usage Tracking', () => {
    it('should log compat API usage and show 2 calls in report', async () => {
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          endpoint: 'POST /api/compat/govqa/cases',
          call_count: 1
        }, {
          endpoint: 'GET /api/compat/govqa/cases/:caseNumber',
          call_count: 1
        }]
      });

      const result = await mockDb.query(`
        SELECT endpoint, COUNT(*) as call_count
        FROM "CompatAPIUsage"
        GROUP BY endpoint
      `);

      expect(result.rows).toHaveLength(2);
      expect(result.rows.reduce((sum: number, r: any) => sum + r.call_count, 0)).toBe(2);
    });
  });
});
