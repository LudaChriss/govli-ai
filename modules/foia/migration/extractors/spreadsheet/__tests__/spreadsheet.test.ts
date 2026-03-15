/**
 * Spreadsheet Import Engine Tests
 */

import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync';
import {
  parseExcelFile,
  parseCsvFile,
  parseTsvFile,
  isDateColumn,
  isEmailColumn,
  normalizeDate,
  normalizeStatus
} from '../src/utils/fileParser';
import { suggestColumnMappings } from '../src/utils/aiClient';
import { STATUS_KEYWORDS } from '../src/types';
import * as handlers from '../src/handlers';

// Mock Redis client
jest.mock('../src/utils/redisClient', () => ({
  getRedisClient: jest.fn().mockResolvedValue({
    setEx: jest.fn(),
    get: jest.fn(),
    del: jest.fn()
  }),
  storeSpreadsheetData: jest.fn().mockResolvedValue(undefined),
  getSpreadsheetData: jest.fn(),
  storeConfirmedMapping: jest.fn().mockResolvedValue(undefined),
  getConfirmedMapping: jest.fn(),
  deleteSpreadsheetData: jest.fn().mockResolvedValue(undefined),
  deleteConfirmedMapping: jest.fn().mockResolvedValue(undefined),
  closeRedisClient: jest.fn().mockResolvedValue(undefined)
}));

// Mock AI client
jest.mock('../src/utils/aiClient');

describe('Spreadsheet Import Engine', () => {
  // =====================================================
  // File Parsing Tests
  // =====================================================
  describe('parseExcelFile', () => {
    it('should parse .xlsx file with correct columns and rows', () => {
      // Create sample workbook
      const worksheet = XLSX.utils.aoa_to_sheet([
        ['Name', 'Email', 'Date'],
        ['John Doe', 'john@example.com', '2023-01-15'],
        ['Jane Smith', 'jane@example.com', '2023-02-20']
      ]);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const result = parseExcelFile(buffer);

      expect(result.sheetNames).toEqual(['Sheet1']);
      expect(result.columns).toContain('Name');
      expect(result.columns).toContain('Email');
      expect(result.columns).toContain('Date');
      expect(result.rows.length).toBe(2);
      expect(result.rows[0].Name).toBe('John Doe');
      expect(result.rows[0].Email).toBe('john@example.com');
    });

    it('should handle multi-sheet Excel files', () => {
      const worksheet1 = XLSX.utils.aoa_to_sheet([['A'], ['1']]);
      const worksheet2 = XLSX.utils.aoa_to_sheet([['B'], ['2']]);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet1, 'Sheet1');
      XLSX.utils.book_append_sheet(workbook, worksheet2, 'Sheet2');

      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      const result = parseExcelFile(buffer);

      expect(result.sheetNames).toEqual(['Sheet1', 'Sheet2']);
    });
  });

  describe('parseCsvFile', () => {
    it('should parse CSV file correctly', () => {
      const csvContent = `Name,Email,Date
John Doe,john@example.com,2023-01-15
Jane Smith,jane@example.com,2023-02-20`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = parseCsvFile(buffer);

      expect(result.columns).toContain('Name');
      expect(result.columns).toContain('Email');
      expect(result.columns).toContain('Date');
      expect(result.rows.length).toBe(2);
      expect(result.rows[0].Name).toBe('John Doe');
      expect(result.rows[0].Email).toBe('john@example.com');
    });

    it('should handle CSV with quoted fields', () => {
      const csvContent = `Name,Description
"Doe, John","Request for records"`;

      const buffer = Buffer.from(csvContent, 'utf-8');
      const result = parseCsvFile(buffer);

      expect(result.rows[0].Name).toBe('Doe, John');
      expect(result.rows[0].Description).toContain('Request for');
    });
  });

  describe('parseTsvFile', () => {
    it('should parse TSV file correctly', () => {
      const tsvContent = `Name\tEmail\tDate
John Doe\tjohn@example.com\t2023-01-15
Jane Smith\tjane@example.com\t2023-02-20`;

      const buffer = Buffer.from(tsvContent, 'utf-8');
      const result = parseTsvFile(buffer);

      expect(result.columns).toContain('Name');
      expect(result.columns).toContain('Email');
      expect(result.rows.length).toBe(2);
      expect(result.rows[0].Name).toBe('John Doe');
    });
  });

  // =====================================================
  // Column Detection Tests
  // =====================================================
  describe('isDateColumn', () => {
    it('should detect date column by name', () => {
      expect(isDateColumn('Date Received', [])).toBe(true);
      expect(isDateColumn('Submission Date', [])).toBe(true);
      expect(isDateColumn('Timestamp', [])).toBe(true);
    });

    it('should detect date column by values', () => {
      const values = [
        '2023-01-15',
        '2023-02-20',
        '2023-03-10',
        '2023-04-05'
      ];

      expect(isDateColumn('Column1', values)).toBe(true);
    });

    it('should not detect non-date column', () => {
      const values = ['John', 'Jane', 'Bob', 'Alice'];

      expect(isDateColumn('Name', values)).toBe(false);
    });

    it('should handle mixed date formats', () => {
      const values = [
        '01/15/2023',
        '02/20/2023',
        'March 10, 2023',
        '2023-04-05'
      ];

      expect(isDateColumn('Date', values)).toBe(true);
    });
  });

  describe('isEmailColumn', () => {
    it('should detect email column by name', () => {
      expect(isEmailColumn('Email', [])).toBe(true);
      expect(isEmailColumn('E-mail Address', [])).toBe(true);
      expect(isEmailColumn('Contact Email', [])).toBe(true);
    });

    it('should detect email column by values', () => {
      const values = [
        'john@example.com',
        'jane@example.com',
        'bob@test.org',
        'alice@company.net'
      ];

      expect(isEmailColumn('Column1', values)).toBe(true);
    });

    it('should not detect non-email column', () => {
      const values = ['John Doe', 'Jane Smith', 'Bob Johnson'];

      expect(isEmailColumn('Name', values)).toBe(false);
    });
  });

  // =====================================================
  // Data Normalization Tests
  // =====================================================
  describe('normalizeDate', () => {
    it('should normalize ISO 8601 dates', () => {
      const result = normalizeDate('2023-01-15');
      expect(result).toBeTruthy();
      expect(new Date(result!).getFullYear()).toBe(2023);
    });

    it('should normalize US date format', () => {
      const result = normalizeDate('01/15/2023');
      expect(result).toBeTruthy();
      expect(new Date(result!).getFullYear()).toBe(2023);
    });

    it('should normalize long date format', () => {
      const result = normalizeDate('January 15, 2023');
      expect(result).toBeTruthy();
      expect(new Date(result!).getFullYear()).toBe(2023);
    });

    it('should return null for invalid dates', () => {
      expect(normalizeDate('not a date')).toBeNull();
      expect(normalizeDate('')).toBeNull();
      expect(normalizeDate(null)).toBeNull();
    });

    it('should reject unreasonable years', () => {
      expect(normalizeDate('1800-01-01')).toBeNull();
      expect(normalizeDate('2200-01-01')).toBeNull();
    });
  });

  describe('normalizeStatus', () => {
    it('should normalize common status keywords', () => {
      expect(normalizeStatus('open', STATUS_KEYWORDS)).toBe('SUBMITTED');
      expect(normalizeStatus('in progress', STATUS_KEYWORDS)).toBe('IN_PROGRESS');
      expect(normalizeStatus('closed', STATUS_KEYWORDS)).toBe('CLOSED');
      expect(normalizeStatus('denied', STATUS_KEYWORDS)).toBe('CLOSED');
      expect(normalizeStatus('withdrawn', STATUS_KEYWORDS)).toBe('WITHDRAWN');
    });

    it('should be case-insensitive', () => {
      expect(normalizeStatus('OPEN', STATUS_KEYWORDS)).toBe('SUBMITTED');
      expect(normalizeStatus('Open', STATUS_KEYWORDS)).toBe('SUBMITTED');
      expect(normalizeStatus('oPeN', STATUS_KEYWORDS)).toBe('SUBMITTED');
    });

    it('should handle partial matches', () => {
      expect(normalizeStatus('status: in progress', STATUS_KEYWORDS)).toBe('IN_PROGRESS');
      expect(normalizeStatus('currently under review', STATUS_KEYWORDS)).toBe('IN_PROGRESS');
    });

    it('should default to SUBMITTED for unknown status', () => {
      expect(normalizeStatus('unknown status', STATUS_KEYWORDS)).toBe('SUBMITTED');
      expect(normalizeStatus('', STATUS_KEYWORDS)).toBe('SUBMITTED');
      expect(normalizeStatus(null, STATUS_KEYWORDS)).toBe('SUBMITTED');
    });
  });

  // =====================================================
  // Handler Tests
  // =====================================================
  describe('uploadSpreadsheet handler', () => {
    it('should reject request without file', async () => {
      const req = {
        file: undefined,
        user: { id: 'user-123', tenant_id: 'tenant-123', role: 'foia_admin' }
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any;

      await handlers.uploadSpreadsheet(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'No file uploaded'
        })
      );
    });

    it('should reject unauthenticated request', async () => {
      const req = {
        file: { buffer: Buffer.from(''), originalname: 'test.xlsx' },
        user: undefined
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any;

      await handlers.uploadSpreadsheet(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Authentication required'
        })
      );
    });
  });

  describe('confirmMapping handler', () => {
    it('should reject mapping without required fields', async () => {
      const req = {
        body: {
          file_id: 'file-123',
          mappings: [
            { source: 'Name', target: 'requester_name' }
            // Missing required 'description' and 'date_received'
          ]
        },
        user: { id: 'user-123', tenant_id: 'tenant-123', role: 'foia_admin' }
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any;

      // Mock getSpreadsheetData to return valid data
      const { getSpreadsheetData } = await import('../src/utils/redisClient');
      (getSpreadsheetData as jest.Mock).mockResolvedValue({
        file_id: 'file-123',
        columns: ['Name', 'Description', 'Date'],
        tenant_id: 'tenant-123'
      });

      await handlers.confirmMapping(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('description')
        })
      );
    });

    it('should reject invalid target field', async () => {
      const req = {
        body: {
          file_id: 'file-123',
          mappings: [
            { source: 'Name', target: 'invalid_field' }
          ]
        },
        user: { id: 'user-123', tenant_id: 'tenant-123', role: 'foia_admin' }
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any;

      const { getSpreadsheetData } = await import('../src/utils/redisClient');
      (getSpreadsheetData as jest.Mock).mockResolvedValue({
        file_id: 'file-123',
        columns: ['Name'],
        tenant_id: 'tenant-123'
      });

      await handlers.confirmMapping(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid target field')
        })
      );
    });
  });

  describe('importSpreadsheet handler', () => {
    it('should process rows and track errors', async () => {
      const req = {
        body: {
          file_id: 'file-123',
          mapping_id: 'mapping-123'
        },
        user: { id: 'user-123', tenant_id: 'tenant-123', role: 'foia_admin' }
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as any;

      const { getSpreadsheetData, getConfirmedMapping } = await import('../src/utils/redisClient');

      (getSpreadsheetData as jest.Mock).mockResolvedValue({
        file_id: 'file-123',
        columns: ['Name', 'Email', 'Description', 'Date'],
        rows: [
          {
            'Name': 'John Doe',
            'Email': 'john@example.com',
            'Description': 'Request for records',
            'Date': '2023-01-15'
          },
          {
            'Name': 'Jane Smith',
            'Email': 'jane@example.com',
            'Description': '', // Missing description
            'Date': '2023-02-20'
          }
        ],
        tenant_id: 'tenant-123'
      });

      (getConfirmedMapping as jest.Mock).mockResolvedValue({
        mapping_id: 'mapping-123',
        file_id: 'file-123',
        mappings: [
          { source: 'Name', target: 'requester_name' },
          { source: 'Email', target: 'requester_email' },
          { source: 'Description', target: 'description' },
          { source: 'Date', target: 'date_received' }
        ],
        tenant_id: 'tenant-123'
      });

      await handlers.importSpreadsheet(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            total_rows: 2,
            imported: 1,
            skipped: 1,
            errors: expect.arrayContaining([
              expect.objectContaining({
                row_number: 2,
                error: expect.stringContaining('description')
              })
            ])
          })
        })
      );
    });
  });
});
