/**
 * Migration API Tests
 */

import { Pool } from 'pg';
import { Request, Response } from 'express';
import * as handlers from '../src/handlers';
import { MigrationRequest, BulkMigrationRequest, BulkMigrationContact } from '../src/types';
import { generateMigrationToken, verifyMigrationToken } from '../src/utils/tokenUtils';
import { mapStatus, getStatusMapping } from '../src/utils/statusMapper';

// Mock database pool
const mockDb = {
  query: jest.fn()
} as unknown as Pool;

// Helper to create mock request
function createMockRequest(body: any = {}, token?: any): MigrationRequest {
  return {
    body,
    migrationToken: token,
    app: {
      locals: {
        db: mockDb
      }
    },
    headers: {},
    query: {},
    params: {}
  } as unknown as MigrationRequest;
}

// Helper to create mock response
function createMockResponse(): Response {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res as Response;
}

describe('Migration API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =====================================================
  // Authentication Tests
  // =====================================================
  describe('POST /auth', () => {
    it('should authenticate with valid migration key', async () => {
      const req = createMockRequest({
        migration_key: 'test-migration-key-123'
      });
      const res = createMockResponse();

      // Mock database response
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            tenant_id: 'tenant-123',
            migration_source: 'govqa',
            migration_window_expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
          }
        ]
      });

      await handlers.authenticate(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            migration_token: expect.any(String),
            tenant_id: 'tenant-123',
            migration_source: 'govqa'
          })
        })
      );
    });

    it('should reject invalid migration key', async () => {
      const req = createMockRequest({
        migration_key: 'invalid-key'
      });
      const res = createMockResponse();

      // Mock empty database response
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: []
      });

      await handlers.authenticate(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid migration key')
        })
      );
    });

    it('should reject expired migration window', async () => {
      const req = createMockRequest({
        migration_key: 'expired-key'
      });
      const res = createMockResponse();

      // Mock database response with expired window
      (mockDb.query as jest.Mock).mockResolvedValueOnce({
        rows: []
      });

      await handlers.authenticate(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  // =====================================================
  // Token Utilities Tests
  // =====================================================
  describe('Migration Token', () => {
    it('should generate and verify migration token', () => {
      const payload = {
        tenant_id: 'tenant-123',
        migration_source: 'govqa',
        expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
      };

      const token = generateMigrationToken(payload);
      expect(token).toBeTruthy();

      const decoded = verifyMigrationToken(token);
      expect(decoded.tenant_id).toBe('tenant-123');
      expect(decoded.migration_source).toBe('govqa');
    });

    it('should reject expired migration window', () => {
      const payload = {
        tenant_id: 'tenant-123',
        migration_source: 'govqa',
        expires_at: new Date(Date.now() - 1000).toISOString() // Expired 1 second ago
      };

      const token = generateMigrationToken(payload);

      expect(() => {
        verifyMigrationToken(token);
      }).toThrow('Migration window has expired');
    });
  });

  // =====================================================
  // Bulk Requests Import Tests
  // =====================================================
  describe('POST /requests/bulk', () => {
    const mockToken = {
      tenant_id: 'tenant-123',
      migration_source: 'govqa',
      expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    };

    it('should import 100 requests successfully', async () => {
      // Generate 100 test requests
      const requests: BulkMigrationRequest[] = Array.from({ length: 100 }, (_, i) => ({
        legacy_id: `REQ-${i + 1}`,
        migration_source: 'govqa',
        description: `Test FOIA Request ${i + 1}`,
        requester_name: `Test Requester ${i + 1}`,
        requester_email: `requester${i + 1}@example.com`,
        requester_category: 'INDIVIDUAL',
        department: 'Test Department',
        date_received: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
        legacy_status: 'NEW'
      }));

      const req = createMockRequest({ requests }, mockToken);
      const res = createMockResponse();

      // Mock status mapping query
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // No custom mappings
        .mockResolvedValue({
          rows: [{ govli_request_id: `req-${Date.now()}` }]
        });

      await handlers.bulkImportRequests(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            imported: 100,
            skipped: 0,
            errors: []
          })
        })
      );

      // Verify database was called for each request
      const queryCalls = (mockDb.query as jest.Mock).mock.calls;
      expect(queryCalls.length).toBeGreaterThan(100); // status mapping + inserts
    });

    it('should deduplicate existing requests', async () => {
      const requests: BulkMigrationRequest[] = [
        {
          legacy_id: 'REQ-DUPLICATE',
          migration_source: 'govqa',
          description: 'Test Request',
          requester_name: 'Test Requester',
          requester_email: 'test@example.com',
          requester_category: 'INDIVIDUAL',
          department: 'Test Dept',
          date_received: new Date().toISOString(),
          legacy_status: 'NEW'
        }
      ];

      const req = createMockRequest({ requests }, mockToken);
      const res = createMockResponse();

      // Mock status mapping query
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // No custom mappings
        .mockResolvedValueOnce({
          // Existing migration record found
          rows: [{ govli_request_id: 'existing-req-123' }]
        });

      await handlers.bulkImportRequests(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            imported: 0,
            skipped: 1,
            request_id_map: [
              {
                legacy_id: 'REQ-DUPLICATE',
                govli_request_id: 'existing-req-123'
              }
            ]
          })
        })
      );
    });

    it('should reject bulk import exceeding 1000 requests', async () => {
      const requests: BulkMigrationRequest[] = Array.from({ length: 1001 }, (_, i) => ({
        legacy_id: `REQ-${i}`,
        migration_source: 'govqa',
        description: 'Test',
        requester_name: 'Test',
        requester_email: 'test@example.com',
        requester_category: 'INDIVIDUAL',
        department: 'Test',
        date_received: new Date().toISOString(),
        legacy_status: 'NEW'
      }));

      const req = createMockRequest({ requests }, mockToken);
      const res = createMockResponse();

      await handlers.bulkImportRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Maximum 1000 requests per bulk import'
        })
      );
    });

    it('should handle validation errors gracefully', async () => {
      const requests: BulkMigrationRequest[] = [
        {
          legacy_id: 'REQ-VALID',
          migration_source: 'govqa',
          description: 'Valid Request',
          requester_name: 'Test',
          requester_email: 'test@example.com',
          requester_category: 'INDIVIDUAL',
          department: 'Test',
          date_received: new Date().toISOString(),
          legacy_status: 'NEW'
        },
        {
          legacy_id: 'REQ-INVALID',
          migration_source: 'govqa',
          description: '', // Missing required field
          requester_name: '',
          requester_email: '',
          requester_category: 'INDIVIDUAL',
          department: 'Test',
          date_received: new Date().toISOString(),
          legacy_status: 'NEW'
        }
      ];

      const req = createMockRequest({ requests }, mockToken);
      const res = createMockResponse();

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // No custom mappings
        .mockResolvedValue({ rows: [] });

      await handlers.bulkImportRequests(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            imported: 1,
            skipped: 1,
            errors: expect.arrayContaining([
              expect.objectContaining({
                legacy_id: 'REQ-INVALID',
                error: expect.stringContaining('Missing required fields')
              })
            ])
          })
        })
      );
    });
  });

  // =====================================================
  // Bulk Contacts Import Tests
  // =====================================================
  describe('POST /contacts/bulk', () => {
    const mockToken = {
      tenant_id: 'tenant-123',
      migration_source: 'govqa',
      expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    };

    it('should deduplicate and merge contacts by email', async () => {
      const contacts: BulkMigrationContact[] = [
        {
          email: 'john.doe@example.com',
          name: 'John Doe',
          phone: '555-1234',
          organization: 'Acme Corp',
          requester_category: 'INDIVIDUAL'
        },
        {
          email: 'JOHN.DOE@EXAMPLE.COM', // Same email, different case
          name: 'John Doe',
          phone: '555-5678', // Different phone
          organization: 'Acme Corporation', // Different org
          requester_category: 'INDIVIDUAL'
        }
      ];

      const req = createMockRequest({ contacts }, mockToken);
      const res = createMockResponse();

      // Mock first contact doesn't exist, second is duplicate
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // First contact - no duplicate
        .mockResolvedValueOnce({ rows: [] }) // Insert first contact
        .mockResolvedValueOnce({
          // Second contact - duplicate found
          rows: [
            {
              id: 'contact-123',
              name: 'John Doe',
              phone: '555-1234',
              organization: 'Acme Corp'
            }
          ]
        })
        .mockResolvedValueOnce({ rows: [] }); // Update existing contact

      await handlers.bulkImportContacts(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            imported: 1,
            merged: 1,
            skipped: 0
          })
        })
      );
    });

    it('should reject bulk import exceeding 2000 contacts', async () => {
      const contacts: BulkMigrationContact[] = Array.from({ length: 2001 }, (_, i) => ({
        email: `contact${i}@example.com`,
        name: `Contact ${i}`,
        requester_category: 'INDIVIDUAL'
      }));

      const req = createMockRequest({ contacts }, mockToken);
      const res = createMockResponse();

      await handlers.bulkImportContacts(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Maximum 2000 contacts per bulk import'
        })
      );
    });
  });

  // =====================================================
  // Status Mapping Tests
  // =====================================================
  describe('Status Mapping', () => {
    it('should map legacy status to Govli status', () => {
      const statusMap = new Map<string, string>([
        ['NEW', 'SUBMITTED'],
        ['ASSIGNED', 'IN_PROGRESS'],
        ['CLOSED', 'CLOSED']
      ]);

      expect(mapStatus('NEW', statusMap)).toBe('SUBMITTED');
      expect(mapStatus('ASSIGNED', statusMap)).toBe('IN_PROGRESS');
      expect(mapStatus('CLOSED', statusMap)).toBe('CLOSED');
      expect(mapStatus('UNKNOWN', statusMap)).toBe('SUBMITTED'); // Default
    });

    it('should store custom status mappings', async () => {
      const req = createMockRequest(
        {
          mappings: [
            { legacy_status: 'CUSTOM_STATUS_1', govli_status: 'IN_PROGRESS' },
            { legacy_status: 'CUSTOM_STATUS_2', govli_status: 'CLOSED' }
          ]
        },
        {
          tenant_id: 'tenant-123',
          migration_source: 'custom',
          expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
        }
      );
      const res = createMockResponse();

      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [] });

      await handlers.setStatusMapping(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            mappings_stored: 2
          })
        })
      );

      // Verify DELETE and INSERT queries
      const queryCalls = (mockDb.query as jest.Mock).mock.calls;
      expect(queryCalls[0][0]).toContain('DELETE FROM "FoiaMigrationStatusMappings"');
      expect(queryCalls[1][0]).toContain('INSERT INTO "FoiaMigrationStatusMappings"');
    });
  });

  // =====================================================
  // Validation Report Tests
  // =====================================================
  describe('GET /validation-report', () => {
    const mockToken = {
      tenant_id: 'tenant-123',
      migration_source: 'govqa',
      expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    };

    it('should generate validation report with all checks passing', async () => {
      const req = createMockRequest({}, mockToken);
      const res = createMockResponse();

      // Mock database queries for validation checks
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // Migrated count
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // Actual count
        .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // Documents migrated
        .mockResolvedValueOnce({ rows: [{ count: '50' }] }) // Documents actual
        .mockResolvedValueOnce({
          // Status distribution
          rows: [
            { legacy_status: 'NEW', count: '20' },
            { legacy_status: 'ASSIGNED', count: '50' },
            { legacy_status: 'CLOSED', count: '30' }
          ]
        })
        .mockResolvedValueOnce({
          // Actual status distribution
          rows: [
            { foia_status: 'SUBMITTED', count: '20' },
            { foia_status: 'IN_PROGRESS', count: '50' },
            { foia_status: 'CLOSED', count: '30' }
          ]
        });

      await handlers.getValidationReport(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            validation_status: 'PASS',
            checks: expect.arrayContaining([
              expect.objectContaining({
                check_name: 'Total Requests',
                source_count: 100,
                govli_count: 100,
                match: true
              }),
              expect.objectContaining({
                check_name: 'Total Documents',
                match: true
              })
            ])
          })
        })
      );
    });

    it('should report WARN status when counts mismatch', async () => {
      const req = createMockRequest({}, mockToken);
      const res = createMockResponse();

      // Mock mismatched counts
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ count: '100' }] }) // Migrated count
        .mockResolvedValueOnce({ rows: [{ count: '95' }] }) // Actual count (5 missing)
        .mockResolvedValue({ rows: [] });

      await handlers.getValidationReport(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            validation_status: 'WARN',
            checks: expect.arrayContaining([
              expect.objectContaining({
                check_name: 'Total Requests',
                source_count: 100,
                govli_count: 95,
                match: false
              })
            ])
          })
        })
      );
    });
  });

  // =====================================================
  // Finalize Migration Tests
  // =====================================================
  describe('POST /finalize', () => {
    const mockToken = {
      tenant_id: 'tenant-123',
      migration_source: 'govqa',
      expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
    };

    it('should finalize migration successfully', async () => {
      const req = createMockRequest({}, mockToken);
      const res = createMockResponse();

      // Mock database queries
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [] }) // Update migration records
        .mockResolvedValueOnce({ rows: [] }) // Invalidate configuration
        .mockResolvedValueOnce({ rows: [{ total: '100' }] }) // Get total count
        .mockResolvedValue({ rows: [] }); // Validation report queries

      await handlers.finalizeMigration(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            finalized_at: expect.any(String),
            total_migrated: 100,
            validation_report: expect.any(Object)
          })
        })
      );

      // Verify migration records marked as FINAL
      const queryCalls = (mockDb.query as jest.Mock).mock.calls;
      expect(queryCalls[0][0]).toContain('UPDATE "FoiaMigrationRecords"');
      expect(queryCalls[0][0]).toContain("validation_status = 'FINAL'");

      // Verify configuration invalidated
      expect(queryCalls[1][0]).toContain('UPDATE "FoiaMigrationConfigurations"');
      expect(queryCalls[1][0]).toContain('is_active = false');
    });
  });
});
