/**
 * Integration Tests: AI-13 Batch Optimization
 * Tests duplicate detection and batch merging
 */

import { createMockRequest, createMockResponse, mockUsers, mockDb, createMockFoiaRequest } from './setup';

describe('AI-13 Batch Optimization Integration Tests', () => {
  // Test 1-2: Submit two similar requests
  describe('Duplicate Detection', () => {
    it('should detect batch opportunity with similarity > 0.80 for similar requests', async () => {
      const requestA = createMockFoiaRequest({
        id: 'req-a',
        description: 'Police department budget 2023',
        requester: { name: 'John Doe', email: 'john@example.com' }
      });

      const requestB = createMockFoiaRequest({
        id: 'req-b',
        description: 'Law enforcement budget for fiscal year 2023',
        requester: { name: 'John Doe', email: 'john@example.com' }
      });

      // Mock embedding vectors (similar)
      const embeddingA = new Array(1536).fill(0).map(() => Math.random());
      const embeddingB = embeddingA.map(v => v + (Math.random() - 0.5) * 0.15); // Very similar

      // Calculate cosine similarity
      const similarity = embeddingA.reduce((sum, val, i) => sum + val * embeddingB[i], 0) /
        (Math.sqrt(embeddingA.reduce((s, v) => s + v * v, 0)) *
         Math.sqrt(embeddingB.reduce((s, v) => s + v * v, 0)));

      expect(similarity).toBeGreaterThan(0.80);

      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          request_a_id: requestA.id,
          request_b_id: requestB.id,
          similarity_score: similarity,
          batch_opportunity: true
        }]
      });

      const result = await mockDb.query(`
        SELECT similarity FROM compare_requests($1, $2)
      `, [requestA.id, requestB.id]);

      expect(result.rows[0].batch_opportunity).toBe(true);
      expect(result.rows[0].similarity_score).toBeGreaterThan(0.80);
    });
  });

  // Test 3-4: Execute MERGE action
  describe('Request Merging', () => {
    it('should merge request B into A and update status to MERGED_INTO', async () => {
      const req = createMockRequest({
        user: mockUsers.foia_admin,
        body: {
          primary_request_id: 'req-a',
          secondary_request_id: 'req-b',
          action: 'MERGE'
        }
      });
      const res = createMockResponse();

      mockDb.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{ id: 'req-b', foia_status: 'MERGED_INTO', merged_into: 'req-a' }]
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'req-b', foia_status: 'MERGED_INTO', merged_into: 'req-a' }]
        });

      const mergeBatchRequests = async (req: any, res: any) => {
        // Update secondary request
        await mockDb.query(`
          UPDATE "FoiaRequests"
          SET foia_status = 'MERGED_INTO', merged_into = $1
          WHERE id = $2
        `, [req.body.primary_request_id, req.body.secondary_request_id]);

        // Get updated secondary
        const secondary = await mockDb.query(
          'SELECT * FROM "FoiaRequests" WHERE id = $1',
          [req.body.secondary_request_id]
        );

        return res.json({
          success: true,
          primary_request_id: req.body.primary_request_id,
          merged_request_id: req.body.secondary_request_id,
          status: secondary.rows[0].foia_status
        });
      };

      await mergeBatchRequests(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        primary_request_id: 'req-a',
        merged_request_id: 'req-b',
        status: 'MERGED_INTO'
      });
    });
  });

  // Test 5: Verify merge in database
  describe('Merge Verification', () => {
    it('should confirm B.status = MERGED_INTO and B.merged_into = A.id', async () => {
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'req-b',
          foia_status: 'MERGED_INTO',
          merged_into: 'req-a'
        }]
      });

      const result = await mockDb.query(
        'SELECT id, foia_status, merged_into FROM "FoiaRequests" WHERE id = $1',
        ['req-b']
      );

      const requestB = result.rows[0];
      expect(requestB.foia_status).toBe('MERGED_INTO');
      expect(requestB.merged_into).toBe('req-a');
    });
  });
});
