/**
 * Response Service Tests
 */

import { Pool } from 'pg';
import { ResponseService } from '../services/responseService';

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
    getAvailableTemplates: jest.fn().mockReturnValue(['FULL_GRANT', 'PARTIAL_GRANT', 'FULL_DENIAL'])
  }))
}));

describe('ResponseService', () => {
  let responseService: ResponseService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = new Pool();
    responseService = new ResponseService(mockDb);
    jest.clearAllMocks();
  });

  describe('draftResponse', () => {
    it('should draft response using AI', async () => {
      // Mock FOIA request query
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'req-1',
          tenant_id: 'tenant-1',
          subject: 'Test Request',
          description: 'Request for documents',
          requester_name: 'John Doe',
          requester_email: 'john@example.com'
        }]
      });

      // Mock tenant query
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'tenant-1',
          name: 'Test Agency'
        }]
      });

      // Mock response insert
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          tenant_id: 'tenant-1',
          foia_request_id: 'req-1',
          response_type: 'FULL_GRANT',
          status: 'DRAFT',
          body_text: 'AI-generated FOIA response letter...',
          ai_generated: true,
          edit_count: 0,
          created_at: new Date()
        }]
      });

      const result = await responseService.draftResponse(
        'tenant-1',
        'req-1',
        'user-1',
        {
          response_type: 'FULL_GRANT',
          documents_included: ['doc1.pdf', 'doc2.pdf']
        }
      );

      expect(result.id).toBe('resp-1');
      expect(result.response_type).toBe('FULL_GRANT');
      expect(result.ai_generated).toBe(true);
      expect(mockDb.query).toHaveBeenCalledTimes(3);
    });

    it('should throw error for non-existent request', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        responseService.draftResponse('tenant-1', 'req-999', 'user-1', {
          response_type: 'FULL_GRANT'
        })
      ).rejects.toThrow('FOIA request not found');
    });
  });

  describe('editResponse', () => {
    it('should edit response and calculate delta', async () => {
      // Mock get current response
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          tenant_id: 'tenant-1',
          foia_request_id: 'req-1',
          status: 'DRAFT',
          body_text: 'Original text line 1\nOriginal text line 2',
          original_body_text: 'Original text line 1\nOriginal text line 2'
        }]
      });

      // Mock update response
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          body_text: 'Edited text line 1\nEdited text line 2',
          edit_delta_pct: 100.0,
          edit_count: 1
        }]
      });

      const result = await responseService.editResponse(
        'tenant-1',
        'resp-1',
        'user-1',
        {
          body_text: 'Edited text line 1\nEdited text line 2'
        }
      );

      expect(result.edit_count).toBe(1);
      expect(result.edit_delta_pct).toBeDefined();
    });

    it('should throw error for delivered response', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          status: 'DELIVERED'
        }]
      });

      await expect(
        responseService.editResponse('tenant-1', 'resp-1', 'user-1', {
          body_text: 'New text'
        })
      ).rejects.toThrow('Cannot edit delivered response');
    });
  });

  describe('approveResponse', () => {
    it('should approve response', async () => {
      // Mock get response
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          tenant_id: 'tenant-1',
          foia_request_id: 'req-1',
          status: 'DRAFT'
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

      const result = await responseService.approveResponse(
        'tenant-1',
        'resp-1',
        'user-1',
        { notes: 'Looks good' }
      );

      expect(result.status).toBe('APPROVED');
      expect(result.approved_by).toBe('user-1');
    });

    it('should throw error for already delivered response', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          status: 'DELIVERED'
        }]
      });

      await expect(
        responseService.approveResponse('tenant-1', 'resp-1', 'user-1', {})
      ).rejects.toThrow('Response already delivered');
    });
  });

  describe('deliverResponse', () => {
    it('should deliver response via email', async () => {
      // Mock get response
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          tenant_id: 'tenant-1',
          foia_request_id: 'req-1',
          status: 'APPROVED',
          subject: 'FOIA Response',
          body_text: 'Response body',
          requester_email: 'john@example.com'
        }]
      });

      // Mock update delivery
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          status: 'DELIVERED',
          delivered_to: 'john@example.com',
          delivery_method: 'EMAIL',
          delivery_status: 'SENT',
          delivered_at: new Date()
        }]
      });

      const result = await responseService.deliverResponse(
        'tenant-1',
        'resp-1',
        'user-1',
        {
          delivery_method: 'EMAIL',
          delivery_email: 'john@example.com'
        }
      );

      expect(result.status).toBe('DELIVERED');
      expect(result.delivery_status).toBe('SENT');
    });

    it('should throw error for unapproved response', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          status: 'DRAFT'
        }]
      });

      await expect(
        responseService.deliverResponse('tenant-1', 'resp-1', 'user-1', {
          delivery_method: 'EMAIL'
        })
      ).rejects.toThrow('Response must be approved before delivery');
    });
  });

  describe('getResponse', () => {
    it('should get response by ID', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          id: 'resp-1',
          tenant_id: 'tenant-1',
          foia_request_id: 'req-1',
          response_type: 'FULL_GRANT',
          status: 'DRAFT'
        }]
      });

      const result = await responseService.getResponse('tenant-1', 'resp-1');

      expect(result.id).toBe('resp-1');
      expect(result.response_type).toBe('FULL_GRANT');
    });

    it('should throw error for non-existent response', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await expect(
        responseService.getResponse('tenant-1', 'resp-999')
      ).rejects.toThrow('Response not found');
    });
  });

  describe('getResponsesForRequest', () => {
    it('should get all responses for a request', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'resp-1',
            foia_request_id: 'req-1',
            response_type: 'FULL_GRANT',
            status: 'DELIVERED',
            created_at: new Date('2024-01-01')
          },
          {
            id: 'resp-2',
            foia_request_id: 'req-1',
            response_type: 'ACKNOWLEDGMENT',
            status: 'DELIVERED',
            created_at: new Date('2024-01-02')
          }
        ]
      });

      const result = await responseService.getResponsesForRequest('tenant-1', 'req-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('resp-1');
      expect(result[1].id).toBe('resp-2');
    });
  });
});
