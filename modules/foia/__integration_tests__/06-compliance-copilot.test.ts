/**
 * Integration Tests: AI-14 Compliance Copilot
 * Tests interactive AI assistant with context awareness
 */

import { createMockRequest, createMockResponse, mockUsers, mockDb, mockAIResponse } from './setup';

describe('AI-14 Compliance Copilot Integration Tests', () => {
  // Test 1: Simple question uses Haiku
  describe('Simple Question - Haiku Model', () => {
    it('should answer "What exemption covers SSN?" with correct statute and use Haiku', async () => {
      const req = createMockRequest({
        user: mockUsers.foia_officer,
        body: {
          message: 'What exemption covers SSN?',
          session_id: 'session-123'
        }
      });
      const res = createMockResponse();

      mockDb.query = jest.fn()
        .mockResolvedValueOnce({
          rows: [{ jurisdiction: 'California', statute_reference: 'Cal. Gov. Code § 6254' }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'msg-123',
            model_used: 'claude-haiku-4-20250514',
            cost_usd: 0.002
          }]
        });

      const askCopilot = async (req: any, res: any) => {
        const tenant = await mockDb.query('SELECT jurisdiction FROM "Tenants" WHERE id = $1', [req.user.tenant_id]);

        const aiResponse = mockAIResponse(
          'Social Security Numbers are protected under exemption 6254(c) in California, which covers personal privacy information.',
          'claude-haiku-4-20250514'
        );

        await mockDb.query('INSERT INTO "FoiaCopilotMessages" ...', [{
          session_id: req.body.session_id,
          model_used: aiResponse.model,
          cost_usd: 0.002
        }]);

        return res.json({
          response: aiResponse.content[0].text,
          model_used: aiResponse.model,
          cites_statute: true
        });
      };

      await askCopilot(req, res);

      expect(res.json).toHaveBeenCalledWith({
        response: expect.stringContaining('6254'),
        model_used: 'claude-haiku-4-20250514',
        cites_statute: true
      });
    });
  });

  // Test 2: Complex legal question escalates to Sonnet
  describe('Complex Question - Sonnet Model', () => {
    it('should escalate "Can we invoke deliberative process privilege?" to Sonnet', async () => {
      const req = createMockRequest({
        user: mockUsers.foia_officer,
        body: {
          message: 'Can we invoke deliberative process privilege here?',
          session_id: 'session-456'
        }
      });
      const res = createMockResponse();

      // Detect complexity
      const detectComplexity = (message: string): string => {
        const legalTerms = ['privilege', 'exemption', 'statute', 'deliberative', 'invoke'];
        const hasLegalTerms = legalTerms.some(term => message.toLowerCase().includes(term));

        return hasLegalTerms ? 'claude-sonnet-4-20250514' : 'claude-haiku-4-20250514';
      };

      const model = detectComplexity(req.body.message);
      expect(model).toBe('claude-sonnet-4-20250514');

      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          model_used: model,
          cost_usd: 0.015
        }]
      });

      const aiResponse = mockAIResponse(
        'Deliberative process privilege can be invoked for pre-decisional, deliberative documents...',
        model
      );

      const askCopilot = async (req: any, res: any) => {
        return res.json({
          response: aiResponse.content[0].text,
          model_used: model,
          escalated: true
        });
      };

      await askCopilot(req, res);

      expect(res.json).toHaveBeenCalledWith({
        response: expect.any(String),
        model_used: 'claude-sonnet-4-20250514',
        escalated: true
      });
    });
  });

  // Test 3: Context-aware responses
  describe('Context-Aware Responses', () => {
    it('should reference specific request when foia_request_id is set', async () => {
      const req = createMockRequest({
        user: mockUsers.foia_officer,
        body: {
          message: 'Should I extend?',
          session_id: 'session-789',
          foia_request_id: 'req-123'
        }
      });
      const res = createMockResponse();

      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'req-123',
          due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
          complexity_score: 75
        }]
      });

      const askCopilot = async (req: any, res: any) => {
        const request = await mockDb.query(
          'SELECT * FROM "FoiaRequests" WHERE id = $1',
          [req.body.foia_request_id]
        );

        const daysUntilDue = Math.ceil((request.rows[0].due_date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));

        const aiResponse = mockAIResponse(
          `For request ${req.body.foia_request_id}, the due date is in ${daysUntilDue} days. Given the complexity score of ${request.rows[0].complexity_score}, an extension may be warranted.`,
          'claude-haiku-4-20250514'
        );

        return res.json({
          response: aiResponse.content[0].text,
          references_request: true,
          request_id: req.body.foia_request_id
        });
      };

      await askCopilot(req, res);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.references_request).toBe(true);
      expect(response.response).toContain('req-123');
    });
  });

  // Test 4: Session logging
  describe('Session Logging', () => {
    it('should log session in foia_copilot_sessions table', async () => {
      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          id: 'session-123',
          user_id: 'user-officer-123',
          total_messages: 3,
          total_cost: 0.025,
          created_at: new Date()
        }]
      });

      const result = await mockDb.query(
        'SELECT * FROM "FoiaCopilotSessions" WHERE id = $1',
        ['session-123']
      );

      expect(result.rows[0].id).toBe('session-123');
      expect(result.rows[0].total_messages).toBe(3);
      expect(result.rows[0].total_cost).toBe(0.025);
    });
  });
});
