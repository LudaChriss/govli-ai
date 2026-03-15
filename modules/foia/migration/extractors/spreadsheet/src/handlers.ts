/**
 * Spreadsheet Import Engine - API Handlers
 */

import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer, { File as MulterFile, FileFilterCallback } from 'multer';
import path from 'path';
import {
  AuthenticatedRequest,
  FileUploadResponse,
  MappingSuggestionResponse,
  ConfirmMappingInput,
  ConfirmMappingResponse,
  ImportRequestInput,
  ImportResponse,
  ParsedSpreadsheetData,
  ConfirmedMapping,
  VALID_TARGET_FIELDS,
  STATUS_KEYWORDS
} from './types';
import {
  parseExcelFile,
  parseCsvFile,
  parseTsvFile,
  isDateColumn,
  isEmailColumn,
  normalizeDate,
  normalizeStatus
} from './utils/fileParser';
import {
  storeSpreadsheetData,
  getSpreadsheetData,
  storeConfirmedMapping,
  getConfirmedMapping
} from './utils/redisClient';
import { suggestColumnMappings } from './utils/aiClient';

// Multer configuration for file uploads (50MB max)
const storage = multer.memoryStorage();
export const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req: any, file: MulterFile, cb: FileFilterCallback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.xlsx' || ext === '.csv' || ext === '.tsv') {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx, .csv, and .tsv files are allowed'), false);
    }
  }
});

/**
 * POST /api/v1/foia/migration/spreadsheet/upload
 * Upload and parse spreadsheet file
 */
export async function uploadSpreadsheet(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const { buffer, originalname } = req.file;
    const ext = path.extname(originalname).toLowerCase();
    const sheetName = req.body.sheet_name;

    // Parse file based on extension
    let sheetNames: string[] = [];
    let columns: string[] = [];
    let rows: Record<string, any>[] = [];

    if (ext === '.xlsx') {
      const parsed = parseExcelFile(buffer, sheetName);
      sheetNames = parsed.sheetNames;
      columns = parsed.columns;
      rows = parsed.rows;
    } else if (ext === '.csv') {
      const parsed = parseCsvFile(buffer);
      sheetNames = ['Sheet1']; // CSV has only one sheet
      columns = parsed.columns;
      rows = parsed.rows;
    } else if (ext === '.tsv') {
      const parsed = parseTsvFile(buffer);
      sheetNames = ['Sheet1']; // TSV has only one sheet
      columns = parsed.columns;
      rows = parsed.rows;
    } else {
      res.status(400).json({
        success: false,
        error: 'Unsupported file format'
      });
      return;
    }

    // Detect date columns
    const detectedDateColumns: string[] = [];
    for (const col of columns) {
      const sampleValues = rows.slice(0, 20).map(row => row[col]);
      if (isDateColumn(col, sampleValues)) {
        detectedDateColumns.push(col);
      }
    }

    // Detect email columns
    const detectedEmailColumns: string[] = [];
    for (const col of columns) {
      const sampleValues = rows.slice(0, 20).map(row => row[col]);
      if (isEmailColumn(col, sampleValues)) {
        detectedEmailColumns.push(col);
      }
    }

    // Generate file ID
    const fileId = uuidv4();

    // Store parsed data in Redis (1 hour TTL)
    const parsedData: ParsedSpreadsheetData = {
      file_id: fileId,
      original_filename: originalname,
      sheet_names: sheetNames,
      columns,
      rows,
      detected_date_columns: detectedDateColumns,
      detected_email_columns: detectedEmailColumns,
      uploaded_at: new Date().toISOString(),
      uploaded_by: req.user.id,
      tenant_id: req.user.tenant_id
    };

    await storeSpreadsheetData(parsedData);

    // Prepare response
    const response: FileUploadResponse = {
      file_id: fileId,
      sheet_names: sheetNames,
      columns,
      row_count: rows.length,
      preview: rows.slice(0, 10), // First 10 rows
      detected_date_columns: detectedDateColumns,
      detected_email_columns: detectedEmailColumns
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('[Spreadsheet Upload] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to upload and parse file'
    });
  }
}

/**
 * POST /api/v1/foia/migration/spreadsheet/suggest-mapping
 * Get AI-suggested column mappings
 */
export async function suggestMapping(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const { file_id, sheet_name } = req.body;

    if (!file_id) {
      res.status(400).json({
        success: false,
        error: 'file_id is required'
      });
      return;
    }

    // Retrieve parsed data from Redis
    const parsedData = await getSpreadsheetData(file_id);

    if (!parsedData) {
      res.status(404).json({
        success: false,
        error: 'File not found or expired. Please re-upload.'
      });
      return;
    }

    // Verify tenant
    if (parsedData.tenant_id !== req.user.tenant_id) {
      res.status(403).json({
        success: false,
        error: 'Access denied'
      });
      return;
    }

    // If sheet_name specified for multi-sheet Excel, re-parse that sheet
    let columns = parsedData.columns;
    let rows = parsedData.rows;

    if (sheet_name && parsedData.sheet_names.includes(sheet_name)) {
      // Re-parse specific sheet (for .xlsx files)
      // Note: We would need to store the original buffer for this
      // For now, we'll use the already-parsed data
      console.log(`[Suggest Mapping] Sheet selection: ${sheet_name}`);
    }

    // Get AI suggestions
    const mappings = await suggestColumnMappings(columns, rows);

    const response: MappingSuggestionResponse = {
      mappings
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('[Suggest Mapping] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to suggest mappings'
    });
  }
}

/**
 * POST /api/v1/foia/migration/spreadsheet/confirm-mapping
 * Confirm or adjust AI-suggested mappings
 */
export async function confirmMapping(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const { file_id, mappings }: ConfirmMappingInput = req.body;

    if (!file_id || !mappings || !Array.isArray(mappings)) {
      res.status(400).json({
        success: false,
        error: 'file_id and mappings array are required'
      });
      return;
    }

    // Retrieve parsed data from Redis
    const parsedData = await getSpreadsheetData(file_id);

    if (!parsedData) {
      res.status(404).json({
        success: false,
        error: 'File not found or expired. Please re-upload.'
      });
      return;
    }

    // Verify tenant
    if (parsedData.tenant_id !== req.user.tenant_id) {
      res.status(403).json({
        success: false,
        error: 'Access denied'
      });
      return;
    }

    // Validate mappings
    const mappedFields: string[] = [];
    const unmappedColumns: string[] = [];

    for (const mapping of mappings) {
      if (!mapping.source || !mapping.target) {
        res.status(400).json({
          success: false,
          error: 'Each mapping must have source and target fields'
        });
        return;
      }

      // Verify source column exists
      if (!parsedData.columns.includes(mapping.source)) {
        res.status(400).json({
          success: false,
          error: `Source column "${mapping.source}" not found in spreadsheet`
        });
        return;
      }

      // Verify target is valid FOIA field
      if (!VALID_TARGET_FIELDS.includes(mapping.target as any)) {
        res.status(400).json({
          success: false,
          error: `Invalid target field "${mapping.target}". Must be one of: ${VALID_TARGET_FIELDS.join(', ')}`
        });
        return;
      }

      mappedFields.push(mapping.target);
    }

    // Check required fields
    if (!mappedFields.includes('description')) {
      res.status(400).json({
        success: false,
        error: 'Required field "description" must be mapped'
      });
      return;
    }

    if (!mappedFields.includes('date_received')) {
      res.status(400).json({
        success: false,
        error: 'Required field "date_received" must be mapped'
      });
      return;
    }

    // Identify unmapped columns
    for (const col of parsedData.columns) {
      if (!mappings.some(m => m.source === col)) {
        unmappedColumns.push(col);
      }
    }

    // Generate mapping ID
    const mappingId = uuidv4();

    // Store confirmed mapping in Redis (1 hour TTL)
    const confirmedMapping: ConfirmedMapping = {
      mapping_id: mappingId,
      file_id,
      mappings,
      confirmed_at: new Date().toISOString(),
      confirmed_by: req.user.id,
      tenant_id: req.user.tenant_id
    };

    await storeConfirmedMapping(confirmedMapping);

    // Prepare response
    const response: ConfirmMappingResponse = {
      mapping_id: mappingId,
      mapped_fields: mappedFields,
      unmapped_columns: unmappedColumns
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('[Confirm Mapping] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to confirm mapping'
    });
  }
}

/**
 * POST /api/v1/foia/migration/spreadsheet/import
 * Import spreadsheet data into FOIA requests
 */
export async function importSpreadsheet(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
      return;
    }

    const { file_id, mapping_id }: ImportRequestInput = req.body;

    if (!file_id || !mapping_id) {
      res.status(400).json({
        success: false,
        error: 'file_id and mapping_id are required'
      });
      return;
    }

    // Retrieve parsed data from Redis
    const parsedData = await getSpreadsheetData(file_id);

    if (!parsedData) {
      res.status(404).json({
        success: false,
        error: 'File not found or expired. Please re-upload.'
      });
      return;
    }

    // Retrieve confirmed mapping from Redis
    const confirmedMapping = await getConfirmedMapping(mapping_id);

    if (!confirmedMapping) {
      res.status(404).json({
        success: false,
        error: 'Mapping not found or expired. Please confirm mapping again.'
      });
      return;
    }

    // Verify tenant
    if (parsedData.tenant_id !== req.user.tenant_id || confirmedMapping.tenant_id !== req.user.tenant_id) {
      res.status(403).json({
        success: false,
        error: 'Access denied'
      });
      return;
    }

    // Verify file_id matches
    if (confirmedMapping.file_id !== file_id) {
      res.status(400).json({
        success: false,
        error: 'Mapping does not match file'
      });
      return;
    }

    // Create mapping lookup
    const mappingLookup = new Map<string, string>();
    for (const mapping of confirmedMapping.mappings) {
      mappingLookup.set(mapping.source, mapping.target);
    }

    // Process rows
    const totalRows = parsedData.rows.length;
    let imported = 0;
    let skipped = 0;
    const errors: { row_number: number; error: string }[] = [];
    const importedRequests: any[] = [];

    for (let i = 0; i < parsedData.rows.length; i++) {
      const row = parsedData.rows[i];
      const rowNumber = i + 1;

      try {
        // Transform row using mapping
        const transformedRow: Record<string, any> = {};

        for (const [sourceCol, targetField] of mappingLookup.entries()) {
          const value = row[sourceCol];

          // Normalize dates
          if (targetField === 'date_received' || targetField === 'date_due' || targetField === 'date_closed') {
            const normalized = normalizeDate(value);
            if (normalized) {
              transformedRow[targetField] = normalized;
            } else if (value) {
              // Date normalization failed
              errors.push({
                row_number: rowNumber,
                error: `Invalid date format in column "${sourceCol}": ${value}`
              });
              skipped++;
              continue;
            }
          }
          // Normalize status
          else if (targetField === 'status') {
            transformedRow[targetField] = normalizeStatus(value, STATUS_KEYWORDS);
          }
          // Other fields
          else {
            transformedRow[targetField] = value;
          }
        }

        // Validate required fields
        if (!transformedRow.description || String(transformedRow.description).trim() === '') {
          errors.push({
            row_number: rowNumber,
            error: 'Missing required field: description'
          });
          skipped++;
          continue;
        }

        if (!transformedRow.date_received) {
          errors.push({
            row_number: rowNumber,
            error: 'Missing required field: date_received'
          });
          skipped++;
          continue;
        }

        // Set defaults
        if (!transformedRow.requester_name) {
          transformedRow.requester_name = 'Unknown';
        }

        if (!transformedRow.requester_email) {
          transformedRow.requester_email = 'unknown@example.com';
        }

        if (!transformedRow.department) {
          transformedRow.department = 'General';
        }

        if (!transformedRow.status) {
          transformedRow.status = 'SUBMITTED';
        }

        // Set legacy_id to tracking_number if available, otherwise row number
        const legacyId = transformedRow.tracking_number || `ROW-${rowNumber}`;

        // Prepare for bulk import
        importedRequests.push({
          legacy_id: legacyId,
          migration_source: 'spreadsheet',
          description: transformedRow.description,
          requester_name: transformedRow.requester_name,
          requester_email: transformedRow.requester_email,
          requester_phone: transformedRow.requester_phone || null,
          requester_category: transformedRow.category || 'INDIVIDUAL',
          department: transformedRow.department,
          date_received: transformedRow.date_received,
          date_due: transformedRow.date_due || null,
          date_closed: transformedRow.date_closed || null,
          legacy_status: transformedRow.status,
          response_type: transformedRow.response_type || null,
          notes: transformedRow.notes || null
        });

        imported++;
      } catch (error) {
        console.error(`[Spreadsheet Import] Error processing row ${rowNumber}:`, error);
        errors.push({
          row_number: rowNumber,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        skipped++;
      }
    }

    // TODO: Call Migration API bulk import endpoint
    // For now, we'll simulate the import
    console.log(`[Spreadsheet Import] Would import ${imported} requests via Migration API`);
    console.log('[Spreadsheet Import] Sample request:', importedRequests[0]);

    // Emit event
    console.log('[Spreadsheet Import] Emitting foia.migration.spreadsheet.completed', {
      tenant_id: req.user.tenant_id,
      file_id,
      total_rows: totalRows,
      imported,
      skipped
    });

    // Generate import report URL (placeholder)
    const importReportUrl = `/api/v1/foia/migration/reports/${file_id}`;

    // Prepare response
    const response: ImportResponse = {
      total_rows: totalRows,
      imported,
      skipped,
      errors,
      import_report_url: importReportUrl
    };

    res.json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('[Spreadsheet Import] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import spreadsheet'
    });
  }
}
