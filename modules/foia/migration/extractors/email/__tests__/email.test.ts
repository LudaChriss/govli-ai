/**
 * Email Import Engine Tests
 */

import { Pool } from 'pg';
import * as handlers from '../src/handlers';
import {
  parseEmailWithAI,
  extractTenantSubdomain,
  lookupTenantBySubdomain
} from '../src/utils/emailParser';
import {
  validateAttachment,
  getFileSizeFromBase64
} from '../src/utils/attachmentHandler';

// Mock AI client
jest.mock('../src/utils/emailParser', () => ({
  ...jest.requireActual('../src/utils/emailParser'),
  parseEmailWithAI: jest.fn(),
  lookupTenantBySubdomain: jest.fn()
}));

// Mock database pool
const mockDb = {
  query: jest.fn()
} as unknown as Pool;

// Helper to create mock request
function createMockRequest(body: any = {}, user?: any): any {
  return {
    body,
    user,
    params: {},
    app: {
      locals: {
        db: mockDb
      }
    }
  };
}

// Helper to create mock response
function createMockResponse(): any {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
  return res;
}

describe('Email Import Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =====================================================
  // Email Parser Tests
  // =====================================================
  describe('extractTenantSubdomain', () => {
    it('should extract subdomain from import email address', () => {
      const { extractTenantSubdomain: actual } = jest.requireActual('../src/utils/emailParser');

      expect(actual('import@cityname.govli.ai')).toBe('cityname');
      expect(actual('import@testcity.govli.ai')).toBe('testcity');
      expect(actual('import@my-agency.govli.ai')).toBe('my-agency');
    });

    it('should return null for invalid email formats', () => {
      const { extractTenantSubdomain: actual } = jest.requireActual('../src/utils/emailParser');

      expect(actual('test@example.com')).toBeNull();
      expect(actual('admin@govli.ai')).toBeNull();
      expect(actual('invalid')).toBeNull();
    });

    it('should be case-insensitive', () => {
      const { extractTenantSubdomain: actual } = jest.requireActual('../src/utils/emailParser');

      expect(actual('IMPORT@CityName.GOVLI.AI')).toBe('CityName');
      expect(actual('Import@TestCity.Govli.Ai')).toBe('TestCity');
    });
  });

  // =====================================================
  // Attachment Validation Tests
  // =====================================================
  describe('validateAttachment', () => {
    it('should accept valid PDF attachment', () => {
      const attachment = {
        filename: 'document.pdf',
        content_type: 'application/pdf',
        content_base64: Buffer.from('test content').toString('base64')
      };

      const result = validateAttachment(attachment);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject attachment exceeding 25MB', () => {
      // Create 26MB of base64 content
      const largeContent = Buffer.alloc(26 * 1024 * 1024, 'a').toString('base64');

      const attachment = {
        filename: 'large.pdf',
        content_type: 'application/pdf',
        content_base64: largeContent
      };

      const result = validateAttachment(attachment);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds 25MB limit');
    });

    it('should reject dangerous file types', () => {
      const dangerousFiles = [
        'virus.exe',
        'script.bat',
        'malware.cmd',
        'trojan.scr',
        'bad.vbs',
        'hack.js'
      ];

      for (const filename of dangerousFiles) {
        const attachment = {
          filename,
          content_type: 'application/octet-stream',
          content_base64: Buffer.from('test').toString('base64')
        };

        const result = validateAttachment(attachment);

        expect(result.valid).toBe(false);
        expect(result.error).toContain('prohibited file type');
      }
    });

    it('should accept common document types', () => {
      const acceptedFiles = [
        'document.pdf',
        'spreadsheet.xlsx',
        'text.txt',
        'image.jpg',
        'photo.png'
      ];

      for (const filename of acceptedFiles) {
        const attachment = {
          filename,
          content_type: 'application/octet-stream',
          content_base64: Buffer.from('test').toString('base64')
        };

        const result = validateAttachment(attachment);

        expect(result.valid).toBe(true);
      }
    });
  });

  describe('getFileSizeFromBase64', () => {
    it('should calculate correct file size', () => {
      const content = 'Hello World!';
      const base64 = Buffer.from(content).toString('base64');

      const size = getFileSizeFromBase64(base64);

      expect(size).toBe(content.length);
    });
  });

  // =====================================================
  // Ingest Email Handler Tests
  // =====================================================
  describe('ingestEmail handler', () => {
    it('should reject request without required fields', async () => {
      const req = createMockRequest({});
      const res = createMockResponse();

      await handlers.ingestEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Missing required fields')
        })
      );
    });

    it('should reject invalid recipient email format', async () => {
      const req = createMockRequest({
        from: 'john@example.com',
        to: 'invalid@example.com',
        subject: 'FOIA Request',
        body_text: 'I request all documents...'
      });
      const res = createMockResponse();

      await handlers.ingestEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid recipient address format')
        })
      );
    });

    it('should reject email for non-existent tenant', async () => {
      const req = createMockRequest({
        from: 'john@example.com',
        to: 'import@nonexistent.govli.ai',
        subject: 'FOIA Request',
        body_text: 'I request all documents...'
      });
      const res = createMockResponse();

      (lookupTenantBySubdomain as jest.Mock).mockResolvedValue(null);

      await handlers.ingestEmail(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('No active tenant found')
        })
      );
    });

    it('should process FOIA request email successfully', async () => {
      const req = createMockRequest({
        from: 'John Doe <john@example.com>',
        to: 'import@testcity.govli.ai',
        subject: 'FOIA Request for Police Reports',
        body_text: 'I am requesting all police reports for January 2023...',
        attachments: []
      });
      const res = createMockResponse();

      (lookupTenantBySubdomain as jest.Mock).mockResolvedValue('tenant-123');

      (parseEmailWithAI as jest.Mock).mockResolvedValue({
        is_foia_request: true,
        requester_name: 'John Doe',
        requester_email: 'john@example.com',
        requester_phone: null,
        requester_organization: null,
        request_description: 'All police reports for January 2023',
        date_range_mentioned: 'January 2023',
        departments_mentioned: ['Police'],
        record_types_mentioned: ['Police Reports'],
        urgency_indicators: [],
        confidence: 0.92
      });

      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [] });

      await handlers.ingestEmail(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            processed: true,
            request_id: expect.any(String),
            confidence: 0.92,
            requires_review: true,
            message: expect.stringContaining('Draft created for review')
          })
        })
      );

      // Verify draft request was created
      const queryCalls = (mockDb.query as jest.Mock).mock.calls;
      expect(queryCalls.some((call: any) =>
        call[0].includes('INSERT INTO "FoiaRequests"')
      )).toBe(true);
    });

    it('should reject non-FOIA email (spam)', async () => {
      const req = createMockRequest({
        from: 'marketing@example.com',
        to: 'import@testcity.govli.ai',
        subject: 'Special Offer - Buy Now!',
        body_text: 'Get 50% off on our amazing products...'
      });
      const res = createMockResponse();

      (lookupTenantBySubdomain as jest.Mock).mockResolvedValue('tenant-123');

      (parseEmailWithAI as jest.Mock).mockResolvedValue({
        is_foia_request: false,
        requester_name: null,
        requester_email: 'marketing@example.com',
        requester_phone: null,
        requester_organization: null,
        request_description: 'Marketing email',
        date_range_mentioned: null,
        departments_mentioned: [],
        record_types_mentioned: [],
        urgency_indicators: [],
        confidence: 0.05
      });

      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [] });

      await handlers.ingestEmail(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            processed: true,
            requires_review: false,
            message: expect.stringContaining('does not appear to be a FOIA request')
          })
        })
      );

      // Verify no draft request was created
      const queryCalls = (mockDb.query as jest.Mock).mock.calls;
      expect(queryCalls.some((call: any) =>
        call[0].includes('INSERT INTO "FoiaRequests"')
      )).toBe(false);
    });
  });

  // =====================================================
  // Get Pending Reviews Handler Tests
  // =====================================================
  describe('getPendingReviews handler', () => {
    it('should require authentication', async () => {
      const req = createMockRequest({}, undefined);
      const res = createMockResponse();

      await handlers.getPendingReviews(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Authentication required'
        })
      );
    });

    it('should return list of pending reviews', async () => {
      const req = createMockRequest({}, {
        id: 'user-123',
        tenant_id: 'tenant-123',
        role: 'foia_admin'
      });
      const res = createMockResponse();

      (mockDb.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            email_import_id: 'import-1',
            from_email: 'john@example.com',
            subject: 'FOIA Request',
            body_text: 'I request...',
            parsed_data: {
              is_foia_request: true,
              requester_name: 'John Doe',
              confidence: 0.9
            },
            confidence: 0.9,
            created_at: new Date(),
            request_id: 'req-1'
          }
        ]
      });

      await handlers.getPendingReviews(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            pending_requests: expect.arrayContaining([
              expect.objectContaining({
                id: 'req-1',
                from_email: 'john@example.com',
                confidence: 0.9
              })
            ]),
            total: 1
          })
        })
      );
    });
  });

  // =====================================================
  // Approve Request Handler Tests
  // =====================================================
  describe('approveRequest handler', () => {
    it('should approve and transition request to SUBMITTED', async () => {
      const req = createMockRequest(
        {
          approved_fields: {
            description: 'Updated description',
            requester_name: 'John Doe Updated'
          }
        },
        {
          id: 'user-123',
          tenant_id: 'tenant-123',
          role: 'foia_admin'
        }
      );
      req.params = { requestId: 'req-123' };

      const res = createMockResponse();

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({
          // Verify request exists
          rows: [
            {
              id: 'req-123',
              requester: { name: 'John Doe', email: 'john@example.com' },
              description: 'Original description'
            }
          ]
        })
        .mockResolvedValue({ rows: [] }); // Updates

      await handlers.approveRequest(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            request_id: 'req-123',
            status: 'SUBMITTED',
            message: expect.stringContaining('approved')
          })
        })
      );

      // Verify status update to SUBMITTED
      const queryCalls = (mockDb.query as jest.Mock).mock.calls;
      expect(queryCalls.some((call: any) =>
        call[0].includes("foia_status = 'SUBMITTED'")
      )).toBe(true);
    });
  });

  // =====================================================
  // Reject Request Handler Tests
  // =====================================================
  describe('rejectRequest handler', () => {
    it('should reject and delete request', async () => {
      const req = createMockRequest(
        {
          reason: 'Not a valid FOIA request - spam email'
        },
        {
          id: 'user-123',
          tenant_id: 'tenant-123',
          role: 'foia_admin'
        }
      );
      req.params = { requestId: 'req-123' };

      const res = createMockResponse();

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({
          // Verify request exists
          rows: [{ id: 'req-123' }]
        })
        .mockResolvedValue({ rows: [] }); // Updates

      await handlers.rejectRequest(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            message: expect.stringContaining('rejected and deleted'),
            reason: 'Not a valid FOIA request - spam email'
          })
        })
      );

      // Verify request was deleted
      const queryCalls = (mockDb.query as jest.Mock).mock.calls;
      expect(queryCalls.some((call: any) =>
        call[0].includes('DELETE FROM "FoiaRequests"')
      )).toBe(true);
    });

    it('should require rejection reason', async () => {
      const req = createMockRequest(
        {},
        {
          id: 'user-123',
          tenant_id: 'tenant-123',
          role: 'foia_admin'
        }
      );
      req.params = { requestId: 'req-123' };

      const res = createMockResponse();

      await handlers.rejectRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Rejection reason is required')
        })
      );
    });
  });

  // =====================================================
  // Analytics Handler Tests
  // =====================================================
  describe('getAnalytics handler', () => {
    it('should return email import analytics', async () => {
      const req = createMockRequest({}, {
        id: 'user-123',
        tenant_id: 'tenant-123',
        role: 'foia_supervisor'
      });
      const res = createMockResponse();

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({
          // Stats query
          rows: [
            {
              total_emails: '100',
              parsed_as_foia: '75',
              parsed_as_non_foia: '25',
              approved: '60',
              rejected: '10',
              pending: '5',
              avg_confidence: '0.85'
            }
          ]
        })
        .mockResolvedValueOnce({
          // False positives query
          rows: [{ count: '10' }]
        });

      await handlers.getAnalytics(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            emails_received: 100,
            parsed_as_foia: 75,
            parsed_as_non_foia: 25,
            approved: 60,
            rejected: 10,
            pending_review: 5,
            avg_confidence: 0.85,
            false_positive_rate: expect.any(Number)
          })
        })
      );
    });
  });
});
