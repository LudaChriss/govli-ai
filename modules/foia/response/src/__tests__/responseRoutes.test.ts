/**
 * Response Routes Integration Tests
 */

import request from 'supertest';
import express from 'express';
import { Pool } from 'pg';
import { createResponseRoutes } from '../routes/responseRoutes';
import { authMiddleware } from '../middleware/authMiddleware';
import jwt from 'jsonwebtoken';

// Mock pg Pool
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn()
  };
  return { Pool: jest.fn(() => mPool) };
});

// Mock shared AI client
jest.mock('@govli/foia-shared', () => ({
  getSharedAIClient: jest.fn(() => ({
    callWithAudit: jest.fn().mockResolvedValue({
      content: 'AI-generated FOIA response letter...',
      model: 'claude-3-5-sonnet-20250122',
      usage: {
        input_tokens: 500,
        output_tokens: 1000
      }
    })
  })),
  emit: jest.fn()
}));

// Mock email service
jest.mock('../services/emailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendFoiaResponse: jest.fn().mockResolvedValue({
      success: true,
      message_id: 'test-message-id'
    })
  }))
}));

// Mock template service
jest.mock('../services/templateService', () => ({
  TemplateService: jest.fn().mockImplementation(() => ({
    renderTemplate: jest.fn().mockReturnValue('Rendered template'),
    getAvailableTemplates: jest.fn().mockReturnValue(['FULL_GRANT', 'PARTIAL_GRANT', 'FULL_DENIAL', 'NO_RESPONSIVE_RECORDS', 'FEE_WAIVER_DENIAL', 'ACKNOWLEDGMENT'])
  }))
}));

describe('Response Routes', () => {
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
    app.use('/response', authMiddleware, createResponseRoutes(mockDb));

    jest.clearAllMocks();
  });

  describe('POST /response/requests/:id/draft', () => {
    it('should draft response using AI', async () => {
      // Mock FOIA request query
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'req-1',
          tenant_id: 'tenant-1',
          subject: 'Test Request',
          requester_name: 'John Doe'
        }]
      });

      // Mock tenant query
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'tenant-1', name: 'Test Agency' }]
      });

      // Mock response insert
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          tenant_id: 'tenant-1',
          foia_request_id: 'req-1',
          response_type: 'FULL_GRANT',
          status: 'DRAFT',
          body_text: 'AI-generated response...',
          ai_generated: true
        }]
      });

      const response = await request(app)
        .post('/response/requests/req-1/draft')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          response_type: 'FULL_GRANT',
          documents_included: ['doc1.pdf']
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.response_type).toBe('FULL_GRANT');
    });

    it('should return 400 when response_type is missing', async () => {
      const response = await request(app)
        .post('/response/requests/req-1/draft')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .post('/response/requests/req-1/draft')
        .send({ response_type: 'FULL_GRANT' });

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('PUT /response/responses/:id/edit', () => {
    it('should edit response', async () => {
      // Mock get response
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          status: 'DRAFT',
          body_text: 'Original text',
          original_body_text: 'Original text'
        }]
      });

      // Mock update
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          body_text: 'Edited text',
          edit_delta_pct: 50.0,
          edit_count: 1
        }]
      });

      const response = await request(app)
        .put('/response/responses/resp-1/edit')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          body_text: 'Edited text'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.edit_count).toBe(1);
    });

    it('should return 400 when body_text is missing', async () => {
      const response = await request(app)
        .put('/response/responses/resp-1/edit')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('POST /response/responses/:id/approve', () => {
    it('should approve response', async () => {
      // Mock get response
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          status: 'DRAFT',
          foia_request_id: 'req-1'
        }]
      });

      // Mock update to approved
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          status: 'APPROVED',
          approved_by: 'user-1',
          approved_at: new Date()
        }]
      });

      const response = await request(app)
        .post('/response/responses/resp-1/approve')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ notes: 'Approved' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('APPROVED');
    });
  });

  describe('POST /response/responses/:id/deliver', () => {
    it('should deliver response via email', async () => {
      // Mock get response
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          status: 'APPROVED',
          subject: 'FOIA Response',
          body_text: 'Response body',
          requester_email: 'john@example.com',
          foia_request_id: 'req-1'
        }]
      });

      // Mock update delivery
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          status: 'DELIVERED',
          delivery_status: 'SENT'
        }]
      });

      const response = await request(app)
        .post('/response/responses/resp-1/deliver')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          delivery_method: 'EMAIL',
          delivery_email: 'john@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('DELIVERED');
    });

    it('should return 400 when delivery_method is missing', async () => {
      const response = await request(app)
        .post('/response/responses/resp-1/deliver')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('GET /response/responses/:id/preview', () => {
    it('should preview response', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          response_type: 'FULL_GRANT',
          status: 'DRAFT',
          body_text: 'Response content'
        }]
      });

      const response = await request(app)
        .get('/response/responses/resp-1/preview')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe('resp-1');
    });
  });

  describe('GET /response/templates', () => {
    it('should return available templates', async () => {
      const response = await request(app)
        .get('/response/templates')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toContain('FULL_GRANT');
      expect(response.body.data).toContain('PARTIAL_GRANT');
      expect(response.body.data).toContain('FULL_DENIAL');
    });
  });

  describe('POST /response/requests/:id/appeal', () => {
    it('should submit appeal', async () => {
      // Mock request query
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'req-1', tenant_id: 'tenant-1' }]
      });

      // Mock response query
      mockDb.query.mockResolvedValueOnce({
        rows: [{ id: 'resp-1' }]
      });

      // Mock appeal insert
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'appeal-1',
          foia_request_id: 'req-1',
          status: 'PENDING',
          reason: 'Disagree with denial'
        }]
      });

      // Mock request status update
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/response/requests/req-1/appeal')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          reason: 'Disagree with denial',
          additional_info: 'Additional details'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('PENDING');
    });

    it('should return 400 when reason is missing', async () => {
      const response = await request(app)
        .post('/response/requests/req-1/appeal')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    });
  });

  describe('GET /response/requests/:id/responses', () => {
    it('should get all responses for a request', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { id: 'resp-1', response_type: 'ACKNOWLEDGMENT', status: 'DELIVERED' },
          { id: 'resp-2', response_type: 'FULL_GRANT', status: 'DELIVERED' }
        ]
      });

      const response = await request(app)
        .get('/response/requests/req-1/responses')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
    });
  });
});
