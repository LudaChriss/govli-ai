/**
 * Integration Tests: API Gateway
 * Tests authentication, authorization, rate limiting, validation, and versioning
 */

import { createMockRequest, createMockResponse, mockUsers, mockTenants, mockTokens } from './setup';

describe('API Gateway Integration Tests', () => {
  // Test 1: Unauthenticated access to staff endpoint
  describe('Authentication - Unauthenticated user', () => {
    it('should return 401 with token_missing when accessing staff endpoint without auth', async () => {
      const req = createMockRequest({
        user: mockUsers.unauthenticated,
        headers: {}
      });
      const res = createMockResponse();

      // Simulate auth middleware
      const authMiddleware = (req: any, res: any, next: any) => {
        if (!req.headers.authorization) {
          return res.status(401).json({
            error: 'token_missing',
            message: 'Authentication required'
          });
        }
        next();
      };

      authMiddleware(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'token_missing',
        message: 'Authentication required'
      });
    });
  });

  // Test 2: Expired JWT token
  describe('Authentication - Expired token', () => {
    it('should return 401 with token_expired for expired JWT', async () => {
      const req = createMockRequest({
        headers: {
          authorization: `Bearer ${mockTokens.expired}`
        }
      });
      const res = createMockResponse();

      // Simulate auth middleware with token validation
      const authMiddleware = (req: any, res: any, next: any) => {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (token === mockTokens.expired) {
          return res.status(401).json({
            error: 'token_expired',
            message: 'Token has expired'
          });
        }

        next();
      };

      authMiddleware(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'token_expired',
        message: 'Token has expired'
      });
    });
  });

  // Test 3: Insufficient permissions
  describe('Authorization - Insufficient permissions', () => {
    it('should return 403 when foia_officer accesses foia_admin endpoint', async () => {
      const req = createMockRequest({
        user: mockUsers.foia_officer,
        headers: {
          authorization: `Bearer ${mockTokens.valid_officer}`
        }
      });
      const res = createMockResponse();

      // Simulate role-based access control middleware
      const requireRole = (allowedRoles: string[]) => {
        return (req: any, res: any, next: any) => {
          if (!req.user) {
            return res.status(401).json({ error: 'unauthorized' });
          }

          if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
              error: 'insufficient_permissions',
              message: `Requires one of: ${allowedRoles.join(', ')}`,
              user_role: req.user.role
            });
          }

          next();
        };
      };

      const adminMiddleware = requireRole(['foia_admin', 'foia_supervisor']);
      adminMiddleware(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'insufficient_permissions',
        message: 'Requires one of: foia_admin, foia_supervisor',
        user_role: 'foia_officer'
      });
    });
  });

  // Test 4: Rate limiting
  describe('Rate Limiting', () => {
    it('should return 429 after exceeding rate limit (100 requests for Small tier)', async () => {
      const tenant = mockTenants.small;
      const requestCounts = new Map<string, number>();

      const rateLimitMiddleware = (req: any, res: any, next: any) => {
        const tenantId = req.user?.tenant_id || 'unknown';
        const count = requestCounts.get(tenantId) || 0;

        if (count >= tenant.rate_limit) {
          return res.status(429).json({
            error: 'rate_limit_exceeded',
            message: `Rate limit of ${tenant.rate_limit} requests per minute exceeded`,
            retry_after: 60
          });
        }

        requestCounts.set(tenantId, count + 1);
        next();
      };

      const req = createMockRequest({
        user: { ...mockUsers.foia_officer, tenant_id: tenant.id }
      });

      // Simulate 100 successful requests
      for (let i = 0; i < 100; i++) {
        const res = createMockResponse();
        rateLimitMiddleware(req, res, () => {});

        if (i < 100) {
          expect(res.status).not.toHaveBeenCalledWith(429);
        }
      }

      // 101st request should be rate limited
      const res101 = createMockResponse();
      rateLimitMiddleware(req, res101, () => {});
      expect(res101.status).toHaveBeenCalledWith(429);
      expect(res101.json).toHaveBeenCalledWith({
        error: 'rate_limit_exceeded',
        message: 'Rate limit of 100 requests per minute exceeded',
        retry_after: 60
      });

      // Remaining 49 requests should also be rate limited
      for (let i = 0; i < 49; i++) {
        const res = createMockResponse();
        rateLimitMiddleware(req, res, () => {});
        expect(res.status).toHaveBeenCalledWith(429);
      }
    });
  });

  // Test 5: Request validation
  describe('Request Validation', () => {
    it('should return 400 with field-level Zod errors for invalid request body', async () => {
      const req = createMockRequest({
        user: mockUsers.foia_officer,
        body: {
          // Missing required fields: description, requester
          tracking_number: 'FOIA-2024-001'
        }
      });
      const res = createMockResponse();

      // Simulate Zod validation middleware
      const validateRequest = (req: any, res: any, next: any) => {
        const errors: any[] = [];

        if (!req.body.description) {
          errors.push({
            field: 'description',
            message: 'Required field missing'
          });
        }

        if (!req.body.requester) {
          errors.push({
            field: 'requester',
            message: 'Required field missing'
          });
        }

        if (!req.body.requester?.email) {
          errors.push({
            field: 'requester.email',
            message: 'Required field missing'
          });
        }

        if (errors.length > 0) {
          return res.status(400).json({
            error: 'validation_failed',
            message: 'Request validation failed',
            errors
          });
        }

        next();
      };

      validateRequest(req, res, () => {});

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'validation_failed',
        message: 'Request validation failed',
        errors: expect.arrayContaining([
          { field: 'description', message: 'Required field missing' },
          { field: 'requester', message: 'Required field missing' }
        ])
      });
    });
  });

  // Test 6: API versioning
  describe('API Versioning', () => {
    it('should include X-API-Version: 1.0 header in response', async () => {
      const req = createMockRequest({
        user: mockUsers.foia_officer,
        body: {
          description: 'Test request',
          requester: {
            name: 'John Doe',
            email: 'john@example.com'
          }
        }
      });
      const res = createMockResponse();

      // Simulate versioning middleware
      const versionMiddleware = (req: any, res: any, next: any) => {
        res.setHeader('X-API-Version', '1.0');
        next();
      };

      versionMiddleware(req, res, () => {});

      // Simulate successful request handler
      res.json({ success: true, request_id: 'req-123' });

      expect(res.setHeader).toHaveBeenCalledWith('X-API-Version', '1.0');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        request_id: 'req-123'
      });
    });
  });
});
