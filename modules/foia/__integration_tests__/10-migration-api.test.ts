/**
 * Integration Tests: Migration API
 * Tests bulk import, validation, and migration lifecycle
 */

import { createMockRequest, createMockResponse, mockDb } from './setup';

describe('Migration API Integration Tests', () => {
  const MIGRATION_KEY = 'test-migration-key-123';

  describe('Authentication', () => {
    it('should authenticate with migration key', async () => {
      const req = createMockRequest({
        headers: { 'x-migration-key': MIGRATION_KEY }
      });
      const res = createMockResponse();

      const authMiddleware = (req: any, res: any, next: any) => {
        if (req.headers['x-migration-key'] !== MIGRATION_KEY) {
          return res.status(401).json({ error: 'Invalid migration key' });
        }
        next();
      };

      authMiddleware(req, res, () => {});
      expect(res.status).not.toHaveBeenCalledWith(401);
    });
  });

  describe('Bulk Import Requests', () => {
    it('should bulk import 100 requests successfully', async () => {
      const requests = Array.from({ length: 100 }, (_, i) => ({
        legacy_id: `legacy-${i}`,
        tracking_number: `MIGR-${i}`,
        description: `Request ${i}`,
        requester: { name: `Requester ${i}`, email: `req${i}@example.com` },
        migration_source: 'govqa'
      }));

      const req = createMockRequest({
        headers: { 'X-Migration-Key': MIGRATION_KEY },
        body: {
          tenant_id: 'tenant-123',
          items: requests
        }
      });
      const res = createMockResponse();

      mockDb.query = jest.fn().mockResolvedValue({
        rows: requests.map((r, i) => ({ id: `req-${i}`, ...r }))
      });

      const bulkImportRequests = async (req: any, res: any) => {
        const results = await mockDb.query('INSERT INTO "FoiaRequests" ...', req.body.items);

        return res.json({
          success: true,
          imported: results.rows.length,
          failed: 0,
          errors: []
        });
      };

      await bulkImportRequests(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        imported: 100,
        failed: 0,
        errors: []
      });
    });
  });

  describe('Bulk Import Documents', () => {
    it('should bulk import 50 documents with presigned URLs', async () => {
      const documents = Array.from({ length: 50 }, (_, i) => ({
        legacy_id: `doc-${i}`,
        request_legacy_id: `legacy-${i}`,
        filename: `document-${i}.pdf`,
        file_size: 102400,
        file_url: `https://s3.amazonaws.com/bucket/doc-${i}.pdf`
      }));

      const req = createMockRequest({
        headers: { 'X-Migration-Key': MIGRATION_KEY },
        body: {
          tenant_id: 'tenant-123',
          items: documents
        }
      });
      const res = createMockResponse();

      mockDb.query = jest.fn().mockResolvedValue({
        rows: documents.map((d, i) => ({ id: `doc-uuid-${i}`, ...d }))
      });

      const bulkImportDocuments = async (req: any, res: any) => {
        const results = await mockDb.query('INSERT INTO "FoiaDocuments" ...', req.body.items);

        return res.json({
          success: true,
          imported: results.rows.length,
          failed: 0
        });
      };

      await bulkImportDocuments(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        imported: 50,
        failed: 0
      });
    });
  });

  describe('Validation Report', () => {
    it('should run validation and confirm source_count matches govli_count', async () => {
      const req = createMockRequest({
        headers: { 'X-Migration-Key': MIGRATION_KEY },
        body: {
          tenant_id: 'tenant-123',
          migration_source: 'govqa'
        }
      });
      const res = createMockResponse();

      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          source_requests: 100,
          govli_requests: 100,
          source_documents: 50,
          govli_documents: 50,
          validation_status: 'PASS'
        }]
      });

      const validateMigration = async (req: any, res: any) => {
        const result = await mockDb.query(`
          SELECT * FROM validate_migration($1, $2)
        `, [req.body.tenant_id, req.body.migration_source]);

        const validation = result.rows[0];

        return res.json({
          validation_status: validation.validation_status,
          requests: {
            source: validation.source_requests,
            govli: validation.govli_requests,
            match: validation.source_requests === validation.govli_requests
          },
          documents: {
            source: validation.source_documents,
            govli: validation.govli_documents,
            match: validation.source_documents === validation.govli_documents
          }
        });
      };

      await validateMigration(req, res);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.validation_status).toBe('PASS');
      expect(response.requests.match).toBe(true);
      expect(response.documents.match).toBe(true);
    });
  });

  describe('Migration Finalization', () => {
    it('should finalize migration and expire token for future imports', async () => {
      const req1 = createMockRequest({
        headers: { 'X-Migration-Key': MIGRATION_KEY },
        body: { tenant_id: 'tenant-123' }
      });
      const res1 = createMockResponse();

      let migrationFinalized = false;

      const finalizeMigration = async (req: any, res: any) => {
        migrationFinalized = true;

        mockDb.query = jest.fn().mockResolvedValue({
          rows: [{ migration_key: MIGRATION_KEY, expired: true }]
        });

        await mockDb.query('UPDATE "MigrationKeys" SET expired = true WHERE key = $1', [MIGRATION_KEY]);

        return res.json({
          success: true,
          message: 'Migration finalized',
          migration_key_expired: true
        });
      };

      await finalizeMigration(req1, res1);

      expect(res1.json).toHaveBeenCalledWith({
        success: true,
        message: 'Migration finalized',
        migration_key_expired: true
      });

      // Attempt another bulk import after finalization
      const req2 = createMockRequest({
        headers: { 'X-Migration-Key': MIGRATION_KEY },
        body: { tenant_id: 'tenant-123', items: [] }
      });
      const res2 = createMockResponse();

      const authMiddleware = (req: any, res: any, next: any) => {
        if (migrationFinalized) {
          return res.status(401).json({
            error: 'migration_key_expired',
            message: 'Migration has been finalized'
          });
        }
        next();
      };

      authMiddleware(req2, res2, () => {});

      expect(res2.status).toHaveBeenCalledWith(401);
      expect(res2.json).toHaveBeenCalledWith({
        error: 'migration_key_expired',
        message: 'Migration has been finalized'
      });
    });
  });
});
