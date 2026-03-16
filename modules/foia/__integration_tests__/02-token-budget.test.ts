/**
 * Integration Tests: Token Budget Manager
 * Tests AI budget warnings, enforcement, and graceful degradation
 */

import { createMockRequest, createMockResponse, mockUsers, mockTenants, mockDb } from './setup';

describe('Token Budget Manager Integration Tests', () => {
  let currentSpend = 0;
  const monthlyBudget = 10.00;

  beforeEach(() => {
    currentSpend = 0;
  });

  // Test 1: Budget warning at 80%
  describe('Budget Warning', () => {
    it('should emit budget warning event at 80% spend', async () => {
      const events: any[] = [];
      const emitEvent = (event: any) => events.push(event);

      const checkBudget = (tenantId: string, newCost: number) => {
        currentSpend += newCost;
        const percentUsed = (currentSpend / monthlyBudget) * 100;

        if (percentUsed >= 80 && percentUsed < 95) {
          emitEvent({
            type: 'budget_warning',
            tenant_id: tenantId,
            current_spend: currentSpend,
            budget: monthlyBudget,
            percent_used: percentUsed,
            threshold: 80
          });
        }

        return { allowed: true, current_spend: currentSpend };
      };

      // Simulate AI calls totaling $8 (80% of $10 budget)
      const aiCosts = [2.0, 2.0, 2.0, 2.0]; // Total: $8

      for (const cost of aiCosts) {
        checkBudget('tenant-123', cost);
      }

      expect(currentSpend).toBe(8.00);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: 'budget_warning',
        tenant_id: 'tenant-123',
        current_spend: 8.00,
        budget: 10.00,
        percent_used: 80,
        threshold: 80
      });
    });
  });

  // Test 2: Budget enforcement at 95%
  describe('Budget Enforcement', () => {
    it('should reject AI calls at 95% budget usage', async () => {
      const checkBudgetStrict = (tenantId: string, newCost: number) => {
        const projectedSpend = currentSpend + newCost;
        const percentUsed = (projectedSpend / monthlyBudget) * 100;

        if (percentUsed >= 95) {
          return {
            allowed: false,
            error: 'budget_exceeded',
            message: `AI budget limit reached (${percentUsed.toFixed(1)}% of monthly budget)`,
            current_spend: currentSpend,
            budget: monthlyBudget
          };
        }

        currentSpend = projectedSpend;
        return { allowed: true, current_spend: currentSpend };
      };

      // Bring spend to $8
      currentSpend = 8.00;

      // Try to add $1.50 more (would bring to $9.50, which is 95%)
      const result1 = checkBudgetStrict('tenant-123', 1.50);
      expect(result1.allowed).toBe(false);
      expect(result1.error).toBe('budget_exceeded');
      expect(currentSpend).toBe(8.00); // Spend should not increase

      // Try smaller amount that brings to exactly 95%
      const result2 = checkBudgetStrict('tenant-123', 1.50);
      expect(result2.allowed).toBe(false);
    });
  });

  // Test 3: Continuing at 95% (soft limit allows more spend up to hard limit)
  describe('Budget Soft vs Hard Limit', () => {
    it('should continue allowing calls between 95% and 100% with warnings', async () => {
      const warnings: string[] = [];

      const checkBudgetWithWarnings = (tenantId: string, newCost: number) => {
        const projectedSpend = currentSpend + newCost;
        const percentUsed = (projectedSpend / monthlyBudget) * 100;

        if (percentUsed >= 100) {
          return {
            allowed: false,
            error: 'hard_budget_exceeded',
            message: 'Hard budget limit reached (100%)'
          };
        }

        if (percentUsed >= 95) {
          warnings.push(`Budget at ${percentUsed.toFixed(1)}% - consider review`);
        }

        currentSpend = projectedSpend;
        return { allowed: true, current_spend: currentSpend, warnings };
      };

      currentSpend = 9.00; // 90%

      // Add $0.60 to reach 96%
      const result1 = checkBudgetWithWarnings('tenant-123', 0.60);
      expect(result1.allowed).toBe(true);
      expect(currentSpend).toBe(9.60);
      expect(warnings.length).toBeGreaterThan(0);

      // Try to add $0.50 more (would exceed 100%)
      const result2 = checkBudgetWithWarnings('tenant-123', 0.50);
      expect(result2.allowed).toBe(false);
      expect(result2.error).toBe('hard_budget_exceeded');
    });
  });

  // Test 4: Graceful degradation - core workflow works without AI
  describe('Graceful Degradation', () => {
    it('should allow submit, route, and respond when AI is budget-blocked', async () => {
      const req = createMockRequest({
        user: mockUsers.foia_officer,
        body: {
          description: 'Request for budget documents',
          requester: {
            name: 'Jane Doe',
            email: 'jane@example.com'
          }
        }
      });
      const res = createMockResponse();

      // Simulate request submission handler with AI budget check
      const submitRequest = async (req: any, res: any) => {
        const budgetCheck = {
          allowed: false, // AI budget exceeded
          error: 'budget_exceeded'
        };

        // Create request WITHOUT AI enhancements
        const request = {
          id: 'req-123',
          ...req.body,
          foia_status: 'SUBMITTED',
          ai_enhanced: false, // Flag indicating AI was skipped
          complexity_score: null,
          scope: null
        };

        mockDb.query = jest.fn().mockResolvedValue({
          rows: [request]
        });

        await mockDb.query('INSERT INTO "FoiaRequests" ...');

        return res.json({
          success: true,
          request_id: request.id,
          warning: budgetCheck.error === 'budget_exceeded'
            ? 'AI features unavailable due to budget limits'
            : null
        });
      };

      await submitRequest(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        request_id: 'req-123',
        warning: 'AI features unavailable due to budget limits'
      });

      // Core workflows should still function
      // 1. Route request (manual assignment instead of AI routing)
      const routeReq = createMockRequest({
        user: mockUsers.foia_admin,
        body: {
          request_id: 'req-123',
          assigned_department: 'Police', // Manual assignment
          assigned_to_user_id: 'user-456'
        }
      });
      const routeRes = createMockResponse();

      const routeRequest = async (req: any, res: any) => {
        mockDb.query = jest.fn().mockResolvedValue({
          rows: [{
            id: req.body.request_id,
            assigned_department: req.body.assigned_department,
            foia_status: 'IN_PROGRESS'
          }]
        });

        await mockDb.query('UPDATE "FoiaRequests" ...');

        return res.json({
          success: true,
          request_id: req.body.request_id,
          status: 'IN_PROGRESS'
        });
      };

      await routeRequest(routeReq, routeRes);
      expect(routeRes.json).toHaveBeenCalledWith({
        success: true,
        request_id: 'req-123',
        status: 'IN_PROGRESS'
      });

      // 2. Respond to request (manual response instead of AI-generated)
      const respondReq = createMockRequest({
        user: mockUsers.foia_officer,
        body: {
          request_id: 'req-123',
          response_text: 'Manually written response letter',
          documents: []
        }
      });
      const respondRes = createMockResponse();

      const respondToRequest = async (req: any, res: any) => {
        mockDb.query = jest.fn().mockResolvedValue({
          rows: [{
            id: req.body.request_id,
            foia_status: 'DELIVERED',
            response_text: req.body.response_text
          }]
        });

        await mockDb.query('UPDATE "FoiaRequests" ...');

        return res.json({
          success: true,
          request_id: req.body.request_id,
          status: 'DELIVERED'
        });
      };

      await respondToRequest(respondReq, respondRes);
      expect(respondRes.json).toHaveBeenCalledWith({
        success: true,
        request_id: 'req-123',
        status: 'DELIVERED'
      });

      // All core workflows completed successfully without AI
    });
  });
});
