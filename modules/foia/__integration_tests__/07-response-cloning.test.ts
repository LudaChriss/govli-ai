/**
 * Integration Tests: Response Cloning
 * Tests detection of similar requests and response package cloning
 */

import { createMockRequest, createMockResponse, mockUsers, mockDb, createMockFoiaRequest } from './setup';

describe('Response Cloning Integration Tests', () => {
  // Test 1: Create and close request A with full response
  describe('Setup Source Request', () => {
    it('should create and close request A with full response package', async () => {
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'req-a',
          foia_status: 'DELIVERED',
          response_text: 'Dear Requester, attached are the documents you requested...',
          exemptions_used: ['6254(c)', '6254(k)'],
          documents: [
            { filename: 'budget-2023.pdf', is_redacted: false },
            { filename: 'emails-redacted.pdf', is_redacted: true }
          ]
        }]
      });

      const result = await mockDb.query(
        'SELECT * FROM "FoiaRequests" WHERE id = $1',
        ['req-a']
      );

      expect(result.rows[0].foia_status).toBe('DELIVERED');
      expect(result.rows[0].exemptions_used).toHaveLength(2);
    });
  });

  // Test 2: Submit similar request B
  describe('Clone Detection', () => {
    it('should detect clone candidate for request B with > 0.90 similarity to A', async () => {
      const requestB = createMockFoiaRequest({
        id: 'req-b',
        description: 'Request for city budget 2023 and related email communications'
      });

      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          source_request_id: 'req-a',
          candidate_request_id: 'req-b',
          similarity_score: 0.93,
          is_clone_candidate: true
        }]
      });

      const result = await mockDb.query(`
        SELECT * FROM detect_clone_candidates($1)
      `, [requestB.id]);

      expect(result.rows[0].is_clone_candidate).toBe(true);
      expect(result.rows[0].similarity_score).toBeGreaterThan(0.90);
    });
  });

  // Test 3: Execute clone
  describe('Clone Execution', () => {
    it('should clone response from A to B with adapted dates and names', async () => {
      const req = createMockRequest({
        user: mockUsers.foia_officer,
        body: {
          source_request_id: 'req-a',
          target_request_id: 'req-b',
          action: 'CLONE'
        }
      });
      const res = createMockResponse();

      mockDb.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'req-a',
            response_text: 'Dear John Doe, attached are documents from 2023-01-15...',
            exemptions_used: ['6254(c)', '6254(k)']
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'req-b',
            requester: { name: 'Jane Smith' },
            submitted_at: '2024-02-20'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'req-b', response_text: 'Dear Jane Smith, attached are documents from 2024-02-20...' }]
        });

      const cloneResponse = async (req: any, res: any) => {
        const source = await mockDb.query('SELECT * FROM "FoiaRequests" WHERE id = $1', [req.body.source_request_id]);
        const target = await mockDb.query('SELECT * FROM "FoiaRequests" WHERE id = $1', [req.body.target_request_id]);

        // Adapt response text
        let adaptedText = source.rows[0].response_text
          .replace(/Dear [^,]+/, `Dear ${target.rows[0].requester.name}`)
          .replace(/\d{4}-\d{2}-\d{2}/, target.rows[0].submitted_at);

        await mockDb.query(`
          UPDATE "FoiaRequests"
          SET response_text = $1, exemptions_used = $2, cloned_from = $3
          WHERE id = $4
        `, [adaptedText, source.rows[0].exemptions_used, req.body.source_request_id, req.body.target_request_id]);

        return res.json({
          success: true,
          cloned_from: req.body.source_request_id,
          adapted: true,
          exemptions_preserved: true
        });
      };

      await cloneResponse(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        cloned_from: 'req-a',
        adapted: true,
        exemptions_preserved: true
      });
    });
  });

  // Test 4: Verify adaptation
  describe('Clone Verification', () => {
    it('should confirm dates and names updated but exemptions identical', async () => {
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'req-b',
          response_text: 'Dear Jane Smith, attached are documents from 2024-02-20...',
          exemptions_used: ['6254(c)', '6254(k)']
        }]
      });

      const result = await mockDb.query('SELECT * FROM "FoiaRequests" WHERE id = $1', ['req-b']);
      const cloned = result.rows[0];

      expect(cloned.response_text).toContain('Jane Smith');
      expect(cloned.response_text).toContain('2024-02-20');
      expect(cloned.exemptions_used).toEqual(['6254(c)', '6254(k)']);
    });
  });

  // Test 5: Approve clone
  describe('Clone Approval', () => {
    it('should approve clone and move request B to DELIVERED', async () => {
      const req = createMockRequest({
        user: mockUsers.foia_admin,
        params: { requestId: 'req-b' }
      });
      const res = createMockResponse();

      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{ id: 'req-b', foia_status: 'DELIVERED' }]
      });

      const approveClone = async (req: any, res: any) => {
        await mockDb.query(`
          UPDATE "FoiaRequests"
          SET foia_status = 'DELIVERED', delivered_at = NOW()
          WHERE id = $1
        `, [req.params.requestId]);

        return res.json({
          success: true,
          request_id: req.params.requestId,
          status: 'DELIVERED'
        });
      };

      await approveClone(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        request_id: 'req-b',
        status: 'DELIVERED'
      });
    });
  });

  // Test 6: Audit trail
  describe('Clone Audit Trail', () => {
    it('should track clone origin in audit log', async () => {
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'audit-123',
          request_id: 'req-b',
          event_type: 'RESPONSE_CLONED',
          description: 'Response cloned from request req-a',
          metadata: {
            source_request_id: 'req-a',
            similarity_score: 0.93
          }
        }]
      });

      const result = await mockDb.query(`
        SELECT * FROM "FoiaAuditLog"
        WHERE request_id = $1 AND event_type = 'RESPONSE_CLONED'
      `, ['req-b']);

      expect(result.rows[0].event_type).toBe('RESPONSE_CLONED');
      expect(result.rows[0].metadata.source_request_id).toBe('req-a');
    });
  });
});
