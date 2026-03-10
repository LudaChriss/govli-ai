/**
 * Tracking Routes Integration Tests
 * Tests all endpoints including invalid state transition error handling
 */

import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createTrackingRoutes } from '../routes/trackingRoutes';
import { authMiddleware } from '../middleware/authMiddleware';
import jwt from 'jsonwebtoken';

// Mock pg Pool
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn()
  };
  return { Pool: jest.fn(() => mPool) };
});

// Mock emit
jest.mock('@govli/foia-shared', () => ({
  emit: jest.fn(),
  FoiaRequestStatus: {}
}));

describe('Tracking Routes', () => {
  let app: express.Application;
  let mockDb: any;
  let authToken: string;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    mockDb = new Pool();

    // Create auth token
    authToken = jwt.sign(
      {
        id: 'user-1',
        tenant_id: 'tenant-1',
        email: 'test@example.com',
        role: 'admin'
      },
      process.env.JWT_SECRET || 'dev-secret-change-in-production'
    );

    // Mount routes with auth
    app.use('/tracking', authMiddleware, createTrackingRoutes(mockDb));

    jest.clearAllMocks();
  });

  describe('GET /tracking/requests/:id/timeline', () => {
    it('should return timeline events', async () => {
      const mockTimeline = [
        {
          id: 'event-1',
          tenant_id: 'tenant-1',
          foia_request_id: 'req-1',
          event_type: 'STATUS_CHANGED',
          from_status: 'PENDING',
          to_status: 'IN_REVIEW',
          user_id: 'user-1',
          metadata: {},
          created_at: new Date()
        }
      ];

      mockDb.query.mockResolvedValueOnce({ rows: mockTimeline });

      const response = await request(app)
        .get('/tracking/requests/req-1/timeline')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .get('/tracking/requests/req-1/timeline');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /tracking/requests/:id/transition', () => {
    it('should transition request to valid status', async () => {
      // Mock get current request
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'req-1',
          tenant_id: 'tenant-1',
          status: 'PENDING'
        }]
      });

      // Mock update request
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'req-1',
          tenant_id: 'tenant-1',
          status: 'IN_REVIEW',
          received_at: new Date('2024-01-01'),
          due_date: new Date('2024-01-20')
        }]
      });

      // Mock SLA calculation query (for calculateSLAStatus)
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'req-1',
          tenant_id: 'tenant-1',
          status: 'IN_REVIEW',
          received_at: new Date('2024-01-01'),
          due_date: new Date('2024-01-20')
        }]
      });

      // Mock breach_risk_score update
      mockDb.query.mockResolvedValueOnce({
        rows: []
      });

      // Mock user lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{ name: 'Test User' }]
      });

      // Mock timeline event insert
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'event-1',
          tenant_id: 'tenant-1',
          foia_request_id: 'req-1',
          event_type: 'STATUS_CHANGED',
          from_status: 'PENDING',
          to_status: 'IN_REVIEW',
          user_id: 'user-1',
          metadata: {},
          created_at: new Date()
        }]
      });

      const response = await request(app)
        .post('/tracking/requests/req-1/transition')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          to_status: 'IN_REVIEW',
          reason: 'Starting review process'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.request.status).toBe('IN_REVIEW');
    });

    it('should return 400 for invalid state transition', async () => {
      // Mock get current request (PENDING status)
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'req-1',
          tenant_id: 'tenant-1',
          status: 'PENDING'
        }]
      });

      const response = await request(app)
        .post('/tracking/requests/req-1/transition')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          to_status: 'COMPLETED', // Invalid: can't go from PENDING to COMPLETED
          reason: 'Trying to skip steps'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_TRANSITION');
      expect(response.body.error.message).toContain('Invalid state transition');
    });

    it('should return 400 for COMPLETED to IN_PROGRESS (backwards)', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'req-2',
          tenant_id: 'tenant-1',
          status: 'COMPLETED'
        }]
      });

      const response = await request(app)
        .post('/tracking/requests/req-2/transition')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          to_status: 'IN_PROGRESS'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_TRANSITION');
    });

    it('should return 400 when to_status is missing', async () => {
      const response = await request(app)
        .post('/tracking/requests/req-1/transition')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reason: 'Missing status'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('POST /tracking/requests/:id/route', () => {
    it('should route request to department', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'routing-1',
          tenant_id: 'tenant-1',
          foia_request_id: 'req-1',
          department_id: 'dept-1',
          department_name: 'Legal',
          status: 'PENDING',
          created_at: new Date()
        }]
      });

      const response = await request(app)
        .post('/tracking/requests/req-1/route')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          department_id: 'dept-1',
          department_name: 'Legal',
          notes: 'Routing to legal'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.department_name).toBe('Legal');
    });

    it('should return 400 when department info is missing', async () => {
      const response = await request(app)
        .post('/tracking/requests/req-1/route')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          department_id: 'dept-1'
          // Missing department_name
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('PUT /tracking/routing/:routingId/assign', () => {
    it('should assign routing to user', async () => {
      // Mock check routing exists
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'routing-1', tenant_id: 'tenant-1' }]
      });

      // Mock update routing
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'routing-1',
          tenant_id: 'tenant-1',
          foia_request_id: 'req-1',
          assigned_to: 'user-2',
          status: 'ASSIGNED'
        }]
      });

      // Mock update foia_requests
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .put('/tracking/routing/routing-1/assign')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          assigned_to: 'user-2'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.assigned_to).toBe('user-2');
    });

    it('should return 400 when assigned_to is missing', async () => {
      const response = await request(app)
        .put('/tracking/routing/routing-1/assign')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('GET /tracking/sla-dashboard', () => {
    it('should return SLA dashboard', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/tracking/sla-dashboard')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total_requests');
      expect(response.body.data).toHaveProperty('by_tier');
    });
  });

  describe('POST /tracking/requests/:id/extend-deadline', () => {
    it('should request deadline extension', async () => {
      const now = new Date();
      const oldDueDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

      // Mock get current request
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'req-1',
          tenant_id: 'tenant-1',
          due_date: oldDueDate
        }]
      });

      // Mock insert extension
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'ext-1',
          tenant_id: 'tenant-1',
          foia_request_id: 'req-1',
          old_due_date: oldDueDate,
          new_due_date: new Date(oldDueDate.getTime() + 10 * 24 * 60 * 60 * 1000),
          extension_days: 10,
          reason: 'Need more time',
          status: 'PENDING'
        }]
      });

      // Mock user lookup
      mockDb.query.mockResolvedValueOnce({
        rows: [{ name: 'Test User' }]
      });

      // Mock timeline event insert
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'event-1',
          event_type: 'DEADLINE_EXTENDED'
        }]
      });

      const response = await request(app)
        .post('/tracking/requests/req-1/extend-deadline')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          extension_days: 10,
          reason: 'Need more time'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.extension_days).toBe(10);
    });

    it('should return 400 for invalid extension_days', async () => {
      const response = await request(app)
        .post('/tracking/requests/req-1/extend-deadline')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          extension_days: 500, // Too many days
          reason: 'Need more time'
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('should return 400 when required fields are missing', async () => {
      const response = await request(app)
        .post('/tracking/requests/req-1/extend-deadline')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          extension_days: 10
          // Missing reason
        });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('GET /tracking/requests/overdue-alerts', () => {
    it('should return overdue alerts', async () => {
      const now = new Date();
      const overdueDueDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          foia_request_id: 'req-1',
          tenant_id: 'tenant-1',
          requester_name: 'John Doe',
          subject: 'Test Request',
          due_date: overdueDueDate,
          assigned_to: 'user-1',
          status: 'IN_PROGRESS',
          received_at: now
        }]
      });

      const response = await request(app)
        .get('/tracking/requests/overdue-alerts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);
    });
  });

  describe('GET /tracking/requests/:id/sla-status', () => {
    it('should return SLA status for request', async () => {
      const now = new Date();
      const dueDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
      const receivedAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'req-1',
          tenant_id: 'tenant-1',
          status: 'IN_PROGRESS',
          received_at: receivedAt,
          due_date: dueDate
        }]
      });

      const response = await request(app)
        .get('/tracking/requests/req-1/sla-status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('breach_risk_score');
      expect(response.body.data).toHaveProperty('sla_tier');
    });
  });

  describe('GET /tracking/sla-wall', () => {
    it('should return SLA wall data sorted by breach_risk_score', async () => {
      const now = new Date();
      const dueDate = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);

      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'req-1',
            tracking_number: 'FOIA-2024-00001',
            requester_name: 'John Doe',
            subject: 'Test Request 1',
            status: 'IN_PROGRESS',
            due_date: dueDate,
            breach_risk_score: 85,
            assigned_to: 'user-1',
            received_at: now
          },
          {
            id: 'req-2',
            tracking_number: 'FOIA-2024-00002',
            requester_name: 'Jane Smith',
            subject: 'Test Request 2',
            status: 'PENDING',
            due_date: dueDate,
            breach_risk_score: 45,
            assigned_to: null,
            received_at: now
          }
        ]
      });

      const response = await request(app)
        .get('/tracking/sla-wall')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.requests).toBeDefined();
      expect(response.body.data.summary).toBeDefined();
      expect(response.body.data.summary.overdue).toBeDefined();
      expect(response.body.data.summary.critical).toBeDefined();
      expect(response.body.data.summary.at_risk).toBeDefined();
      expect(response.body.data.summary.on_track).toBeDefined();
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .get('/tracking/sla-wall');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
