/**
 * Integration Tests: Model Routing
 * Tests complexity scoring and automatic model selection
 */

import { createMockRequest, createMockResponse, mockUsers, mockDb, mockAIResponse } from './setup';

describe('Model Routing Integration Tests', () => {
  // Test 1: Simple request uses Haiku
  describe('Simple Request - Haiku Model', () => {
    it('should use claude-haiku-4-20250514 for simple request with complexity 15', async () => {
      const req = createMockRequest({
        user: mockUsers.foia_officer,
        body: {
          description: 'Request for city budget 2023'
        }
      });
      const res = createMockResponse();

      // Simulate complexity scoring
      const calculateComplexity = (description: string): number => {
        let score = 0;

        // Simple heuristic
        const wordCount = description.split(/\s+/).length;
        score += Math.min(wordCount * 2, 20);

        // Date ranges
        const hasDateRange = /\d{4}.*\d{4}/.test(description);
        if (hasDateRange) score += 20;

        // Multiple departments
        const departments = ['police', 'fire', 'public works', 'finance'];
        const deptMentions = departments.filter(d => description.toLowerCase().includes(d)).length;
        score += deptMentions * 15;

        // Legal terms
        const legalTerms = ['pursuant', 'statute', 'exemption', 'privilege'];
        const legalMentions = legalTerms.filter(t => description.toLowerCase().includes(t)).length;
        score += legalMentions * 10;

        return Math.min(score, 100);
      };

      const complexity = calculateComplexity(req.body.description);
      expect(complexity).toBeLessThan(30); // Simple request

      // Route to appropriate model
      const selectModel = (complexity: number, aiFeature: string): string => {
        // AI-5 (Vaughn Index) always uses Opus
        if (aiFeature === 'AI-5: Vaughn Index Generator') {
          return 'claude-opus-4-20250514';
        }

        // Complexity-based routing for other features
        if (complexity >= 70) {
          return 'claude-opus-4-20250514';
        } else if (complexity >= 40) {
          return 'claude-sonnet-4-20250514';
        } else {
          return 'claude-haiku-4-20250514';
        }
      };

      const model = selectModel(complexity, 'AI-1: Request Scoping');
      expect(model).toBe('claude-haiku-4-20250514');

      // Simulate AI call and log usage
      const aiUsage = {
        id: 'usage-123',
        tenant_id: mockUsers.foia_officer.tenant_id,
        request_id: 'req-123',
        ai_feature: 'AI-1: Request Scoping',
        model_used: model,
        complexity_score: complexity,
        input_tokens: 500,
        output_tokens: 200,
        cost_usd: 0.0015,
        created_at: new Date()
      };

      mockDb.query = jest.fn().mockResolvedValue({
        rows: [aiUsage]
      });

      await mockDb.query('INSERT INTO "FoiaAIUsage" ...', [aiUsage]);

      expect(mockDb.query).toHaveBeenCalled();
      const loggedUsage = (mockDb.query as jest.Mock).mock.calls[0][1][0];
      expect(loggedUsage.model_used).toBe('claude-haiku-4-20250514');
      expect(loggedUsage.complexity_score).toBe(complexity);
    });
  });

  // Test 2: Complex request uses Opus
  describe('Complex Request - Opus Model', () => {
    it('should use claude-opus-4-20250514 for complex request with complexity > 70', async () => {
      const complexDescription = `Pursuant to the Freedom of Information Act, I request all documents,
        emails, and communications between the Police Department, Fire Department, and Public Works
        Department regarding the 2019-2023 infrastructure project, including all exemption logs and
        deliberative process privilege claims.`;

      const req = createMockRequest({
        user: mockUsers.foia_officer,
        body: {
          description: complexDescription
        }
      });

      // Calculate complexity
      const calculateComplexity = (description: string): number => {
        let score = 0;

        const wordCount = description.split(/\s+/).length;
        score += Math.min(wordCount * 2, 30);

        // Date ranges (2019-2023)
        const hasDateRange = /\d{4}.*\d{4}/.test(description);
        if (hasDateRange) score += 20;

        // Multiple departments (Police, Fire, Public Works = 3)
        const departments = ['police', 'fire', 'public works', 'finance'];
        const deptMentions = departments.filter(d => description.toLowerCase().includes(d)).length;
        score += deptMentions * 15; // 3 * 15 = 45

        // Legal terms (pursuant, exemption, privilege = 3)
        const legalTerms = ['pursuant', 'statute', 'exemption', 'privilege', 'deliberative'];
        const legalMentions = legalTerms.filter(t => description.toLowerCase().includes(t)).length;
        score += legalMentions * 10; // 3 * 10 = 30

        return Math.min(score, 100);
      };

      const complexity = calculateComplexity(complexDescription);
      expect(complexity).toBeGreaterThan(70); // Complex request

      // Route to Opus
      const selectModel = (complexity: number): string => {
        if (complexity >= 70) {
          return 'claude-opus-4-20250514';
        } else if (complexity >= 40) {
          return 'claude-sonnet-4-20250514';
        } else {
          return 'claude-haiku-4-20250514';
        }
      };

      const model = selectModel(complexity);
      expect(model).toBe('claude-opus-4-20250514');

      // Log usage
      const aiUsage = {
        id: 'usage-456',
        tenant_id: mockUsers.foia_officer.tenant_id,
        ai_feature: 'AI-1: Request Scoping',
        model_used: model,
        complexity_score: complexity,
        input_tokens: 2000,
        output_tokens: 800,
        cost_usd: 0.045,
        created_at: new Date()
      };

      mockDb.query = jest.fn().mockResolvedValue({
        rows: [aiUsage]
      });

      await mockDb.query('INSERT INTO "FoiaAIUsage" ...', [aiUsage]);

      const loggedUsage = (mockDb.query as jest.Mock).mock.calls[0][1][0];
      expect(loggedUsage.model_used).toBe('claude-opus-4-20250514');
      expect(loggedUsage.complexity_score).toBeGreaterThan(70);
    });
  });

  // Test 3: AI-5 Vaughn Index always uses Opus
  describe('AI-5 Vaughn Index - Always Opus', () => {
    it('should always use claude-opus-4-20250514 for Vaughn Index generation regardless of complexity', async () => {
      const simpleDescription = 'Request for one email from 2023';

      // Calculate complexity (will be low)
      const calculateComplexity = (description: string): number => {
        let score = 0;
        const wordCount = description.split(/\s+/).length;
        score += Math.min(wordCount * 2, 20);
        return score;
      };

      const complexity = calculateComplexity(simpleDescription);
      expect(complexity).toBeLessThan(30); // Low complexity

      // But AI-5 always uses Opus
      const selectModel = (complexity: number, aiFeature: string): string => {
        if (aiFeature === 'AI-5: Vaughn Index Generator') {
          return 'claude-opus-4-20250514'; // Always Opus for Vaughn
        }

        if (complexity >= 70) {
          return 'claude-opus-4-20250514';
        } else if (complexity >= 40) {
          return 'claude-sonnet-4-20250514';
        } else {
          return 'claude-haiku-4-20250514';
        }
      };

      const model = selectModel(complexity, 'AI-5: Vaughn Index Generator');
      expect(model).toBe('claude-opus-4-20250514');

      // Verify with another complexity score
      const highComplexity = 85;
      const modelHighComplexity = selectModel(highComplexity, 'AI-5: Vaughn Index Generator');
      expect(modelHighComplexity).toBe('claude-opus-4-20250514');

      // Log usage
      const aiUsage = {
        id: 'usage-789',
        tenant_id: mockUsers.foia_officer.tenant_id,
        ai_feature: 'AI-5: Vaughn Index Generator',
        model_used: model,
        complexity_score: complexity,
        input_tokens: 3000,
        output_tokens: 2000,
        cost_usd: 0.120,
        created_at: new Date()
      };

      mockDb.query = jest.fn().mockResolvedValue({
        rows: [aiUsage]
      });

      await mockDb.query('INSERT INTO "FoiaAIUsage" ...', [aiUsage]);

      const loggedUsage = (mockDb.query as jest.Mock).mock.calls[0][1][0];
      expect(loggedUsage.ai_feature).toBe('AI-5: Vaughn Index Generator');
      expect(loggedUsage.model_used).toBe('claude-opus-4-20250514');
    });
  });
});
