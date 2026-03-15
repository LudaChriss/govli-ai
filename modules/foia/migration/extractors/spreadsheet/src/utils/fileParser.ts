/**
 * Spreadsheet Import Engine - File Parser Utilities
 */

import * as XLSX from 'xlsx';
import { parse } from 'csv-parse/sync';

/**
 * Parse Excel file (.xlsx)
 */
export function parseExcelFile(buffer: Buffer, sheetName?: string): {
  sheetNames: string[];
  columns: string[];
  rows: Record<string, any>[];
} {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  // Get sheet names
  const sheetNames = workbook.SheetNames;

  // Use specified sheet or first sheet
  const targetSheet = sheetName || sheetNames[0];
  const worksheet = workbook.Sheets[targetSheet];

  // Convert to JSON
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    raw: false,
    defval: null
  });

  // Extract column names from first row
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return {
    sheetNames,
    columns,
    rows
  };
}

/**
 * Parse CSV file (.csv)
 */
export function parseCsvFile(buffer: Buffer): {
  columns: string[];
  rows: Record<string, any>[];
} {
  const content = buffer.toString('utf-8');

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  });

  const columns = records.length > 0 ? Object.keys(records[0]) : [];

  return {
    columns,
    rows: records
  };
}

/**
 * Parse TSV file (.tsv)
 */
export function parseTsvFile(buffer: Buffer): {
  columns: string[];
  rows: Record<string, any>[];
} {
  const content = buffer.toString('utf-8');

  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    delimiter: '\t',
    relax_column_count: true
  });

  const columns = records.length > 0 ? Object.keys(records[0]) : [];

  return {
    columns,
    rows: records
  };
}

/**
 * Detect if a column contains dates
 */
export function isDateColumn(columnName: string, sampleValues: any[]): boolean {
  // Check column name for date keywords
  const dateKeywords = ['date', 'time', 'timestamp', 'when', 'received', 'submitted', 'due', 'closed', 'delivered'];
  const lowerName = columnName.toLowerCase();

  if (dateKeywords.some(keyword => lowerName.includes(keyword))) {
    return true;
  }

  // Check sample values for date patterns
  const nonNullValues = sampleValues.filter(v => v !== null && v !== undefined && v !== '');
  if (nonNullValues.length === 0) return false;

  // Count how many values look like dates
  let dateCount = 0;
  for (const value of nonNullValues.slice(0, 10)) {
    const str = String(value).trim();

    // ISO 8601 format
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
      dateCount++;
      continue;
    }

    // MM/DD/YYYY or DD/MM/YYYY
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(str)) {
      dateCount++;
      continue;
    }

    // Month DD, YYYY
    if (/^[A-Za-z]+\s+\d{1,2},?\s+\d{4}/.test(str)) {
      dateCount++;
      continue;
    }

    // Try parsing as date
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1900 && parsed.getFullYear() < 2100) {
      dateCount++;
    }
  }

  // If more than 70% of values look like dates, it's a date column
  return dateCount / nonNullValues.slice(0, 10).length > 0.7;
}

/**
 * Detect if a column contains email addresses
 */
export function isEmailColumn(columnName: string, sampleValues: any[]): boolean {
  // Check column name for email keywords
  const emailKeywords = ['email', 'e-mail', 'mail', 'contact'];
  const lowerName = columnName.toLowerCase();

  if (emailKeywords.some(keyword => lowerName.includes(keyword))) {
    return true;
  }

  // Check sample values for email patterns
  const nonNullValues = sampleValues.filter(v => v !== null && v !== undefined && v !== '');
  if (nonNullValues.length === 0) return false;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let emailCount = 0;

  for (const value of nonNullValues.slice(0, 10)) {
    const str = String(value).trim();
    if (emailRegex.test(str)) {
      emailCount++;
    }
  }

  // If more than 70% of values look like emails, it's an email column
  return emailCount / nonNullValues.slice(0, 10).length > 0.7;
}

/**
 * Normalize date string to ISO 8601
 */
export function normalizeDate(dateValue: any): string | null {
  if (!dateValue) return null;

  const str = String(dateValue).trim();
  if (!str) return null;

  try {
    // Try parsing as date
    const parsed = new Date(str);

    if (isNaN(parsed.getTime())) {
      return null;
    }

    // Validate year is reasonable
    if (parsed.getFullYear() < 1900 || parsed.getFullYear() > 2100) {
      return null;
    }

    return parsed.toISOString();
  } catch (error) {
    return null;
  }
}

/**
 * Normalize status value to Govli status
 */
export function normalizeStatus(statusValue: any, statusKeywords: Record<string, string>): string {
  if (!statusValue) return 'SUBMITTED';

  const str = String(statusValue).trim().toLowerCase();

  // Direct match
  if (statusKeywords[str]) {
    return statusKeywords[str];
  }

  // Partial match
  for (const [keyword, govliStatus] of Object.entries(statusKeywords)) {
    if (str.includes(keyword)) {
      return govliStatus;
    }
  }

  // Default
  return 'SUBMITTED';
}
