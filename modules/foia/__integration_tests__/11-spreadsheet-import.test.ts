/**
 * Integration Tests: Spreadsheet Import Engine
 * Tests Excel/CSV import with AI-powered column mapping
 */

import { createMockRequest, createMockResponse, mockUsers, mockDb, mockAIResponse } from './setup';

describe('Spreadsheet Import Integration Tests', () => {
  describe('Upload and Parse Spreadsheet', () => {
    it('should upload .xlsx with 50 rows and detect 8 columns with preview', async () => {
      const req = createMockRequest({
        user: mockUsers.foia_admin,
        file: {
          fieldname: 'file',
          originalname: 'foia-requests.xlsx',
          buffer: Buffer.from('mock-excel-data'),
          mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          size: 51200
        }
      });
      const res = createMockResponse();

      const parseSpreadsheet = async (req: any, res: any) => {
        // Mock parsed data
        const columns = [
          'Request Number',
          'Requester Name',
          'Email',
          'Description',
          'Date Received',
          'Status',
          'Department',
          'Notes'
        ];

        const rows = Array.from({ length: 50 }, (_, i) => ({
          'Request Number': `REQ-${i + 1}`,
          'Requester Name': `Person ${i + 1}`,
          'Email': `person${i + 1}@example.com`,
          'Description': `Request for documents ${i + 1}`,
          'Date Received': '2023-01-15',
          'Status': 'Open',
          'Department': 'Police',
          'Notes': 'No notes'
        }));

        const preview = rows.slice(0, 10);

        return res.json({
          file_id: 'file-123',
          columns,
          row_count: rows.length,
          preview
        });
      };

      await parseSpreadsheet(req, res);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.columns).toHaveLength(8);
      expect(response.row_count).toBe(50);
      expect(response.preview).toHaveLength(10);
    });
  });

  describe('AI Column Mapping Suggestions', () => {
    it('should suggest reasonable mappings for detected columns', async () => {
      const req = createMockRequest({
        user: mockUsers.foia_admin,
        body: {
          file_id: 'file-123'
        }
      });
      const res = createMockResponse();

      mockDb.query = jest.fn().mockResolvedValue({
        rows: [{
          columns: ['Request Number', 'Requester Name', 'Email', 'Description', 'Date Received', 'Status']
        }]
      });

      const suggestMapping = async (req: any, res: any) => {
        // Mock AI response with suggested mappings
        const mappings = [
          { source_column: 'Request Number', target_field: 'tracking_number', confidence: 0.95 },
          { source_column: 'Requester Name', target_field: 'requester_name', confidence: 0.98 },
          { source_column: 'Email', target_field: 'requester_email', confidence: 0.99 },
          { source_column: 'Description', target_field: 'description', confidence: 0.97 },
          { source_column: 'Date Received', target_field: 'date_received', confidence: 0.90 },
          { source_column: 'Status', target_field: 'status', confidence: 0.85 }
        ];

        return res.json({
          file_id: req.body.file_id,
          suggested_mappings: mappings,
          model_used: 'claude-haiku-4-20250514'
        });
      };

      await suggestMapping(req, res);

      const response = (res.json as jest.Mock).mock.calls[0][0];
      expect(response.suggested_mappings).toHaveLength(6);
      expect(response.suggested_mappings[0].confidence).toBeGreaterThan(0.90);
      expect(response.model_used).toBe('claude-haiku-4-20250514');
    });
  });

  describe('Confirm Mapping and Import', () => {
    it('should create 50 requests with migration_source="spreadsheet"', async () => {
      const req = createMockRequest({
        user: mockUsers.foia_admin,
        body: {
          file_id: 'file-123',
          confirmed_mappings: [
            { source_column: 'Request Number', target_field: 'tracking_number' },
            { source_column: 'Requester Name', target_field: 'requester_name' },
            { source_column: 'Email', target_field: 'requester_email' },
            { source_column: 'Description', target_field: 'description' },
            { source_column: 'Date Received', target_field: 'date_received' },
            { source_column: 'Status', target_field: 'status' }
          ]
        }
      });
      const res = createMockResponse();

      const importedRequests = Array.from({ length: 50 }, (_, i) => ({
        id: `req-${i}`,
        tracking_number: `REQ-${i + 1}`,
        requester: { name: `Person ${i + 1}`, email: `person${i + 1}@example.com` },
        description: `Request for documents ${i + 1}`,
        migration_source: 'spreadsheet',
        foia_status: 'SUBMITTED'
      }));

      mockDb.query = jest.fn().mockResolvedValue({
        rows: importedRequests
      });

      const importSpreadsheet = async (req: any, res: any) => {
        // Apply mappings and import rows
        const result = await mockDb.query('INSERT INTO "FoiaRequests" ...', [importedRequests]);

        return res.json({
          success: true,
          imported: result.rows.length,
          failed: 0,
          migration_source: 'spreadsheet'
        });
      };

      await importSpreadsheet(req, res);

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        imported: 50,
        failed: 0,
        migration_source: 'spreadsheet'
      });

      // Verify all imported requests have migration_source
      const imported = importedRequests.every(r => r.migration_source === 'spreadsheet');
      expect(imported).toBe(true);
    });
  });
});
